# Universal Orbit Payment Hub v2 — Integration Guide

Orbit Payment Hub v2 is a universal, tamper-proof, multi-vertical MFS payment verification infrastructure supporting `ecommerce`, `saas_subscription`, `lms_course`, `booking_appointment`, `invoice_b2b`, `donation`, `digital_topup`, and `custom` applications with zero vertical hardcoding.

---

## 1. Authentication Headers

Server-to-server requests from client backends authenticate using **either**:
- `X-Merchant-Api-Key: sk_live_...` (recommended, SHA-256 hashed on Orbit)
- `X-Merchant-Secret: whsec_...` (legacy/webhook secret fallback)
- `X-Merchant-Id: mer_live_...` (optional disambiguation header)

---

## 2. Core API Contracts

### Create Universal Payment Intent
`POST /api/v1/payment-intents`

Returns `paymentIntentId`, `sessionId`, `sessionToken`, `checkoutUrl`, `uniqueAmount`, `offsetCents`, `activeWallets`, `verificationMode`, `receiptPolicy`, and `deviceStatus` (`{ online, lastSeenAt, activeSockets }`).

### Public Session Hydration & Receipt Upload
- `GET /api/v1/checkout/sessions/:sessionId` — public immutable session hydration (`display`, `actions`, `activeWallets`, `deviceStatus`, `verificationMode`, `receiptPolicy`).
- `POST /api/v1/checkout/receipt` — signed `sessionToken`-gated upload (`PNG` / `JPEG` / `WEBP`, magic-byte verified, max 3 uploads, stored privately on R2/D1).
- `POST /api/v1/checkout/verify` — submits `trxId`, `senderNumber`, `provider`, `paidAmount`, and `sessionToken`. Evaluates all **6 Zero-False-Positive Factors** or routes cleanly through the **5-Tier Fallback Cascade**.

### Reverse-Sync & Dynamic Actions
- `POST /api/v1/payments/:id/resolve` (alias: `POST /api/v1/checkout/resolve`) — atomic `APPROVE` / `REJECT` with `expectedStateVersion` CAS, `consumed_trx_ids` tombstone, and `suppressWebhookEcho: true` when triggered from a Client Admin Panel.
- `POST /api/v1/payments/:id/action` — validates `actionId` against the intent's declared `actions[]` and dispatches signed `action.<actionId>` webhook.
- `POST /api/v1/payment-intents/backfill` — idempotent recovery for Tier-4 outage fallback orders.

### Zero-Code Payment Links
- `CRUD /api/v1/payment-links` (Merchant Auth)
- `GET /api/v1/payment-links/public/:slug` & `POST /api/v1/payment-links/public/:slug/pay`

---

## 3. Signed Webhook Verification (`X-Orbit-Signature-V2`)

Every Orbit webhook includes:
- `X-Orbit-Event`: `payment.submitted | payment.escalated_manual | payment.verified | payment.rejected | payment.expired | order.* | action.* | webhook.test`
- `X-Orbit-Event-Id`: immutable `evt_...` across all retries (use for idempotency PK deduplication)
- `X-Orbit-Timestamp`: Unix epoch milliseconds
- `X-Orbit-Signature`: `HMAC-SHA256(rawBody, webhookSecret)`
- `X-Orbit-Signature-V2`: `HMAC-SHA256("${timestamp}.${rawBody}", webhookSecret)`

