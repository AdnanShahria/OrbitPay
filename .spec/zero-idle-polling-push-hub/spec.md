# Zero-Idle-Polling Push-First Realtime Hub — Specification

## Problem Statement
1. **Multi-Isolate SSE Gap**: `realtimeHub` in `backend/src/features/realtime/realtime.service.ts` is an in-memory `Set<RealtimeListener>` local to a single Cloudflare Worker isolate. When a webhook, SMS ingest, or portal mutation executes on Isolate A while the merchant portal's SSE stream is connected to Isolate B, realtime events are silently dropped unless the frontend falls back to aggressive polling.
2. **Idle Polling Cost & Battery Drain**: Continuous 3–15s background polling on the Merchant Web Portal and Android Companion wastes D1 read rows, Worker CPU/requests, and mobile battery.
3. **Socket Role Separation**: `MerchantPushHub` (Cloudflare Durable Object keyed by `merchantId`) already supports hibernatable WebSockets (`setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`) with zero idle duration charges, but previously broadcast all frames to `getWebSockets()` untargeted. Without tag separation (`android` vs `web`), web dashboard events or heartbeats would trigger Android push notifications, and vice-versa.

## Functional Requirements
1. **Single Multi-Isolate Source of Truth**:
   - `MerchantPushHub` Durable Object (`PUSH_HUB` binding, `idFromName(merchantId)`) serves as the cross-isolate WebSocket hub for each merchant tenant.
   - Merchant Web Portal connects via `GET /api/v1/realtime/ws` (tagged `'web'`).
   - Android Companion connects via `GET /api/v1/device/ws` (tagged `'android'`).
   - Master Admin cross-tenant telemetry continues using SSE `GET /api/v1/realtime/stream`.
2. **Strict Tenant Isolation**:
   - WebSocket upgrades at `/api/v1/realtime/ws` and `/api/v1/device/ws` must authenticate the caller and derive `merchantId` from verified session/key credentials—never from unverified query params.
   - Admin JWTs attempting `/api/v1/realtime/ws` are rejected (`400`) and directed to `/api/v1/realtime/stream`.
3. **Socket Tag Separation (`android` vs `web`)**:
   - `GET /connect?clientType=<android|web>` tags each accepted WebSocket with `[clientType]` and includes `clientType` in the initial `connected` welcome frame.
   - `POST /push` defaults to `target: 'android'` (also supporting `'web' | 'all'`) so Android notification frames (`{ type: 'push', ... }`) do not spam web sockets unless explicitly requested.
   - `POST /realtime` targets ONLY `'web'` sockets (`getWebSockets('web')`) with `{ type: 'realtime', event, data, timestamp }`, preventing `DEVICE_HEARTBEAT` or portal events from triggering Android OS notifications.
4. **Zero-Idle-Polling & Push-First Sync**:
   - All merchant-scoped backend mutations and reconciliations call `emitMerchantRealtimeEvent`, fanning out both to in-memory `realtimeHub` (for SSE/Admin) and `MerchantPushHub` (`POST /realtime` for connected web portals).
   - Connected clients use hibernatable `'ping'` -> `'pong'` auto-response without waking DO billing and pause background polling while WebSocket state is healthy, falling back gracefully to incremental sync/polling only on disconnect or reconnect.
5. **100% Backward Compatibility**:
   - Existing `Ecomm-Demo` HMAC-SHA256 webhooks (`payment.submitted`, `payment.verified`, `payment.rejected`, `order.*`, `wallet.*`) remain unchanged.
   - Existing SSE `/api/v1/realtime/stream` continues functioning for Admin and legacy clients.
   - Older Android clients connecting to `/api/v1/device/ws` continue receiving `{ type: 'connected', ... }` and `{ type: 'push', ... }` frames unchanged (with additive `clientType` field).
