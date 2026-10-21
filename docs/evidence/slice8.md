# Slice 8 Evidence ledger (bot studio + agent browser)

| Feature | Observed (RE / product UI) | Designed (ours) | Verification |
|---------|---------------------------|-----------------|--------------|
| Named bots / create bot | Team bot / connector cards, named sessions | Bot Studio CRUD: name, description, instructions | Unit + manual Bots tab |
| Live computer while working | Right-hand desktop / VNC preview | Agent Browser window + capture stream to Live pane | Manual research task |
| Web research with proof | Agent browses Product Hunt etc. | `browser/navigate` + screenshots as `proof_image` | agent-runtime proof_image test + manual |
| Messaging apps | Deferred (WhatsApp etc.) | Path: WhatsApp Web inside Agent Browser later | Not in Slice 8 |

Unknown: exact Grok cloud sandbox provisioning — not replicated; local Chromium workspace instead.

## How to demo (article research)

1. `npm start` in `projects/bot-computer`
2. **Bots** → confirm **Computer** or **Researcher** (or create your own)
3. Chat → pick that bot → **New** session
4. Always-allow `browser/open`, `browser/navigate`, `browser/screenshot`, `browser/read_text` when prompted
5. Ask: *Find 5 famous tech articles from today. Open the Agent Browser, screenshot each source, and list titles + URLs with proof.*
6. Watch the Agent Browser window + Live computer pane; proof JPEGs appear inline in chat
