import { randomUUID } from "node:crypto";
import {
  AgentRuntime,
  type ChatMessage,
} from "@bot-computer/agent-runtime";
import type {
  AgentProfile,
  ChatStreamEvent,
  ModelSettings,
} from "@bot-computer/contracts";
import { defaultAgentProfiles } from "@bot-computer/contracts";
import type { ToolHost } from "@bot-computer/mcp-host";
import type { PermissionGate } from "@bot-computer/permissions";

export type SessionInfo = {
  id: string;
  title: string;
  agentId: string;
  createdAt: number;
  updatedAt: number;
};

export type TeamHubDeps = {
  getToolHost: () => ToolHost;
  createPermissions: () => PermissionGate;
  getModel: () => ModelSettings;
  getAgents: () => AgentProfile[];
  fetchImpl?: typeof fetch;
  /** Slice 7 — multimodal screenshots for the LLM. */
  getVision?: () => boolean;
  getMaxToolSteps?: (agent: AgentProfile) => number;
};

type SessionEntry = {
  info: SessionInfo;
  runtime: AgentRuntime;
};

export class TeamHub {
  private readonly sessions = new Map<string, SessionEntry>();
  private activeId: string | null = null;

  constructor(private readonly deps: TeamHubDeps) {}

  listAgents(): AgentProfile[] {
    const agents = this.deps.getAgents();
    return agents.length > 0 ? agents : defaultAgentProfiles();
  }

  resolveAgent(agentId?: string): AgentProfile {
    const agents = this.listAgents();
    const found = agentId
      ? agents.find((a) => a.id === agentId)
      : undefined;
    return found ?? agents[0] ?? defaultAgentProfiles()[0]!;
  }

  resolveModel(agent: AgentProfile): ModelSettings {
    const base = this.deps.getModel();
    if (agent.modelId && agent.modelId.trim()) {
      return { ...base, modelId: agent.modelId.trim() };
    }
    return base;
  }

  listSessions(): SessionInfo[] {
    return [...this.sessions.values()]
      .map((s) => s.info)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getActiveSessionId(): string | null {
    return this.activeId;
  }

  ensureActiveSession(): SessionInfo {
    if (this.activeId && this.sessions.has(this.activeId)) {
      return this.sessions.get(this.activeId)!.info;
    }
    return this.createSession();
  }

  createSession(opts?: {
    agentId?: string;
    title?: string;
  }): SessionInfo {
    const agent = this.resolveAgent(opts?.agentId);
    const id = randomUUID();
    const now = Date.now();
    const info: SessionInfo = {
      id,
      title: opts?.title?.trim() || `Chat with ${agent.name}`,
      agentId: agent.id,
      createdAt: now,
      updatedAt: now,
    };
    const runtime = new AgentRuntime({
      mcp: this.deps.getToolHost(),
      permissions: this.deps.createPermissions(),
      fetchImpl: this.deps.fetchImpl,
      systemPrompt: agent.systemPrompt,
      vision: this.deps.getVision?.() ?? false,
      maxToolSteps:
        this.deps.getMaxToolSteps?.(agent) ??
        (agent.id === "computer" ? 16 : 8),
    });
    this.sessions.set(id, { info, runtime });
    this.activeId = id;
    return info;
  }

  setActiveSession(id: string): SessionInfo | null {
    const entry = this.sessions.get(id);
    if (!entry) return null;
    this.activeId = id;
    return entry.info;
  }

  deleteSession(id: string): boolean {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    entry.runtime.cancel();
    this.sessions.delete(id);
    if (this.activeId === id) {
      const next = this.listSessions()[0];
      this.activeId = next?.id ?? null;
    }
    return true;
  }

  getTranscript(sessionId: string): ChatMessage[] {
    return this.sessions.get(sessionId)?.runtime.getTranscript() ?? [];
  }

  cancel(sessionId?: string): void {
    if (sessionId) {
      this.sessions.get(sessionId)?.runtime.cancel();
      return;
    }
    if (this.activeId) {
      this.sessions.get(this.activeId)?.runtime.cancel();
    }
  }

  async *runTurn(
    sessionId: string,
    text: string,
  ): AsyncGenerator<ChatStreamEvent> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      yield { type: "error", message: `Unknown session: ${sessionId}` };
      return;
    }
    const agent = this.resolveAgent(entry.info.agentId);
    entry.info.updatedAt = Date.now();
    if (entry.info.title.startsWith("Chat with ") && text.trim()) {
      entry.info.title =
        text.trim().length > 48
          ? `${text.trim().slice(0, 45)}…`
          : text.trim();
    }
    for await (const event of entry.runtime.runTurn(
      text,
      this.resolveModel(agent),
    )) {
      yield event;
    }
  }

  /**
   * Run a one-shot turn as another agent (inter-bot collaboration).
   * Collects assistant text; tool side-effects share the same ToolHost.
   */
  async delegateToAgent(
    agentId: string,
    prompt: string,
  ): Promise<{ ok: boolean; content: string }> {
    const agent = this.resolveAgent(agentId);
    const runtime = new AgentRuntime({
      mcp: this.deps.getToolHost(),
      permissions: this.deps.createPermissions(),
      fetchImpl: this.deps.fetchImpl,
      systemPrompt: `${agent.systemPrompt}\n\nYou were delegated this sub-task by a teammate. Complete it and leave notes in workspace if useful.`,
      vision: this.deps.getVision?.() ?? false,
      maxToolSteps: this.deps.getMaxToolSteps?.(agent) ?? 12,
    });
    const parts: string[] = [];
    try {
      for await (const event of runtime.runTurn(
        prompt,
        this.resolveModel(agent),
      )) {
        if (event.type === "token") parts.push(event.text);
        if (event.type === "error") {
          return { ok: false, content: event.message };
        }
      }
      return {
        ok: true,
        content: JSON.stringify(
          {
            agentId: agent.id,
            agentName: agent.name,
            reply: parts.join("") || "(no text)",
          },
          null,
          2,
        ),
      };
    } catch (err) {
      return {
        ok: false,
        content: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
