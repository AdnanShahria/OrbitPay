# Shared Contracts: Mobile App, Anti-Spoofing, OTP & FCM v1

All subagents MUST read and follow these contracts verbatim.

---

## 1. Trust Model (Anti-Spoofing)

- **Phone as Primary Trust Anchor:**
  - The Android app ONLY accepts SMS whose originating address (`smsSender`) is in the trusted-sender list for that provider, OR app notifications whose package name is in the trusted-package list.
  - It **ALWAYS rejects** senders that look like a personal phone number:
    - Regex: `^\+?(88)?01\d{9}$`
    - OR any purely numeric sender longer than 6 digits unless explicitly in the trusted-sender list for that provider.
  - The parsed provider MUST equal the sender's provider (e.g., an SMS from `"bKash"` parsed as Nagad is rejected).
- **Default Trusted SMS Senders** (case-insensitive exact match after `.trim()`):
  - `BKASH`: `["bKash"]`
  - `NAGAD`: `["NAGAD"]`
  - `ROCKET`: `["16216", "Rocket"]`
  - `UPAY`: `["upay"]`
  - `CELLFIN`: `["CellFin", "IBBL"]`
  - User-configured extras: stored in `PreferencesManager.extraTrustedSenders`, format `PROVIDER:Sender` comma-separated (e.g., `BKASH:bKashAlert,NAGAD:16167`).
- **Default Trusted Packages** (case-insensitive exact match, NO `.contains("bkash")` substring matching):
  - `BKASH`: `com.bkash.customerapp`, `com.bkash.merchantapp`
  - `NAGAD`: `com.konasl.nagad`, `com.konasl.nagad.merchant`
  - `ROCKET`: `com.dbbl.mbb.rocket`
  - `UPAY`: `bd.com.upay.customer`
  - `CELLFIN`: `com.ibbl.cellfin`
- **Server Defense-in-Depth (`evaluateSmsTrust(msg)`):**
  Returns `TrustFlag | null` checked strictly in this order:
  1. `smsSender` missing or blank -> `'LEGACY_UNVERIFIED_SENDER'`
  2. `smsSender` matches personal-phone regex `^\+?(88)?01\d{9}$` -> `'UNTRUSTED_SENDER'`
  3. `source === 'NOTIFICATION'` and `smsSender` not in trusted-package list -> `'UNTRUSTED_SENDER'`
  4. Server re-parse of `rawSms` via `parseMfsSms(rawSms)` fails, OR parsed `trxId !== normalizedTrxId`, OR `Math.abs(parsed.amount - msg.amount) > 0.009` -> `'PARSE_MISMATCH'`
  5. Otherwise `null` (trusted)
- **Flagged Row Handling:**
  - Flagged rows are inserted into `sms_ledger` as `status = 'UNCLAIMED'` with `trust_flag` set.
  - They are **NEVER** auto-reconciled during ingest and **NEVER** matched by `verifyCheckoutPayment` (must include `isNull(smsLedger.trustFlag)`).
  - Manual match (`manualMatchTransaction`) IS still allowed, and the UI displays a warning.

---

## 2. Ingest Item v2 (`POST /api/v1/device/ingest`)

- Request body: `{ messages: IngestSmsItem[] }` (extra top-level keys like `merchantId`, `deviceKey` are ignored).
- `IngestSmsItem`:
  ```json
  {
    "provider": "BKASH | NAGAD | ROCKET | UPAY | CELLFIN",
    "trxId": "string",
    "amount": 500.0,
    "senderNumber": "01712345678",
    "rawSms": "string",
    "receivedAt": 1764072000000,
    "smsSender": "bKash",
    "source": "SMS | NOTIFICATION | INBOX_SCAN"
  }
  ```
  (`receivedAt`, `smsSender`, and `source` are optional for backward compatibility; `source` defaults to `'SMS'`).
- Response envelope `{ success: true, data: { ingestedCount: number, autoVerifiedCount: number, flaggedCount: number } }`.

---

## 3. Database Schema Additions (`backend/src/db/schema.ts`)

### `sms_ledger` new columns
- `sms_sender`: `text('sms_sender')` (nullable)
- `source`: `text('source', { enum: ['SMS', 'NOTIFICATION', 'INBOX_SCAN'] }).default('SMS').notNull()`
- `trust_flag`: `text('trust_flag')` (nullable)
- Drizzle JSON field names: `smsSender`, `source`, `trustFlag`.

### New table `otp_codes` (Drizzle export name `otpCodes`)
```ts
export const otpCodes = sqliteTable('otp_codes', {
  id: text('id').primaryKey(),
  merchantId: text('merchant_id').references(() => merchants.id),
  purpose: text('purpose').notNull(),            // e.g. 'BUYER_PHONE', 'GENERIC'
  phone: text('phone').notNull(),                // normalized 01XXXXXXXXX
  codeHash: text('code_hash').notNull(),         // HMAC-SHA256(code, pepper + phone + id)
  attempts: integer('attempts').notNull().default(0),
  provider: text('provider'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (t) => ({
  phoneIdx: index('idx_otp_phone').on(t.phone, t.purpose, t.createdAt),
}));
```

