# Tasks: Self-Hosted Cloudflare Push Hub & Email OTP Fallback

## S1 — Backend Push Hub & Email OTP Engineer
- [x] Update `wrangler.toml` with `PUSH_HUB` Durable Object binding (`MerchantPushHub`) and SQLite migration `v1`
- [x] Update `backend/src/shared/types.ts` (`Env`) with `PUSH_HUB?: DurableObjectNamespace`
- [x] Create `backend/src/durable/merchant-push-hub.ts` (`MerchantPushHub` implementing `DurableObject` with WebSocket Hibernation + `ping`/`pong` auto-response)
- [x] Export `MerchantPushHub` from `backend/src/worker.ts`
- [x] Create `backend/src/router/push-hub.ts` (`pushToMerchantWebSockets`, `getMerchantPushHubStatus`)
- [x] Bypass Hono `cors()` in `backend/src/index.ts` when `Upgrade: websocket`
- [x] Add `GET /api/v1/device/ws` in `backend/src/features/device/device.routes.ts`
- [x] Update `backend/src/features/webhooks/webhook.dispatcher.ts` with `sendPushToMerchantDevicesDetailed` (Tier 1 WS + Tier 2 FCM v1)
- [x] Add optional `email` + Email OTP fallback (`routeEmail`) in `backend/src/features/otp/otp.schema.ts` & `otp.service.ts`
- [x] Update `backend/src/features/admin/messaging.routes.ts` (`GET /status` email + push fields, `POST /test-push` breakdown)

## S2 — Android WebSocket Push & Fallback Engineer
- [x] Add `com.squareup.okhttp3:okhttp:4.12.0` in `app/app/build.gradle.kts` and ProGuard rules in `app/app/proguard-rules.pro`
- [x] Create `app/app/src/main/java/com/orbitsaas/payment/service/PushWebSocketClient.kt` (`WsPushState`, `connectionState`, `lastPushReceivedAt`, 45s `"ping"` keepalive, exponential backoff reconnect, Room + notification handling)
- [x] Integrate `PushWebSocketClient`, `ACTION_RECONNECT_WS`, `reconnectWebSocket(context)`, adaptive 60s/300s polling, immediate catch-up `/sync`, and dynamic foreground notification status in `StickyForegroundService.kt`
- [x] Add EN/BN strings in `res/values/strings_core.xml` and `res/values-bn/strings_core.xml`
- [x] Update `app/README.md` for zero-Firebase self-hosted instant push

## S3 — Android Diagnostics UI & Localization Engineer
- [x] Observe `PushWebSocketClient.connectionState` and `lastPushReceivedAt` + add `reconnectPushWebSocket()` in `DiagnosticsViewModel.kt`
- [x] Add Self-Hosted Instant Push (WebSocket) checklist row + Reconnect button, Optional Backup (FCM) row clarity, and Last Instant Push telemetry in `DiagnosticsScreen.kt`
- [x] Add EN/BN strings in `res/values/strings_screens.xml` and `res/values-bn/strings_screens.xml`

## S4 — Web Admin Panel & Docs Engineer
- [x] Extend `AdminMessagingStatus` and `TestPushResponse` types in `frontend/src/features/admin/useAdmin.ts`
- [x] Update `frontend/src/features/admin/SmsPushPanel.tsx` for 3-tier Push status, Email OTP fallback readiness, and `wsDelivered`/`fcmDelivered`/`activeSockets` breakdown
- [x] Document Email OTP fallback in `ECOMMERCE_INTEGRATION.md` and 3-tier Zero-Firebase Push architecture in `docs/SMS_AND_PUSH_SETUP.md`

## QA — Convergence Lead
- [x] Verify `wrangler.toml`, `worker.ts`, `index.ts` CORS bypass, `types.ts`, and `MerchantPushHub` alignment with `@cloudflare/workers-types/2023-07-01`
- [x] Verify `webhook.dispatcher.ts` callers and `otp.service.ts` email fallback invariants (no OTP log/leak)
- [x] Verify Kotlin symbols across `PushWebSocketClient.kt`, `StickyForegroundService.kt`, `DiagnosticsViewModel.kt`, `DiagnosticsScreen.kt`, and `app/build.gradle.kts`
- [x] Verify 1:1 EN/BN key parity and zero duplicate keys across `strings.xml`, `strings_core.xml`, `strings_screens.xml`
- [x] Verify frontend `useAdmin.ts` ↔ `SmsPushPanel.tsx` ↔ `messaging.routes.ts` types and BoardUI rules
