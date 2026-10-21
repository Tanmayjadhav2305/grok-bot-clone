# Bot Computer — Slice 7 Design (Live computer preview + act loop)

**Status:** implemented  

**Depends on:** Slice 1–6 (esp. Slice 3 computer-use)

## Goal

Grok Bot–like **watch the computer while the agent works**: chat + **live desktop preview** panel, and a stronger **see → act → see** computer-use loop on the **local machine** (clean-room; not cloud VNC/sandbox).

## Behavior

### Live preview UI

- Chat layout: sessions | messages | **Computer** preview pane
- Preview streams JPEG frames of the primary display while enabled
- Settings: `computerUse.livePreview`, `previewIntervalMs` (default ~750ms)
- Toggle preview from the chat header (“Computer”)

### Capture pipeline

- Electron main: `desktopCapturer` on an interval → JPEG data URL / base64 over IPC `bot:preview:frame`
- Start/stop via IPC; stops when window closes or setting off

### Act loop

- Default agent prompt gains computer-use guidance when tools are available
- New built-in agent profile **Computer** optimized for screen tasks
- After `click` / `type_text`, host auto-captures a fresh frame (preview + tool path)
- Optional `computerUse.vision`: attach latest screenshot as multimodal image content to the next LLM turn (OpenAI-compatible `image_url`)
- Tool loop limit raised for computer sessions (16 steps)

### Permissions

- Unchanged modal; recommend Always allow `computer-use/screenshot` (and click/type if input enabled) for smooth demos
- `allowInput` still default **false** until user opts in

## Non-goals

- Remote cloud sandbox / noVNC server (Grok’s hosted machine)
- Pixel-perfect Grok Bot chrome
- Full accessibility-tree / OCR pipeline
- Cross-platform input beyond Windows (same as Slice 3)
