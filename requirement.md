# ORBIT Payment Hub — Industrial System Requirements & Technical Specification

**Document Type:** Definite Software Requirements Specification (SRS)  
**Product Name:** ORBIT Payment Hub (ORBIT Pay)  
**Custom Production Domain:** `payment.orbitsaas.cloud`  
**Deployment Infrastructure:** Single Cloudflare Pages Full-Stack Project  
**Repository Architecture:** Single Git Monorepo (`frontend/`, `backend/`, `app/`)  
**Version:** 1.0.0-PROD  
**Specification Level:** Concrete & Deterministic (Zero Ambiguity)  

---

## 1. Hosting & Infrastructure Architecture

### 1.1 Single Cloudflare Pages Project Model
The entire cloud platform is hosted as **one single Cloudflare Pages project** connected to a **single GitHub repository**. There is no separate deployment for frontend and backend.

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Single GitHub Repository                 │
                    │               (OrbitSaaS / Orbit-Payment)              │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                    [ Cloudflare Pages CI/CD ]
                                                │
                    ┌───────────────────────────┴────────────────────────────┐
                    │       Single Cloudflare Project: "orbit-payment"       │
                    │         Custom Domain: payment.orbitsaas.cloud         │
                    ├────────────────────────────┬───────────────────────────┤
                    │   Static Edge Assets       │  Serverless Edge Functions│
                    │   (Compiled frontend/dist) │  (Compiled functions/api) │
                    │   - React 19 Merchant UI   │  - Hono REST API Routes   │
                    │   - Embeddable Modal UI    │  - Drizzle D1 Engine      │
                    │   - widget.js Embed Script │  - HMAC Webhook Engine    │
                    └────────────────────────────┴───────────────────────────┘
                                                ▲
                                                │ Binding: env.DB
                                   [ Cloudflare D1 Database ]
```

* **Project Name in Cloudflare:** `orbit-payment`
* **Production Domain:** `payment.orbitsaas.cloud`
* **Static Assets Directory:** `dist/` (compiled from `frontend/` by Vite 6).
* **Functions Entrypoint:** `functions/api/[[route]].ts` (imports and executes `backend/src/index.ts`).
* **Edge Database Binding:** `env.DB` (Cloudflare D1 SQLite database named `orbit-payment-d1`).
* **Environment Secrets:**
  - `MASTER_ADMIN_KEY`: Secret string for SaaS administrative routes.
  - `ENCRYPTION_PEPPER`: Secret string used for device key SHA-256 hashing.
  - `FCM_SERVER_KEY`: Firebase service account credentials for push notifications.

---

## 2. Definitive Technology Stack

### 2.1 Backend Engine (`backend/`)
* **Framework:** Hono v4 (`hono`) running on Cloudflare Pages Functions edge runtime.
* **Database Driver:** `@cloudflare/d1` with `drizzle-orm/d1`.
* **Database ORM:** Drizzle ORM (`drizzle-orm` + `drizzle-kit`).
* **Validation:** Zod v3 (`zod`).
* **Cryptography:** Native Web Crypto API (`crypto.subtle`) for timing-safe HMAC-SHA256 and SHA-256 key hashing.
* **Push Notifications:** Firebase Cloud Messaging (FCM HTTP v1 API) for syncing transactions back to the Android companion app.

### 2.2 Frontend & UI (`frontend/`)
* **Framework:** React 19 (`react`, `react-dom`) with TypeScript.
* **Bundler:** Vite 6 (`vite`, `@vitejs/plugin-react`).
* **Design System:** Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`) + BoardUI design tokens.
* **State & Server Cache:** TanStack Query v5 (`@tanstack/react-query`).
* **Icons:** Lucide React (`lucide-react`).
* **Standalone Widget:** Vanilla TypeScript compiling to `dist/widget.js` (zero external dependencies).

