# Slice 9 Evidence ledger (automations platform)

| Feature | Designed | Verification |
|---------|----------|--------------|
| Scheduler (daily / interval) | JobScheduler + Auto tab | Unit `shouldRunJob` + manual Run first schedule |
| Skills replay | skills/run + Auto tab | Manual skill JSON |
| Shared workspace | workspace/note_* + file_* | Tool list + chat |
| Multi-bot delegate | team/delegate | Chat: ask Writer to delegate to Researcher |
| Sheets / mail / calendar / Slack | local connectors | Drop files in userData; webhook URL in Settings |
| Persistent browser profile | `persist:bot-computer-agent` | Login survives restart |
| Ops/Sales/QA/Writer bots | defaultAgentProfiles | Bots tab |

Honest limits: no Gmail/Slack OAuth yet; captcha farms deferred; observe UI is skill JSON not live screen recording.
