#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runAllowlistedArgv } from "@bot-computer/local-exec";

function parseAllowlist() {
  const raw = process.env.BOT_COMPUTER_ALLOWLIST ?? "node,git";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowlist = parseAllowlist();
const timeoutMs = Number(process.env.BOT_COMPUTER_EXEC_TIMEOUT_MS ?? 30_000);
const maxOutputBytes = Number(
  process.env.BOT_COMPUTER_EXEC_MAX_OUTPUT ?? 200_000,
);

const server = new McpServer({
  name: "bot-computer-local-exec",
  version: "0.1.0",
});

server.tool(
  "run_argv",
  "Run an allowlisted local executable with an argv array (no shell). Tools run on this machine.",
  {
    argv: z.array(z.string()).min(1),
    cwd: z.string().optional(),
  },
  async ({ argv, cwd }) => {
    const result = await runAllowlistedArgv(argv, {
      allowlist,
      timeoutMs,
      maxOutputBytes,
      cwd,
    });
    const body = JSON.stringify(result, null, 2);
    return {
      content: [{ type: "text", text: body }],
      isError: !result.ok,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