### 2.3 Android Companion Application (`app/`)
* **Platform:** Native Android (Min SDK: 26 / Android 8.0 Oreo; Target SDK: 34 / Android 14).
* **Language:** Kotlin 2.0+ with JVM target 17.
* **UI Toolkit:** Jetpack Compose (BOM 2024.09.00+) with Material 3.
* **Local Database:** Android Jetpack Room DB v2.6+ (`androidx.room`).
* **Background Scheduling:** Android Jetpack WorkManager v2.9+ (`androidx.work`).
* **Network Client:** Ktor Client v2.3+ (`io.ktor:ktor-client-android`, `ktor-client-content-negotiation`, `ktor-serialization-kotlinx-json`).
* **Interceptors:** Native `BroadcastReceiver` (`android.provider.Telephony.SMS_RECEIVED`) + `NotificationListenerService`.

---

## 3. Mirrored Monorepo Directory Layout

The codebase strictly mirrors features between `frontend/` and `backend/`. Every feature in `backend/src/features/<feature>/` has its direct twin in `frontend/src/features/<feature>/`.

```
c:\Users\Adnan\Desktop\OrbitSaaS\Orbit Payment\
├── backend/                              # Hono Backend Source (Compiles to functions/api/)
│   └── src/
│       ├── index.ts                      # Root Hono app, CORS, error handling, route mounting
│       ├── db/
│       │   ├── schema.ts                 # Drizzle schemas (merchants, wallets, ledger, queue, webhooks)
│       │   └── client.ts                 # Drizzle D1 factory helper
│       ├── features/
│       │   ├── checkout/
│       │   │   ├── checkout.routes.ts    # POST /api/v1/checkout/session, POST /api/v1/checkout/verify
│       │   │   ├── checkout.service.ts   # Session generation & instant/deferred matching
│       │   │   └── checkout.schema.ts    # Zod schemas for checkout requests/responses
│       │   ├── device/
│       │   │   ├── device.routes.ts      # POST /api/v1/device/ingest, GET /api/v1/device/stats, POST /heartbeat
│       │   │   ├── device.service.ts     # Batch SMS ingestion, deduplication, auto-reconciliation
│       │   │   └── device.schema.ts      # Zod schemas for device payloads
│       │   ├── merchants/
│       │   │   ├── merchants.routes.ts   # GET /api/v1/merchants/profile, POST /settings, POST /keys/rotate
│       │   │   ├── merchants.service.ts  # Merchant configuration, secret generation
│       │   │   └── merchants.schema.ts   # Zod schemas for merchant profile
│       │   ├── wallets/
│       │   │   ├── wallets.routes.ts     # GET /api/v1/wallets, POST /wallets, PATCH /wallets/:id
│       │   │   ├── wallets.service.ts    # Multi-SIM rotation logic & monthly quota tracker
│       │   │   └── wallets.schema.ts     # Zod schemas for wallet management
│       │   ├── transactions/
│       │   │   ├── transactions.routes.ts# GET /api/v1/transactions, POST /transactions/manual-match
│       │   │   ├── transactions.service.ts# Ledger query engine & manual match resolver
│       │   │   └── transactions.schema.ts# Zod schemas for filters & manual match
│       │   └── webhooks/
│       │       ├── webhook.service.ts    # HMAC-SHA256 signature generator
│       │       └── webhook.dispatcher.ts # HTTP POST dispatcher with retry execution
│       └── shared/
│           ├── crypto.ts                 # Web Crypto API timing-safe HMAC & SHA-256 helpers
│           ├── errors.ts                 # AppError, NotFoundError, UnauthorizedError classes
│           └── middleware.ts             # authMerchantMiddleware, authDeviceMiddleware
│
├── frontend/                             # React 19 Merchant Portal & Checkout Widget
│   ├── src/
│   │   ├── main.tsx                      # React root, React Query provider, router setup
│   │   ├── App.tsx                       # Layout navigation (Dashboard, Wallets, Transactions, Settings)
│   │   ├── features/                     # MIRRORED FEATURE SLICES
│   │   │   ├── checkout/
│   │   │   │   ├── CheckoutModal.tsx     # Embedded / Standalone payment modal
│   │   │   │   ├── CheckoutStepper.tsx   # 3-Step UI: 1. Copy Number -> 2. Transfer -> 3. Enter TrxID
│   │   │   │   ├── PollingStatus.tsx     # Animated progress indicator & success checkmark
│   │   │   │   └── useCheckout.ts        # Hook communicating with /api/v1/checkout/*
│   │   │   ├── device/
│   │   │   │   ├── DevicePairingQR.tsx   # QR code generator for Android companion pairing
│   │   │   │   ├── DeviceLiveBadge.tsx   # Dynamic online/offline pill (green vs amber)
│   │   │   │   └── useDeviceStats.ts     # Hook polling /api/v1/device/stats
│   │   │   ├── merchants/
│   │   │   │   ├── MerchantSettings.tsx  # Webhook URL, secret regenerator, grace period form
│   │   │   │   └── useMerchant.ts        # Hook for merchant settings CRUD
│   │   │   ├── wallets/
│   │   │   │   ├── WalletManager.tsx     # Multi-SIM grid (bKash, Nagad, Rocket, Upay, Cellfin)
│   │   │   │   ├── VolumeProgressBar.tsx # Monthly ৳300k limit visual progress meter
│   │   │   │   ├── AddWalletDialog.tsx   # Modal form to register new SIM
│   │   │   │   └── useWallets.ts         # Hook for wallet operations
│   │   │   └── transactions/
│   │   │       ├── TransactionTable.tsx  # Ledger table with status chips (VERIFIED, UNCLAIMED)
│   │   │       ├── UnclaimedModal.tsx    # 1-Click modal to resolve customer TrxID typos
│   │   │       ├── AnalyticsOverview.tsx # Metrics: Total BDT, Verified Orders, Unclaimed SMS
│   │   │       └── useTransactions.ts    # Hook for ledger queries & manual matches
│   │   ├── widget/
│   │   │   └── widget.ts                 # Standalone script compiled to dist/widget.js
│   │   └── shared/
│   │       ├── components/               # BoardUI UI elements (Button, Card, Input, Modal, Badge)
│   │       └── utils/                    # cx() class merger, currency formatters
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── functions/                            # Cloudflare Pages Functions Entrypoint
│   └── api/
│       └── [[route]].ts                  # Bridges Cloudflare Pages to backend/src/index.ts
│
├── app/                                  # Native Kotlin Companion Android App (Sideloaded APK)
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml           # ForegroundService, RECEIVE_SMS, NOTIFICATION_LISTENER
│   │   ├── java/com/orbitsaas/payment/
│   │   │   ├── OrbitApplication.kt       # Application class, notification channels, Room DB setup
│   │   │   ├── data/
│   │   │   │   ├── local/
│   │   │   │   │   ├── OrbitDatabase.kt  # Room database declaration
│   │   │   │   │   ├── SmsEntity.kt      # Entity: id, provider, trxId, amount, sender, rawSms, status
│   │   │   │   │   └── SmsDao.kt         # Dao: insert, getPendingUploads, markUploaded
│   │   │   │   └── remote/
│   │   │   │       ├── OrbitApiClient.kt # Ktor HTTP client sending POST /api/v1/device/ingest
│   │   │   │       └── DevicePayloads.kt # Kotlinx Serializable request/response models
│   │   │   ├── interceptors/
│   │   │   │   ├── SmsReceiver.kt        # BroadcastReceiver on SMS_RECEIVED
│   │   │   │   ├── PushListener.kt       # NotificationListenerService capturing app push banners
│   │   │   │   └── parsers/
│   │   │   │       └── MfsParser.kt      # Regex engine for bKash, Nagad, Rocket, Upay, Cellfin
│   │   │   ├── service/
│   │   │   │   ├── StickyForegroundService.kt # Sticky foreground service + notification
│   │   │   │   └── SyncWorker.kt         # WorkManager CoroutineWorker for network-constrained sync
│   │   │   └── ui/
│   │   │       ├── DashboardScreen.kt    # Compose UI: stats cards, sync indicator, live SMS list
│   │   │       ├── OnboardingScreen.kt   # Compose UI: 4-step Android 13/14 Restricted Settings guide
│   │   │       └── SettingsScreen.kt     # Compose UI: QR code camera scanner for device pairing
│   │   └── res/                          # Drawables, mipmaps, strings, notification icons
│   └── build.gradle.kts
│
├── package.json                          # Root monorepo workspace configuration
├── wrangler.toml                         # Cloudflare D1 database and compatibility config
└── tsconfig.json
```

