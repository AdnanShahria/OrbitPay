# Implementation Plan: Merchant Sub-Projects (`merchant_projects`)

## 1. Data Model & Runtime Schema (`backend/src/db/`)
1. **`schema.ts`**:
   - Add `WALLET_SELECTION_MODES = ['COMMON', 'SPECIFIC'] as const`.
   - Add `merchantProjects` (`merchant_projects`):
     - `id`, `merchantId`, `name`, `slug`, `description`, `accountMode`, `verificationMode`, `walletSelectionMode`, `ignoreStorefrontSync`, `webhookUrl`, `webhookSecret`, `apiKeyHash`, `apiKeyPrefix`, `publishableKey`, `allowedCallbackOriginsJson`, `telegramBotToken`, `telegramChatId`, `isDefault`, `isActive`, `createdAt`, `updatedAt`.
     - Indexes: `uq_merchant_projects_slug (merchantId, slug)`, `idx_merchant_projects_merchant (merchantId, isActive)`, `idx_merchant_projects_api_key (apiKeyHash)`.
   - Add `merchantProjectWallets` (`merchant_project_wallets`):
     - `projectId` (FK `merchantProjects.id`), `walletId` (FK `merchantWallets.id`), `createdAt`. PK `(projectId, walletId)`.
   - Add nullable `projectId` column + index to `paymentLinks`, `paymentIntents`, `checkoutSessions`, `verificationQueue`, `merchantOrders`, `webhookDeliveries`.
2. **`bootstrap.ts`**:
   - Add `CREATE TABLE IF NOT EXISTS` for `merchant_projects` and `merchant_project_wallets`.
   - Add idempotent `ALTER TABLE ... ADD COLUMN project_id text` statements for `payment_links`, `payment_intents`, `checkout_sessions`, `verification_queue`, `merchant_orders`, `webhook_deliveries`.
   - Add `POST_ALTER_INDEX_STATEMENTS` for project indexes & unique slug index.
   - Add `'merchant_projects'` and `'merchant_project_wallets'` to `CORE_HEALTH_TABLES`.

## 2. Backend Feature Module & Cross-Cutting Integration (`backend/src/`)
1. **New `features/projects/` module**:
   - `projects.schema.ts`: Zod schemas for Admin create/update sub-project, Merchant update sub-project settings, wallet assignment (`walletSelectionMode` + `walletIds[]`), and key rotation.
   - `projects.service.ts`:
     - `listMerchantProjects`, `getMerchantProjectById`, `resolveAuthorizedProject` (validates `project.merchantId === merchantId`, active check, and pinned `projectAuthScoped` anti-pivot check).
     - `createMerchantProject` (Admin-only, generates `prj_...`, `sk_proj_...`, `whsec_...`, `pk_live_...`, unique slug per merchant, validates `walletIds` belong to `merchantId`).
     - `updateMerchantProject` (Admin or Setup-Unlocked Owner; validates `walletIds` ownership and updates `merchant_project_wallets`).
     - `deleteMerchantProject` (Admin-only; safely clears/nulls references or deletes project & join rows).
     - `rotateProjectKeys` (Admin or Setup-Unlocked Owner).
     - `resolveProjectWallets` / `getProjectRotatedWallets`: returns project-assigned wallets when `walletSelectionMode === 'SPECIFIC'`, or merchant common rotated wallets when `'COMMON'`.
     - `resolveEffectiveDispatchConfig`: resolves `webhookUrl`, `webhookSecret`, `allowedCallbackOrigins`, `telegramBotToken`, `telegramChatId`, `appName`, `accountMode`, `verificationMode` from `(merchant, project)`.
   - `projects.routes.ts`:
     - `GET /api/v1/projects` (merchant auth or device; returns active projects & assigned wallet IDs, scoped to `project.id` if `projectAuthScoped`).
     - `GET /api/v1/projects/:id`
     - `PATCH /api/v1/projects/:id` (`requireOwnerRoleMiddleware` + `assertSetupUnlockedForJwt`, blocked if `projectAuthScoped` for another project).
     - `POST /api/v1/projects/:id/keys/rotate` (`requireOwnerRoleMiddleware` + `assertSetupUnlockedForJwt`).
