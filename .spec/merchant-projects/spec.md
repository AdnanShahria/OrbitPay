# Feature Spec: Merchant Sub-Projects, Dynamic SIM Wallet Binding & Project-Scoped Payment Links

## 1. Overview & Problem Statement
Currently, ORBIT Payment Hub operates with a strict 1-level tenant model (`merchants`). While a single merchant may run multiple websites, products, or payment-link campaigns using the same physical Android companion device(s) and SIM pool (2, 4, or 10+ SIMs under one `merchantId`), the system currently lacks sub-projects under a merchant.

This feature introduces **Merchant Sub-Projects (`merchant_projects`)** under a single `merchantId`:
1. **Admin-Provisioned Sub-Projects:** Hub Admins can create, configure, activate/pause, and delete sub-projects under any merchant in `/admin` (`ProjectInspectDrawer`).
2. **Dynamic SIM / Wallet Assignment (`COMMON` vs `SPECIFIC`):** Each sub-project can either share **all common merchant wallets** (`COMMON`) or bind **specific selected SIM wallets** (`SPECIFIC`) via `merchant_project_wallets`, while monthly 250k/300k volume limits, Android SMS ingestion, and single-use `consumed_trx_ids` stay unified under `merchantId`.
3. **Project-Scoped Payment Links (Creator-Side Picker):** When creating or editing a Payment Link, the Merchant Owner (or Admin) selects which Project the link belongs to (`projectId`), routing checkout wallets, branding (`appName`), verification mode, and webhooks to that project without exposing internal project lists to public buyers.
4. **Per-Project Website & Webhook Integration:** Each project has its own `accountMode` (`STANDALONE` | `WEBHOOK_CONNECTED`), `verificationMode` (`AUTO` | `PURE_MANUAL`), `webhookUrl`, `webhookSecret`, `allowedCallbackOrigins`, `apiKey` (`sk_proj_...`), `publishableKey`, and Telegram alert settings.

---

## 2. User Stories & Acceptance Criteria (`Given / When / Then`)

### Story 1: Admin Sub-Project Provisioning & Wallet Assignment
- **Given** a Hub Admin opens `ProjectInspectDrawer` for a merchant (`mer_live_...`),
- **When** they create a sub-project with a name, optional slug, `accountMode`, `verificationMode`, `walletSelectionMode` (`COMMON` or `SPECIFIC`), optional `walletIds[]`, and optional `webhookUrl`,
- **Then** the backend creates a `merchant_projects` row (`prj_...`), generates a unique project slug within that merchant, generates project credentials (`sk_proj_...`, `whsec_...`, `pk_live_...`), and persists any `merchant_project_wallets` assignments (all validated to belong to the same `merchantId`).
- **And** the Admin receives the raw credentials once and can later edit settings, toggle `isActive`, rotate keys, or delete the sub-project.

### Story 2: Dynamic Common & Specific Number Selection
- **Given** a sub-project has `walletSelectionMode = 'COMMON'`,
- **When** a buyer opens its Payment Link or creates a Payment Intent/Checkout Session,
- **Then** ORBIT returns the merchant's active rotated wallets from the common pool (`merchant_wallets`).
- **Given** a sub-project has `walletSelectionMode = 'SPECIFIC'`,
- **When** a buyer opens its Payment Link or creates a Payment Intent/Checkout Session,
- **Then** ORBIT returns **only** the active wallets explicitly assigned to that `projectId` in `merchant_project_wallets` (preserving 250k/300k rotation across those assigned wallets).
- **And** if no active wallets are assigned to a `SPECIFIC` project yet, the public Payment Link loads gracefully with `hasActiveWallets: false` ("Merchant is configuring payment numbers") rather than crashing.

### Story 3: Creator-Side Project Selection for Payment Links
- **Given** a `MERCHANT_OWNER` (or Admin) creates or edits a Payment Link in `PaymentLinksManager` (or `ProjectInspectDrawer`),
- **When** they pick a Target Project (`projectId`) from the merchant's active projects (or choose "Merchant Default / All Common Wallets"),
- **Then** the server verifies `project.merchantId === merchant.id` and `project.isActive === true`, saves `payment_links.project_id`, and returns project metadata (`projectId`, `projectName`, `projectSlug`).
- **And** public checkout (`/:merchantSlug/:linkSlug` and `POST /pay`) automatically inherits that project's `display.appName`, `verificationMode`, assigned `activeWallets`, `webhookUrl`, `webhookSecret`, and `returnUrl`/`cancelUrl` defaults.

