# Tasks: Admin Auth, Console Error Fixes & Hub Hardening

- [x] **T1**: Add `adminUsers`, `adminSessions`, `adminAuditLogs` to `backend/src/db/schema.ts`, create `backend/drizzle/0006_admin_auth_sessions.sql`, update `_journal.json`, and create `backend/src/db/bootstrap.ts`.
- [x] **T2**: Update `backend/src/shared/types.ts` and `backend/src/shared/middleware.ts` to support Admin JWT + `admin_sessions` verification alongside `X-Admin-Key`.
- [x] **T3**: Implement `backend/src/features/admin/admin-auth.service.ts` (login, verify, me, bootstrap, logout, logout-all, sessions list/revoke, admin users CRUD, audit log) and `system/health` + `project inspect` + `project delete` in `admin.service.ts` & `admin.routes.ts`.
- [x] **T4**: Fix `/api/v1/admin/releases` 500 via `ensureRuntimeSchema(db)` in `releases.service.ts` and fix `/api/v1/realtime/stream` 401 by adding `?adminToken=` admin SSE stream support in `realtime.routes.ts`.
- [x] **T5**: Upgrade `frontend/src/shared/hooks/useRealtime.ts` to pass `?token=` / `?adminToken=`, stop unauthenticated connects, use exponential backoff, and remove duplicate `useRealtime()` from `GlobalQueueTable.tsx`.
- [x] **T6**: Upgrade `frontend/src/features/admin/useAdmin.ts` and `AdminAuthGate.tsx` for Admin JWT + Email/Password & Master Key sign-in + real server-side Logout.
- [x] **T7**: Build `AdminSecurityPanel.tsx` (Admin Sessions, Logout All, Admin Accounts, Bootstrap, Audit Logs, System Health/Schema Check) and `ProjectInspectDrawer.tsx` + Edit/Delete flows in `ProjectManagerTable.tsx`, wired into `AdminDashboard.tsx`.
- [x] **T8**: Cross-check all backend/frontend API contracts, BoardUI rules, and TypeScript imports across modified files (note: local shell build verification skipped because host `run_command` PreToolUse hook requires `bash`).