2. **Auth & Middleware (`shared/types.ts`, `shared/middleware.ts`)**:
   - Extend `AppVariables` with `project?: MerchantProjectRecord`, `projectId?: string`, `projectAuthScoped?: boolean`.
   - Update `authMerchantMiddleware` to match `merchantProjects.apiKeyHash` (`sk_proj_...` or `X-Merchant-Api-Key`) and `merchantProjects.webhookSecret`, setting `merchant`, `project`, `projectId`, `projectAuthScoped = true`.
   - If authenticated at merchant level and `X-Project-Id` header is provided, validate & attach `project` + `projectId` (without setting `projectAuthScoped`).
3. **Existing Feature Wiring**:
   - `admin.routes.ts`: Add `/projects/:id/sub-projects` CRUD + key rotation routes under `requireAdminAuth`.
   - `admin.service.ts`: Include `subProjects` in `inspectAdminProject` and `subProjectsCount` in `getAdminProjects`.
   - `wallets.service.ts` & `wallets.routes.ts`: Add `projectScoped` support in `getAllActiveRotatedWallets` / `getActiveRotatedWallet`, `syncMerchantWallets`, `dispatchWalletSyncWebhook`, and clean up `merchant_project_wallets` when a wallet is deleted.
   - `payment-links.*`: Accept optional `projectId` on create/update; filter by `projectId`; resolve project wallets & config in `getPublicPaymentLink` and `payPublicPaymentLink`; make `usedCount` increment atomic against `maxUses`.
   - `payments.*`: Accept/pin `projectId` on `createPaymentIntent` & `backfillPaymentIntent`; filter `listPaymentIntents` by `projectId`; propagate `projectId` to `checkoutSessions`; use project webhook/secret/Telegram in `resolvePaymentIntent` and fix atomic `consumedTrxIds` insert (remove `.onConflictDoNothing()`).
   - `checkout.*`: Propagate `projectId` across `createCheckoutSession`, `getPublicCheckoutSession`, `verifyCheckoutPayment`, `escalatePaymentToManualReview`; use project wallets & webhook config.
   - `device.service.ts` & `verification.engine.ts`: Propagate `projectId` on escalation/verification webhooks & pushes; add `SPECIFIC`-wallet `receiverNumber` mismatch safety check when hardware telemetry explicitly reports a different merchant wallet.
   - `orders.*`: Propagate & filter `projectId` on `notifyOrder`, `listOrders`, `performOrderAction` (using project webhook config when `order.projectId` is set).
   - `transactions.service.ts`: Fix `manualMatchTransaction` CAS & atomic `consumedTrxIds` insert; dispatch webhook to project if `intent.projectId` is set.
   - `webhooks/webhook.dispatcher.ts`: Support `webhookSecretOverride` / project-resolved webhook target cleanly.

## 3. Frontend UI (`frontend/src/features/`) — BoardUI + Apple HIG
1. **`features/projects/useProjects.ts`**: React Query hooks for `GET /api/v1/projects`, `PATCH /api/v1/projects/:id`, `POST /api/v1/projects/:id/keys/rotate`.
2. **Admin Panel (`features/admin/useAdmin.ts`, `ProjectInspectDrawer.tsx`)**:
   - Add **Sub-Projects** management section inside `ProjectInspectDrawer`: list sub-projects with status/mode/wallet-mode chips, inline **Add Sub-Project** form (Name, Slug, Account Mode, Verification Mode, Webhook URL, Wallet Mode `COMMON` vs `SPECIFIC` with checkbox list of merchant SIM wallets), Edit/Assign Wallets drawer/inline editor, Rotate Keys modal/toast, and Delete confirmation.
   - Add `Project` dropdown to Admin `Create Payment Link` inline form in `ProjectInspectDrawer`.
3. **Merchant Portal**:
   - `PaymentLinksManager.tsx` & `usePaymentLinks.ts`: Add **Project** selector in Create/Edit modal, project filter/chip on table rows, and preview branding.
   - `ConsolidatedSetupHub.tsx` & `IntegrationGuide.tsx`: Add **Connected Projects & Website Setup** section showing admin-provisioned sub-projects, allowing setup-unlocked owners to configure project Webhook URL, Verification Mode, Common vs Specific SIM wallet selection, rotate project API/Webhook keys, and copy project-specific integration snippets.
   - `PaymentIntentsManager.tsx` & `OrdersManager.tsx`: Add optional Project filter & Project chip on rows.

## 4. Verification
- Run `npm run build:backend` (`tsc --noEmit`) and `npm run build:frontend` (`tsc && vite build`).
- Write and run automated verification tests covering multi-project CRUD, `COMMON` vs `SPECIFIC` wallet resolution, Payment Link project routing, Project API key anti-IDOR pinning, TrxID replay prevention across projects, and `maxUses`/CAS race protection.
