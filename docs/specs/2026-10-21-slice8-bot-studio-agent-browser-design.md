# Bot Computer — Slice 8 Design (Bot Studio + Agent Browser)

**Status:** implemented  

**Depends on:** Slice 1–7  
**RE note:** Grok Bot shows named bots + a live computer the agent drives. Full cloud sandbox/VNC is still deferred; this slice adds a **dedicated agent browser workspace** the user can watch — the right shape for “research on your computer” and later WhatsApp Web–style tasks.

## Goal

Stop being “chat that can screenshot my PC.” Become an **agent product**:
1. **Create bots** — name, description, instructions (system prompt)
2. **Agent Browser** — a real Chromium workspace the bot controls (`navigate` / `click` / `type` / `read` / `screenshot`)
3. **Proof** — screenshots stream into the Live computer pane and appear in chat as evidence

## Behavior

### Bot Studio

- `team.agents[]` gains `description`
- UI tab **Bots**: create / edit / delete (name, description, instructions, optional modelId)
- Sessions pick a bot; default includes **Computer** bot tuned for browser tasks

### Agent Browser tools (`browser/*`)

| Tool | Role |
|------|------|
| `navigate` | Load URL in the agent workspace |
| `screenshot` | Capture workspace → preview + proof |
| `click` | Click at coordinates in the workspace |
| `type_text` | Type into focused element |
| `read_text` | Extract visible page text (truncated) |
| `open` | Ensure workspace window is visible |

### Runtime

- Browser tools auto-enabled when computer-use enabled (or always on in Slice 8)
- Computer / research prompts prefer `browser/*` for web tasks
- Screenshot tool results include `dataUrl` → chat `proof_image` events + live preview

## Non-goals

- Cloud VM / noVNC sandbox
- Native WhatsApp Desktop automation (later via browser WhatsApp Web or OS input)
- Pixel-perfect Grok Bot UI copy
