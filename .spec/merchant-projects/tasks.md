# Tasks: Merchant Sub-Projects (`merchant_projects`)

- [x] **Task 1 [DB]**: Add `merchant_projects`, `merchant_project_wallets`, and nullable `project_id` columns/indexes in `backend/src/db/schema.ts` and `backend/src/db/bootstrap.ts`.
- [x] **Task 2 [Backend Auth/Core]**: Extend `shared/types.ts` and `shared/middleware.ts` with project-scoped API key / webhook secret auth and strict anti-pivot `X-Project-Id` validation.
- [x] **Task 3 [Backend Projects Module]**: Create `backend/src/features/projects/` (`projects.schema.ts`, `projects.service.ts`, `projects.routes.ts`) and mount `/api/v1/projects` in `backend/src/index.ts`.
- [x] **Task 4 [Backend Admin]**: Add Admin sub-project CRUD, wallet assignment, and key rotation endpoints in `admin.routes.ts`, `admin.schema.ts`, `admin.service.ts`.
- [x] **Task 5 [Backend Payment Links & Payments]**: Wire `projectId`, dynamic `COMMON`/`SPECIFIC` wallet resolution, project-scoped webhooks/secrets/Telegram, and atomic `maxUses` + CAS fixes in `payment-links.*`, `payments.*`, `checkout.*`, `orders.*`, `wallets.*`, `transactions.service.ts`, `device.service.ts`, `verification.engine.ts`, and `webhook.dispatcher.ts`.
- [x] **Task 6 [Frontend Admin]**: Update `useAdmin.ts` and `ProjectInspectDrawer.tsx` with Sub-Projects management (create, edit, Common vs Specific SIM assignment, key rotation, delete, and project selector on link creation).
- [x] **Task 7 [Frontend Merchant]**: Create `useProjects.ts` and update `PaymentLinksManager.tsx`, `ConsolidatedSetupHub.tsx`, `IntegrationGuide.tsx`, `PaymentIntentsManager.tsx`, and `OrdersManager.tsx` using BoardUI semantic tokens & Apple HIG.
- [x] **Task 8 [QA & Security]**: Verify `tsc --noEmit`, `vite build`, and run end-to-end API/logic & `/claude-red` security verification tests.
