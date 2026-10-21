import type { ListedTool, ToolHost } from "@bot-computer/mcp-host";
import { localConnectors } from "./localConnectors.js";

export {
  sheetsConnector,
  mailConnector,
  calendarConnector,
  notifyConnector,
} from "./localConnectors.js";

export type ConnectorManifest = {
  id: string;
  name: string;
  description: string;
};

export type ConnectorContext = {
  /** Optional app userData path for connector-local state. */
  userDataPath?: string;
  /** Slack-compatible incoming webhook for notify connector. */
  slackWebhookUrl?: string;
};

/** Local connector plugin: expands to an in-process ToolHost when enabled. */
export type Connector = ConnectorManifest & {
  createHost(ctx: ConnectorContext): ToolHost;
};

const MAX_BODY_CHARS = 50_000;

function createHttpFetchHost(): ToolHost {
  const serverId = "http-fetch";
  const tools: ListedTool[] = [
    {
      serverId,
      name: "get",
      description:
        "HTTP GET a URL (http/https only). Returns status and truncated text body.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute http(s) URL" },
        },
        required: ["url"],
      },
    },
  ];

  return {
    async listTools() {
      return tools;
    },
    async callTool(sid, toolName, args) {
      if (sid !== serverId) {
        return { ok: false, content: `Unknown server: ${sid}` };
      }
      if (toolName !== "get") {
        return { ok: false, content: `Unknown tool: ${toolName}` };
      }
      const urlText =
        args &&
        typeof args === "object" &&
        !Array.isArray(args) &&
        typeof (args as { url?: unknown }).url === "string"
          ? (args as { url: string }).url
          : "";
      if (!urlText) {
        return { ok: false, content: "get requires string url" };
      }
      let parsed: URL;
      try {
        parsed = new URL(urlText);
      } catch {
        return { ok: false, content: "invalid URL" };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, content: "only http/https URLs are allowed" };
      }
      try {
        const res = await fetch(parsed, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
        });
        const raw = await res.text();
        const body =
          raw.length > MAX_BODY_CHARS
            ? `${raw.slice(0, MAX_BODY_CHARS)}\n…[truncated ${raw.length - MAX_BODY_CHARS} chars]`
            : raw;
        return {
          ok: res.ok,
          content: JSON.stringify(
            {
              status: res.status,
              contentType: res.headers.get("content-type"),
              body,
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
    },
  };
}

export const httpFetchConnector: Connector = {
  id: "http-fetch",
  name: "HTTP Fetch",
  description: "Simple HTTP GET tool (no OAuth). Permission-gated.",
  createHost() {
    return createHttpFetchHost();
  },
};

export const builtinConnectors: Connector[] = [
  httpFetchConnector,
  ...localConnectors,
];

export class ConnectorRegistry {
  private readonly byId = new Map<string, Connector>();

  constructor(connectors: Connector[] = builtinConnectors) {
    for (const c of connectors) {
      this.byId.set(c.id, c);
    }
  }

  list(): ConnectorManifest[] {
    return [...this.byId.values()].map(({ id, name, description }) => ({
      id,
      name,
      description,
    }));
  }

  createHosts(
    enabledIds: string[],
    ctx: ConnectorContext = {},
  ): ToolHost[] {
    const hosts: ToolHost[] = [];
    const seen = new Set<string>();
    for (const id of enabledIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const connector = this.byId.get(id);
      if (!connector) continue;
      hosts.push(connector.createHost(ctx));
    }
    return hosts;
  }
}