### Story 4: Per-Project Website Connection & Webhooks
- **Given** a connected website calls `POST /api/v1/payment-intents`, `POST /api/v1/orders/notify`, or `POST /api/v1/wallets/sync` with a Project API Key (`sk_proj_...`) or with Merchant API Key + `X-Project-Id`,
- **Then** ORBIT resolves `project`, enforces `allowedCallbackOrigins` from the project (with merchant fallback), stores `projectId` on the created `payment_intent` / `checkout_session` / `merchant_order`, and signs/dispatches outgoing webhooks (`payment.verified`, `payment.submitted`, `payment.escalated_manual`, `order.*`, `wallet.synced`) to that project's `webhookUrl` using that project's `webhookSecret`.
- **And** Android SMS verification continues seamlessly under `merchantId` across 2, 4, or 10+ SIMs, while `consumed_trx_ids (merchant_id, trx_id)` blocks cross-project TrxID replay.

### Story 5: Merchant Portal Project Hub & Filtering
- **Given** a `MERCHANT_OWNER` opens Setup & Controls (`ConsolidatedSetupHub`),
- **Then** they can inspect all admin-assigned projects, view/copy each project's ID, API prefix, and integration snippet, and (when Setup Lock is unlocked) configure each project's `webhookUrl`, `walletSelectionMode` (`COMMON` vs `SPECIFIC` SIMs), `verificationMode`, and rotate project keys.
- **And** `PaymentLinksManager`, `PaymentIntentsManager`, and `OrdersManager` display project badges and support filtering by project.

---

## 3. Security Invariants (`/claude-red`)
- **Zero Cross-Tenant / Cross-Project IDOR:**
  - Every `projectId` passed via header (`X-Project-Id`), query, or body is verified against `merchantProjects.merchantId === merchant.id`.
  - A **Project-Scoped API Key (`sk_proj_...`)** or **Project Webhook Secret** is strictly pinned to that single `project.id`. Any attempt to pass a different `projectId` in headers/query/body returns `403 Forbidden`.
  - Wallet IDs assigned to a project (`merchant_project_wallets`) are validated to belong to `merchant.id` before insertion.
- **Role-Based Access Control (BFLA Prevention):**
  - Only Hub Admins (`authMasterAdminMiddleware`) can create/delete sub-projects under a merchant.
  - `MERCHANT_STAFF` and `device` keys are blocked (`requireOwnerRoleMiddleware`) from modifying project settings, rotating project keys, assigning project wallets, or mutating payment links.
  - Merchant JWT project configuration mutations (`PATCH /api/v1/projects/:id`, `POST /api/v1/projects/:id/keys/rotate`) require `assertSetupUnlockedForJwt(c)`.
- **TrxID Anti-Replay & Atomic CAS:**
  - `consumed_trx_ids` remains `(merchant_id, trx_id)` primary key, preventing one payment TrxID from verifying orders in two projects under the same merchant.
  - `resolvePaymentIntent` and `manualMatchTransaction` insert `consumed_trx_ids` atomically (without `.onConflictDoNothing()` masking duplicates) and enforce `stateVersion` CAS.
  - `payPublicPaymentLink` atomically increments `usedCount` with `WHERE max_uses IS NULL OR used_count < max_uses`.
  - If a `SPECIFIC`-wallet project receives an SMS whose hardware `receiverNumber` explicitly matches a *different* merchant wallet outside that project's assigned set, auto-verify escalates to `MANUAL_REVIEW_REQUIRED` (`TRUST_FLAG_ANOMALY`) for operator confirmation.
- **SSRF & Secret Hygiene:**
  - All project `webhookUrl` and `callbackUrl` values pass `validateSafeWebhookUrl`.
  - Project secrets (`webhookSecret`, `apiKeyHash`) are masked/omitted in standard read endpoints.

---

## 4. Out of Scope
- Native Android APK UI changes (Android app stays logged into `merchantId` and already captures/uploads `simSlotIndex` and `receiverNumber` for all SIMs on the device).
- Exposing internal project lists on public buyer payment pages.