---

## 4. Specific Backend Functions & Method Signatures

### 4.1 Feature 1: Checkout (`backend/src/features/checkout/`)
* **`createCheckoutSession(db: D1Database, merchantId: string, orderId: string, amount: number, customerEmail: string): Promise<CheckoutSessionResult>`**
  - Validates `amount > 0` and checks merchant status (`isActive == true`).
  - Queries `merchant_wallets` for active numbers, calling `getActiveRotatedWallet()` to select the active number under quota.
  - Generates an encrypted/signed session token containing `merchantId`, `orderId`, and `amount`.
  - Returns: `{ sessionToken: string, activeWallets: [{ provider: string, walletNumber: string, accountType: string }], expectedAmount: number }`.
* **`verifyCheckoutPayment(db: D1Database, merchantId: string, payload: VerifyPayload): Promise<VerifyResult>`**
  - Sanitizes `submittedTrxId = payload.trxId.trim().toUpperCase()`.
  - Sanitizes `submittedSender = payload.senderNumber.replace(/^\+88/, '').trim()`.
  - **Instant Match Flow:** Executes query on `sms_ledger`:
    ```sql
    SELECT * FROM sms_ledger 
    WHERE merchant_id = ? AND trx_id = ? AND status = 'UNCLAIMED' AND amount >= ?
    LIMIT 1;
    ```
    - If found:
      - Checks `sender_number == submittedSender`.
      - Updates `sms_ledger.status = 'VERIFIED'`, `external_order_id = payload.orderId`, `verified_at = NOW()`.
      - Triggers `dispatchWebhook(db, merchant, 'payment.verified', verifiedData)`.
      - Returns `{ status: 'VERIFIED', trxId: submittedTrxId, amount: row.amount }`.
  - **Deferred Queue Flow:** If no match found in `sms_ledger`:
    - Inserts a record into `verification_queue` with `status = 'WAITING_FOR_SMS'` and `expires_at = NOW() + gracePeriodMinutes`.
    - Returns `{ status: 'PENDING_VERIFICATION', message: 'Verification queued. Confirmation will be sent automatically.' }`.

