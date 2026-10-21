#!/usr/bin/env node
/**
 * Minimal HTTP+SSE MCP fixture for Bot Computer Slice 4.
 * GET /mcp — SSE stream; POST /messages?sessionId=… — client messages.
 */
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 3921);

function createEchoServer() {
  const server = new McpServer({
    name: "bot-computer-fixture-sse",
    version: "0.1.0",
  });
  server.tool(
    "echo",
    "Echo back a message (SSE fixture tool for Bot Computer Slice 4)",
    { message: z.string() },
    async ({ message }) => ({
      content: [{ type: "text", text: `sse-echo:${message}` }],
    }),
  );
  return server;
}

/** @type {Map<string, SSEServerTransport>} */
const transports = new Map();

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/mcp") {
    try {
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);
      transport.onclose = () => {
        transports.delete(sessionId);
      };
      const mcp = createEchoServer();
      await mcp.connect(transport);
    } catch (err) {
      console.error("SSE connect failed:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("SSE connect failed");
      }
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/messages") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400);
      res.end("Missing sessionId");
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404);
      res.end("Session not found");
      return;
    }
    try {
      await transport.handlePostMessage(req, res);
    } catch (err) {
      console.error("POST /messages failed:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("message handling failed");
      }
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`fixture-mcp-sse listening on http://127.0.0.1:${PORT}/mcp`);
});
