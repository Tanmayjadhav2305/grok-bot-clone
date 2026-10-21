import { describe, expect, it, vi } from "vitest";
import { PermissionGate } from "@bot-computer/permissions";
import type { ToolHost } from "@bot-computer/mcp-host";
import { TeamHub } from "./index.js";

const emptyHost: ToolHost = {
  async listTools() {
    return [];
  },
  async callTool() {
    return { ok: true, content: "ok" };
  },
};

describe("TeamHub", () => {
  it("creates sessions bound to agents and switches active", () => {
    const hub = new TeamHub({
      getToolHost: () => emptyHost,
      createPermissions: () =>
        new PermissionGate([], async () => "deny"),
      getModel: () => ({
        baseUrl: "http://127.0.0.1:9/v1",
        apiKey: "",
        modelId: "m",
      }),
      getAgents: () => [
        {
          id: "default",
          name: "Default",
          systemPrompt: "default prompt",
        },
        {
          id: "coder",
          name: "Coder",
          systemPrompt: "coder prompt",
        },
      ],
    });

    const a = hub.createSession({ agentId: "coder", title: "Work" });
    expect(a.agentId).toBe("coder");
    expect(a.title).toBe("Work");
    expect(hub.getActiveSessionId()).toBe(a.id);

    const b = hub.createSession({ agentId: "default" });
    expect(hub.listSessions()).toHaveLength(2);
    hub.setActiveSession(a.id);
    expect(hub.getActiveSessionId()).toBe(a.id);
    expect(hub.deleteSession(a.id)).toBe(true);
    expect(hub.getActiveSessionId()).toBe(b.id);
  });

  it("runs a turn with the agent system prompt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "from-coder", tool_calls: [] } }],
      }),
    });

    const hub = new TeamHub({
      getToolHost: () => emptyHost,
      createPermissions: () =>
        new PermissionGate([], async () => "deny"),
      getModel: () => ({
        baseUrl: "http://llm.test/v1",
        apiKey: "",
        modelId: "mock",
      }),
      getAgents: () => [
        {
          id: "coder",
          name: "Coder",
          systemPrompt: "You are the Coder agent.",
        },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = hub.createSession({ agentId: "coder" });
    const events = [];
    for await (const ev of hub.runTurn(session.id, "hi")) {
      events.push(ev);
    }
    expect(events.some((e) => e.type === "token" && e.text === "from-coder")).toBe(
      true,
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]?.content).toContain("Coder agent");
  });
});
