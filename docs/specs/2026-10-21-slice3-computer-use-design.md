# Bot Computer — Slice 3 Design (Local computer-use)

**Status:** implemented  

**Depends on:** Slice 1–2

## Goal

Local-first **computer-use** tools inspired by Sand/Grok Bot computer-use *roles* (screen preview, capture) — clean-room, no VNC/cloud sandbox.

## Behavior

- Built-in in-process tools (Electron main, not a Node MCP child — needs `desktopCapturer`):
  - `computer-use` / `display_info` — primary display size + scale
  - `computer-use` / `screenshot` — PNG of primary display (path + size; optional base64 truncated in tool result)
  - `computer-use` / `click` — move + left-click at screen coords (Windows; opt-in)
  - `computer-use` / `type_text` — type Unicode text (Windows; opt-in)
- Settings: `computerUse.enabled`, `computerUse.allowInput` (default false)
- All tools still pass Slice 1 permission modal unless always-allowed
- Composite tool host merges MCP + in-process tools for the agent loop

## Non-goals

- Remote VNC / noVNC viewer
- Cloud sandbox pods
- Full accessibility tree / OCR pipeline
