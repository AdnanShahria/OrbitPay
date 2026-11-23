# Technical Architecture & Implementation Plan: ORBIT Payment Hub

## 1. Monorepo Architecture

```
Orbit Payment Monorepo/
├── backend/                              # Hono v4 Edge API on Cloudflare Pages Functions
│   ├── src/
│   │   ├── index.ts                      # Hono app mounting all routes, CORS, error handler
│   │   ├── db/
│   │   │   ├── schema.ts                 # Drizzle D1 schemas (5 tables: merchants, wallets, ledger, queue, webhooks)
│   │   │   └── client.ts                 # D1 client factory
│   │   ├── features/
│   │   │   ├── checkout/                 # Session creation & payment verification
│   │   │   ├── device/                   # SMS ingest, auto-reconciler, stats, heartbeat
│   │   │   ├── merchants/                # Profile, webhook settings, key rotation
│   │   │   ├── wallets/                  # SIM management & ৳300k limit rotation
│   │   │   ├── transactions/             # Ledger querying & typo manual matching
│   │   │   └── webhooks/                 # HMAC signing & resilient HTTP dispatcher
│   │   └── shared/                       # Web Crypto helpers, errors, auth middlewares
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                             # React 19 Merchant Portal + Embed Widget
│   ├── src/
│   │   ├── features/                     # Mirrored slices (checkout, device, wallets, transactions, merchants)
│   │   ├── shared/components/            # BoardUI styled components (Button, Card, Input, Modal, Badge, etc.)
│   │   ├── shared/utils/                 # cx() class merger, currency formatters
│   │   ├── widget/widget.ts              # Standalone zero-dependency vanilla JS embed script
│   │   ├── index.css                     # Tailwind CSS v4 + BoardUI semantic tokens
│   │   ├── App.tsx                       # Main merchant portal layout & tabs
│   │   └── main.tsx                      # Root mount with TanStack Query provider
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── functions/api/[[route]].ts            # Cloudflare Pages Functions edge entrypoint
├── app/                                  # Native Kotlin Android Companion App
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml           # Telephony.SMS_RECEIVED + NotificationListener + ForegroundService
│   │   ├── java/com/orbitsaas/payment/
│   │   │   ├── data/local/               # Room DB (SmsEntity, SmsDao, OrbitDatabase)
│   │   │   ├── data/remote/              # Ktor HTTP client, device ingest payloads
│   │   │   ├── interceptors/             # SmsReceiver, PushListener, MfsParser (bKash/Nagad/Rocket/Upay/Cellfin)
│   │   │   ├── service/                  # StickyForegroundService, SyncWorker, FcmService
│   │   │   └── ui/                       # Jetpack Compose UI (DashboardScreen, OnboardingScreen, SettingsScreen)
│   │   └── res/
│   ├── build.gradle.kts
│   └── settings.gradle.kts
│
├── package.json                          # Root npm workspaces
├── wrangler.toml                         # Cloudflare D1 and Pages bindings
└── tsconfig.json                         # Root TypeScript config
```

## 2. Data Contracts & Database Schema

### Cloudflare D1 Tables (Drizzle ORM)
- `merchants`: `id`, `store_name`, `webhook_url`, `webhook_secret`, `device_api_key_hash`, `grace_period_minutes`, `fcm_token`, `last_seen_at`, `is_active`, `created_at`, `updated_at`.
- `merchant_wallets`: `id`, `merchant_id`, `provider` (`BKASH`, `NAGAD`, `ROCKET`, `UPAY`, `CELLFIN`), `wallet_number`, `account_type` (`PERSONAL`, `MERCHANT`), `monthly_limit_bdt` (default: 300000), `current_monthly_volume`, `is_active`, `priority_order`, `created_at`.
- `sms_ledger`: `id`, `merchant_id`, `provider`, `trx_id` (UNIQUE per merchant), `amount`, `sender_number`, `raw_sms`, `status` (`UNCLAIMED`, `VERIFIED`, `MANUAL_VERIFIED`), `external_order_id`, `sms_received_at`, `verified_at`.
- `verification_queue`: `id`, `merchant_id`, `external_order_id`, `customer_email`, `expected_amount`, `submitted_trx_id`, `submitted_sender`, `status` (`WAITING_FOR_SMS`, `MATCHED`, `EXPIRED`), `expires_at`, `created_at`.
- `webhook_deliveries`: `id`, `merchant_id`, `event_type`, `payload_json`, `response_status`, `response_body`, `attempt_count`, `delivered_at`.

## 3. Cryptography & Webhook Protocol
- Standard Web Crypto timing-safe signature comparison:
  ```ts
  const hmac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  ```
- All webhooks include `X-Orbit-Signature: <hex>` and `Content-Type: application/json`.
- Companion app sends `X-Device-Key: <raw_key>`. Edge server validates:
  `SHA256(raw_key + env.ENCRYPTION_PEPPER) === merchant.device_api_key_hash`.