```ts
export async function verifyOrbitWebhookV2(
  rawBody: string,
  timestampHeader: string,
  signatureV2Header: string,
  webhookSecret: string,
  maxSkewMs = 5 * 60 * 1000
): Promise<boolean> {
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > maxSkewMs) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestampHeader}.${rawBody}`)
  );
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return expected.length === signatureV2Header.length && expected === signatureV2Header.toLowerCase();
}
```

---

## 4. Vertical Integration Examples

### A. Ecomm-Demo (`Aurelia` — E-Commerce Storefront)
```json
POST /api/v1/payment-intents
{
  "externalRefId": "ORD-2026-9041",
  "vertical": "ecommerce",
  "amount": 1850,
  "callbackUrl": "https://aurelia.shop/api/v1/webhooks/orbit-payment",
  "returnUrl": "https://aurelia.shop/orders/ORD-2026-9041",
  "customer": { "name": "Nusrat Jahan", "phone": "01712345678", "email": "nusrat@example.com" },
  "display": {
    "appName": "Aurelia",
    "appDomain": "aurelia.shop",
    "category": "E-Commerce",
    "referenceLabel": "Order",
    "title": "Silk Jamdani Saree + Express Courier",
    "subtitle": "Dhaka Metro • 2 Items",
    "highlights": [
      { "label": "Order ID", "value": "ORD-2026-9041" },
      { "label": "Payable", "value": "৳1,850" }
    ],
    "adminDeepLink": "https://aurelia.shop/admin/orders?search=ORD-2026-9041"
  },
  "actions": [
    { "id": "confirm_order", "label": "Confirm Order", "style": "primary", "webhookEvent": "action.confirm_order" },
    { "id": "flag_fraud", "label": "Flag Issue", "style": "danger", "webhookEvent": "action.flag_fraud" }
  ]
}
```

### B. Ovijatrik (`Marathon` — Event Registration)
```json
POST /api/v1/payment-intents
{
  "externalRefId": "RUN-OVJ-4418",
  "vertical": "booking_appointment",
  "amount": 1200,
  "callbackUrl": "https://ovijatrik.org/api/webhooks/orbit",
  "customer": { "name": "Tariq Hasan", "phone": "01819001122", "email": "tariq@example.com" },
  "display": {
    "appName": "Ovijatrik Half Marathon",
    "appDomain": "ovijatrik.org",
    "category": "Event Registration",
    "referenceLabel": "Bib Reg",
    "title": "21.1KM Half Marathon Kit",
    "subtitle": "Hatirjheel • T-Shirt Size L",
    "highlights": [
      { "label": "Category", "value": "21.1 KM Open" },
      { "label": "Runner", "value": "Tariq Hasan" }
    ],
    "adminDeepLink": "https://ovijatrik.org/admin/runners/RUN-OVJ-4418"
  },
  "actions": [
    { "id": "issue_bib", "label": "Assign Bib #", "style": "primary", "webhookEvent": "action.issue_bib" }
  ]
}
```

### C. Search / SaaS (`SaaS` — Pro Plan Subscription)
```json
POST /api/v1/payment-intents
{
  "externalRefId": "INV-SAAS-8820",
  "vertical": "saas_subscription",
  "amount": 999,
  "callbackUrl": "https://search.orbitsaas.cloud/api/billing/orbit-webhook",
  "customer": { "name": "Dev Studio", "email": "billing@devstudio.io" },
  "display": {
    "appName": "Orbit Search Pro",
    "appDomain": "search.orbitsaas.cloud",
    "category": "SaaS Subscription",
    "referenceLabel": "Invoice",
    "title": "Team Pro Monthly Plan",
    "subtitle": "50,000 API Queries / mo",
    "highlights": [
      { "label": "Workspace", "value": "devstudio" },
      { "label": "Cycle", "value": "Monthly" }
    ],
    "adminDeepLink": "https://search.orbitsaas.cloud/admin/billing/INV-SAAS-8820"
  },
  "actions": [
    { "id": "activate_license", "label": "Activate Workspace", "style": "primary", "webhookEvent": "action.activate_license" }
  ]
}
```

---

## 5. Reverse-Sync from Client Admin Panel

When a merchant approves or rejects a `WAITING_FOR_SMS` or `MANUAL_REVIEW_REQUIRED` payment directly inside their own admin panel (e.g. Ecomm-Demo Orders Tab), call:

```http
POST /api/v1/payments/{paymentIntentId}/resolve
X-Merchant-Api-Key: sk_live_...
Content-Type: application/json

{
  "decision": "APPROVE",
  "expectedStateVersion": 2,
  "resolutionSource": "CLIENT_ADMIN",
  "resolvedBy": { "id": "adm_1", "email": "owner@aurelia.shop", "role": "ADMIN" },
  "suppressWebhookEcho": true
}
```

Setting `suppressWebhookEcho: true` prevents Orbit from echoing `payment.verified` back to the caller while still recording `consumed_trx_ids`, closing `verification_queue` & `checkout_sessions`, and silently reconciling any late-arriving MFS SMS without duplicate webhooks.
