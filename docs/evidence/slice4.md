# Slice 4 Evidence ledger (MCP SSE + connectors)

| Feature | Observed (RE) | Designed (ours) | Verification |
|---------|---------------|-----------------|--------------|
| Custom / remote MCP | `custom_stdio`, MCP config, connector chunks | `transport: stdio \| sse` on `mcp.servers` | mcp-host vitest + Reload MCP |
| SSE / HTTP MCP | MCP SDK SSE client roles (static ecosystem) | `SSEClientTransport` in `@bot-computer/mcp-host` | fixture-mcp-sse + vitest |
| Connectors | `chunk-connector-*`, native connector cards | `Connector` + `ConnectorRegistry` plugin API | connectors vitest |
| Sample integration | Marketplace / OAuth connectors (deferred) | Built-in `http-fetch` in-process ToolHost | list tools + permission modal |
| Permission gate | tool permissions | Unchanged Slice 1 modal | Manual |

Unknown / deferred: OAuth flows, Streamable HTTP, connector marketplace UI, encrypted tokens.
