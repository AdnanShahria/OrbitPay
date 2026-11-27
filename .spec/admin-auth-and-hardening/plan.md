# Technical Plan: Admin Auth, Console Error Fixes & Hub Hardening

## 1. Database & Schema (`backend/src/db/`)
- Add `adminUsers`, `adminSessions`, and `adminAuditLogs` tables to `backend/src/db/schema.ts`.
- Add `backend/drizzle/0006_admin_auth_sessions.sql` and register in `backend/drizzle/meta/_journal.json`.
- Create `backend/src/db/bootstrap.ts` (`ensureRuntimeSchema(db)`) to idempotently create `app_releases`, `admin_users`, `admin_sessions`, and `admin_audit_logs` tables and indexes if absent on D1 (solves `500` on unmigrated remote D1 immediately).

## 2. Backend Middleware & Routes (`backend/src/`)
- `shared/crypto.ts` & `shared/types.ts`: Add `adminUserId`, `adminSessionId`, `adminRole`, `adminEmail`, `adminAuthMethod` to `AppVariables`, and `OrbitAdminJwtClaims` interface.
- `shared/middleware.ts`:
  - Update `authMasterAdminMiddleware` to accept:
    1. `Authorization: Bearer <admin_jwt>` (where `typ === 'ORBIT_ADMIN_JWT'`, verified with `verifyJwt`, checked against `admin_sessions` with `revokedAt IS NULL` and `expiresAt > now`, plus active `admin_users` check if `sub !== 'master_admin'`), OR
    2. `X-Admin-Key` header (timing-safe match against `MASTER_ADMIN_KEY`, preserving CLI/script compatibility).
  - Add `authenticateAdminJwt(c, db, token)` helper so `realtime.routes.ts` can verify `?adminToken=<jwt>`.
- `features/admin/admin-auth.service.ts` & `admin.routes.ts`:
  - `POST /api/v1/admin/auth/login` (email+password or `adminKey` -> returns `{ accessToken, session, admin, hasAdminUsers }`)
  - `POST /api/v1/admin/auth/verify` (backward-compatible: exchanges `adminKey` for JWT + tracked session, or validates existing Bearer JWT)
  - `GET /api/v1/admin/auth/me`
  - `POST /api/v1/admin/auth/bootstrap` (creates first `SUPER_ADMIN` user)
  - `POST /api/v1/admin/auth/logout` (revokes current session)
  - `POST /api/v1/admin/auth/logout-all` (revokes all active admin sessions)
  - `GET /api/v1/admin/auth/sessions` & `DELETE /api/v1/admin/auth/sessions/:sessionId`
  - `GET /api/v1/admin/auth/users`, `POST /api/v1/admin/auth/users`, `PATCH /api/v1/admin/auth/users/:id`
  - `GET /api/v1/admin/system/health` & `POST /api/v1/admin/system/ensure-schema`
  - `GET /api/v1/admin/projects/:id/inspect` (returns wallets, recent `sms_ledger`, recent `merchant_orders`)
  - `DELETE /api/v1/admin/projects/:id` (cascading cleanup inside `db.batch` for test/unwanted storefronts)
- `features/releases/releases.service.ts`: Call `ensureRuntimeSchema(db)` before querying `app_releases`.
- `features/realtime/realtime.routes.ts`:
  - Allow `?adminToken=<admin_jwt>` on `GET /api/v1/realtime/stream` (`scope: 'admin'` receives all tenant events; merchant JWT / device key receives tenant-isolated events).

## 3. Frontend (`frontend/src/`)
- Use BoardUI components (`Button`, `Card`, `Input`, `TextField`, `Modal`, `Drawer`, `Tabs`, `Table`, `Chip`, `StatusDot`, `Select`, `Skeleton`, `Spinner`, `toast`), semantic tokens, composite typography, `cx()`, and `@remixicon/react` icons.
- `shared/hooks/useRealtime.ts`:
  - Accept `{ mode?: 'merchant' | 'admin'; enabled?: boolean }`.
  - Append `?token=<merchantJwt>` or `?adminToken=<adminJwt>` (stored in `sessionStorage` / `localStorage`).
  - Do not connect when `enabled === false` or no token exists.
  - Exponential backoff reconnect (3s -> 6s -> 12s -> 30s) and clean teardown on logout/unmount.
  - Export `triggerRealtimeSimulation` or pass `adminFetch` headers when simulating.
- `features/admin/useAdmin.ts`:
  - Support both `ADMIN_JWT_STORAGE` (`orbit_admin_jwt`) and legacy `ADMIN_KEY_STORAGE` fallback during transition.
  - `loginWithPassword(email, password)`, `loginWithMasterKey(adminKey)`, `logout()`, `logoutAll()`.
  - Hooks for `/system/health`, `/auth/sessions`, `/auth/users`, `/auth/bootstrap`, `inspectProject`, `deleteProject`, `ensureSchema`.
- `features/admin/AdminAuthGate.tsx`:
  - Dual-mode sign-in tabs ("Admin Account" Email + Password, "Master Security Key") with Apple HIG polish, show/hide toggle, error banner, and local dev quick-fill.
- `features/admin/AdminDashboard.tsx`:
  - Replace `"Lock"` with real `"Logout"` button (revokes server session + clears storage), display current admin identity chip (`SUPER_ADMIN` / `Master Key`), pass `{ mode: 'admin', enabled: true }` to `useRealtime`, hide `Simulate Influx` in production when `simulatorEnabled === false`, show degraded R2/Schema health banner if any binding is missing, and add `"Security & System"` tab (`AdminSecurityPanel.tsx`).
- `features/admin/GlobalQueueTable.tsx`:
  - Remove duplicate `useRealtime()` call; use authenticated admin simulation mutation and hide simulator button when `simulatorEnabled === false`.
- `features/admin/ProjectManagerTable.tsx`, `ProjectInspectDrawer.tsx`:
  - Add Edit Project modal, Inspect Drawer (SIM wallets, recent SMS ledger, recent orders), and Delete Storefront confirmation modal.
