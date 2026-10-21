import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CompositeToolHost, McpHost, type ToolHost } from "./index.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const fixtureServer = path.join(root, "apps/fixture-mcp/src/server.js");
const fixtureSseServer = path.join(root, "apps/fixture-mcp-sse/src/server.js");

async function waitForUrl(url: string, attempts = 40): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: AbortSignal.timeout(500),
      });
      // Any HTTP response means the server is up (SSE may hang the body).
      void res.body?.cancel();
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`server not ready: ${String(lastErr)}`);
}

describe("McpHost", () => {
  it("lists and calls fixture echo tool", async () => {
    const host = new McpHost();
    await host.reload([
      {
        id: "fixture",
        name: "Fixture",
        transport: "stdio",
        command: process.execPath,
        args: [fixtureServer],
        enabled: true,
      },
    ]);
    try {
      const tools = await host.listTools();
      expect(tools.some((t) => t.name === "echo")).toBe(true);
      const result = await host.callTool("fixture", "echo", {
        message: "hi",
      });
      expect(result.ok).toBe(true);
      expect(result.content).toContain("echo:hi");
    } finally {
      await host.dispose();
    }
  }, 30_000);

  it("connects to SSE fixture and calls echo", async () => {
    const port = 39_200 + Math.floor(Math.random() * 400);
    const child = spawn(process.execPath, [fixtureSseServer], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const host = new McpHost();
    try {
      await waitForUrl(`http://127.0.0.1:${port}/mcp`);
      const { failures } = await host.reload([
        {
          id: "fixture-sse",
          name: "Fixture SSE",
          transport: "sse",
          url: `http://127.0.0.1:${port}/mcp`,
          enabled: true,
        },
      ]);
      expect(failures).toEqual([]);
      const tools = await host.listTools();
      expect(tools.some((t) => t.name === "echo")).toBe(true);
      const result = await host.callTool("fixture-sse", "echo", {
        message: "sse",
      });
      expect(result.ok).toBe(true);
      expect(result.content).toContain("sse-echo:sse");
    } finally {
      await host.dispose();
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once("exit", () => resolve());
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 2000);
      });
    }
  }, 45_000);
});

describe("CompositeToolHost", () => {
  it("merges listTools and routes callTool", async () => {
    const a: ToolHost = {
      async listTools() {
        return [
          {
            serverId: "inproc",
            name: "ping",
            description: "ping",
            inputSchema: { type: "object", properties: {} },
          },
        ];
      },
      async callTool(serverId, toolName) {
        if (serverId === "inproc" && toolName === "ping") {
          return { ok: true, content: "pong" };
        }
        return { ok: false, content: "miss" };
      },
    };
    const b: ToolHost = {
      async listTools() {
        return [
          {
            serverId: "other",
            name: "noop",
            inputSchema: { type: "object", properties: {} },
          },
        ];
      },
      async callTool() {
        return { ok: true, content: "noop" };
      },
    };
    const composite = new CompositeToolHost([a, b]);
    const tools = await composite.listTools();
    expect(tools.map((t) => `${t.serverId}/${t.name}`).sort()).toEqual([
      "inproc/ping",
      "other/noop",
    ]);
    const hit = await composite.callTool("inproc", "ping", {});
    expect(hit).toEqual({ ok: true, content: "pong" });
    const miss = await composite.callTool("missing", "x", {});
    expect(miss.ok).toBe(false);
  });
});
