# Zero-Firebase Push Hub, SMS Gateways & Email OTP Fallback Setup

This guide covers ORBIT's **Zero-Firebase 3-Tier Push Architecture** for the Android companion app, outgoing **SMS gateways**, **free Email OTP fallback** via `routeEmail`, and Cloudflare Worker request-budget math.

---

## 1. Zero-Firebase 3-Tier Push Architecture

ORBIT delivers sub-second (`<1s`) payment verification and order alerts to the Android companion app at **$0 cost** with **zero Firebase or Google Cloud dependency** by default.

```text
Tier 1 (Primary, $0, <1s)   : Cloudflare Durable Objects SQLite WebSocket Hub (MerchantPushHub)
   ↓ (optional parallel backup when configured)
Tier 2 (Optional Backup)     : FCM HTTP v1 (FCM_SERVICE_ACCOUNT_JSON + google-services.json)
   ↓ (automatic disconnect fallback)
Tier 3 (Guaranteed Fallback) : Adaptive GET /api/v1/device/sync HTTP Polling (60s / 300s)
```

### Tier 1: Self-Hosted Cloudflare Durable Objects WebSocket Hub (Free Plan)
- **Binding:** `PUSH_HUB` (`MerchantPushHub` SQLite-backed Durable Object in `wrangler.toml`, compatible with Cloudflare Workers **Free Plan**).
- **Endpoint:** `GET /api/v1/device/ws` (authenticated via `Authorization: Bearer <jwt>`, `X-Device-Key: <key>`, `X-Merchant-Id: <id>` during the WebSocket upgrade handshake).
- **Hibernation & Keepalive:** `MerchantPushHub` uses Cloudflare's **WebSocket Hibernation API** with `WebSocketRequestResponsePair("ping", "pong")`. Android sends a lightweight `"ping"` every 45 seconds and Cloudflare auto-replies `"pong"` at the edge **without waking the Durable Object from hibernation** (zero billable compute while idle).
- **No external secrets required:** Once `PUSH_HUB` is bound in `wrangler.toml`, Tier 1 is active automatically for all storefronts.

### Tier 2: Optional FCM HTTP v1 Setup (Cloudflare Workers + Android)

If you want Google FCM as a secondary wake-up channel alongside Tier 1 WebSocket, configure **FCM HTTP v1** (`https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`). Legacy `FCM_SERVER_KEY` is removed; ORBIT signs RS256 OAuth2 JWT assertions directly on Cloudflare Workers using Web Crypto (`crypto.subtle`).

