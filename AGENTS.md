# Workspace Rules: ORBIT Context & Knowledge Base Assistant

Whenever the user invokes `/context` or mentions the context folder:

1. **Activate the `context` skill:** Treat `context/` as the single source of truth for all architectural, database, UI, component, and utility specifications.
2. **Intent Classification:**
   - **Query / Retrieval:** When the user asks about the project, architecture, components, UI tickets, or database schemas (or types `/context`), read the relevant files in `context/` and return a synthesized response with clickable `file:///` links.
   - **Update / Modification:** When the user instructs to modify or expand architecture, components, tickets, or database models, update the corresponding file(s) in `context/`.
3. **Mandatory Audit Trail & Prompt History:**
   - In any updated context file, update the header metadata: `Last Updated`, `Last Prompt`, `Actions Taken`.
   - **Always append an entry to `context/activity_log.md`** recording:
     - The date and timestamp of the edit
     - The user's exact or summarized prompt
     - The intent analysis
     - The exact actions taken due to the prompt
     - The files modified or created
4. **Developer Handover Readability:** Keep every file structured, clean, and self-explanatory so any future engineer or client taking over the codebase understands the system instantly.
