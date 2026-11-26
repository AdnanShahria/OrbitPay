# ORBIT Payment Hub — Utilities & Feature Edition Matrix

> **Part of ORBIT Context Directory** | [Back to Master Context](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/context.md)

---

## 📌 Document Metadata & Activity Tracker

| Field | Value |
|---|---|
| **Document** | Utilities, Regex Parsers, Crypto Engines & Feature Tiers |
| **Status** | Active / Production Specification |
| **Last Updated** | 2026-11-25 19:50:00 +06:00 |
| **Last Prompt / Trigger** | Self-Hosted Cloudflare Durable Objects Push Hub & Email OTP Fallback (`/spin-subagents`) |
| **Actions Taken** | Added `router/push-hub.ts` + `durable/merchant-push-hub.ts` (Cloudflare DO WebSocket Hibernation), updated `sms.ts` + `otp.service.ts` with `routeEmail` OTP fallback, and preserved `fcm.ts` (HTTP v1) as an optional backup tier. |

---

## 1. Core Utilities & Helper Engines

### 1.1 Multi-Provider MFS Regex Extraction & Anti-Spoof Engine (`backend/src/shared/parsers/mfs.ts`, `backend/src/shared/sms-trust.ts`, `app/.../interceptors/SenderTrust.kt`)

Hardened parsing and trust enforcement across all 5 Bangladeshi MFS providers:
- **Tolerant Amount Regex:** `([0-9][0-9,]*(?:\.[0-9]{1,2})?)` handles `Tk`, `Tk.`, `BDT`, commas, and trailing periods (`Tk 500.`).
- **Provider Coverage:** bKash (Send Money, PRA Payment, Cash In), Nagad (Standard & multiline Key-Value), Rocket (`A/C:01912345678X` + legacy 12-digit normalized to 11 digits), Upay, and Cellfin.
- **Explicit Rejections:** Rejects outgoing transfers (`Send Money ... to`), OTP/verification SMS, personal phone senders (`^\+?(88)?01\d{9}$`), numeric senders > 6 digits outside the whitelist, and provider/sender mismatches.
- **Default Sender Whitelist:** `BKASH: ["bKash"]`, `NAGAD: ["NAGAD"]`, `ROCKET: ["16216", "Rocket"]`, `UPAY: ["upay"]`, `CELLFIN: ["CellFin", "IBBL"]` (extensible via `extraTrustedSenders` in Android Settings).
- **Trusted App Packages:** Exact match on `com.bkash.customerapp`, `com.bkash.merchantapp`, `com.konasl.nagad`, `com.konasl.nagad.merchant`, `com.dbbl.mbb.rocket`, `bd.com.upay.customer`, `com.ibbl.cellfin`.

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
- `sms.ts`: Unified SMS & FCM push router (`bulksmsbd`, `ssl_wireless`, `twilio`, `fcm`, `custom_webhook`), paired with `push-hub.ts` (`MerchantPushHub` Cloudflare DO WebSocket primary push) and `otp.service.ts` (`routeEmail` fallback).
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