#### Step A: Generate Firebase Service Account JSON
1. Open the [Firebase Console](https://console.firebase.google.com/) and select (or create) your project.
2. Go to **Project settings** (gear icon) -> **Service accounts**.
3. Click **Generate new private key** and download the JSON file.
4. Push the minified JSON to Cloudflare Workers:
   ```bash
   npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON
   ```
   *(Paste the entire JSON object when prompted. Optionally set `FCM_PROJECT_ID` to override `project_id`.)*

For local `wrangler dev`, copy `.dev.vars.example` to `.dev.vars` and set `FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'`.

#### Step B: Configure Android `google-services.json`
1. In the same Firebase project, click **Add app** -> **Android**.
2. Enter the exact Android package name (`applicationId` in `app/app/build.gradle.kts`):
   ```text
   com.orbitsaas.payment
   ```
3. Download `google-services.json` and place it at:
   ```text
   app/app/google-services.json
   ```
4. Rebuild the Android APK. If `google-services.json` is absent, the app compiles cleanly and runs on Tier 1 WebSocket + Tier 3 polling.

### Tier 3: Adaptive `/sync` Polling & Catch-Up Sync (`GET /api/v1/device/sync`)
Even on unstable mobile networks where a WebSocket drops:
- **Disconnected (`WsPushState != CONNECTED` and `!isFirebaseAvailable`):** `StickyForegroundService` polls `GET /api/v1/device/sync` every **60 seconds**.
- **Connected (`WsPushState == CONNECTED` or Firebase active):** Polling relaxes to a **300-second (5-minute)** safety-net interval.
- **Immediate catch-up sync:** As soon as `PushWebSocketClient` transitions back into `CONNECTED`, `StickyForegroundService` triggers an immediate `/sync` so any events missed during the disconnect are recovered right away, deduplicated across WS / FCM / `/sync`.

---

## 2. SMS Provider Secrets (`wrangler secret put`)

ORBIT's unified SMS router (`backend/src/router/sms.ts`) automatically selects configured providers in priority order and fails over across providers on HTTP errors, timeouts, or quota exhaustion.

Default priority order:
```text
bulksmsbd -> ssl_wireless -> twilio -> fcm -> custom_webhook
```

You can override the order with `SMS_PROVIDER_ORDER` (comma-separated).

### BulkSMSBD (Primary Bangladesh Route)
```bash
npx wrangler secret put BULKSMSBD_API_KEY
npx wrangler secret put BULKSMSBD_SENDER_ID
```
- Normalizes `01XXXXXXXXX` numbers to `8801XXXXXXXXX`.
- Expects BulkSMSBD `response_code === 202`.

### SSL Wireless (Enterprise Bangladesh Failover)
```bash
npx wrangler secret put SSL_WIRELESS_API_TOKEN
npx wrangler secret put SSL_WIRELESS_SID
```
- Dispatches JSON payloads to `https://smsplus.sslwireless.com/api/v3/send-sms`.

### Twilio (Global SMS Fallback)
```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM_NUMBER
```
- `TWILIO_FROM_NUMBER` should be in E.164 format (e.g. `+15551234567`).

### Custom Webhook Relay (Optional)
```bash
npx wrangler secret put CUSTOM_SMS_WEBHOOK_URL
```
- Receives `{ to, message, title, fcmToken, data }` via `POST`.

### OTP Security & TTL Variables
```bash
npx wrangler secret put ENCRYPTION_PEPPER
npx wrangler secret put OTP_TTL_SECONDS    # Optional, defaults to 300 (5 minutes)
```
- `ENCRYPTION_PEPPER` is used to derive HMAC-SHA256 hashes for stored OTP codes (`otp_codes`).

---

## 3. Free Email OTP Fallback (`routeEmail` Secrets)

If you have not purchased SMS gateway credits yet (or if all configured SMS gateways fail), `POST /api/v1/otp/send` accepts an optional `email` field and automatically falls back to ORBIT's email router (`backend/src/router/email.ts`), returning `channel: "EMAIL"` and `provider: "email:<providerUsed>"`.

Default email priority order (overridable via `EMAIL_PROVIDER_ORDER`):
```text
resend -> brevo -> sendpulse -> aws_ses -> sendgrid -> cloudflare -> apps_script -> custom_webhook
```

### Common Sender Identity Variables
```bash
npx wrangler secret put EMAIL_FROM         # e.g. noreply@payment.orbitsaas.cloud
npx wrangler secret put EMAIL_FROM_NAME    # e.g. ORBIT Payment Hub
```

### Supported `routeEmail` Provider Secrets
Configure any one (or more for automatic multi-provider failover):

| Provider ID | Required Secrets / Binding | Notes |
| --- | --- | --- |
| `resend` | `RESEND_API_KEY` | Free tier: 3,000 emails/month |
| `brevo` | `BREVO_API_KEY` | Free tier: 300 emails/day |
| `sendpulse` | `SENDPULSE_CLIENT_ID`, `SENDPULSE_CLIENT_SECRET` | OAuth2 token cached per isolate |
| `aws_ses` | `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_SES_REGION` | Signed with Web Crypto AWS SigV4 |
| `sendgrid` | `SENDGRID_API_KEY` | SendGrid v3 Mail Send API |
| `cloudflare` | `SEND_EMAIL` binding in `wrangler.toml`, or `CLOUDFLARE_EMAIL_API_KEY` / `MAILCHANNELS_API_KEY` | Native Cloudflare Email Service |
| `apps_script` | `APPS_SCRIPT_EMAIL_URL` | Free Gmail/Google Apps Script relay |
| `custom_webhook` | `CUSTOM_EMAIL_WEBHOOK_URL` (+ optional `CUSTOM_EMAIL_WEBHOOK_SECRET`) | Signs payload with `X-Orbit-Signature` |

---

## 4. Verifying Configuration in `/admin`

1. Open `https://payment.orbitsaas.cloud/admin` (or press `Ctrl+Alt+A`).
2. Authenticate with `MASTER_ADMIN_KEY` and select the **SMS & Push** tab.
3. Verify:
   - **Instant Push (3-Tier Chain)** shows **Self-Hosted WebSocket** (`$0 Free · <1s`), optional FCM v1 status, and the `60s` `/sync` polling fallback.
   - **SMS & Push Provider Capabilities** shows configured SMS gateways as **Active primary** or **Ready**.
   - **Email OTP Fallback Providers** shows configured `routeEmail` adapters as **Active primary** or **Ready** even when no SMS credits are configured.
   - Use **Test Instant Push (Self-Hosted WS + FCM)** (selecting a connected storefront) to confirm `sentCount > 0` along with the `wsDelivered`, `fcmDelivered`, and `activeSockets` breakdown.

---

## 5. Cloudflare Free vs. $5 Paid Plan Cost Math

### Push Delivery (Tier 1 WebSocket + Optional Tier 2 FCM)
- **Cost:** **$0** — Cloudflare Durable Objects SQLite WebSocket Hibernation runs on the Workers Free Plan, and FCM HTTP v1 has no per-message charge.
- **Idle Hibernation:** Client `"ping"` / `"pong"` keepalives are handled automatically at the Cloudflare edge without waking the Durable Object, keeping DO duration usage near zero.

### Adaptive Polling Fallback (`GET /api/v1/device/sync`)
- **Tier 3 Fallback (WS disconnected & no FCM):** polls `/api/v1/device/sync` every **60 seconds**:
  $$60\text{ req/hour} \times 24\text{ hours} = 1{,}440\text{ req/day per phone}$$
- **Safety-Net Mode (WS `CONNECTED` or FCM active):** polling relaxes to every **300 seconds** (5 minutes):
  $$12\text{ req/hour} \times 24\text{ hours} = 288\text{ req/day per phone}$$

### Cloudflare Workers Plan Sizing
- **Cloudflare Workers Free Plan (100,000 requests/day):**
  - With Tier 1 Self-Hosted WebSocket active (`288 req/day/phone` safety-net `/sync`), the Free tier comfortably handles **~250–300 active companion phones**.
  - Even if all phones fell back to 60s polling (`1,440 req/day/phone`), the Free tier handles **~40–50 active phones**.
- **Cloudflare Workers Paid Plan ($5/month):**
  - Includes **10 million requests/month** (`~$0.30` per additional million), easily covering hundreds to thousands of companion phones.