---

## 4. New Device Endpoints (all protected by `authDeviceMiddleware`, envelope `{ success, data }`)

1. **`GET /api/v1/device/transactions?status&provider&search&limit&offset`**
   - Response `data`: `{ items: Ledger[], total: number, limit: number, offset: number }`
   - `Ledger` JSON: `{ id, merchantId, provider, trxId, amount, senderNumber, rawSms, status, matchType, externalOrderId, smsReceivedAt (ISO string), verifiedAt (ISO string | null), smsSender, source, trustFlag }`
2. **`GET /api/v1/device/queue`**
   - Response `data`: `{ queue: QueueItem[] }`
   - `QueueItem` JSON: `{ id, provider, externalOrderId, customerEmail, expectedAmount, baseAmount, uniqueAmount, submittedAmount, submittedTrxId, submittedSender, status, expiresAt (ISO string), createdAt (ISO string) }`
3. **`POST /api/v1/device/manual-match`**
   - Body: `{ smsLedgerId: string, externalOrderId: string, customerEmail?: string }`
   - Response `data`: `Ledger` (reuses `manualMatchTransaction`)
4. **`GET /api/v1/device/sync?since=<epochMs>`**
   - Response `data`: `{ serverTime: number (epochMs), verified: [{ trxId, externalOrderId, verifiedAt (ISO string), amount, provider }], orders: MerchantOrderDto[], pendingConfirmationCount: number }`
   - If `since` is omitted, defaults to `Date.now() - 24 * 60 * 60 * 1000`. Cap `verified` and `orders` at 100 items each.
5. **`POST /api/v1/device/heartbeat`**
   - Accepts existing fields (`fcmToken?`, `batteryLevel?`, `appVersion?`, `networkType?`) PLUS optional booleans: `fcmEnabled?: boolean`, `smsPermission?: boolean`, `listenerEnabled?: boolean`.

---

## 5. OTP Endpoints (`POST /api/v1/otp/*`, `authMerchantMiddleware`)

- **`POST /api/v1/otp/send`**
  - Body: `{ phone: string, purpose?: string (default 'GENERIC'), template?: string }`
  - Response `data`: `{ otpId: string, expiresAt: string (ISO), provider: string, devCode?: string }`
  - Rules:
    - 6-digit numeric code generated via `crypto.getRandomValues`
    - TTL: 5 minutes (or `env.OTP_TTL_SECONDS` if set)
    - Cooldown: ≥ 60s between sends per `(phone, purpose)`
    - Rate limit: ≤ 5 sends per hour per `phone`
    - Message: `"{storeName} verification code: {code}. Valid 5 minutes. Do not share. -ORBIT"` (or safe template replacement)
    - In non-production (`env.ENVIRONMENT !== 'production'`), if no SMS provider is configured, return `devCode` in `data` so developers can test without live SMS credits. NEVER return `devCode` in production or log the OTP code.
- **`POST /api/v1/otp/verify`**
  - Body: `{ otpId?: string, phone: string, code: string, purpose?: string }`
  - Response `data`: `{ verified: true }`
  - Rules:
    - Max 5 verify attempts per OTP row; on 5th failed attempt or beyond, the OTP is dead/locked
    - Constant-time HMAC-SHA256 comparison
    - Single use (`consumedAt` set atomically on match)

---

## 6. Admin Messaging Endpoints (`/api/v1/admin/messaging/*`, `authMasterAdminMiddleware`)

- **`GET /api/v1/admin/messaging/status`**
  - Response `data`: `{ sms: ProviderCapability[], push: { fcmV1Configured: boolean, projectId: string | null }, otp: { sentLast24h: number, verifiedLast24h: number } }`
- **`POST /api/v1/admin/messaging/test-sms`**
  - Body: `{ to: string, message: string }`
  - Response `data`: `{ dispatched: boolean, provider?: string, attempts: [...] }`
- **`POST /api/v1/admin/messaging/test-push`**
  - Body: `{ merchantId: string, title: string, body: string }`
  - Response `data`: `{ sentCount: number }`

---

## 7. Amount & Phone Parsing Rules

- Tolerant amount capture regex: `([0-9][0-9,]*(?:\.[0-9]{1,2})?)` (avoids capturing trailing period in `Tk 500.`).
- Tolerant of `Tk`, `Tk.`, `BDT`, optional colon after `TrxID`/`TxnID`/`TxnId`, and newlines.
- Rocket A/C format (`A/C:01912345678X`): strip trailing check digit/letter and keep the first 11 digits (`01912345678`).
- Must reject outgoing transfers (e.g., `Send Money Tk 500 to ...`) and OTP messages (e.g., `Your bKash verification code is 123456`).
