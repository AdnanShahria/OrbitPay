# Implementation Tasks & Convergence Checklist: ORBIT Payment Hub

## Track 0: Monorepo Foundation & Root Config
- [x] Create root `package.json` with npm workspaces (`"backend"`, `"frontend"`)
- [x] Create root `tsconfig.json`
- [x] Create `wrangler.toml` with D1 binding `env.DB` (`orbit-payment-d1`)
- [x] Create `.gitignore` for Node, Vite, Cloudflare, and Android Gradle

## Track 1: Backend Hub Subagent (`backend/` & `functions/`)
- [x] Task 1.1: Setup `backend/package.json` and `backend/tsconfig.json` (Hono, Drizzle ORM, Zod)
- [x] Task 1.2: Implement `backend/src/db/schema.ts` (merchants, merchant_wallets, sms_ledger, verification_queue, webhook_deliveries)
- [x] Task 1.3: Implement `backend/src/db/client.ts` (Drizzle D1 factory helper)
- [x] Task 1.4: Implement `backend/src/shared/crypto.ts` (Timing-safe Web Crypto HMAC-SHA256, SHA-256 key hashing)
- [x] Task 1.5: Implement `backend/src/shared/errors.ts` and `backend/src/shared/middleware.ts` (authMerchantMiddleware, authDeviceMiddleware)
- [x] Task 1.6: Implement `backend/src/features/checkout/` (schema, service with instant/deferred reconciliation, routes)
- [x] Task 1.7: Implement `backend/src/features/device/` (schema, service with auto-reconciler & batch ingest, stats, heartbeat routes)
- [x] Task 1.8: Implement `backend/src/features/wallets/` (schema, service with ৳300k limit rotation, routes)
- [x] Task 1.9: Implement `backend/src/features/transactions/` (schema, query service, 1-click manual match resolver)
- [x] Task 1.10: Implement `backend/src/features/merchants/` (schema, settings, API key generator)
- [x] Task 1.11: Implement `backend/src/features/webhooks/` (HMAC signature generator & HTTP dispatcher)
- [x] Task 1.12: Implement `backend/src/index.ts` (Hono app mounting routes, CORS, error handling)
- [x] Task 1.13: Implement `functions/api/[[route]].ts` (Cloudflare Pages Functions edge entrypoint)

## Track 2: Frontend Subagent (`frontend/`)
- [x] Task 2.1: Setup `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html` (React 19, Vite 6, Tailwind v4, TanStack Query v5, Lucide)
- [x] Task 2.2: Implement `frontend/src/index.css` (Tailwind v4 with BoardUI semantic tokens & Apple HIG typography scales)
- [x] Task 2.3: Implement `frontend/src/shared/utils/cx.ts` and BoardUI UI primitives (`Button.tsx`, `Card.tsx`, `Input.tsx`, `Modal.tsx`, `Badge.tsx`, `Table.tsx`, `Tabs.tsx`)
- [x] Task 2.4: Implement `frontend/src/features/device/` (`DeviceLiveBadge.tsx`, `DevicePairingQR.tsx`, `useDeviceStats.ts`)
- [x] Task 2.5: Implement `frontend/src/features/transactions/` (`AnalyticsOverview.tsx`, `TransactionTable.tsx`, `UnclaimedModal.tsx`, `useTransactions.ts`)
- [x] Task 2.6: Implement `frontend/src/features/wallets/` (`WalletManager.tsx`, `VolumeProgressBar.tsx`, `AddWalletDialog.tsx`, `useWallets.ts`)
- [x] Task 2.7: Implement `frontend/src/features/merchants/` (`MerchantSettings.tsx`, `useMerchant.ts`)
- [x] Task 2.8: Implement `frontend/src/features/checkout/` (`CheckoutModal.tsx`, `CheckoutStepper.tsx`, `PollingStatus.tsx`, `useCheckout.ts`)
- [x] Task 2.9: Implement `frontend/src/widget/widget.ts` (Zero-dependency standalone script for third-party client storefronts)
- [x] Task 2.10: Implement `frontend/src/App.tsx` and `frontend/src/main.tsx` (Complete portal navigation & state)

## Track 3: Android Companion Subagent (`app/`)
- [x] Task 3.1: Setup `app/build.gradle.kts`, `app/settings.gradle.kts`, `app/gradle.properties`, `app/app/build.gradle.kts` (Kotlin 2.0, Compose, Room, WorkManager, Ktor, FCM)
- [x] Task 3.2: Implement `app/app/src/main/AndroidManifest.xml` (Permissions: RECEIVE_SMS, FOREGROUND_SERVICE, NOTIFICATION_LISTENER)
- [x] Task 3.3: Implement `OrbitApplication.kt` (Room database initialization, Notification Channel setup)
- [x] Task 3.4: Implement local data layer (`OrbitDatabase.kt`, `SmsEntity.kt`, `SmsDao.kt`)
- [x] Task 3.5: Implement remote client layer (`OrbitApiClient.kt`, `DevicePayloads.kt`)
- [x] Task 3.6: Implement SMS & Push parsers (`MfsParser.kt` for bKash, Nagad, Rocket, Upay, Cellfin)
- [x] Task 3.7: Implement background services (`SmsReceiver.kt`, `PushListener.kt`, `StickyForegroundService.kt`, `SyncWorker.kt`, `FcmService.kt`)
- [x] Task 3.8: Implement Jetpack Compose UI (`Theme.kt`, `MainActivity.kt`, `DashboardScreen.kt`, `OnboardingScreen.kt`, `SettingsScreen.kt`)

## Track 4: Multi-Agent Convergence & Verification
- [x] Verify TypeScript compilation and lint checks (Vite build + tsc passed with zero errors)
- [x] Verify D1 schema alignments with client models (5 tables + indexes generated into Drizzle migration)
- [x] Verify Ktor payloads match Hono `/api/v1/device/ingest` schemas (DevicePayloads.kt aligned with device.schema.ts)
- [x] Update `context/activity_log.md` with complete session actions

## Track 5: Real-Time Edge Streaming & Fast Unified Dev Orchestration
- [x] Task 5.1: Fix `@cloudflare/workers-types/2023-07-01` resolution and `typeRoots` in `backend/tsconfig.json` and `tsconfig.json`
- [x] Task 5.2: Implement `backend/src/features/realtime/realtime.service.ts` (RealtimeHub pub/sub broadcast engine)
- [x] Task 5.3: Implement `backend/src/features/realtime/realtime.routes.ts` (SSE streaming + instant transaction simulator endpoint)
- [x] Task 5.4: Implement `frontend/src/shared/hooks/useRealtime.ts` (EventSource listener with query invalidations) and Live Status + Quick Simulator in `frontend/src/App.tsx`
- [x] Task 5.5: Implement `scripts/dev.mjs` ultra-fast runner for `npm run dev:full` and `bun run dev` with graceful process cleanup
- [x] Task 5.6: Implement `scripts/simulate-realtime.mjs` CLI for continuous or single-shot MFS transaction streaming
- [x] Task 5.7: Apply local Cloudflare D1 migrations (`0000_brown_silverclaw.sql`) verifying end-to-end ingestion and auto-reconciliation
