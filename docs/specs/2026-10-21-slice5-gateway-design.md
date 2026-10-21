# Bot Computer — Slice 5 Design (Self-hosted gateway)

**Status:** implemented  

**Depends on:** Slice 1–4

## Goal

Optional **local HTTP gateway** so other clients on the machine (or LAN, if explicitly bound) can run chat turns against the same tools — clean-room, not a proprietary cloud bot-computer.

## Behavior

- Settings `gateway`: `enabled` (default false), `host` (`127.0.0.1`), `port` (`8787`), `apiKey`
- When enabled with empty `apiKey`, desktop generates one and persists it
- Package `@bot-computer/gateway` serves:
  - `GET /health` — liveness (no auth)
  - `GET /v1/tools` — list tools (auth)
  - `POST /v1/chat` — body `{ "text": "…" }`; NDJSON stream of `ChatStreamEvent` (auth)
- Auth: `Authorization: Bearer <apiKey>` or `x-api-key`
- Each chat request uses a **fresh** `AgentRuntime` so UI transcript is not shared
- Tool permissions: **no interactive modal** over HTTP — only `permissions.alwaysAllow` tools run; anything else is denied
- Desktop starts/stops the gateway when settings change; Settings UI shows URL + key

## Non-goals

- TLS / reverse-proxy setup
- Multi-user OAuth / accounts
- Team/multi-agent orchestration (Slice 6)
- Cloud relay or vendor-hosted sandbox
