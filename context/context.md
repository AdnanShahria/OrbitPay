# ORBIT Payment Hub — Master Project Context & Index

> **Master Context File** | Single source of truth for ORBIT Payment Hub.  
> Whenever working with or handing off this repository, start here.

---

## 📌 Document Metadata & Activity Tracker

| Field | Value |
|---|---|
| **Project Name** | ORBIT Payment Hub (ORBIT Pay) |
| **Domain** | `payment.orbitsaas.cloud` |
| **System Architecture** | Multi-Tenant, 3-Party MFS Payment Verification SaaS with 3rd-Party Webhook API Dispatch |
| **Target Deployment** | Single Cloudflare Worker with Static Assets (`frontend/dist` via `[assets]` + `backend/src/worker.ts` Hono + Cron) + Native Kotlin APK (`app/`) |
| **Supported Third-Party Stores** | `ecom.orbitsaas.cloud`, `aurelia.shop/payment/v1`, `newznbd.shop/payment/v1`, and custom client platforms |
| **Central Admin Center** | Hidden `/admin` path (Multi-project monitoring, telemetry KPIs, webhook retries) |
| **Unified Service Router** | `backend/src/router/` + `frontend/src/router/` (`/api/v1/router/*`) — Zero-secret-leakage multi-provider failover for Email, SMS/Push, Images & Database/KV |
| **Last Updated** | 2026-11-23 00:05:00 +06:00 |
| **Last Prompt / Trigger** | Unique positive 2-decimal poisha checkout + base-amount fallback, admin-provisioned JWT/Session auth, bi-directional e-commerce order sync, and Android Kotlin app upgrades |
| **Actions Taken** | Added `checkout_sessions`, `merchant_users`, `auth_sessions`, `merchant_devices`, and `merchant_orders` (migration `0002_auth_unique_orders.sql`); implemented positive `+0.01` poisha unique amount allocator with `BASE_AMOUNT_FALLBACK` TrxID matching; built admin-provisioned PBKDF2 + HMAC-SHA256 JWT/Session auth across Web & Android (locking public `/merchants/register`); added bi-directional `/api/v1/orders/*` & `/api/v1/device/orders/*` sync with FCM push & storefront webhooks; and created `ECOMMERCE_INTEGRATION.md`. |

---

## 🚀 Executive Summary & Product Vision

ORBIT Payment Hub is an industrial-grade, multi-tenant, non-custodial Mobile Financial Services (MFS) payment verification SaaS. It bridges personal and micro-merchant accounts (**bKash**, **Nagad**, **Rocket**, **Upay**, **Cellfin**) with e-commerce storefronts, automating transaction verification through a native Android companion daemon without requiring a formal corporate Trade License or enterprise payment gateway onboarding.

### Core Value Proposition:
1. **Zero Documentation Friction:** Enables micro-merchants and solopreneurs to accept automated digital payments using personal wallets or Personal Retail Accounts (PRA).
2. **Instant Wallet Liquidity (Non-Custodial):** Funds flow directly into the merchant's mobile wallet. Zero 3-day gateway settlement delays.
3. **0% Transaction Commission:** Avoids the 1.5%–2.5% cuts charged by traditional payment aggregators (SSLCommerz, Shurjopay, AamarPay).
4. **Multi-SIM Limit Bypass:** Overcomes the Bangladesh Bank ৳300,000 monthly personal account ceiling by dynamically pooling and rotating up to 5 MFS numbers per merchant.
5. **Edge-Native Speed:** Sub-20ms API response time across Bangladesh via Cloudflare’s Dhaka (DAC) edge infrastructure.

---

