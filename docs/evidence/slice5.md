# Slice 5 Evidence ledger (self-hosted gateway)

| Feature | Observed (RE) | Designed (ours) | Verification |
|---------|---------------|-----------------|--------------|
| Hosted / remote bot computer | Cloud sandbox + remote agent surfaces (static) | Optional **local** HTTP gateway only | gateway vitest + Settings |
| Chat API | Chat stream / inference packages | `POST /v1/chat` NDJSON `ChatStreamEvent` | Unit test with mock runtime deps |
| Auth | Account / device session concepts | Bearer / `x-api-key` required when enabled | 401 without key |
| Tools over network | MCP + connectors on bot computer | `GET /v1/tools`; tools use shared `ToolHost` | List + alwaysAllow-only policy |
| Permission gate | Interactive allow modal | Gateway auto-denies asks; only always-allow | Documented + test |

Unknown / deferred: TLS, multi-tenant auth, cloud relay, team bots (Slice 6).
