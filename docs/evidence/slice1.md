# Slice 1 Evidence ledger

Maps observed Grok Bot / Sand static findings to Bot Computer design. No proprietary code is copied.

| Feature | Observed (RE) | Designed (ours) | Verification |
|---------|---------------|-----------------|--------------|
| Desktop agent product | `package.json` name `sand`, productName Grok Bot, `@anysphere/*` agent/MCP deps | Independent app `bot-computer`, MIT | App boots via `npm start` |
| MCP stdio host | `custom_stdio`, `mcpServers`, `INLINE_MCP_CONFIG_*`, fixture paths under local-exec | `@bot-computer/mcp-host` + settings `mcp.servers` | `packages/mcp-host` vitest + UI Reload MCP |
| Tool permission gate | `Get/SetGrokBotMcpToolPermissions`, allow flows | `PermissionGate` allow-once / always / deny + modal | `packages/permissions` vitest + UI modal |
| Preload bridge roles | `desktop`, MCP-related surfaces, `sand:*` IPC | `window.bot` + `bot:*` IPC | Preload + chat/settings |
| Tools on bot computer | UI copy `runs_on_bot_computer` | Settings/permission copy: tools run on this machine | Manual |
| Chat + model | chat chunks / inference packages (static) | OpenAI-compatible HTTP client in agent-runtime | Manual with Ollama or API |

See also [Slice 2 evidence](slice2.md).

Local RE artifacts (not published): workspace `.cache/grok-bot-re/` Evidence IDs such as `ev_7d3b46bf…`, `ev_9a91ba39…`.
