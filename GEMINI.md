# ORBIT Payment Hub — Project Guidelines & Context Directive

## 🎯 Context Directory (`context/`) & `/context` Command

The `context/` directory stores persistent project intelligence:
- `context.md`: Master index and 3-party architecture overview
- `architecture.md`: Flow charts, sequence diagrams, edge topology, and HMAC cryptography
- `component.md`: BoardUI tokens, web components, and Android Compose screens
- `ui tickets.md`: Sprint backlog and UI issue tracking
- `database.md`: Cloudflare D1 Drizzle ORM schemas and Android Room DB models
- `utils.feature edition.md`: SMS regex engines, Web Crypto helpers, and feature tiers
- `activity_log.md`: Chronological log of editing dates, previous prompts, and actions taken
- `handoff.md`: Rapid onboarding guide for developers receiving repository handovers

### Behavior on `/context`:
- Intelligently understand user intent (retrieving information vs updating context).
- Maintain editing timestamps, user prompt records, and action logs in `context/activity_log.md`.
- Keep documentation clean and versatile for easy developer onboarding.
