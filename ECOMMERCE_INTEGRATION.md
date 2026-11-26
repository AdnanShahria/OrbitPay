# ORBIT Payment Hub — E-Commerce Storefront Integration Guide (Double-Side Rendering)

This guide explains how your **separate e-commerce website** (e.g. `aurelia.shop`, `newznbd.shop`, `ecom.orbitsaas.cloud`, Next.js, Hono, Express, or Laravel) connects with **ORBIT Payment Hub** (`payment.orbitsaas.cloud`) and the **Merchant Android Companion App**.

---

## 1. How the Unique Poisha Amount System Works Across Two Separate Websites

You do **NOT** need to implement decimal offset math on your e-commerce website.

1. Your e-commerce site sends its normal base order total (e.g. `10` or `50` BDT) to ORBIT Pay when opening the checkout modal or calling `POST /api/v1/checkout/session`.
2. **ORBIT Payment Hub** automatically reserves the smallest unused **positive 2-decimal poisha offset** (`+0.01`, `+0.02`, ..., `+3.00`, ...) among active concurrent sessions for that merchant and base amount:
   - Customer #1 paying ৳50 gets **৳50.01**
   - Customer #2 paying ৳50 gets **৳50.02**
   - Customer #300 paying ৳50 gets **৳53.00**
   - It is **always strictly positive** (`10` becomes `10.01`, never `9.99`).
3. On the checkout form, the buyer enters:
   1. **Sender Mobile Number**
   2. **Payment Total Amount Sent** (pre-filled with `50.01`, editable if they sent `50.00`)
   3. **Transaction ID (`TrxID`)**
4. **Base-Amount Fallback Protection**:
   - If a buyer ignores the `.01` instruction and sends `50.00` BDT instead of `50.01`, ORBIT **still verifies the payment automatically** as long as the `TrxID` matches an unclaimed incoming SMS on the merchant's phone and `sms.amount >= baseAmount` (`matchType: "BASE_AMOUNT_FALLBACK"`).

---

## 2. Storefront Frontend — Launch ORBIT Checkout (`widget.js` or Direct Iframe/API)

Pass your normal `amount` (e.g., `50`). ORBIT handles the `.01` poisha allocation automatically:

```html
<!-- 1. Include ORBIT Widget Script -->
<script src="https://payment.orbitsaas.cloud/widget.js"></script>

<!-- 2. Trigger Checkout on "Pay Now" -->
<script>
  function launchOrbitCheckout(order) {
    OrbitPay.open({
      merchantId: "YOUR_MERCHANT_ID",
      orderId: order.id,                 // e.g. "ORD-2026-1042"
      amount: order.totalAmount,         // Pass standard price (e.g. 50)
      customerEmail: order.customerEmail,
      storeName: "Your Store Name",
      onSuccess: function (data) {
        // data = { orderId, trxId, amount, matchType }
        window.location.href = "/order-confirmed?orderId=" + encodeURIComponent(data.orderId);
      },
      onClose: function () {
        console.log("Buyer closed checkout modal");
      }
    });
  }
</script>
```

---

## 3. Storefront Backend — Receive Webhooks (`POST /payment/v1`)

ORBIT sends **HMAC-SHA256 signed webhooks** (`X-Orbit-Signature`) to your configured `webhookUrl` for both **MFS payment verifications** and **bi-directional order actions** triggered from the Merchant's Android Kotlin App or Web Dashboard:

```typescript
import { Hono } from 'hono';

const app = new Hono();

async function verifyOrbitHmac(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const pairs = signatureHex.match(/.{1,2}/g) || [];
  const sigBytes = new Uint8Array(pairs.map((b) => parseInt(b, 16)));
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(rawBody));
}

app.post('/payment/v1', async (c) => {
  const signature = c.req.header('x-orbit-signature') || '';
  const rawBody = await c.req.text();
  const secret = process.env.ORBIT_WEBHOOK_SECRET || '';

  if (!(await verifyOrbitHmac(rawBody, signature, secret))) {
    return c.json({ error: 'Invalid X-Orbit-Signature' }, 401);
  }

  const payload = JSON.parse(rawBody);
  const data = payload.data;

  switch (payload.event) {
    case 'payment.verified': {
      // data: { externalOrderId, trxId, provider, baseAmount, uniqueAmount, paidAmount, matchType, senderNumber }
      // matchType: 'EXACT_UNIQUE' | 'BASE_AMOUNT_FALLBACK' | 'OVERPAID' | 'MANUAL_VERIFIED'
      await markOrderPaidInStoreDb({
        orderId: data.externalOrderId,
        trxId: data.trxId,
        baseAmount: data.baseAmount,
        uniqueAmount: data.uniqueAmount,
        paidAmount: data.paidAmount,
        matchType: data.matchType,
      });
      break;
    }

    // Bi-directional order status sync from Merchant Android Kotlin App / Web Portal
    case 'order.confirmed':
      await updateStoreOrderStatus(data.externalOrderId, 'CONFIRMED');
      break;
    case 'order.ready_to_ship':
      await updateStoreOrderStatus(data.externalOrderId, 'READY_TO_SHIP');
      break;
    case 'order.shipped':
      await updateStoreOrderStatus(data.externalOrderId, 'SHIPPED');
      break;
    case 'order.paid':
      await markStoreOrderPaid(data.externalOrderId);
      break;
    case 'order.cancelled':
      await updateStoreOrderStatus(data.externalOrderId, 'CANCELLED');
      break;
  }

  return c.json({ received: true });
});
```