### 4.2 Feature 2: Device Ingestion & Auto-Reconciler (`backend/src/features/device/`)
* **`ingestDeviceSmsBatch(db: D1Database, merchantId: string, messages: IngestMessage[]): Promise<IngestResult>`**
  - Executes batch insert into `sms_ledger` using `ON CONFLICT (merchant_id, trx_id) DO NOTHING`.
  - **Immediate Auto-Reconciliation Loop:** For each inserted message:
    ```sql
    SELECT * FROM verification_queue 
    WHERE merchant_id = ? AND submitted_trx_id = ? AND status = 'WAITING_FOR_SMS' AND expected_amount <= ?
    LIMIT 1;
    ```
    - If a matching pending queue record exists:
      1. Updates `verification_queue.status = 'MATCHED'`.
      2. Updates `sms_ledger.status = 'VERIFIED'`, `external_order_id = queueRecord.external_order_id`.
      3. Dispatches HMAC webhook to the merchant’s storefront (`dispatchWebhook()`).
      4. Dispatches FCM push notification back to the Android companion app so its UI updates the transaction chip to `VERIFIED`.
  - Returns: `{ ingestedCount: number, autoVerifiedCount: number }`.
* **`getDeviceStats(db: D1Database, merchantId: string): Promise<DeviceStatsResult>`**
  - Returns:
    - `totalVerifiedVolume`: Sum of verified transaction amounts for current calendar month.
    - `verifiedCount`: Total verified orders.
    - `unclaimedCount`: Total unassigned incoming SMS.
    - `pendingQueueCount`: Current orders waiting for SMS.
    - `recentTransactions`: Latest 50 rows from `sms_ledger`.
