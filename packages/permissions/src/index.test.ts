import { describe, expect, it, vi } from "vitest";
import { PermissionGate } from "./index.js";

describe("PermissionGate", () => {
  it("allows when already always-allowed", async () => {
    const ask = vi.fn();
    const gate = new PermissionGate(["echo/ping"], ask);
    const result = await gate.authorize({
      serverId: "echo",
      toolName: "ping",
      arguments: {},
      requestId: "1",
    });
    expect(result).toBe("allow");
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks user and records allow-always", async () => {
    const ask = vi.fn().mockResolvedValue("allow-always");
    const gate = new PermissionGate([], ask);
    const first = await gate.authorize({
      serverId: "echo",
      toolName: "ping",
      arguments: { x: 1 },
      requestId: "1",
    });
    expect(first).toBe("allow");
    expect(gate.listAlwaysAllow()).toContain("echo/ping");

    const ask2 = vi.fn();
    gate.setAlwaysAllow(gate.listAlwaysAllow());
    const gate2 = new PermissionGate(gate.listAlwaysAllow(), ask2);
    await gate2.authorize({
      serverId: "echo",
      toolName: "ping",
      arguments: {},
      requestId: "2",
    });
    expect(ask2).not.toHaveBeenCalled();
  });

  it("denies when user denies", async () => {
    const ask = vi.fn().mockResolvedValue("deny");
    const gate = new PermissionGate([], ask);
    const result = await gate.authorize({
      serverId: "echo",
      toolName: "ping",
      arguments: {},
      requestId: "1",
    });
    expect(result).toBe("deny");
  });
});
