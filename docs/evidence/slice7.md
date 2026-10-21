# Slice 7 Evidence ledger (live computer preview)

| Feature | Observed (RE) | Designed (ours) | Verification |
|---------|---------------|-----------------|--------------|
| Live computer preview pane | Grok Bot right-hand desktop stream / VNC preview | Electron `desktopCapturer` JPEG stream → UI panel | Manual: open Computer pane |
| “Do it on your computer so I can watch” | Agent acts on visible desktop | Local primary display preview + computer-use tools | Manual act loop |
| See → act loop | Computer-use / VNC interactivity | Screenshot/click/type + optional vision frames to LLM | Manual + unit tests |
| Cloud sandbox desktop | Hosted bot computer | Deferred — local machine only | N/A |

Unknown / deferred: remote noVNC sandbox, multi-monitor picker, macOS/Linux input parity.