* **`recordDeviceHeartbeat(db: D1Database, merchantId: string, fcmToken?: string): Promise<void>`**
  - Updates `merchants.last_seen_at = NOW()` and `merchants.fcm_token = fcmToken`.

### 4.3 Feature 3: Multi-SIM Wallets & Limit Rotation (`backend/src/features/wallets/`)
* **`getActiveRotatedWallet(db: D1Database, merchantId: string, provider: Provider): Promise<WalletRecord>`**
  - Queries active wallets for the merchant and provider.
  - Evaluates `current_month_volume` against `monthly_volume_limit` (default ৳250,000 threshold for personal bKash accounts).
  - If Primary SIM has reached ৳250,000, automatically promotes Secondary SIM to active status for new checkout sessions.
  - Returns the chosen wallet record.
* **`addMerchantWallet(db: D1Database, merchantId: string, data: AddWalletDTO): Promise<WalletRecord>`**
  - Validates phone format (11 digits for bKash/Nagad/Upay/Cellfin; 11 or 12 digits for DBBL Rocket).
  - Inserts into `merchant_wallets`.

### 4.4 Feature 4: Webhook Dispatcher & Retries (`backend/src/features/webhooks/`)
* **`generateHmacSignature(rawBody: string, secret: string): Promise<string>`**
  - Uses native `crypto.subtle` to generate an HMAC-SHA256 hexadecimal string.
* **`dispatchWebhook(db: D1Database, merchant: MerchantRecord, event: string, payload: Record<string, unknown>): Promise<void>`**
  - Formats payload JSON with timestamp and event name.
  - Generates `X-Orbit-Signature` header.
  - Sends HTTP POST to `merchant.webhook_url` with a 10-second timeout.
  - If HTTP status is `>= 200 && < 300`, logs delivery in `webhook_deliveries` with `status = 'DELIVERED'`.
  - If HTTP status fails or times out, logs delivery with `status = 'RETRYING'` and `next_retry_at = NOW() + 1 minute`.
* **`processWebhookRetries(db: D1Database): Promise<void>`**
  - Queries `webhook_deliveries` where `status = 'RETRYING'` and `next_retry_at <= NOW()`.
  - Retries dispatch with exponential backoff (1m, 5m, 15m, 1h, 24h). After 5 failed attempts, marks `status = 'FAILED'`.

---

## 5. Specific Frontend Components & Embed Widget

### 5.1 Standalone / Iframe Checkout Widget (`frontend/src/features/checkout/`)
* **`CheckoutModal.tsx`**:
  - Modal container rendering header with merchant store name, order ID, and amount in BDT (`৳`).
  - Embeds `CheckoutStepper.tsx` and `PollingStatus.tsx`.
* **`CheckoutStepper.tsx`**:
  - **Step 1:** Shows provider logos (bKash, Nagad, Rocket, Upay, Cellfin). On click, displays the active wallet number with an automated 1-click "Copy Number" button and "Account Type: Personal / PRA".
  - **Step 2:** Step-by-step instructions: *"Open bKash App > Send Money ৳[Amount] to [Number] > Copy TrxID"*.
  - **Step 3:** Form inputs for `Sender Phone Number` (validated 11/12 digits) and `TrxID` (auto-capitalized input).
  - Submit button: *"Verify Payment"*.
