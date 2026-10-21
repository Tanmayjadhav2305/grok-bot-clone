#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "bot-computer-fixture",
  version: "0.1.0",
});

server.tool(
  "echo",
  "Echo back a message (fixture tool for Bot Computer Slice 1)",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: `echo:${message}` }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
