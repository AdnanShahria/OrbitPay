# ORBIT Payment Hub — Utilities & Feature Edition Matrix

> **Part of ORBIT Context Directory** | [Back to Master Context](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/context.md)

---

## 📌 Document Metadata & Activity Tracker

| Field | Value |
|---|---|
| **Document** | Utilities, Regex Parsers, Crypto Engines & Feature Tiers |
| **Status** | Active / Production Specification |
| **Last Updated** | 2026-11-18 18:20:00 +06:00 |
| **Last Prompt / Trigger** | Third-party storefront API architecture & multi-provider MFS expansion |
| **Actions Taken** | Expanded regex engines to cover all 5 MFS providers (bKash Personal/PRA, Nagad, Rocket 12-digit, Upay, Cellfin), Web Crypto HMAC helpers, and third-party webhook payloads. |

---

## 1. Core Utilities & Helper Engines

### 1.1 Multi-Provider MFS Regex Extraction Engine (`backend/src/shared/parsers/`)

Incoming telecom SMS and app push formats across all major Bangladeshi providers:

```typescript
export const PROVIDER_PARSERS = {
  // 1. bKash Personal (Send Money)
  // "You have received Tk 500.00 from 01711111111. Ref . Fee Tk 0.00. Balance Tk 1,250.00. TrxID 9GB7XQ21 at 18/11/2026 14:30"
  BKASH_PERSONAL: /You have received Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TrxID\s+([A-Za-z0-9]+)/i,

  // 2. bKash Personal Retail (PRA Payment)
  // "Payment received Tk 500.00 from 01711111111. TrxID 9GB7XQ21 at 18/11/2026 14:30. Balance Tk 5,200.00."
  BKASH_PRA: /Payment received Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TrxID\s+([A-Za-z0-9]+)/i,

  // 3. Nagad Personal & Merchant
  // "You have received BDT 500.00 from 01811111111. Fee: BDT 0.00. Balance: BDT 2,100.00. TxnID: 7XYZABC9 18/11/2026 14:35"
  NAGAD_STANDARD: /received BDT\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TxnID:\s*([A-Za-z0-9]+)/i,
  NAGAD_ALT: /Amount:\s*Tk\s*([0-9,.]+).*?Sender:\s*(01[3-9]\d{8}).*?TxnID:\s*([A-Za-z0-9]+)/i,

  // 4. DBBL Rocket (Supports 12-digit format with check digit)
  // "You have received Tk 500.00 from 019111111112. Fee Tk 0.00. Balance Tk 3,443.15. TrxID ADB3DB1GHF at 18/11/2026 19:17"
  ROCKET_STANDARD: /You have received Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8,9}).*?TrxID\s+([A-Za-z0-9]+)/i,
  ROCKET_MERCHANT: /Payment Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8,9}).*?TrxID:\s*([A-Za-z0-9]+)/i,

  // 5. Upay (UCB MFS)
  // "You have received Tk 500.00 from 01611111111. Fee Tk 0.00. Balance Tk 1,500.00. TrxID UP87912ABC at 18/11/2026 15:10"
  UPAY_STANDARD: /You have received Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TrxID\s+([A-Za-z0-9]+)/i,

  // 6. Cellfin (Islami Bank Bangladesh PLC)
  // "You have received Tk 1,200.00 from 01712345678. Balance Tk 4,500.00. TrxID CF9812481"
  CELLFIN_STANDARD: /(?:received|credited)\s+Tk\s*([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TrxID\s+([A-Za-z0-9]+)/i,
};
```

---

### 1.2 Web Crypto HMAC-SHA256 Signer & Verifier (`backend/src/shared/crypto.ts`)

Native Web Standards implementation for Cloudflare Workers / Pages Functions:

```typescript
export async function signWebhookPayload(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyWebhookSignature(payload: string, receivedSig: string, secret: string): Promise<boolean> {
  const expectedSig = await signWebhookPayload(payload, secret);
  // Constant-time comparison preventing timing attacks
  if (expectedSig.length !== receivedSig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ receivedSig.charCodeAt(i);
  }
  return mismatch === 0;
}
```

---

### 1.3 Unified Service Router (`backend/src/router/` & `frontend/src/router/`)

Replaces direct provider/secret references across feature code with centralized fallback routers:
- `email.ts`: Multi-provider email router (`resend`, `brevo`, `sendpulse`, `aws_ses`, `sendgrid`, `cloudflare`, `apps_script`, `custom_webhook`) with automatic quota/rate-limit cooldown failover.
- `image.ts`: Multi-backend image upload & streaming download router (`r2`, `imgbb`, `supabase`, `mongodb`, `d1`) backed by D1 `media_assets`.
- `sms.ts`: Unified SMS & FCM push router (`bulksmsbd`, `ssl_wireless`, `twilio`, `fcm`, `custom_webhook`).
- `database.ts`: Unified KV/document storage router (`kv`, `d1`, `supabase`, `mongodb`, `turso`).
- `secrets.ts`: Backend-only secret & circuit-breaker orchestrator (`executeWithFallback`).

---

## 2. Feature Edition Matrix

| Feature / Capability | Starter / Community | Pro / Business (Standard) | Enterprise Custom |
|---|---|---|---|
| **Max SIM Numbers per Merchant** | 1 SIM | **Up to 5 SIMs (৳1.5M ceiling)** | Unlimited Pooled SIMs |
| **Supported Providers** | bKash, Nagad | **bKash, Nagad, Rocket, Upay, Cellfin** | All Providers + Custom Banks |
| **Auto-Reconciliation Queue** | 15-minute grace window | **60-minute grace window** | 24-hour configurable grace |
| **Third-Party Storefront APIs** | 1 Storefront Endpoint | **Multiple Endpoints (`aurelia.shop`, etc.)** | Unlimited Multi-Store Webhooks |
| **Instant HMAC Webhooks** | ❌ (Manual CSV export) | ✅ **Real-time signed webhooks**| ✅ Real-time signed webhooks |
| **Email Invoice Pipeline** | ❌ | ✅ **SendPulse / Apps Script** | ✅ SendPulse / SMTP / Resend |
| **Android Sideload Companion** | Single Device | Up to 3 Linked Devices | Multi-device Cluster |
| **Cloudflare D1 Infrastructure** | Shared Multi-tenant | Shared Isolated Tenant | Dedicated D1 Instance |
