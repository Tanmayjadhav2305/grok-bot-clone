import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { ConnectorRegistry, httpFetchConnector } from "./index.js";

describe("ConnectorRegistry", () => {
  it("lists builtin connectors", () => {
    const reg = new ConnectorRegistry();
    const list = reg.list();
    expect(list.some((c) => c.id === "http-fetch")).toBe(true);
  });

  it("creates hosts only for enabled ids", async () => {
    const reg = new ConnectorRegistry();
    expect(reg.createHosts([]).length).toBe(0);
    const hosts = reg.createHosts(["http-fetch", "missing", "http-fetch"]);
    expect(hosts.length).toBe(1);
    const tools = await hosts[0]!.listTools();
    expect(tools.some((t) => t.serverId === "http-fetch" && t.name === "get")).toBe(
      true,
    );
  });
});

describe("http-fetch connector", () => {
  it("rejects non-http urls", async () => {
    const host = httpFetchConnector.createHost({});
    const result = await host.callTool("http-fetch", "get", {
      url: "file:///etc/passwd",
    });
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/http\/https/i);
  });

  it("GETs a local http server", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello-connector");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      server.close();
      throw new Error("expected tcp address");
    }
    try {
      const host = httpFetchConnector.createHost({});
      const result = await host.callTool("http-fetch", "get", {
        url: `http://127.0.0.1:${addr.port}/`,
      });
      expect(result.ok).toBe(true);
      expect(result.content).toContain("hello-connector");
      expect(result.content).toContain('"status": 200');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
