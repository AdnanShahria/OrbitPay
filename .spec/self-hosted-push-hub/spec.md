# Specification: Self-Hosted Cloudflare Push Hub, 3-Tier Fallback & Email OTP Fallback

## Overview
Replace dependency on Firebase/Google Cloud for real-time Android push alerts with a **100% free, self-hosted Cloudflare Durable Objects WebSocket Hub** (`MerchantPushHub` using SQLite-backed DO + WebSocket Hibernation API), backed by a **3-tier delivery chain** (Self-Hosted WebSocket → Optional FCM HTTP v1 → Adaptive `/api/v1/device/sync` HTTP Polling), plus **free Email OTP fallback** via `routeEmail` when no SMS gateway is configured or SMS fails.

---

## User Stories & Acceptance Criteria

### 1. Tier-1 Self-Hosted Cloudflare Durable Objects WebSocket Push (`\$0` Free Plan)
- **Story:** As a merchant without a Firebase project, I want instant (<1s) payment verification and order notifications delivered directly from my Cloudflare Worker to my Android companion app.
- **Given/When/Then:**
  - **Given** `StickyForegroundService` is running and signed in, **When** it connects to `GET /api/v1/device/ws` with `Authorization: Bearer` / `X-Device-Key` / `X-Merchant-Id`, **Then** `authDeviceMiddleware` authenticates the handshake, Hono CORS middleware skips header mutation on `Upgrade: websocket`, and `MerchantPushHub` accepts the hibernatable WebSocket and sends `{ type: "connected", serverTime, transport: "cloudflare_do_ws" }`.
  - **Given** the WebSocket is open, **When** Android sends `"ping"` every 45s, **Then** Cloudflare's `WebSocketRequestResponsePair("ping", "pong")` auto-replies `"pong"` without waking the Durable Object from hibernation.
  - **Given** a payment is verified, an order is created/updated, or an admin triggers `POST /api/v1/admin/messaging/test-push`, **When** `sendPushToMerchantDevicesDetailed` runs, **Then** Tier-1 dispatches `{ type: "push", id, event, title, body, data, timestamp }` to all open WebSockets for that merchant immediately.

### 2. Tier-2 Optional FCM HTTP v1 Backup
- **Story:** As a merchant who later configures Firebase (`FCM_SERVICE_ACCOUNT_JSON` + `google-services.json`), I want FCM HTTP v1 to act as an automatic wake-up backup alongside the self-hosted WebSocket hub.
- **Given/When/Then:**
  - **Given** `FCM_SERVICE_ACCOUNT_JSON` is configured and the merchant has active `fcmToken` rows, **When** `sendPushToMerchantDevicesDetailed` runs, **Then** it delivers via Tier-1 WebSocket AND Tier-2 FCM HTTP v1, clearing any `UNREGISTERED` tokens.
  - **Given** `FCM_SERVICE_ACCOUNT_JSON` is absent, **Then** Tier-2 is cleanly skipped with zero errors.

### 3. Tier-3 Adaptive Sync Polling Fallback & Catch-Up Sync
- **Story:** As a merchant on unstable mobile networks, I want the app to automatically fall back to 60s HTTP polling whenever the WebSocket disconnects (and Firebase is absent), and run an immediate catch-up sync upon WebSocket reconnection.
- **Given/When/Then:**
  - **Given** `PushWebSocketClient.connectionState != CONNECTED` and `!FcmTokenRegistrar.isFirebaseAvailable(ctx)`, **When** `StickyForegroundService` loops, **Then** it polls `GET /api/v1/device/sync?since=...` every 60 seconds.
  - **Given** WebSocket IS `CONNECTED` (or Firebase is available), **When** `StickyForegroundService` loops, **Then** polling relaxes to a 300-second (5-minute) safety-net interval.
  - **Given** WebSocket transitions into `CONNECTED`, **Then** an immediate catch-up `/sync` runs so no events missed during disconnect are lost.
  - **Given** an order notification arrives via WebSocket, FCM, or `/sync`, **Then** `PreferencesManager.markOrderSeen(externalOrderId)` deduplicates alerts so the merchant never sees duplicate notifications.

### 4. Email OTP Fallback (`POST /api/v1/otp/send`)
- **Story:** As a storefront owner who has not yet purchased SMS gateway credits, I want `POST /api/v1/otp/send` to fall back to sending the OTP via Email (`routeEmail`) when an optional `email` address is supplied.
- **Given/When/Then:**
  - **Given** `POST /api/v1/otp/send` receives `{ phone, email }`, **When** SMS dispatch fails or no SMS provider is configured, **Then** `otp.service.ts` automatically dispatches the 6-digit OTP via `routeEmail` and returns `{ otpId, expiresAt, provider: "email:<provider>", channel: "EMAIL" }`.
  - **Given** both SMS and Email fail (or no Email was provided and no SMS provider is configured), **Then** non-production returns `channel: "DEV"` with `devCode`, while production fails cleanly with HTTP `503`/`502` and never leaks `devCode`.

### 5. Android Diagnostics & Admin Messaging Visibility
- **Story:** As a merchant or platform admin, I want clear visibility into the 3-tier push state (Self-Hosted WebSocket, Optional FCM v1, 60s Polling) and Email OTP fallback readiness, plus a Reconnect button on Android and a detailed breakdown in `/admin`.
