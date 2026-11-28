# Zero-Idle-Polling Push-First Realtime Hub — Technical Plan

## Architecture Overview

```
  [Android Companion] ──WS──▶ GET /api/v1/device/ws   ──▶ DO /connect?clientType=android (tag: 'android')
  [Merchant Web App]  ──WS──▶ GET /api/v1/realtime/ws ──▶ DO /connect?clientType=web     (tag: 'web')
  [Master Admin Hub]  ──SSE─▶ GET /api/v1/realtime/stream (in-memory realtimeHub, cross-tenant)

  Backend Event Emitters:
   ├─ Push notifications (webhook.dispatcher) ──▶ pushToMerchantWebSockets(..., target='android') ──▶ DO POST /push
   └─ Merchant realtime UI events             ──▶ emitMerchantRealtimeEvent(...)
                                                   ├─ realtimeHub.broadcast(...)        [SSE / Admin]
                                                   └─ broadcastRealtimeToMerchantWeb()  ──▶ DO POST /realtime (tag: 'web')
```

## Durable Object Protocol (`MerchantPushHub`)

### 1. `GET /connect?clientType=<android|web>`
- Validates `Upgrade: websocket` (else `426`).
- Normalizes `clientType` to `'web'` or `'android'` (default `'android'`).
- Accepts socket via `this.state.acceptWebSocket(server, [clientType])`.
- Sends welcome frame:
  ```json
  {
    "type": "connected",
    "serverTime": 1700000000000,
    "transport": "cloudflare_do_ws",
    "clientType": "web"
  }
  ```
- Hibernation ping/pong: `this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`.

### 2. `POST /push` (Android Notification Frames)
- Body: `{ event?, title?, body?, data?, target?: 'android' | 'web' | 'all' }` (default `target = 'android'`).
- Resolves sockets:
  - `'android'` -> `this.state.getWebSockets('android')`
  - `'web'` -> `this.state.getWebSockets('web')`
  - `'all'` -> `this.state.getWebSockets()`
- Frame sent: `{ type: 'push', id, event, title, body, data, timestamp }`.
- Response: `{ ok: true, delivered, activeSockets }`.

### 3. `POST /realtime` (Merchant Web Portal Event Frames)
- Body: `{ event: string, data?: unknown, timestamp?: string }`. Validates non-empty `event` (else `400`).
- Selects ONLY `this.state.getWebSockets('web')`.
- Frame sent to open sockets:
  ```json
  {
    "type": "realtime",
    "event": "PAYMENT_VERIFIED",
    "data": { ... },
    "timestamp": "2026-11-27T22:20:40.000Z"
  }
  ```
- Response: `{ success: true, delivered, activeWebSockets }`.

### 4. `GET /status`
- Returns `{ activeSockets: all.length, androidSockets: android.length, webSockets: web.length, transport: 'cloudflare_do_ws' }`.

## Backend Event Fan-Out (`emitMerchantRealtimeEvent`)
- Signature: `emitMerchantRealtimeEvent(env, type, data, merchantId?, ctx?)`
- Event types (`RealtimeEventType`): `CONNECTED`, `PING`, `TRANSACTION_NEW`, `SMS_FLAGGED`, `PAYMENT_VERIFIED`, `QUEUE_UPDATED`, `DEVICE_HEARTBEAT`, `STATS_UPDATED`, `ORDER_CREATED`, `ORDER_UPDATED`, `WALLET_ROTATED`, `WALLET_SYNCED`, `PAYMENT_LINK_UPDATED`.
- Always calls `realtimeHub.broadcast(type, data, merchantId)`.
- When `merchantId && env?.PUSH_HUB`, dispatches `broadcastRealtimeToMerchantWeb(env, merchantId, type, data)` via `safeWaitUntil(ctx, ...)` when `ctx` is present or `.catch(...)` otherwise.
- Wired across: `realtime.routes.ts`, `device.routes.ts`, `device.service.ts`, `checkout.routes.ts`, `orders.service.ts`, `payments.service.ts`, `wallets.service.ts`, `wallets.routes.ts`, `payment-links.routes.ts`.