* **`PollingStatus.tsx`**:
  - Activated upon submission: displays a 10-minute countdown ring and polling state.
  - Polls `/api/v1/checkout/verify` every 3 seconds.
  - Upon receiving `status: "VERIFIED"`, triggers a green checkmark animation, plays confirmation chime, and invokes `window.parent.postMessage({ event: 'orbit_payment_verified', orderId: '...' }, '*')`.
* **`frontend/src/widget/widget.ts` (Compiles to `dist/widget.js`)**:
  - Zero-dependency script embeddable on any client website:
    ```html
    <script src="https://payment.orbitsaas.cloud/widget.js"></script>
    <script>
      OrbitPay.init({
        merchantId: "mer_live_xxx",
        amount: 1250.00,
        orderId: "ORDER-10492",
        customerEmail: "buyer@example.com",
        onSuccess: function(data) {
          window.location.href = "/order-confirmed?id=" + data.orderId;
        }
      });
    </script>
    ```
  - Injects a responsive, accessible iframe overlay pointing to `https://payment.orbitsaas.cloud/checkout/:sessionId`.

### 5.2 Merchant Portal UI (`frontend/src/features/`)
* **`TransactionTable.tsx`**: Real-time table displaying incoming transactions with badges:
  - `VERIFIED` (Green): Matched to store order.
  - `UNCLAIMED` (Gray): Personal money received or customer has not yet checked out.
  - `MANUAL_VERIFIED` (Blue): Admin resolved typo.
* **`UnclaimedModal.tsx`**: Allows merchant to click any `UNCLAIMED` row, type an order number, and manually verify the payment.
* **`DevicePairingQR.tsx`**: Generates a secure QR code containing the server URL (`https://payment.orbitsaas.cloud`) and device API key for 1-click scanning by the Android companion app.
* **`VolumeProgressBar.tsx`**: Dynamic progress meter showing `current_month_volume` vs `300,000 BDT` ceiling, alerting the merchant when SIM rotation is recommended.

---

## 6. Specific Android Companion App Components (`app/`)

### 6.1 Interceptor Architecture
* **`SmsReceiver.kt` (`android.content.BroadcastReceiver`)**:
  - Registered in `AndroidManifest.xml` with intent filter `android.provider.Telephony.SMS_RECEIVED` (priority: `999`).
  - Filters incoming messages by shortcodes: `16247`, `bKash`, `16167`, `Nagad`, `16216`, `DBBL`, `Rocket`, `16268`, `upay`, `16259`, `IBBL`.
  - Invokes `MfsParser.parse(rawBody, senderShortcode)`.
  - Writes extracted transaction to local Room DB (`SmsEntity`).
  - Enqueues `SyncWorker` via `WorkManager`.
* **`PushListener.kt` (`android.service.notification.NotificationListenerService`)**:
  - Listens for notification posted events (`onNotificationPosted`).
  - Filters by package names: `com.bKash.customerapp`, `com.konasl.nagad`, `com.dbbl.mbb.rocket`, `bd.com.upay.customer`.
  - Extracts title and text strings, passing to `MfsParser.parse()`.
  - Eliminates telecom SMS queue lag by providing sub-second capture over Wi-Fi/4G.
* **`MfsParser.kt`**:
  - Deterministic regex matcher extracting `provider`, `trxId`, `amount`, `senderNumber`.

### 6.2 Background Persistence & Network Sync
* **`StickyForegroundService.kt`**:
  - Started at boot (`BOOT_COMPLETED`) and on app launch.
  - Returns `START_STICKY`.
  - Displays persistent notification: *"ORBIT MFS Sync Active — Monitoring bKash/Nagad alerts"*.
  - Acquires a partial `WakeLock` to ensure CPU does not sleep during incoming socket/broadcast events.
