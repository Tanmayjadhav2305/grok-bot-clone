# Bot Computer — Slice 4 Design (MCP SSE + connector plugins)

**Status:** implemented  

**Depends on:** Slice 1–3

## Goal

Add **remote MCP over SSE** and a **local connector plugin API** — inspired by Sand/Grok Bot MCP + connector *roles*, clean-room implementation (no OAuth marketplace).

## Behavior

### MCP transports

- Settings `mcp.servers[]` gains `transport: "stdio" | "sse"` (default `stdio` for back-compat).
- **stdio:** existing `command` / `args` / `env`.
- **sse:** `url` (SSE MCP endpoint) + optional `headers` (e.g. `Authorization`).
- Host soft-fails per server on connect errors (same as Slice 1).
- Still permission-gated via Slice 1 modal.

### Connector plugins

- Package `@bot-computer/connectors` defines:
  - `Connector` — `{ id, name, description, createHost() → ToolHost }`
  - `ConnectorRegistry` — list manifests + instantiate enabled hosts
- Settings: `connectors.enabled: string[]` (connector ids).
- Built-in sample: `http-fetch` → in-process tool `http-fetch/get` (HTTP GET only; truncated body).
- Enabled connector hosts merge into `CompositeToolHost` with MCP + computer-use.

### Fixture

- `apps/fixture-mcp-sse` — minimal HTTP+SSE MCP echo server for local/tests.

## Non-goals

- OAuth connector marketplace (Slack/GitHub/Google sign-in)
- Streamable HTTP transport (can follow; Slice 4 ships classic SSE)
- Self-hosted gateway (Slice 5)
- Encrypted secrets vault
