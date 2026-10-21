import { describe, expect, it } from "vitest";
import {
  SettingsSchema,
  defaultSettings,
  parseToolKey,
  toolKey,
} from "./index.js";

describe("contracts", () => {
  it("parses default settings", () => {
    const s = defaultSettings();
    expect(s.model.modelId).toBe("llama3.2");
    expect(s.mcp.servers).toEqual([]);
    expect(s.permissions.alwaysAllow).toEqual([]);
    expect(s.localExec.allowlist).toContain("node");
    expect(s.localExec.enabled).toBe(true);
    expect(s.computerUse.enabled).toBe(true);
    expect(s.computerUse.allowInput).toBe(false);
    expect(s.sandbox.enabled).toBe(true);
    expect(s.sandbox.allowHostDesktop).toBe(false);
    expect(s.computerUse.livePreview).toBe(false);
    expect(s.team.agents.some((a) => a.id === "computer")).toBe(true);
    expect(s.connectors.enabled).toContain("workspace");
    expect(s.gateway.enabled).toBe(false);
    expect(s.gateway.port).toBe(8787);
    expect(s.team.agents.length).toBeGreaterThanOrEqual(7);
    expect(s.team.agents.some((a) => a.id === "researcher")).toBe(true);
    expect(s.team.agents.some((a) => a.id === "ops")).toBe(true);
    expect(s.team.agents.find((a) => a.id === "default")?.systemPrompt).toMatch(
      /Do not open the browser/i,
    );
    expect(s.automations.schedules).toEqual([]);
  });

  it("accepts mcp server config", () => {
    const s = SettingsSchema.parse({
      mcp: {
        servers: [
          {
            id: "echo",
            name: "Echo",
            command: "node",
            args: ["fixture.js"],
            enabled: true,
          },
        ],
      },
    });
    expect(s.mcp.servers[0]?.id).toBe("echo");
    expect(s.mcp.servers[0]?.transport).toBe("stdio");
  });

  it("accepts sse mcp server config", () => {
    const s = SettingsSchema.parse({
      mcp: {
        servers: [
          {
            id: "remote",
            name: "Remote",
            transport: "sse",
            url: "http://127.0.0.1:3921/mcp",
            enabled: true,
          },
        ],
      },
      connectors: { enabled: ["http-fetch"] },
    });
    expect(s.mcp.servers[0]?.transport).toBe("sse");
    expect(s.mcp.servers[0]?.url).toContain("3921");
    expect(s.connectors.enabled).toEqual(["http-fetch"]);
  });

  it("formats and parses tool keys", () => {
    expect(toolKey("echo", "ping")).toBe("echo/ping");
    expect(parseToolKey("echo/ping")).toEqual({
      serverId: "echo",
      toolName: "ping",
    });
    expect(parseToolKey("bad")).toBeNull();
  });
});