* **`SyncWorker.kt` (`androidx.work.CoroutineWorker`)**:
  - Triggered immediately upon new SMS/Push ingestion or on network change.
  - Sets `Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()`.
  - Reads all `PENDING_UPLOAD` rows from `SmsDao`.
  - POSTs batch payload to `https://payment.orbitsaas.cloud/api/v1/device/ingest` with `X-Device-Key`.
  - Upon receiving HTTP 200, marks rows as `UPLOADED` in Room DB.

---

## 7. Concrete Database Schema (`backend/src/db/schema.ts`)

```typescript
import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// 1. Merchants Table
export const merchants = sqliteTable('merchants', {
  id: text('id').primaryKey(), // mer_live_xxxx
  storeName: text('store_name').notNull(),
  webhookUrl: text('webhook_url').notNull(),
  webhookSecret: text('webhook_secret').notNull(),
  deviceApiKeyHash: text('device_api_key_hash').notNull(),
  gracePeriodMinutes: integer('grace_period_minutes').default(60).notNull(),
  fcmToken: text('fcm_token'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// 2. Merchant Wallets Table
export const merchantWallets = sqliteTable('merchant_wallets', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }).notNull(),
  accountType: text('account_type', { enum: ['PERSONAL', 'PRA', 'MERCHANT'] }).default('PERSONAL').notNull(),
  walletNumber: text('wallet_number').notNull(),
  monthlyVolumeLimit: real('monthly_volume_limit').default(300000).notNull(),
  currentMonthVolume: real('current_month_volume').default(0).notNull(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
}, (table) => ({
  walletLookupIdx: index('idx_wallets_lookup').on(table.merchantId, table.provider, table.isActive),
}));

// 3. SMS Ledger Table
export const smsLedger = sqliteTable('sms_ledger', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }).notNull(),
  trxId: text('trx_id').notNull(), // Normalized uppercase
  amount: real('amount').notNull(),
  senderNumber: text('sender_number').notNull(), // Normalized digits
  rawSms: text('raw_sms').notNull(),
  status: text('status', { enum: ['UNCLAIMED', 'VERIFIED', 'MANUAL_VERIFIED'] }).default('UNCLAIMED').notNull(),
  externalOrderId: text('external_order_id'),
  smsReceivedAt: integer('sms_received_at', { mode: 'timestamp' }).notNull(),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
}, (table) => ({
  uniqueMerchantTrx: uniqueIndex('unique_merchant_trx').on(table.merchantId, table.trxId),
  statusLookupIdx: index('idx_ledger_status').on(table.merchantId, table.status),
}));

// 4. Verification Queue Table
export const verificationQueue = sqliteTable('verification_queue', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  provider: text('provider', { enum: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'] }).notNull(),
  externalOrderId: text('external_order_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  expectedAmount: real('expected_amount').notNull(),
  submittedTrxId: text('submitted_trx_id').notNull(), // Normalized uppercase
  submittedSender: text('submitted_sender').notNull(), // Normalized digits
  status: text('status', { enum: ['WAITING_FOR_SMS', 'MATCHED', 'EXPIRED'] }).default('WAITING_FOR_SMS').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  queueLookupIdx: index('idx_queue_lookup').on(table.merchantId, table.submittedTrxId, table.status),
}));

// 5. Webhook Deliveries Table
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').notNull().references(() => merchants.id),
  externalOrderId: text('external_order_id').notNull(),
  payloadJson: text('payload_json').notNull(),
  signature: text('signature').notNull(),
  attemptCount: integer('attempt_count').default(1).notNull(),
  status: text('status', { enum: ['DELIVERED', 'FAILED', 'RETRYING'] }).default('RETRYING').notNull(),
  nextRetryAt: integer('next_retry_at', { mode: 'timestamp' }),
  lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
  responseCode: integer('response_code'),
  responseBody: text('response_body'),
});
```

---

## 8. Third-Party E-Commerce Storefront API Integration Specification

