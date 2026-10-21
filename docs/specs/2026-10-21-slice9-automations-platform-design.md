# Bot Computer — Slice 9 Design (Automations Platform)

**Status:** implemented  
**Depends on:** Slice 1–8  

## Goal

Unlock Grok-style **ops / sales / QA / agent-team** workflows locally:

1. **Scheduler** — run a bot prompt on a schedule (e.g. morning digest)
2. **Skills** — save browser step sequences; run on demand or on schedule
3. **Shared workspace** — notes/files bots pass between each other
4. **Multi-bot delegate** — one bot hands a sub-task to another agent
5. **Connectors** — local sheets, mail drop folder, Slack webhook, calendar ICS
6. **Persistent Agent Browser profile** — keep cookies/logins across sessions

## Non-goals (honest)

- Full Gmail/Slack/LinkedIn OAuth (use local drop folders + webhooks + Agent Browser logins)
- Cloud shared VMs / captcha farms
- Pixel-perfect observe-and-record UI (v1 = explicit skill steps JSON)

## Capability map

| Use case | Slice 9 path |
|----------|----------------|
| Daily digest | Schedule → bot + mail/calendar connectors + slack webhook |
| Expense / sheets | `sheets/*` CSV + mail drop folder |
| Form fill / booking | Agent Browser + skill replay |
| Lead research | Schedule/chat + browser + sheets |
| QA / bug repro | Computer/QA bot + browser proof |
| Agent teams | `workspace/*` + `team/delegate` |
| Observe & repeat | Skills (manual/recorded steps) + schedule |