---

## 4. Storefront Backend — Push All Orders (COD, Card, Bank, Other) to ORBIT & Kotlin App

Whenever **any** new order is placed on your e-commerce website (including **Cash on Delivery**, **Card**, **SSLCommerz**, or **Unpaid** orders), call `POST /api/v1/orders/notify`.

ORBIT will immediately:
1. Store the order in the merchant's **Orders & COD Sync** dashboard.
2. Broadcast a real-time SSE event to the merchant's Web Portal.
3. Dispatch a high-priority **FCM push notification** to the merchant's **Android Kotlin App** so they can confirm, prepare for shipping, mark shipped, or cancel with 1 tap (which fires the webhook back to your `/payment/v1` endpoint!).

```typescript
export async function notifyOrbitOrder(order: {
  externalOrderId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  shippingAddress?: string;
  itemsSummary?: string;
  paymentMethod: 'ORBIT_MFS' | 'COD' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  paymentStatus?: 'UNPAID' | 'PENDING_VERIFICATION' | 'PAID' | 'COD_COLLECTIBLE' | 'FAILED';
  baseAmount: number;
  storeCallbackUrl?: string;
}) {
  const res = await fetch('https://payment.orbitsaas.cloud/api/v1/orders/notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Merchant-Secret': process.env.ORBIT_WEBHOOK_SECRET!,
      'X-Merchant-Id': process.env.ORBIT_MERCHANT_ID!,
    },
    body: JSON.stringify(order),
  });

  if (!res.ok) {
    throw new Error(`ORBIT order notify failed: ${res.status}`);
  }
  return res.json();
}
```

---

## 5. Admin-Provisioned OrbitSaaS Client Login (Web & Android App)

Public self-registration is **disabled**. To onboard a new client store:
1. Open the hidden `/admin` panel (`https://payment.orbitsaas.cloud/admin` or press `Ctrl+Alt+A`).
2. Authenticate with `MASTER_ADMIN_KEY`.
3. Click **Connect Storefront**, enter the store details + **Client Owner Email** and **Password** (or click **Generate Strong**).
4. Share the generated email & password with the client. They can sign into both:
   - **Web Merchant Portal** (`https://payment.orbitsaas.cloud`)
   - **ORBIT Android Companion App** (auto-pairs their `deviceApiKey` on login!)
5. From `/admin` -> **Users & Auth**, you can create additional staff logins, reset passwords, or revoke active JWT sessions (`auth_sessions`) at any time.

---

## 6. Phone OTP Verification API (with Free Email Fallback) (`POST /api/v1/otp/send` & `POST /api/v1/otp/verify`)

Use ORBIT's built-in OTP service to verify buyer phone numbers during checkout or account signup over BulkSMSBD, SSL Wireless, Twilio, or a custom SMS webhook — with automatic **free Email OTP fallback** via `routeEmail` when an optional `email` address is provided.

**Authentication:** Protected by `authMerchantMiddleware`. Pass either:
- `X-Merchant-Secret: <ORBIT_WEBHOOK_SECRET>` (optionally with `X-Merchant-Id: <MERCHANT_ID>`)
- OR `Authorization: Bearer <JWT>`

