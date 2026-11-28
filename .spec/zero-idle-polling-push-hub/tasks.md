# Zero-Idle-Polling Push-First Realtime Hub — Task Checklist

## Step 1: Spec-Kit Documentation
- [x] Create `.spec/zero-idle-polling-push-hub/spec.md`
- [x] Create `.spec/zero-idle-polling-push-hub/plan.md`
- [x] Create `.spec/zero-idle-polling-push-hub/tasks.md`

## Step 2: Backend (`backend/src/`)
- [x] `durable/merchant-push-hub.ts`: tag sockets `[clientType]`, include `clientType` in welcome frame, add `target` to `POST /push` (default `'android'`), add `POST /realtime` (targeting `'web'`), expand `GET /status` with `androidSockets`, `webSockets`, `transport`.
- [x] `router/push-hub.ts`: add `target` to push payload, add `androidSockets`/`webSockets` to status result, export `broadcastRealtimeToMerchantWeb`.
- [x] `shared/middleware.ts`: widen `safeWaitUntil` `c` parameter to `{ executionCtx?: { waitUntil(promise: Promise<unknown>): void } } | undefined` for service-layer compatibility.
- [x] `features/realtime/realtime.service.ts`: add `'PAYMENT_LINK_UPDATED'` to `RealtimeEventType` and export `emitMerchantRealtimeEvent`.
- [x] `features/realtime/realtime.routes.ts`: add `GET /ws` (`authStreamMiddleware` + `clientType=web`) and update `POST /simulate` to use `emitMerchantRealtimeEvent`.
- [x] Wire `emitMerchantRealtimeEvent` in:
  - [x] `features/device/device.routes.ts` (`DEVICE_HEARTBEAT`)
  - [x] `features/device/device.service.ts` (`SMS_FLAGGED`, `PAYMENT_VERIFIED`, `TRANSACTION_NEW` when `ingestedCount > 0 && autoVerifiedCount === 0`)
  - [x] `features/checkout/checkout.routes.ts` (`PAYMENT_VERIFIED`, `QUEUE_UPDATED`)
  - [x] `features/orders/orders.service.ts` (`ORDER_CREATED`, `ORDER_UPDATED`)
  - [x] `features/payments/payments.service.ts` (`PAYMENT_VERIFIED`, `ORDER_UPDATED`)
  - [x] `features/wallets/wallets.service.ts` (`WALLET_ROTATED` + optional `env?: Env` on `getActiveRotatedWallet` & callers)
  - [x] `features/wallets/wallets.routes.ts` (`WALLET_SYNCED` on create, sync, update, delete)
  - [x] `features/payment-links/payment-links.routes.ts` (`PAYMENT_LINK_UPDATED` on create, update, delete)

## Step 3: Frontend (Completed)
- [x] Connect Merchant Web Portal to `/api/v1/realtime/ws` using `'ping'`/`'pong'` hibernation heartbeat.
- [x] Parse `{ type: 'realtime', event, data, timestamp }` frames to invalidate/refresh affected views and suppress idle polling while WebSocket is open.
- [x] Retain SSE `/api/v1/realtime/stream` for Master Admin and reconnect fallback.

## Step 4: Android Companion (Completed)
- [x] Maintain persistent `/api/v1/device/ws` connection with `'ping'`/`'pong'` keepalive.
- [x] Disable idle foreground/background polling when WS is connected; trigger `/api/v1/device/sync` only on reconnect/push wake and auto-refresh pinned Home Screen Widgets on payment/order pushes.
