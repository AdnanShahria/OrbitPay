# Role & System Context
You are a Principal Full-Stack & Mobile Systems Architect building a multi-tenant, 3-party **MFS (bKash/Nagad) Automated Payment Verification SaaS** for **ORBIT SaaS**.

### The 3-Party Ecosystem Flow:
1. **Buyer (End Customer):** Pays via bKash/Nagad Send Money to the Merchant's personal number and submits `TrxID` + `Sender Number` on the E-Commerce Storefront.
2. **E-Commerce Storefront (Client Repo - Cloudflare Pages Monolith):** Uses React 19, Vite, Hono (`functions/api/app.ts`), Drizzle ORM + Cloudflare D1, and SendPulse/Apps Script email pipeline.
3. **ORBIT SaaS Central Hub (Cloudflare Pages + Hono + D1):** The central verification engine deployed on ORBIT SaaS's Cloudflare Pages that connects Merchant Android Apps with client E-Commerce websites via secure Webhooks.
4. **Merchant Android App (Native Kotlin + Gradle APK):** Sideloaded on the Merchant's phone. Reads bKash/Nagad SMS, syncs to ORBIT SaaS, and displays real-time dashboard analytics (Total SMS Received, Verified via Storefront, Unclaimed/Personal SMS, and Total Verified BDT Volume).

---

# Part 1: ORBIT SaaS Central Hub (Cloudflare Pages + Hono + D1)

Build the central SaaS backend & merchant portal with the following Drizzle D1 schemas and APIs:

### 1. Database Schemas (`orbit-hub/db/schema.ts`)
- **`merchants`**: `id`, `store_name`, `webhook_url`, `webhook_secret` (for HMAC signing), `device_api_key_hash`, `grace_period_minutes` (default: `60`), `fcm_token`, `last_seen_at`, `is_active`.
- **`sms_ledger`**: `id`, `merchant_id`, `provider` (`BKASH` | `NAGAD`), `trx_id` (UNIQUE per merchant), `amount` (real), `sender_number`, `raw_sms`, `status` (`UNCLAIMED` | `VERIFIED` | `MANUAL_VERIFIED`), `external_order_id` (nullable), `sms_received_at`, `verified_at`.
- **`verification_queue`** (Handles Offline Admin / Delayed SMS): `id`, `merchant_id`, `external_order_id`, `customer_email`, `expected_amount`, `submitted_trx_id`, `submitted_sender`, `status` (`WAITING_FOR_SMS` | `MATCHED` | `EXPIRED`), `expires_at`, `created_at`.

### 2. Core Endpoints & Deferred Reconciliation Engine
- **`POST /api/v1/device/ingest`** (Authenticated via `X-Device-Key`, exempted from browser CSRF/Origin checks):
  - Receives single or batched offline SMS records from the Merchant Android App.
  - Upserts into `sms_ledger`.
  - **Auto-Reconciliation Trigger:** Immediately checks `verification_queue` for any `WAITING_FOR_SMS` entry matching `submitted_trx_id` and `amount >= expected_amount` (even if the admin was offline for 30–60 minutes).
  - If matched:
    1. Marks `sms_ledger.status = 'VERIFIED'` and attaches `external_order_id`.
    2. Fires an HMAC-SHA256 signed HTTP POST Webhook (`X-Orbit-Signature`) to the E-Commerce site's `webhook_url` (`event: "payment.verified"`).
    3. Sends a real-time sync payload / FCM push back to the Merchant Android App so its UI updates the transaction badge to `VERIFIED`.
- **`POST /api/v1/checkout/verify`** (Called by E-Commerce Storefront via `X-Merchant-Secret`):
  - Checks `sms_ledger` for an `UNCLAIMED` matching `trx_id` and `amount`.
  - **Instant Match:** Marks `VERIFIED` immediately and returns `{ status: "VERIFIED" }`.
  - **Admin Offline / Delayed SMS:** Creates a `WAITING_FOR_SMS` record in `verification_queue` with `expires_at = now + grace_period_minutes` and returns `{ status: "PENDING_VERIFICATION", message: "Verification queued. Email will be sent automatically once confirmed." }`.
- **`GET /api/v1/device/stats`**: Returns aggregated metrics for the Android App UI: `total_verified_amount`, `verified_count`, `unclaimed_count`, `pending_orders_count`, and the latest 50 ledger items with their live status (`VERIFIED` vs `UNCLAIMED`).

---

# Part 2: E-Commerce Storefront Integration (Adapting Our Existing Monolith)
Modify our existing monolithic Cloudflare Pages repo (`functions/api/app.ts` & frontend):
1. **Checkout Submission (`POST /api/v1/orders/submit-mfs`):** Submits order details (`PENDING_VERIFICATION`) and calls ORBIT SaaS `/api/v1/checkout/verify`.
2. **ORBIT Webhook Receiver (`POST /api/v1/webhooks/orbit-payment`):**
   - Exempt this route from browser `csrf()` and `isAllowedStorefrontOrigin` in `functions/api/app.ts`, verifying `X-Orbit-Signature` HMAC instead.
   - When ORBIT SaaS fires `payment.verified` (either instantly or 45 minutes later when the merchant comes back online), update D1 `orders.payment_status = 'PAID'` and trigger the existing SendPulse/Apps Script email utility (`functions/api/utils/email.ts`) to send the official payment confirmation & invoice email to the buyer.
3. **Admin Fallback UI:** Add a manual "Approve Payment" button in `/admin/orders` for any order whose 1-hour grace window expired without an auto-match.

---

# Part 3: Dynamic Merchant Android App (Kotlin + Gradle, Sideloaded APK)
Build a clean, modern Jetpack Compose / Material 3 Android app (`orbit-merchant-app/`) with:
1. **Live Merchant Dashboard UI:**
   - Top status pill: `Online & Syncing` (Green) vs `Offline - Queued locally` (Amber).
   - Summary Cards: **Total Verified Amount (BDT)**, **Verified Store Orders**, and **Unclaimed / Personal SMS**.
   - Live Transaction Feed: Shows every incoming bKash/Nagad SMS with clear status chips—**`VERIFIED (Order #104)`** in green when matched on the website, or **`UNCLAIMED`** in gray if it was just a personal transfer.
2. **Offline-First Room DB + WorkManager:**
   - Captures bKash/Nagad SMS via `BroadcastReceiver` + `ForegroundService` (with Android 13+ Restricted Settings onboarding helper).
   - Stores locally in Room DB first; if the merchant is out of network, `WorkManager` automatically syncs all queued SMS the exact second internet returns, triggering ORBIT SaaS auto-verification and customer email dispatch.
3. **Two-Way Status Sync:** Periodically (or via FCM push) refreshes `/api/v1/device/stats` so the merchant sees which SMS actually converted into verified website orders.

# Deliverables
Generate:
1. Complete Drizzle schemas & Hono API routes for **ORBIT SaaS Central Hub**.
2. Exact integration patches for our **E-Commerce Monolith** (`functions/api/app.ts` CSRF bypass + HMAC webhook handler + email trigger).
3. Complete, compilable **Kotlin Android App** source code (`AndroidManifest.xml`, `SmsReceiver.kt`, `ForegroundSyncService.kt`, `SyncWorker.kt`, `DashboardScreen.kt`).