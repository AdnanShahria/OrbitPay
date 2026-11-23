# Feature Specification: ORBIT Payment Hub (ORBIT Pay)

**Feature Name:** ORBIT Payment Hub Monorepo  
**Production Domain:** `payment.orbitsaas.cloud`  
**Architecture:** 3-Party MFS Verification SaaS (Cloudflare Pages + D1 Drizzle + React 19 + Android Companion)  
**Status:** In Progress / Subagent Swarm Construction  

---

## 1. System Overview & User Stories

### Story 1: Buyer Checkout Verification (Instant & Deferred)
- **As a** Buyer on an E-Commerce storefront (e.g. `aurelia.shop`, `ecom.orbitsaas.cloud`),
- **I want to** select bKash/Nagad/Rocket/Upay/Cellfin, copy the active merchant number, complete Send Money on my phone, and enter my `TrxID` + `Sender Number`,
- **So that** my order is verified automatically within seconds without waiting for a manual merchant check.
- **Acceptance Criteria (Given / When / Then):**
  - **Instant Match:** Given an unassigned matching SMS already exists in `sms_ledger` (`UNCLAIMED`), when buyer submits `TrxID` and `Amount`, then system marks `VERIFIED`, binds `external_order_id`, fires HMAC webhook to storefront (`payment.verified`), and responds `{ status: "VERIFIED" }`.
  - **Deferred Match (Offline Admin / Delayed SMS):** Given no SMS exists yet, when buyer submits `TrxID`, then system registers a queue entry in `verification_queue` (`WAITING_FOR_SMS`) with a 60-minute expiry, and responds `{ status: "PENDING_VERIFICATION" }`. Once the merchant's companion app comes online and ingests the SMS, auto-reconciliation instantly matches the queue, updates the ledger, and dispatches the webhook.
  - **Typo Tolerance:** Given a customer mistypes their TrxID by 1 character, the merchant can view `UNCLAIMED` transactions in the portal and execute a 1-click manual match against pending orders.

### Story 2: Android Companion Daemon (Offline-First SMS Capture)
- **As an** E-Commerce Merchant with a personal/merchant SIM,
- **I want** my companion Android phone to capture incoming MFS SMS notifications automatically in the background,
- **So that** transactions are synced instantly to `payment.orbitsaas.cloud` without human manual typing.
- **Acceptance Criteria:**
  - Phone captures incoming SMS via `Telephony.SMS_RECEIVED` and `NotificationListenerService` fallback.
  - SMS is parsed locally via regex into `{ provider, trxId, amount, senderNumber, rawSms }`.
  - Persisted in local Room DB (`status: PENDING_UPLOAD`).
  - Synced to `/api/v1/device/ingest` via Ktor HTTP client with `X-Device-Key` authentication.
  - If network is unavailable, `WorkManager` buffers requests and auto-flushes on reconnect.
  - On incoming FCM push or periodic poll, updates local badge to `VERIFIED (Order #...)`.

### Story 3: Merchant Portal & Multi-SIM Wallets
- **As a** Merchant,
- **I want to** manage my SIM numbers, track monthly ৳300,000 regulatory volume limits, configure webhook endpoints, and inspect real-time transaction feeds,
- **So that** my storefronts never exceed individual SIM limits and payment operations run unattended.
- **Acceptance Criteria:**
  - Dashboard displays Real-Time BDT Volume, Verified Orders, Unclaimed SMS, and Device Status.
  - Multi-SIM Grid allows toggling active wallets; checkout rotation automatically picks active numbers under quota.
  - Webhook URL, HMAC secret regeneration, and grace period settings with live testing payload dispatcher.

---

## 2. Security & Compliance Contracts

1. **HMAC-SHA256 Storefront Signatures:** All webhook dispatches must include header `X-Orbit-Signature: hex(HMAC_SHA256(webhook_secret, raw_payload))`. Storefront validates with timing-safe Web Crypto.
2. **Device Authentication:** Companion app sends `X-Device-Key: <raw_key>`. Edge server validates against `merchants.device_api_key_hash = SHA256(raw_key + ENCRYPTION_PEPPER)`.
3. **Storefront API Verification:** Storefront calls `/api/v1/checkout/verify` with `X-Merchant-Secret: <secret>` or signed session token.
4. **Idempotency & Deduplication:** `sms_ledger` enforces `UNIQUE(merchant_id, trx_id)` preventing double-crediting.
