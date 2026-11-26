# Shared Contracts: Self-Hosted Cloudflare Push Hub & Email OTP Fallback

All subagents MUST read and follow these contracts verbatim.

---

#### 1. WebSocket Endpoint (`GET /api/v1/device/ws`)
- Auth: `authDeviceMiddleware` using standard HTTP headers on the WebSocket upgrade handshake (`Authorization: Bearer <jwt>`, `X-Device-Key: <key>`, `X-Merchant-Id: <id>`).
- Requires header `Upgrade: websocket` (else HTTP `426 Upgrade Required`).
- If `env.PUSH_HUB` is unbound, returns HTTP `503` JSON `{ success: false, error: 'Self-hosted push hub binding (PUSH_HUB) is not configured' }`.
- Forwards handshake to `env.PUSH_HUB.get(env.PUSH_HUB.idFromName(merchantId))` at `https://push-hub.internal/connect?clientType=android` forwarding `c.req.raw.headers`. Returns the raw `101` `Response` directly without wrapping/modifying headers.

#### 2. WebSocket Wire Protocol (Server ↔ Android)
- **Keepalive:** Client sends plain text `"ping"` every 45s. Durable Object configures `state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))` so Cloudflare replies `"pong"` without waking the DO from hibernation.
- **Server Welcome Frame (on connect):**
  ```json
  { "type": "connected", "serverTime": 1764072000000, "transport": "cloudflare_do_ws" }
  ```
- **Server Push Frame (on order / payment / admin test):**
  ```json
  {
    "type": "push",
    "id": "uuid",
    "event": "payment.verified | order.created | order.action_required | ADMIN_TEST_PUSH | notification",
    "title": "string",
    "body": "string",
    "data": { "key": "string" },
    "timestamp": 1764072000000
  }
  ```
- **Event Handling on Android (`PushWebSocketClient`):**
  - `payment.verified` (or `data["trxId"]` non-blank): calls `OrbitDatabase.getDatabase(ctx).smsDao().markVerifiedByTrxId(trxId, orderId)` and shows high-priority notification on `OrbitApplication.ORBIT_ALERT_CHANNEL`.
  - `order.created` / `order.action_required`: calls `prefs.markOrderSeen(orderId)` first to deduplicate across WS / FCM / polling; if unseen (or `orderId` blank), shows high-priority order notification on `OrbitApplication.ORBIT_ALERT_CHANNEL`.
  - `ADMIN_TEST_PUSH` or any other `type == "push"` with non-blank `title`/`body`: shows high-priority notification on `OrbitApplication.ORBIT_ALERT_CHANNEL`.

#### 3. 3-Tier Push Fallback Architecture
- **Tier 1 (Primary, Self-Hosted, \$0):** Cloudflare Durable Objects WebSocket (`MerchantPushHub`). Always attempted first when `env.PUSH_HUB` is bound.
- **Tier 2 (Optional Backup):** FCM HTTP v1 (`FCM_SERVICE_ACCOUNT_JSON`). Attempted in parallel/sequence only if configured and merchant has FCM tokens; unregistered tokens are nulled out.
- **Tier 3 (Guaranteed Fallback):** Android `StickyForegroundService` `/api/v1/device/sync` HTTP polling:
  - Interval = `60_000L` (60s) when `PushWebSocketClient.connectionState.value != WsPushState.CONNECTED && !FcmTokenRegistrar.isFirebaseAvailable(ctx)`.
  - Interval = `300_000L` (5 min) when WebSocket is `CONNECTED` OR Firebase is available.
  - Triggers an immediate `/sync` catch-up whenever WebSocket transitions into `CONNECTED` (so events missed while disconnected are recovered immediately).

#### 4. Extended Admin Messaging Contracts (`/api/v1/admin/messaging/*`)
- **`GET /api/v1/admin/messaging/status`** response `data`:
  ```json
  {
    "sms": [ /* ProviderCapability[] */ ],
    "email": [ /* ProviderCapability[] */ ],
    "push": {
      "selfHostedWsConfigured": true,
      "fcmV1Configured": false,
      "projectId": null,
      "fallbackPollingIntervalSec": 60
    },
    "otp": { "sentLast24h": 0, "verifiedLast24h": 0 }
  }
  ```
- **`POST /api/v1/admin/messaging/test-push`** response `data`:
  ```json
  {
    "sentCount": 1,
    "wsDelivered": 1,
    "fcmDelivered": 0,
    "activeSockets": 1
  }
  ```
  (Note: `sentCount = wsDelivered + fcmDelivered`, keeping backward compatibility.)

#### 5. Email OTP Fallback (`POST /api/v1/otp/send`)
- Request body: `{ phone: string, purpose?: string, template?: string, email?: string }` (`email` optional valid email).
- Dispatch order:
  1. Attempt SMS via `routeSmsOrPush(env, { to: phone, message }, ...)`.
  2. If SMS fails (no SMS provider configured OR all SMS providers errored) AND `input.email` is provided: attempt Email via `routeEmail(env, { to: input.email, subject: "${merchant.storeName} Verification Code", text: message, html: "<p>...</p>" }, ...)`.
  3. If neither succeeded: in non-production when no SMS provider (and no working email fallback) is configured, persist with `provider = 'DEV_CONSOLE'` and return `devCode`; in production, throw `503`/`502`.
- Response `data`: `{ otpId, expiresAt, provider, channel: 'SMS' | 'EMAIL' | 'DEV', devCode? }`. (`provider` is `'email:<providerUsed>'` when sent via email.)

#### 6. Android Kotlin Shared Symbols (S2 produces, S3 consumes)
- Package `com.orbitsaas.payment.service`:
  - `enum class WsPushState { DISCONNECTED, CONNECTING, CONNECTED, UNAUTHORIZED }`
  - `class PushWebSocketClient(...)` with companion object exposing:
    - `val connectionState: StateFlow<WsPushState>`
    - `val lastPushReceivedAt: StateFlow<Long>`
  - `StickyForegroundService.companion`:
    - `const val ACTION_RECONNECT_WS = "com.orbitsaas.payment.action.RECONNECT_WS"`
    - `fun reconnectWebSocket(context: Context)` (starts service with `ACTION_RECONNECT_WS` so Diagnostics "Reconnect" button works cleanly even from UI).
