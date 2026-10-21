import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { ChatStreamEvent } from "@bot-computer/contracts";
import type { ToolHost } from "@bot-computer/mcp-host";
import type { TeamHub } from "@bot-computer/team";

export type GatewayHandlers = {
  getTeamHub: () => TeamHub;
  getToolHost: () => ToolHost;
};

export type GatewayListenOptions = {
  host: string;
  port: number;
  apiKey: string;
};

export type GatewayStatus = {
  listening: boolean;
  url: string | null;
  host: string | null;
  port: number | null;
};

function readBody(req: IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function extractApiKey(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (m?.[1]) return m[1].trim();
  }
  const x = req.headers["x-api-key"];
  if (typeof x === "string" && x.length > 0) return x;
  if (Array.isArray(x) && x[0]) return x[0];
  return null;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-api-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    ...extraHeaders,
  });
  res.end(payload);
}

export class GatewayServer {
  private server: Server | null = null;
  private listenOpts: GatewayListenOptions | null = null;

  constructor(private readonly handlers: GatewayHandlers) {}

  status(): GatewayStatus {
    if (!this.server || !this.listenOpts) {
      return { listening: false, url: null, host: null, port: null };
    }
    const { host, port } = this.listenOpts;
    return {
      listening: true,
      url: `http://${host}:${port}`,
      host,
      port,
    };
  }

  async start(opts: GatewayListenOptions): Promise<GatewayStatus> {
    if (!opts.apiKey) {
      throw new Error("gateway apiKey is required");
    }
    await this.stop();
    this.listenOpts = { ...opts };

    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(opts.port, opts.host, () => resolve());
    });

    const addr = this.server.address();
    if (addr && typeof addr === "object") {
      this.listenOpts = { ...opts, port: addr.port };
    }

    return this.status();
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.listenOpts = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private requireAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const expected = this.listenOpts?.apiKey ?? "";
    const provided = extractApiKey(req);
    if (!provided || !expected || !safeEqual(provided, expected)) {
      sendJson(res, 401, { error: "unauthorized" });
      return false;
    }
    return true;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const host = req.headers.host ?? "localhost";
      const url = new URL(req.url || "/", `http://${host}`);

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, content-type, x-api-key",
          "access-control-allow-methods": "GET, POST, OPTIONS",
        });
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, service: "bot-computer-gateway" });
        return;
      }

      const hub = this.handlers.getTeamHub();

      if (req.method === "GET" && url.pathname === "/v1/tools") {
        if (!this.requireAuth(req, res)) return;
        const tools = await this.handlers.getToolHost().listTools();
        sendJson(res, 200, { tools });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/agents") {
        if (!this.requireAuth(req, res)) return;
        sendJson(res, 200, {
          agents: hub.listAgents().map((a) => ({
            id: a.id,
            name: a.name,
            modelId: a.modelId ?? null,
          })),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/v1/sessions") {
        if (!this.requireAuth(req, res)) return;
        sendJson(res, 200, { sessions: hub.listSessions() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/sessions") {
        if (!this.requireAuth(req, res)) return;
        const raw = await readBody(req);
        let agentId: string | undefined;
        let title: string | undefined;
        if (raw.trim()) {
          try {
            const parsed = JSON.parse(raw) as {
              agentId?: unknown;
              title?: unknown;
            };
            if (typeof parsed.agentId === "string") agentId = parsed.agentId;
            if (typeof parsed.title === "string") title = parsed.title;
          } catch {
            sendJson(res, 400, { error: "invalid JSON body" });
            return;
          }
        }
        const session = hub.createSession({ agentId, title });
        sendJson(res, 201, { session });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/chat") {
        if (!this.requireAuth(req, res)) return;
        const raw = await readBody(req);
        let text = "";
        let sessionId: string | undefined;
        let agentId: string | undefined;
        try {
          const parsed = JSON.parse(raw) as {
            text?: unknown;
            sessionId?: unknown;
            agentId?: unknown;
          };
          if (typeof parsed.text === "string") text = parsed.text.trim();
          if (typeof parsed.sessionId === "string") sessionId = parsed.sessionId;
          if (typeof parsed.agentId === "string") agentId = parsed.agentId;
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
          return;
        }
        if (!text) {
          sendJson(res, 400, { error: "text is required" });
          return;
        }

        let session = sessionId
          ? hub.listSessions().find((s) => s.id === sessionId)
          : undefined;
        if (sessionId && !session) {
          sendJson(res, 404, { error: "session not found" });
          return;
        }
        if (!session) {
          session = hub.createSession({ agentId });
        }

        res.writeHead(200, {
          "content-type": "application/x-ndjson; charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "x-session-id": session.id,
        });

        try {
          for await (const event of hub.runTurn(session.id, text)) {
            res.write(`${JSON.stringify(event as ChatStreamEvent)}\n`);
            if (event.type === "done" || event.type === "error") break;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.write(`${JSON.stringify({ type: "error", message })}\n`);
        }
        res.end();
        return;
      }

      sendJson(res, 404, { error: "not found" });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        res.end();
      }
    }
  }
}