## 🔄 The 3-Party Ecosystem

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                       Party 1: Visitor / Buyer                         │
   │  Browses e-commerce store (e.g. aurelia.shop, newznbd.shop, ecom...)   │
   │  Sends money via bKash/Nagad app to merchant's SIM                     │
   │  Submits TrxID + Sender Number on Storefront Checkout                  │
   └───────────────────────────────────┬────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
   ┌─────────────────────────────────────┐   ┌──────────────────────────────────┐
   │ Party 2A: Client E-Commerce Stores  │   │ Party 2B: Merchant Android App   │
   │ (ecom.orbitsaas.cloud,              │   │ (Sideloaded Kotlin Companion)    │
   │  aurelia.shop/payment/v1,           │   │ - Intercepts incoming MFS SMS &  │
   │  newznbd.shop/payment/v1)           │   │   App Push notifications         │
   │ - Presents ORBIT Checkout Modal     │   │ - Ingests SMS to Central Hub via │
   │ - Receives Signed Webhook Callbacks │   │   authenticated X-Device-Key     │
   │ - Marks Order PAID & Sends Invoices │   │ - Displays live status badge     │
   └──────────────────┬──────────────────┘   └──────────────────┬───────────────┘
                      │                                         │
                      └───────────────────┬─────────────────────┘
                                          ▼
         ┌──────────────────────────────────────────────────────────┐
         │             Party 3: ORBIT SaaS Central Hub              │
         │           Domain: payment.orbitsaas.cloud                │
         │           (Cloudflare Pages + Hono + D1)                 │
         │  - Generates Checkout Sessions                           │
         │  - Auto-reconciles Storefront orders with incoming SMS   │
         │  - Fires HMAC-SHA256 Webhook to Third-Party Client APIs  │
         │    (e.g., POST https://aurelia.shop/payment/v1)          │
         │  - Pushes status update to Merchant Android Companion    │
         └──────────────────────────────────────────────────────────┘
```

### Detailed Breakdown of the Three Parties:

1. **Party 1: The Buyer / Visitor:**
   - Visits any of your client e-commerce websites (e.g. `aurelia.shop`, `newznbd.shop`, `ecom.orbitsaas.cloud`).
   - Selects bKash, Nagad, Rocket, Upay, or Cellfin at checkout.
   - Uses their mobile banking app to execute a "Send Money" or "PRA Payment" to the merchant's displayed number.
   - Submits the resulting `TrxID` and their sender mobile number in the ORBIT checkout modal.

2. **Party 2: The E-Commerce Storefront & Merchant (OrbitSaaS Client):**
   - **The Storefront Platform:** Hosted on custom client domains (e.g. `ecom.orbitsaas.cloud`, `aurelia.shop`, `newznbd.shop`). Each store registers with ORBIT Hub and exposes a dedicated third-party webhook endpoint (such as `https://aurelia.shop/payment/v1` or `/api/v1/webhooks/orbit-payment`).
   - **The Merchant Hardware:** Runs the sideloaded **ORBIT Merchant Companion App** on an Android phone carrying the merchant's bKash/Nagad SIMs. The app listens for carrier SMS and app push banners, forwarding transaction payloads to `payment.orbitsaas.cloud`.

3. **Party 3: ORBIT SaaS Central Payment Engine (`payment.orbitsaas.cloud`):**
   - The central intelligence and multi-tenant clearinghouse.
   - Resolves the tenant, verifies the transaction ID and sender number against the SMS ledger, and handles offline grace periods.
   - Makes an authenticated, cryptographically signed HTTP POST request (`X-Orbit-Signature: HMAC-SHA256`) to the client store's designated third-party API endpoint (e.g., `POST https://aurelia.shop/payment/v1`).
   - Once verified, the client store updates its local database (`orders.payment_status = 'PAID'`) and dispatches the customer's invoice email.

---

## 📂 Context Directory Map

This folder (`context/`) is intentionally structured to preserve complete engineering knowledge across handovers and iterations:

| File | Purpose | Link |
|---|---|---|
| `context.md` | Master project index, high-level summary, ecosystem map (This file). | [context.md](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/context.md) |
| `architecture.md` | End-to-end system design, sequence diagrams, third-party API webhook routing, security. | [architecture.md](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/architecture.md) |
| `component.md` | Component hierarchy, BoardUI styling, React web components & Android Compose screens. | [component.md](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/component.md) |
| `ui tickets.md` | UI/UX task backlog, Sprint boards, issue status, and ticket templates. | [ui tickets.md](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/ui%20tickets.md) |
| `database.md` | Cloudflare D1 (SQLite) schemas, Drizzle models, Room DB schemas, and data dictionary. | [database.md](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/database.md) |
| `utils.feature edition.md` | Helper utilities (regex, crypto, email) & feature edition tiers (Free/Pro/Enterprise). | [utils.feature edition.md](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/utils.feature%20edition.md) |
| `activity_log.md` | Chronological log of all prompts, edits, actions taken, and project decisions. | [activity_log.md](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/activity_log.md) |
| `handoff.md` | Quick onboarding & handover guide for any new developer taking over the project. | [handoff.md](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/handoff.md) |

---

## 🛠️ The `/context` Slash Command

You can use `/context` at any time in the prompt box:
- **To query context:** e.g., `/context what is our D1 database schema?` or `/context summarize system architecture`.
- **To update context:** e.g., `/context update database with new refund table` or `/context log prompt: implement Android SMS receiver`.
- **To check full status:** e.g., `/context status` or simply `/context`.

The AI will parse your intent, read or edit the corresponding context files, and automatically record the timestamp, prompt, and action taken in `activity_log.md`.
