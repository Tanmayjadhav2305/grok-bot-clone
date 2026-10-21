# Slice 3 Evidence ledger (computer-use)

| Feature | Observed (RE) | Designed (ours) | Verification |
|---------|---------------|-----------------|--------------|
| Screen capture | `sand-window-capture`, computer-screen-preview, VNC frames | Electron `desktopCapturer` → PNG path | Manual in app |
| Display metrics | computer preview sizing | `display_info` tool | Manual |
| Computer-use tools | `cursorcomputeruse`, computer-use app IDs | In-process `computer-use/*` via CompositeToolHost | list tools in UI |
| Input | VNC interactivity / local driver concepts | Opt-in `click` / `type_text` (Windows) | Manual; default off |
| Permission gate | tool permissions | Same Slice 1 modal | Manual |

Unknown / deferred: remote VNC viewer, cloud sandbox, cross-platform input beyond Windows.
