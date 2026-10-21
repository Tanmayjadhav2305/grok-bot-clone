import { describe, expect, it, vi } from "vitest";
import { PermissionGate } from "@bot-computer/permissions";
import type { McpHost } from "@bot-computer/mcp-host";
import {
  AgentRuntime,
  compactToolContentForModel,
  extractScreenshotDataUrl,
} from "./index.js";

describe("extractScreenshotDataUrl", () => {
  it("reads dataUrl from screenshot JSON", () => {
    expect(
      extractScreenshotDataUrl(
        JSON.stringify({ path: "x.jpg", dataUrl: "data:image/jpeg;base64,abc" }),
      ),
    ).toBe("data:image/jpeg;base64,abc");
  });

  it("reads nested verify.dataUrl after click", () => {
    expect(
      extractScreenshotDataUrl(
        JSON.stringify({
          clicked: true,
          verify: { dataUrl: "data:image/jpeg;base64,xyz" },
        }),
      ),
    ).toBe("data:image/jpeg;base64,xyz");
  });
});

describe("compactToolContentForModel", () => {
  it("omits dataUrl bytes from model transcript", () => {
    const out = compactToolContentForModel(
      JSON.stringify({
        navigated: "https://example.com",
        dataUrl: "data:image/jpeg;base64,aaaaaaaa",
      }),
    );
    expect(out).not.toContain("aaaaaaaa");
    expect(out).toContain("omitted jpeg");
    expect(out).toContain("https://example.com");
  });
});

function mockMcp(tools: Array<{ serverId: string; name: string }>): McpHost {
  return {
    listTools: async () =>
      tools.map((t) => ({
        serverId: t.serverId,
        name: t.name,
        description: t.name,
      })),
    callTool: async (
      _s: string,
      _n: string,
      args: unknown,
    ) => ({
      ok: true,
      content: `called:${JSON.stringify(args)}`,
    }),
    reload: async () => undefined,
    dispose: async () => undefined,
    listServers: () => [],
  } as unknown as McpHost;
}

describe("AgentRuntime", () => {
  it("streams assistant text without tools", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "hello world", tool_calls: [] } }],
      }),
    });
    const runtime = new AgentRuntime({
      mcp: mockMcp([]),
      permissions: new PermissionGate([], async () => "allow-once"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const events = [];
    for await (const ev of runtime.runTurn("hi", {
      baseUrl: "http://example.test/v1",
      apiKey: "",
      modelId: "test",
    })) {
      events.push(ev);
    }
    expect(events).toContainEqual({ type: "token", text: "hello world" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("runs a tool call after permission allow", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "tc1",
                    type: "function",
                    function: {
                      name: "fixture__echo",
                      arguments: JSON.stringify({ message: "x" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "done", tool_calls: [] } }],
        }),
      });

    const runtime = new AgentRuntime({
      mcp: mockMcp([{ serverId: "fixture", name: "echo" }]),
      permissions: new PermissionGate([], async () => "allow-once"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const events = [];
    for await (const ev of runtime.runTurn("use echo", {
      baseUrl: "http://example.test/v1",
      apiKey: "k",
      modelId: "test",
    })) {
      events.push(ev);
    }

    expect(events.some((e) => e.type === "tool_call")).toBe(true);
    expect(events.some((e) => e.type === "tool_result" && e.ok)).toBe(true);
    expect(events.some((e) => e.type === "token" && e.text === "done")).toBe(
      true,
    );
  });

  it("emits proof_image when browser tool returns a dataUrl", async () => {
    const dataUrl = "data:image/jpeg;base64,proofbytes";
    const mcp = {
      listTools: async () => [
        {
          serverId: "browser",
          name: "screenshot",
          description: "shot",
        },
      ],
      callTool: async () => ({
        ok: true,
        content: JSON.stringify({ width: 10, height: 10, dataUrl }),
      }),
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "tc1",
                    type: "function",
                    function: {
                      name: "browser__screenshot",
                      arguments: "{}",
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "here is proof", tool_calls: [] } }],
        }),
      });

    const runtime = new AgentRuntime({
      mcp: mcp as unknown as McpHost,
      permissions: new PermissionGate([], async () => "allow-once"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const events = [];
    for await (const ev of runtime.runTurn("screenshot", {
      baseUrl: "http://example.test/v1",
      apiKey: "",
      modelId: "test",
    })) {
      events.push(ev);
    }

    expect(
      events.some(
        (e) =>
          e.type === "proof_image" &&
          e.dataUrl === dataUrl &&
          e.caption === "browser/screenshot",
      ),
    ).toBe(true);
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult && "content" in toolResult && toolResult.content).not.toContain(
      "proofbytes",
    );
  });
});