ORBIT SaaS Central Hub acts as the central verification authority connecting three distinct parties:
1. **Party 1 (Visitor / Buyer):** Shopping on the client e-commerce store.
2. **Party 2 (E-Commerce Client / OrbitSaaS Client):** The store owner with their custom website (e.g., `ecom.orbitsaas.cloud`, `aurelia.shop`, `newznbd.shop`) and their companion Android phone.
3. **Party 3 (ORBIT Payment Hub):** Hosted at `payment.orbitsaas.cloud`, responsible for matching transactions and executing third-party API webhook calls to client domains.

### 8.1 Third-Party Storefront Callback Endpoints
Every custom e-commerce store registers its third-party webhook URL in ORBIT Hub. When a payment verifies, ORBIT Hub dispatches an authenticated HTTP POST request to that endpoint:
* **Storefront A:** `POST https://ecom.orbitsaas.cloud/api/v1/webhooks/orbit-payment`
* **Storefront B:** `POST https://aurelia.shop/payment/v1`
* **Storefront C:** `POST https://newznbd.shop/payment/v1`

### 8.2 Client Storefront Verification Code (Hono / Node.js)
For any client store receiving callbacks at their `/payment/v1` endpoint:

1. **CSRF & Origin Exemption:**
   The route `/payment/v1` (or `/api/v1/webhooks/orbit-payment`) must be exempted from browser CSRF tokens and Origin restrictions.
2. **HMAC Signature Verification Middleware:**
   ```typescript
   import { Context, Next } from 'hono';

   export async function verifyOrbitSignature(c: Context, next: Next) {
     const signature = c.req.header('x-orbit-signature');
     const rawBody = await c.req.text();
     const secret = c.env.ORBIT_WEBHOOK_SECRET;

     if (!signature) {
       return c.json({ error: 'Missing X-Orbit-Signature header' }, 401);
     }

     const encoder = new TextEncoder();
     const key = await crypto.subtle.importKey(
       'raw',
       encoder.encode(secret),
       { name: 'HMAC', hash: 'SHA-256' },
       false,
       ['verify']
     );

     const isValid = await crypto.subtle.verify(
       'HMAC',
       key,
       hexToUint8Array(signature),
       encoder.encode(rawBody)
     );

     if (!isValid) return c.json({ error: 'Invalid HMAC signature' }, 401);
     c.set('webhookPayload', JSON.parse(rawBody));
     await next();
   }

   function hexToUint8Array(hex: string): Uint8Array {
     const match = hex.match(/.{1,2}/g) || [];
     return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
   }
   ```
3. **Idempotent Order Update:**
   Upon webhook receipt, check if `order.payment_status === 'PAID'`. If already paid, return HTTP 200 immediately without re-triggering confirmation emails. If unpaid, update to `PAID` and invoke SendPulse/email utility.

---

## 9. Monorepo Build & Deployment Configuration

### 9.1 Root `package.json` Build Scripts
```json
{
  "name": "orbit-payment-monorepo",
  "private": true,
  "scripts": {
    "build": "npm run build:frontend && npm run build:backend",
    "build:frontend": "cd frontend && npm run build",
    "build:backend": "drizzle-kit generate && esbuild backend/src/index.ts --bundle --format=esm --platform=neutral --outfile=functions/api/[[route]].js",
    "dev:frontend": "cd frontend && npm run dev",
    "dev:backend": "wrangler pages dev dist --d1 DB=orbit-payment-d1",
    "db:migrate": "wrangler d1 migrations apply orbit-payment-d1 --local"
  }
}
```

### 9.2 Cloudflare Pages Build Settings
* **Framework Preset:** None / Vite
* **Build Command:** `npm run build`
* **Build Output Directory:** `dist`
* **Root Directory:** `/` (Project Root)
* **D1 Database Binding:** Variable name: `DB` -> D1 database: `orbit-payment-d1`

