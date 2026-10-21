# Bot Computer — Slice 6 Design (Team / multi-agent)

**Status:** implemented  

**Depends on:** Slice 1–5

## Goal

Local **multi-agent profiles** and **multi-session** chat — inspired by team-bot / multi-conversation *roles*, clean-room (no cloud team sync).

## Behavior

### Agent profiles

- Settings `team.agents[]`: `{ id, name, systemPrompt, modelId? }`
- Defaults: `default`, `researcher`, `coder` (different system prompts; shared global model unless `modelId` set)
- Desktop Settings: edit agents as JSON (same pattern as MCP servers)

### Sessions

- Package `@bot-computer/team`: `SessionStore` + `TeamHub`
- Each session: `{ id, title, agentId, createdAt, updatedAt }` + in-memory transcript via its own `AgentRuntime`
- Desktop chat: sidebar list — New session, switch, delete; badge shows agent name
- Sending a message routes to the **active** session’s runtime
- Stream events include `sessionId`

### Gateway

- `GET /v1/agents` — list profiles
- `GET /v1/sessions` — list sessions
- `POST /v1/sessions` — `{ agentId?, title? }` → create
- `POST /v1/chat` — optional `sessionId` / `agentId` (creates session if omitted)

### Permissions / tools

- Shared `ToolHost` + `PermissionGate` across agents (same machine)
- No separate per-agent tool allowlists in Slice 6

## Non-goals

- Cloud team sharing / org accounts
- Autonomous multi-agent debate loops
- Persistent transcript disk store (in-memory + session metadata only; disk later)
- Meetings / email / memories marketplace
