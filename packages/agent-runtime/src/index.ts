import { randomUUID } from "node:crypto";
import type {
  ChatStreamEvent,
  ModelSettings,
} from "@bot-computer/contracts";
import type { ListedTool, ToolHost } from "@bot-computer/mcp-host";
import type { PermissionGate } from "@bot-computer/permissions";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are Bot Computer, a local-first open-source desktop agent. Be concise and helpful.";

/** Shared rule for every bot — tools follow the user prompt, never run “just because”. */
const TOOL_DISCIPLINE =
  " Tools are optional. Greetings, small talk, and questions you can answer in text: reply with text only — do NOT call any tools. Only use tools when the user clearly asks you to browse, click, research online, run commands, use connectors, or otherwise act on this machine.";

/** Strip huge dataUrls from tool JSON kept in the LLM transcript. */
export function compactToolContentForModel(toolContent: string): string {
  try {
    const parsed = JSON.parse(toolContent) as Record<string, unknown>;
    let changed = false;
    if (typeof parsed.dataUrl === "string" && parsed.dataUrl.startsWith("data:")) {
      parsed.dataUrl = `[omitted jpeg ${parsed.dataUrl.length} chars — shown to user as proof]`;
      changed = true;
    }
    if (parsed.verify && typeof parsed.verify === "object") {
      const verify = { ...(parsed.verify as Record<string, unknown>) };
      if (typeof verify.dataUrl === "string" && verify.dataUrl.startsWith("data:")) {
        verify.dataUrl = `[omitted jpeg ${verify.dataUrl.length} chars]`;
        parsed.verify = verify;
        changed = true;
      }
    }
    return changed ? JSON.stringify(parsed, null, 2) : toolContent;
  } catch {
    return toolContent;
  }
}

export type AgentRuntimeDeps = {
  /** MCP and/or in-process tools (e.g. computer-use). */
  mcp: ToolHost;
  permissions: PermissionGate;
  fetchImpl?: typeof fetch;
  /** Per-agent system prompt (Slice 6). */
  systemPrompt?: string;
  /**
   * Attach screenshot dataUrls from computer-use tool results as multimodal
   * user messages before the next model call (Slice 7).
   */
  vision?: boolean;
  /** Extra tool-loop steps for computer-use sessions (default 8, computer 16). */
  maxToolSteps?: number;
};

function toOpenAiTools(tools: ListedTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: `${t.serverId}__${t.name}`,
      description: t.description ?? t.name,
      parameters:
        t.inputSchema && typeof t.inputSchema === "object"
          ? t.inputSchema
          : { type: "object", properties: {} },
    },
  }));
}

function parseQualifiedToolName(
  qualified: string,
): { serverId: string; toolName: string } | null {
  const idx = qualified.indexOf("__");
  if (idx <= 0) return null;
  return {
    serverId: qualified.slice(0, idx),
    toolName: qualified.slice(idx + 2),
  };
}

