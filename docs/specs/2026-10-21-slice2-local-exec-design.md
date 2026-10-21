# Bot Computer — Slice 2 Design (Local-exec allowlist)

**Status:** implemented  

**Depends on:** Slice 1

## Goal

Add a **local command runner** that only executes binaries on an explicit allowlist — inspired by Sand/Grok Bot local-exec + sandbox policy *roles*, clean-room implementation.

## Behavior

- Settings: `localExec.allowlist: string[]` (executable basenames, e.g. `node`, `git`)
- Built-in MCP server `local-exec` exposes tool `run_argv`
- Arguments are an **argv array** (no shell string); reject empty argv
- Resolve executable via `PATH` / absolute path; basename must match allowlist (case-insensitive on Windows)
- Capture stdout/stderr (truncated), exit code, timeout
- Still goes through Slice 1 permission modal unless always-allowed

## Non-goals

- Full OS sandbox / seccomp / Seatbelt (later)
- `cmd.exe /c` arbitrary shell strings
- Computer-use / VNC (Slice 3)
