# Bot Computer

Open-source **local-first** agent desktop.

- **Slice 1:** chat (OpenAI-compatible / Ollama), MCP stdio tools, allow/deny permission gate  
- **Slice 2:** built-in **local-exec** MCP (`run_argv`) with executable allowlist (no shell strings)  
- **Slice 3:** local **computer-use** (`screenshot`, `display_info`; optional Windows click/type)  
- **Slice 4:** MCP **SSE** transport + **connector** plugin API (sample `http-fetch`)  
- **Slice 5:** optional **self-hosted HTTP gateway** (`/health`, `/v1/tools`, `/v1/chat`)  
- **Slice 6:** **team agents** + multi-session chat (Default / Researcher / Coder / Computer)  
- **Slice 7:** **live computer preview** pane + see→act computer-use loop (local desktop)  
- **Slice 8:** **Bot Studio** (create/name/describe bots) + **Agent Browser** (`browser/*`) with proof screenshots in chat  
- **Slice 9:** **Automations** — schedules, skills (observe & repeat), shared workspace, multi-bot `team/delegate`, local sheets/mail/calendar + Slack webhook  
- **Slice 10:** **Sandbox Computer** — Grok-like isolated browser embedded in the Live pane (not a cloud VM; host OS control off by default)

This is an independent clean-room project inspired by reverse-engineering notes of Grok Bot’s *architecture*. It is **not** affiliated with Cursor, xAI, or Anysphere, and does not include their proprietary code or assets.

## Requirements

- Node.js 20+
- Optional: [Ollama](https://ollama.com) for local models

## Setup

```bash
cd projects/bot-computer
npm install
npm test
npm start
```

## Settings

In the app **Settings** tab:

- **Base URL** — e.g. `http://127.0.0.1:11434/v1` (Ollama) or an OpenAI-compatible API
- **Model ID** — e.g. `llama3.2`
- **MCP servers** — JSON array. Stdio fixture:

```json
[
  {
    "id": "fixture",
    "name": "Fixture Echo",
    "transport": "stdio",
    "command": "node",
    "args": ["C:/ABSOLUTE/PATH/TO/projects/bot-computer/apps/fixture-mcp/src/server.js"],
    "enabled": true
  }
]
```

SSE fixture (run `npm start -w @bot-computer/fixture-mcp-sse` in another terminal):

```json
[
  {
    "id": "fixture-sse",
    "name": "Fixture SSE Echo",
    "transport": "sse",
    "url": "http://127.0.0.1:3921/mcp",
    "enabled": true
  }
]
```

- **Computer use** — enable `display_info` / `screenshot`; optionally allow Windows `click` / `type_text` (still permission-gated)
- **Local exec allowlist** — comma-separated executable basenames for builtin `local-exec` / `run_argv`
- **Connectors** — enable built-in plugins (e.g. HTTP Fetch → `http-fetch/get`)
- **Bots (Slice 8)** — **Bots** tab: create/edit/delete bots (name, description, instructions, optional modelId). Chat sidebar: pick bot → New session
- **Agent Browser** — tools `browser/open|navigate|screenshot|read_text|click|type_text`. Screenshots stream to Live computer + appear as proof in chat. Prefer **Computer** / **Researcher** bots for web tasks. Logins persist via Chromium partition.
- **Automations (Slice 9)** — **Auto** tab: schedules (`dailyAt` or `intervalMinutes`) + skills (browser step JSON). Connectors: `sheets`, `mail`, `calendar`, `notify`, `workspace`, `skills`, `team`. Bots: Ops / Sales / QA / Writer for digest, pipeline, QA, handoff.
- **Gateway** — enable local HTTP API (default `http://127.0.0.1:8787`). API key auto-generated on save if empty. Example:

```bash
curl -s http://127.0.0.1:8787/health
curl -s -H "Authorization: Bearer YOUR_KEY" http://127.0.0.1:8787/v1/tools
curl -s -H "Authorization: Bearer YOUR_KEY" http://127.0.0.1:8787/v1/agents
curl -sN -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \
  -d "{\"text\":\"hello\",\"agentId\":\"coder\"}" http://127.0.0.1:8787/v1/chat
```

Gateway tool calls only succeed for tools already in **Always allow** (no permission modal over HTTP).

API keys in Slice 1 are stored in Electron `userData` as plain JSON — do not use production secrets without a later hardening slice.

## License

MIT

## Docs

- [Slice 1 design](docs/specs/2026-10-21-slice1-design.md)
- [Slice 1 plan](docs/plans/2026-10-21-slice1.md)
- [Evidence ledger (Slice 1)](docs/evidence/slice1.md)
- [Slice 2 local-exec design](docs/specs/2026-10-21-slice2-local-exec-design.md)
- [Evidence ledger (Slice 2)](docs/evidence/slice2.md)
- [Slice 3 computer-use design](docs/specs/2026-10-21-slice3-computer-use-design.md)
- [Evidence ledger (Slice 3)](docs/evidence/slice3.md)
- [Slice 4 MCP SSE + connectors design](docs/specs/2026-10-21-slice4-mcp-sse-connectors-design.md)
- [Evidence ledger (Slice 4)](docs/evidence/slice4.md)
- [Slice 5 gateway design](docs/specs/2026-10-21-slice5-gateway-design.md)
- [Evidence ledger (Slice 5)](docs/evidence/slice5.md)
- [Slice 6 team agents design](docs/specs/2026-10-21-slice6-team-agents-design.md)
- [Evidence ledger (Slice 6)](docs/evidence/slice6.md)
- [Slice 7 live computer preview design](docs/specs/2026-10-21-slice7-live-computer-preview-design.md)
- [Evidence ledger (Slice 7)](docs/evidence/slice7.md)
- [Slice 8 Bot Studio + Agent Browser design](docs/specs/2026-10-21-slice8-bot-studio-agent-browser-design.md)
- [Evidence ledger (Slice 8)](docs/evidence/slice8.md)
- [Slice 9 Automations platform design](docs/specs/2026-10-21-slice9-automations-platform-design.md)
- [Evidence ledger (Slice 9)](docs/evidence/slice9.md)
- [Slice 10 Sandbox Computer design](docs/specs/2026-10-21-slice10-sandbox-computer-design.md)
