---
name: context
description: Project Context & Knowledge Base Assistant for ORBIT Payment Hub. Triggers whenever the user types /context or asks about/updates the context folder. Intelligently parses user intent (querying context, updating context, logging prompts and actions, or developer handover) across all context files (architecture.md, context.md, component.md, ui tickets.md, database.md, utils.feature edition.md, activity_log.md, handoff.md).
---

# ORBIT Context Manager Skill (`/context`)

This skill governs the project knowledge base stored in the `context/` folder. It provides an intelligent command interface (`/context`) that allows developers to query system knowledge, update architectural specifications, track UI tickets, manage database schemas, and maintain an audit log of all prompts, dates, and actions taken across project handovers.

---

## 🎯 Trigger Modes & Intent Recognition

Whenever the user invokes `/context` in the prompt box, classify the request into one of the following 4 modes:

### Mode 1: Context Query & Retrieval (`/context [question/topic]` or bare `/context`)
**User Intent:** Retrieve project specifications, understand architecture, inspect schemas, or get an overview.

**Procedure:**
1. If the user asks a specific question (e.g., `/context what is our D1 schema?` or `/context delayed SMS sequence`), read the relevant target file in `context/`:
   - System design, flows, security, sequence diagrams ➔ `context/architecture.md`
   - Database tables, Drizzle schemas, Room DB entities ➔ `context/database.md`
   - UI components, BoardUI tokens, Compose screens ➔ `context/component.md`
   - UI tasks, sprint backlog, issue templates ➔ `context/ui tickets.md`
   - Regex parsers, Web Crypto HMAC, tiers ➔ `context/utils.feature edition.md`
   - Prompt history, dates of edits, action logs ➔ `context/activity_log.md`
   - New developer onboarding and guide ➔ `context/handoff.md`
   - General overview / ecosystem map ➔ `context/context.md`
2. If invoked bare (`/context`), present a synthesized master briefing:
   - Current project status & 3-party architecture overview
   - Table of all context files with direct `file:///` links
   - Recent prompt and actions summary from `activity_log.md`
   - Quick command suggestions for the user

---

### Mode 2: Context Update & Expansion (`/context update [details]` or code generation)
**User Intent:** Update, expand, or adjust the context files following a code change, architecture evolution, or prompt instructions.

**Procedure:**
1. Determine which context file(s) are impacted.
2. Edit or append to the target context file(s) maintaining clear structure.
3. Update the document metadata header in each touched file:
   - `Last Updated: [Current ISO/Local Timestamp]`
   - `Last Prompt / Trigger: [User's prompt]`
   - `Actions Taken: [Summary of modifications]`
4. **Always append a new session entry into `context/activity_log.md`** containing:
   - Date / Timestamp
   - User Prompt
   - Intent Analysis
   - Actions Taken
   - Files Modified / Created
   - Next Steps

---

### Mode 3: Prompt & Action Audit History (`/context history` or `/context log`)
**User Intent:** Review the history of prompts, editing dates, actions taken, and decisions made.

**Procedure:**
1. Read `context/activity_log.md`.
2. Present a clear, reverse-chronological timeline of:
   - When changes occurred (dates & timestamps)
   - What the user prompted
   - What actions the AI performed in response
   - Which files were modified

---

### Mode 4: Developer Handover & Onboarding (`/context handoff`)
**User Intent:** Hand over the project to a new developer, contractor, or team member so they understand everything effortlessly.

**Procedure:**
1. Read `context/handoff.md` and `context/context.md`.
2. Present the 60-second TL;DR, repository map, architecture summary, and how to use `/context` for ongoing development.

---

## 📋 Context Files Reference Table

| Target File | Canonical Path | Primary Domain |
|---|---|---|
| **Master Index** | `context/context.md` | Single source of truth, 3-party ecosystem, directory index. |
| **Architecture** | `context/architecture.md` | Flow diagrams, sequence diagrams, HMAC crypto, edge topology. |
| **Components** | `context/component.md` | React 19 + BoardUI web components, Jetpack Compose screens. |
| **UI Tickets** | `context/ui tickets.md` | Sprint backlog, ticket priority (P0-P3), task descriptions. |
| **Database** | `context/database.md` | Cloudflare D1 Drizzle schemas, SQLite indexes, Room DB models. |
| **Utils & Tiers** | `context/utils.feature edition.md` | SMS regex parsers (bKash/Nagad), Web Crypto HMAC, feature tiers. |
| **Activity Log** | `context/activity_log.md` | Chronological ledger of dates, user prompts, and actions taken. |
| **Handover** | `context/handoff.md` | Rapid developer onboarding and repository guidance. |

---

## ⚡ Execution Rules for the AI

1. **Intelligent Intent Parsing:** Never require the user to memorize flags. Whether the user says `/context update the db`, `/context show me the db`, or just `/context`, correctly infer whether the intent is reading, writing, logging, or summarizing.
2. **Mandatory Audit Logging:** Whenever context files are modified, record the date, the user's prompt, and the actions taken in `context/activity_log.md`.
3. **Clickable Links:** Always provide clickable `file:///` links to the modified or referenced context files using forward slashes.
