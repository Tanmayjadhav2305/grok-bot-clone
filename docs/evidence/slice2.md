# Slice 2 Evidence ledger (local-exec)

| Feature | Observed (RE) | Designed (ours) | Verification |
|---------|---------------|-----------------|--------------|
| Local command execution | `local-exec-daemon`, sandbox policy strings, argv/spawn | `@bot-computer/local-exec` `runAllowlistedArgv` | package vitest |
| Allowlist policy | sandbox / policy env concepts | `settings.localExec.allowlist` basenames | vitest + Settings UI |
| No shell string | RE prefers structured command pipes | argv array only, `shell: false` | code review + tests |
| MCP surface | MCP tools on bot computer | builtin MCP `local-exec` / `run_argv` | desktop injects server |

Unknown: exact Sand sandbox helper binary behavior — not reimplemented in Slice 2.