function contentAsText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** Extract dataUrl from computer-use tool JSON if present. */
export function extractScreenshotDataUrl(toolContent: string): string | null {
  try {
    const parsed = JSON.parse(toolContent) as {
      dataUrl?: unknown;
      verify?: { dataUrl?: unknown };
    };
    if (typeof parsed.dataUrl === "string" && parsed.dataUrl.startsWith("data:")) {
      return parsed.dataUrl;
    }
    if (
      parsed.verify &&
      typeof parsed.verify === "object" &&
      typeof (parsed.verify as { dataUrl?: unknown }).dataUrl === "string"
    ) {
      const url = (parsed.verify as { dataUrl: string }).dataUrl;
      if (url.startsWith("data:")) return url;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export class AgentRuntime {
  private readonly mcp: ToolHost;
  private readonly permissions: PermissionGate;
  private readonly fetchImpl: typeof fetch;
  private readonly vision: boolean;
  private readonly maxToolSteps: number;
  private messages: ChatMessage[];
  private abort: AbortController | null = null;
  private pendingVisionDataUrl: string | null = null;

  constructor(deps: AgentRuntimeDeps) {
    this.mcp = deps.mcp;
    this.permissions = deps.permissions;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.vision = Boolean(deps.vision);
    this.maxToolSteps = deps.maxToolSteps ?? 8;
    const base = deps.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
    this.messages = [
      {
        role: "system",
        content: `${base}${TOOL_DISCIPLINE}`,
      },
    ];
  }

  getTranscript(): ChatMessage[] {
    return [...this.messages];
  }

  cancel(): void {
    this.abort?.abort();
  }

  async *runTurn(
    userText: string,
    model: ModelSettings,
  ): AsyncGenerator<ChatStreamEvent> {
    this.abort?.abort();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.messages.push({ role: "user", content: userText });

    try {
      for (let step = 0; step < this.maxToolSteps; step++) {
        if (signal.aborted) {
          yield { type: "error", message: "cancelled" };
          return;
        }

        this.flushPendingVision();

        const tools = await this.mcp.listTools();
        const completion = await this.complete(model, tools, signal);
        if (!completion.ok) {
          yield { type: "error", message: completion.error };
          return;
        }

        const assistant = completion.message;
        const text = contentAsText(assistant.content ?? "");
        if (text) {
          yield { type: "token", text };
        }

        const toolCalls = assistant.tool_calls ?? [];
        if (toolCalls.length === 0) {
          this.messages.push({
            role: "assistant",
            content: text,
          });
          yield { type: "done" };
          return;
        }

        this.messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls,
        });

        for (const call of toolCalls) {
          const parsed = parseQualifiedToolName(call.function.name);
          if (!parsed) {
            yield {
              type: "error",
              message: `Invalid tool name: ${call.function.name}`,
            };
            this.messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: "invalid tool name",
            });
            continue;
          }

          let args: unknown = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            args = {};
          }

          yield {
            type: "tool_call",
            serverId: parsed.serverId,
            toolName: parsed.toolName,
            arguments: args,
          };

          const decision = await this.permissions.authorize({
            serverId: parsed.serverId,
            toolName: parsed.toolName,
            arguments: args,
            requestId: randomUUID(),
          });

          if (decision === "deny") {
            const content = "User denied tool permission.";
            yield {
              type: "tool_result",
              serverId: parsed.serverId,
              toolName: parsed.toolName,
              ok: false,
              content,
            };
            this.messages.push({
              role: "tool",
              tool_call_id: call.id,
              content,
            });
            continue;
          }

          const result = await this.mcp.callTool(
            parsed.serverId,
            parsed.toolName,
            args,
          );
          const dataUrl = extractScreenshotDataUrl(result.content);
          const modelContent = compactToolContentForModel(result.content);
          yield {
            type: "tool_result",
            serverId: parsed.serverId,
            toolName: parsed.toolName,
            ok: result.ok,
            content: modelContent,
          };
          if (dataUrl) {
            yield {
              type: "proof_image",
              dataUrl,
              caption: `${parsed.serverId}/${parsed.toolName}`,
            };
          }
          this.messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: modelContent,
          });

          if (
            this.vision &&
            dataUrl &&
            (parsed.serverId === "computer-use" || parsed.serverId === "browser")
          ) {
            this.pendingVisionDataUrl = dataUrl;
          }
        }
      }
      yield { type: "error", message: "tool loop limit reached" };
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private flushPendingVision(): void {
    if (!this.vision || !this.pendingVisionDataUrl) return;
    const url = this.pendingVisionDataUrl;
    this.pendingVisionDataUrl = null;
    this.messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: "Current capture for your next action (user is watching the Agent Browser / live preview):",
        },
        { type: "image_url", image_url: { url } },
      ],
    });
  }

  private async complete(
    model: ModelSettings,
    tools: ListedTool[],
    signal: AbortSignal,
  ): Promise<
    { ok: true; message: ChatMessage } | { ok: false; error: string }
  > {
    const url = `${model.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const body = {
      model: model.modelId,
      messages: this.messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool",
            tool_call_id: m.tool_call_id,
            content:
              typeof m.content === "string"
                ? m.content
                : contentAsText(m.content),
          };
        }
        if (m.tool_calls) {
          return {
            role: "assistant",
            content: typeof m.content === "string" ? m.content : contentAsText(m.content),
            tool_calls: m.tool_calls,
          };
        }
        return { role: m.role, content: m.content };
      }),
      tools: tools.length > 0 ? toOpenAiTools(tools) : undefined,
      stream: false,
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (model.apiKey) headers.authorization = `Bearer ${model.apiKey}`;

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `LLM HTTP ${res.status}: ${text.slice(0, 500)}`,
      };
    }
    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: ChatMessage["tool_calls"];
        };
      }>;
    };
    const message = json.choices?.[0]?.message;
    if (!message) {
      return { ok: false, error: "LLM response missing choices[0].message" };
    }
    return {
      ok: true,
      message: {
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.tool_calls,
      },
    };
  }
}
