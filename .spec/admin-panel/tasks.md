# Implementation Tasks: Hidden Admin Panel (`/admin`)

## Track A: Backend Edge API (`backend/src/features/admin/`)
- [x] Task A.1: Implement `backend/src/features/admin/admin.schema.ts` (Zod schemas for admin requests)
- [x] Task A.2: Implement `backend/src/features/admin/admin.service.ts` (Cross-project queries, stats aggregation, merchant status management)
- [x] Task A.3: Implement `backend/src/features/admin/admin.routes.ts` (Hono endpoints with master admin key authorization)
- [x] Task A.4: Mount `/api/v1/admin` in `backend/src/index.ts` and verify with TypeScript compilation

## Track B: Frontend Admin UI (`frontend/src/features/admin/`)
- [x] Task B.1: Implement `frontend/src/features/admin/useAdmin.ts` (TanStack Query hooks for stats, projects, webhooks, queue)
- [x] Task B.2: Implement `frontend/src/features/admin/AdminAuthGate.tsx` (Stealth access gate with session storage)
- [x] Task B.3: Implement `frontend/src/features/admin/AdminOverviewCards.tsx` (Cross-project KPI cards)
- [x] Task B.4: Implement `frontend/src/features/admin/ProjectManagerTable.tsx` (Storefronts list, credentials modal, status toggles)
- [x] Task B.5: Implement `frontend/src/features/admin/AddProjectModal.tsx` (Modal to register new merchant with instant credentials)
- [x] Task B.6: Implement `frontend/src/features/admin/GlobalWebhookTable.tsx` (Delivery audit log and retry dispatcher trigger)
- [x] Task B.7: Implement `frontend/src/features/admin/GlobalQueueTable.tsx` (Pending orders queue across all merchants)
- [x] Task B.8: Implement `frontend/src/features/admin/AdminDashboard.tsx` (Master container integrating all sub-tabs)
- [x] Task B.9: Mount `/admin` route, stealth shortcut, and navigation in `frontend/src/App.tsx`

## Track C: Verification & Convergence
- [x] Task C.1: Verify `npm run build` bundles without errors
- [x] Task C.2: Seed realistic demo projects (e.g. `Aurelia Lifestyle BD`, `NewznBD Shop`, `OrbitSaaS Cloud Store`)
- [x] Task C.3: Test `/admin` endpoint authentication and data flow
- [x] Task C.4: Update `context/activity_log.md` with complete session actions