### Rate Limits & Security Rules
- **6-digit CSPRNG code** generated via `crypto.getRandomValues` and stored as a constant-time **HMAC-SHA256** hash in `otp_codes`.
- **TTL:** 5 minutes (configurable via `OTP_TTL_SECONDS`).
- **Cooldown:** At least 60 seconds between sends per `(phone, purpose)`.
- **Hourly Rate Limit:** Maximum 5 sends per hour per phone number.
- **Brute-force Lockout:** Maximum 5 verify attempts per OTP row; on the 5th failed attempt, the OTP is locked. Single-use (`consumedAt` set atomically on match).
- **Free Email OTP Fallback:** Pass an optional valid `email` field in `POST /api/v1/otp/send`. ORBIT attempts SMS delivery first; if no SMS provider is configured or all SMS providers fail, ORBIT automatically sends the 6-digit verification code to `email` via `routeEmail` (e.g. Resend, Brevo, Cloudflare Email, or Google Apps Script) and returns `channel: "EMAIL"` with `provider: "email:<providerUsed>"`.
- **Response `channel` field:** `POST /api/v1/otp/send` returns `channel` as `'SMS' | 'EMAIL' | 'DEV'` indicating how the OTP was delivered.
- **Non-production Dev Mode:** When `ENVIRONMENT !== 'production'` and neither SMS nor Email delivery is available/configured, `POST /api/v1/otp/send` returns `channel: "DEV"` with `devCode` in `data` for local testing. `devCode` is **never** returned in production.

### `curl` Examples

**Send OTP (`POST /api/v1/otp/send`)**

```bash
curl -X POST https://payment.orbitsaas.cloud/api/v1/otp/send \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Id: YOUR_MERCHANT_ID" \
  -H "X-Merchant-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{
    "phone": "01712345678",
    "email": "buyer@example.com",
    "purpose": "BUYER_PHONE",
    "template": "{storeName} verification code: {code}. Valid 5 minutes. Do not share."
  }'
```

Response (SMS primary, or Email fallback when SMS is unconfigured/failing):

```json
{
  "success": true,
  "data": {
    "otpId": "otp_9a8b7c6d5e4f",
    "expiresAt": "2026-11-25T18:36:00.000Z",
    "provider": "bulksmsbd",
    "channel": "SMS"
  }
}
```

When delivered via Email fallback, `provider` is `"email:<providerUsed>"` (for example `"email:resend"`) and `channel` is `"EMAIL"`.

**Verify OTP (`POST /api/v1/otp/verify`)**

```bash
curl -X POST https://payment.orbitsaas.cloud/api/v1/otp/verify \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Id: YOUR_MERCHANT_ID" \
  -H "X-Merchant-Secret: YOUR_WEBHOOK_SECRET" \
  -d '{
    "otpId": "otp_9a8b7c6d5e4f",
    "phone": "01712345678",
    "code": "482910",
    "purpose": "BUYER_PHONE"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "verified": true
  }
}
```

### Node.js / TypeScript Example

```typescript
const ORBIT_BASE = 'https://payment.orbitsaas.cloud';

const orbitHeaders = {
  'Content-Type': 'application/json',
  'X-Merchant-Id': process.env.ORBIT_MERCHANT_ID!,
  'X-Merchant-Secret': process.env.ORBIT_WEBHOOK_SECRET!,
};

export async function sendBuyerOtp(phone: string, email?: string) {
  const res = await fetch(`${ORBIT_BASE}/api/v1/otp/send`, {
    method: 'POST',
    headers: orbitHeaders,
    body: JSON.stringify({
      phone,
      ...(email ? { email } : {}),
      purpose: 'BUYER_PHONE',
    }),
  });

  const payload = (await res.json()) as {
    success: boolean;
    data?: {
      otpId: string;
      expiresAt: string;
      provider: string;
      channel: 'SMS' | 'EMAIL' | 'DEV';
      devCode?: string;
    };
    error?: { message?: string };
  };

  if (!res.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || `OTP send failed (${res.status})`);
  }

  return payload.data;
}

export async function verifyBuyerOtp(params: {
  otpId?: string;
  phone: string;
  code: string;
}) {
  const res = await fetch(`${ORBIT_BASE}/api/v1/otp/verify`, {
    method: 'POST',
    headers: orbitHeaders,
    body: JSON.stringify({
      otpId: params.otpId,
      phone: params.phone,
      code: params.code,
      purpose: 'BUYER_PHONE',
    }),
  });

  const payload = (await res.json()) as {
    success: boolean;
    data?: { verified: boolean };
    error?: { message?: string };
  };

  if (!res.ok || !payload.success || !payload.data?.verified) {
    throw new Error(payload.error?.message || `OTP verification failed (${res.status})`);
  }

  return payload.data.verified;
}
```
