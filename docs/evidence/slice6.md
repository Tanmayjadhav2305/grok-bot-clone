# Slice 6 Evidence ledger (team / multi-agent)

| Feature | Observed (RE) | Designed (ours) | Verification |
|---------|---------------|-----------------|--------------|
| Team / multi-bot concepts | team custom MCP / multi-conversation UI roles | Local agent profiles + multi-session hub | Desktop sidebar + settings |
| Separate conversations | Chat session list (static UI) | `SessionStore` / `TeamHub` | Create/switch/delete |
| Agent personality | System / instruction surfaces | Per-agent `systemPrompt` (+ optional `modelId`) | Different replies by agent |
| Gateway multi-agent | Hosted bot computer APIs | `/v1/agents`, `/v1/sessions`, chat with `agentId`/`sessionId` | gateway vitest |
| Shared tools | Tools on bot computer | Shared ToolHost + PermissionGate | Unchanged |

Unknown / deferred: cloud sync, persistent transcripts on disk, autonomous agent swarms, org ACLs.
