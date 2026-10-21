import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServerConfig } from "@bot-computer/contracts";

export type ListedTool = {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
};

/** Shared surface for MCP hosts and in-process tool providers. */
export type ToolHost = {
  listTools(): Promise<ListedTool[]>;
  callTool(
    serverId: string,
    toolName: string,
    args: unknown,
  ): Promise<{ ok: boolean; content: string }>;
};

export class CompositeToolHost implements ToolHost {
  constructor(private readonly hosts: ToolHost[]) {}

  async listTools(): Promise<ListedTool[]> {
    const out: ListedTool[] = [];
    for (const host of this.hosts) {
      out.push(...(await host.listTools()));
    }
    return out;
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: unknown,
  ): Promise<{ ok: boolean; content: string }> {
    for (const host of this.hosts) {
      const tools = await host.listTools();
      if (tools.some((t) => t.serverId === serverId && t.name === toolName)) {
        return host.callTool(serverId, toolName, args);
      }
    }
    return { ok: false, content: `Unknown tool: ${serverId}/${toolName}` };
  }
}

type RunningServer = {
  config: McpServerConfig;
  client: Client;
  transport: Transport;
};

export type McpStartFailure = { id: string; error: string };

export class McpHost {
  private readonly servers = new Map<string, RunningServer>();

  async reload(
    configs: McpServerConfig[],
  ): Promise<{ failures: McpStartFailure[] }> {
    await this.dispose();
    const failures: McpStartFailure[] = [];
    for (const config of configs.filter((c) => c.enabled)) {
      try {
        await this.startOne(config);
      } catch (err) {
        failures.push({
          id: config.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { failures };
  }

  private async startOne(config: McpServerConfig): Promise<void> {
    const transport =
      config.transport === "sse"
        ? this.createSseTransport(config)
        : this.createStdioTransport(config);

    const client = new Client(
      { name: "bot-computer", version: "0.1.0" },
      { capabilities: {} },
    );
    // Keep startup snappy; a hung child/remote must not block the desktop window.
    await client.connect(transport, { timeout: 15_000 });
    this.servers.set(config.id, { config, client, transport });
  }

  private createStdioTransport(config: McpServerConfig): StdioClientTransport {
    if (!config.command) {
      throw new Error(`stdio server ${config.id} missing command`);
    }
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string" && v.length > 0) env[k] = v;
    }
    if (config.env) {
      for (const [k, v] of Object.entries(config.env)) {
        if (v === "") delete env[k];
        else env[k] = v;
      }
    }
    // Never let Electron steal the child as its own binary.
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_NO_ASAR;

    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env,
      stderr: "pipe",
    });
  }

  private createSseTransport(config: McpServerConfig): SSEClientTransport {
    if (!config.url) {
      throw new Error(`sse server ${config.id} missing url`);
    }
    const headers = config.headers
      ? { ...config.headers }
      : undefined;
    return new SSEClientTransport(new URL(config.url), {
      requestInit: headers ? { headers } : undefined,
    });
  }

  async listTools(): Promise<ListedTool[]> {
    const out: ListedTool[] = [];
    for (const [serverId, running] of this.servers) {
      const result = await running.client.listTools();
      for (const tool of result.tools) {
        out.push({
          serverId,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return out;
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: unknown,
  ): Promise<{ ok: boolean; content: string }> {
    const running = this.servers.get(serverId);
    if (!running) {
      return { ok: false, content: `MCP server not running: ${serverId}` };
    }
    try {
      const result = await running.client.callTool({
        name: toolName,
        arguments:
          args && typeof args === "object" && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : {},
      });
      const text = extractText(result as { content?: unknown; isError?: boolean });
      const isError =
        typeof result === "object" &&
        result !== null &&
        "isError" in result &&
        Boolean((result as { isError?: boolean }).isError);
      return { ok: !isError, content: text };
    } catch (err) {
      return {
        ok: false,
        content: err instanceof Error ? err.message : String(err),
      };
    }
  }

  listServers(): McpServerConfig[] {
    return [...this.servers.values()].map((s) => s.config);
  }

  async dispose(): Promise<void> {
    for (const running of this.servers.values()) {
      try {
        await running.client.close();
      } catch {
        /* ignore */
      }
    }
    this.servers.clear();
  }
}

function extractText(result: { content?: unknown }): string {
  const parts = Array.isArray(result.content) ? result.content : [];
  const texts: string[] = [];
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      (part as { type: string }).type === "text" &&
      "text" in part &&
      typeof (part as { text: unknown }).text === "string"
    ) {
      texts.push((part as { text: string }).text);
    }
  }
  return texts.length > 0 ? texts.join("\n") : JSON.stringify(result);
}
