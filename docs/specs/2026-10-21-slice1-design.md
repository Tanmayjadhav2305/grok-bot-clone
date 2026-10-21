# Bot Computer — Slice 1 Design

**Status:** approved — Slice 1 implementation in progress / shipped locally  
**Date:** 2026-10-21  
**Product:** open-source local-first agent desktop (working name: **Bot Computer**)  
**Method:** clean-room reconstruction inspired by Grok Bot / Sand static Evidence — observed contracts inform design; no proprietary source, assets, or trademarks are copied.

## 1. Goal

Ship a runnable open-source Electron app that can:

1. Chat with a pluggable LLM (OpenAI-compatible HTTP and/or Ollama).
2. Host MCP servers over **stdio**, list tools, and invoke tools with an explicit allow/deny gate.
3. Persist settings (model endpoint, MCP server list) on disk.
4. Document each shipped capability against RE Evidence IDs (observed vs designed).

Slice 1 is the foundation for later slices (computer-use, connectors, team bots). It is not Grok Bot feature parity.

## 2. Non-goals (Slice 1)

- VNC / desktop mount / window capture / cloud sandbox
- OAuth connectors (Slack, GitHub, Google, 1Password, …)
- Team bots, sharing, memories, meetings, email
- Pixel-perfect or brand-compatible UI with Grok Bot
- Vendoring or redistributing ASAR / extracted Sand binaries or minified sources

## 3. Provenance rules

| Kind | Rule |
|------|------|
| **Observed** | Cite Evidence ID / path from RE notes (e.g. IPC channel concepts, MCP stdio/SSE, permission gate). |
| **Designed** | Our names, schemas, UX, and implementation. Prefer `bot:` IPC namespace, not `sand:`. |
| **Unknown** | Mark explicitly; do not invent Grok Bot server behavior as fact. |

Evidence notes live in-repo at `docs/evidence/slice1.md` and link to RE session artifacts under `.cache/grok-bot-re/` (local only; do not publish ASAR extracts).

## 4. Architecture

```
┌─────────────────────────────────────────┐
│ Renderer (React)                        │
│  Chat · Settings · MCP · Permission UI  │
└───────────────┬─────────────────────────┘
                │ contextBridge (typed)
┌───────────────▼─────────────────────────┐
│ Preload                                  │
│  bot.desktop · bot.mcp · bot.agent       │
└───────────────┬─────────────────────────┘
                │ IPC
┌───────────────▼─────────────────────────┐
│ Electron Main                            │
│  ├─ agent-runtime  (turn loop, stream)   │
│  ├─ mcp-host       (stdio child procs)   │
│  ├─ permissions    (allow once/always)   │
│  └─ settings store (JSON on disk)        │
└─────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   LLM HTTP API         MCP server processes
```

**Deployment model:** local-first. Optional self-hosted gateway is a later slice; interfaces must not hard-code a proprietary cloud.

## 5. Repository layout

New tree (not inside REA `src/`):

```
projects/bot-computer/
  apps/desktop/           # Electron main, preload, renderer
  packages/contracts/     # Shared Zod/TS IPC + settings schemas
  packages/agent-runtime/ # Model client + tool-calling loop
  packages/mcp-host/      # MCP stdio client/host
  packages/permissions/   # Policy store + evaluation
  docs/specs/             # This design + later slice specs
  docs/evidence/          # Evidence → feature ledger
  README.md
  package.json            # npm workspaces or pnpm workspace
```

**License:** MIT (default) unless changed before first public release.  
**Package name:** `@bot-computer/*` (not `sand`, not `grok-bot`).

## 6. Contracts (Slice 1)

### 6.1 Settings (persisted)

- `model.baseUrl`, `model.apiKey` (OS keychain or encrypted file — v1 may use userData file with clear warning), `model.modelId`
- `mcp.servers[]`: `{ id, name, command, args[], env?, enabled }`
- `permissions.alwaysAllow[]`: tool keys (`serverId/toolName`)

### 6.2 IPC (designed names; RE-inspired roles)

| Channel / API | Direction | Purpose |
|---------------|-----------|---------|
| `bot:settings:get` / `set` | renderer ↔ main | Load/save settings |
| `bot:chat:send` | renderer → main | Start a user turn |
| `bot:chat:stream` | main → renderer | Token / tool / done events |
| `bot:chat:cancel` | renderer → main | Abort in-flight turn |
| `bot:mcp:list` | renderer → main | Connected servers + tools |
| `bot:mcp:reload` | renderer → main | Restart MCP children from settings |
| `bot:permission:request` | main → renderer | Modal: allow once / always / deny |
| `bot:permission:resolve` | renderer → main | User decision |

Preload exposes a minimal `window.bot` object (`desktop`, `agent`, `mcp`) — same *role* as observed bridges (`desktop`, MCP-related surfaces), different API shape.

### 6.3 Agent turn (runtime)

1. User message appended to session transcript (in-memory + optional disk later).
2. Model called with tool definitions from enabled MCP servers.
3. On `tool_call`: permissions evaluate → if needed, UI gate → mcp-host `tools/call`.
4. Tool result returned to model; stream continues until stop.
5. Errors surface as structured stream events (no silent swallow).

### 6.4 MCP host

- Transport: **stdio only** in Slice 1 (SSE deferred).
- Lifecycle: spawn on reload/enable; restart on crash with backoff; dispose on quit.
- Protocol: MCP tools list + call (pin a current `@modelcontextprotocol/sdk` version in the plan).
- UI copy may note that tools run **on this machine** (aligned with observed “runs on bot computer” messaging; our wording).

## 7. UI (Slice 1)

Single window:

- Left or top: conversation list (v1 can be one session).
- Center: messages + streaming assistant text + tool call cards.
- Modal: permission prompt.
- Settings route: model + MCP server editor (JSON form fields, not freeform-only).

Visual design is original (not Grok Bot chrome). Keep layout simple and accessible.

## 8. Testing & verification

- Unit: permissions policy, settings schema parse, MCP tool-key formatting.
- Integration: mcp-host against a fixture stdio server (in-repo tiny MCP).
- Desktop smoke: main process boots; preload API shape matches contracts.
- Evidence checklist in `docs/evidence/slice1.md`: each feature row = observed reference → our contract → test name.

Later: optional REA `verify_reconstruction` against a typed finite spec — not required to ship Slice 1.

## 9. Success criteria

Slice 1 is done when:

1. `npm start` (or documented script) launches the desktop app.
2. User can complete one chat turn with a local or remote OpenAI-compatible model.
3. User can add a fixture MCP server, approve a tool once, and see the tool result in the thread.
4. Settings survive restart.
5. README states license, local-first scope, and that the product is independent of Cursor/xAI.

## 10. Later slices (roadmap only)

| Slice | Focus |
|-------|--------|
| 2 | Stronger local-exec allowlist / sandbox policy |
| 3 | Computer-use (screenshot + input) — local first |
| 4 | MCP SSE + connector plugin API *(implemented)* |
| 5 | Optional self-hosted gateway *(implemented)* |
| 6 | Team/multi-agent features *(implemented)* |
| 7 | Live computer preview + act loop *(implemented)* |

Each slice gets its own spec → plan → implementation cycle.

## 11. Open decisions (resolved for Slice 1)

| Topic | Decision |
|-------|----------|
| Hosting | Local-first |
| Reconstruction style | Evidence-driven clean-room |
| First vertical | Chat + MCP stdio + permissions |
| Repo location | `projects/bot-computer/` inside this workspace for now (can split to its own git remote later) |
