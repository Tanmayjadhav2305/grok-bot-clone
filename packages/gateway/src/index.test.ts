import { describe, expect, it, vi } from "vitest";
import { PermissionGate } from "@bot-computer/permissions";
import type { ListedTool, ToolHost } from "@bot-computer/mcp-host";
import { TeamHub } from "@bot-computer/team";
import { GatewayServer } from "./index.js";

function mockToolHost(tools: ListedTool[] = []): ToolHost {
  return {
    async listTools() {
      return tools;
    },
    async callTool() {
      return { ok: true, content: "ok" };
    },
  };
}

function makeHub(host: ToolHost, fetchImpl?: typeof fetch): TeamHub {
  return new TeamHub({
    getToolHost: () => host,
    createPermissions: () => new PermissionGate([], async () => "deny"),
    getModel: () => ({
      baseUrl: "http://llm.test/v1",
      apiKey: "",
      modelId: "mock",
    }),
    getAgents: () => [
      {
        id: "default",
        name: "Default",
        systemPrompt: "You are default.",
      },
      {
        id: "coder",
        name: "Coder",
        systemPrompt: "You are coder.",
      },
    ],
    fetchImpl,
  });
}

describe("GatewayServer", () => {
  it("serves health, tools, and agents", async () => {
    const host = mockToolHost([
      {
        serverId: "fixture",
        name: "echo",
        description: "echo",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    const hub = makeHub(host);
    const gw = new GatewayServer({
      getTeamHub: () => hub,
      getToolHost: () => host,
    });

    const fixed = await gw.start({
      host: "127.0.0.1",
      port: 0,
      apiKey: "test-secret-key",
    });
    try {
      const base = fixed.url!;
      expect((await fetch(`${base}/health`)).status).toBe(200);
      expect((await fetch(`${base}/v1/tools`)).status).toBe(401);

      const tools = await fetch(`${base}/v1/tools`, {
        headers: { authorization: "Bearer test-secret-key" },
      });
      expect(tools.status).toBe(200);
      const toolsJson = (await tools.json()) as {
        tools: Array<{ name: string }>;
      };
      expect(toolsJson.tools.some((t) => t.name === "echo")).toBe(true);

      const agents = await fetch(`${base}/v1/agents`, {
        headers: { authorization: "Bearer test-secret-key" },
      });
      const agentsJson = (await agents.json()) as {
        agents: Array<{ id: string }>;
      };
      expect(agentsJson.agents.some((a) => a.id === "coder")).toBe(true);
    } finally {
      await gw.stop();
    }
  });

  it("creates sessions and streams chat NDJSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "gateway-hi", tool_calls: [] } }],
      }),
    });
    const host = mockToolHost([]);
    const hub = makeHub(host, fetchImpl as unknown as typeof fetch);
    const gw = new GatewayServer({
      getTeamHub: () => hub,
      getToolHost: () => host,
    });

    const status = await gw.start({
      host: "127.0.0.1",
      port: 0,
      apiKey: "chat-key",
    });
    const base = status.url!;
    try {
      const created = await fetch(`${base}/v1/sessions`, {
        method: "POST",
        headers: {
          authorization: "Bearer chat-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ agentId: "coder", title: "API" }),
      });
      expect(created.status).toBe(201);
      const createdJson = (await created.json()) as {
        session: { id: string; agentId: string };
      };
      expect(createdJson.session.agentId).toBe("coder");

      const chat = await fetch(`${base}/v1/chat`, {
        method: "POST",
        headers: {
          authorization: "Bearer chat-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: "hello",
          sessionId: createdJson.session.id,
        }),
      });
      expect(chat.status).toBe(200);
      const ndjson = await chat.text();
      const lines = ndjson
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { type: string; text?: string });
      expect(lines.some((e) => e.type === "token" && e.text === "gateway-hi")).toBe(
        true,
      );
      expect(lines.some((e) => e.type === "done")).toBe(true);
    } finally {
      await gw.stop();
    }
  });
});
