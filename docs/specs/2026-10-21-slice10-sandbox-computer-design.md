# Bot Computer — Slice 10 Design (Sandbox Computer)

**Status:** implemented  
**Depends on:** Slice 1–9  

## Honest scope

Grok Bot uses a **cloud sandbox / remote desktop**. We cannot replicate their proprietary infra. Slice 10 builds the open-source equivalent:

**A local Sandbox Computer** — isolated Chromium the bot drives, shown **inside** the Live computer pane (Grok-like watch surface), not your whole Windows desktop.

## Approaches considered

| Approach | Pros | Cons |
|----------|------|------|
| A. Embed BrowserView in Live pane | Feels like Grok; no VNC; works offline | Web-only “desktop” (not full Linux VM) |
| B. Docker + noVNC | Closer to real VM sandbox | Heavy; needs Docker; slower |
| C. Keep separate Agent Browser window | Already works | Not “in product” like Grok |

**Chosen:** A now; B as optional follow-up (`docs` stub).

## Behavior

1. **Sandbox mode ON by default** — agent tools target sandbox browser only
2. **OS `computer-use` OFF while sandbox mode** (unless user opts into “allow host desktop”)
3. **Live pane hosts the real sandbox view** (BrowserView/WebContentsView), not only JPEG of primary display
4. **Persistent partition** `persist:bot-computer-sandbox` (logins stay in sandbox)
5. **Outbound approve path** (later slice): draft→confirm before Send — noted, not required to ship A

## Non-goals

- xAI cloud pods / proprietary VNC
- Full Linux desktop in Docker (Slice 10.1)
- Pixel-perfect Grok UI clone
