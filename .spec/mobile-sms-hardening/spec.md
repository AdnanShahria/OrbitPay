# Specification: Mobile App Completion, SMS Hardening, OTP & FCM v1

## Overview
Complete and harden the ORBIT Payment Hub mobile companion app (`app/`), backend SMS ingestion & verification (`backend/`), OTP verification service, FCM HTTP v1 push notifications (Cloudflare Workers compatible, optional with polling fallback), and Web Admin messaging controls (`frontend/`).

---

## User Stories & Acceptance Criteria

### 1. Anti-Spoofing & SMS/Push Capture Hardening
- **Story:** As a merchant, I want the Android companion app and backend to reject spoofed payment SMS sent from personal phone numbers or untrusted app packages so fraudulent buyers cannot auto-verify unpaid orders.
- **Given/When/Then:**
  - **Given** an incoming SMS matches the bKash payment text format, **When** the originating sender address is a personal phone number (`01712345678` or `+8801712345678`), **Then** `MfsParser` / `SenderTrust` rejects it on the phone, logs it to `blocked_messages`, and never uploads it as a verified SMS.
  - **Given** an incoming SMS comes from sender `bKash` but contains a Nagad-formatted message, **When** parsed, **Then** the provider-consistency check rejects it as a mismatch.
  - **Given** a merchant adds a custom sender override in Settings (`extraTrustedSenders`, e.g. `BKASH:bKashAlert`), **When** an SMS arrives from `bKashAlert`, **Then** `SenderTrust` accepts it for `BKASH`.
  - **Given** a payload arrives at `POST /api/v1/device/ingest` with a missing `smsSender`, personal phone `smsSender`, untrusted `NOTIFICATION` package, or rawSms re-parse mismatch, **When** `evaluateSmsTrust` runs, **Then** it persists the row in `sms_ledger` as `UNCLAIMED` with `trust_flag` set, skips auto-reconciliation, increments `flaggedCount`, and excludes the row from checkout instant-match.
  - **Given** an admin or merchant views a flagged row in the mobile app or Web `TransactionTable`, **When** displayed, **Then** a warning badge is shown; manual match remains possible with an explicit warning.

### 2. Missed SMS Recovery (Inbox Rescan)
- **Story:** As a merchant, I want the app to scan my SMS inbox for recent payment messages missed while the app was killed or signed out so no legitimate payments are lost.
- **Given/When/Then:**
  - **Given** `READ_SMS` permission is granted and the user is logged in, **When** `InboxScanner.scan` runs (after login, during `SyncWorker`, or manually from Diagnostics), **Then** it reads `Telephony.Sms.Inbox.CONTENT_URI` since `lastInboxScanAt` (defaulting to last 72h on first run), enforces the exact same `SenderTrust` + `MfsParser` checks with `source = 'INBOX_SCAN'`, deduplicates via `trxId`, and queues new items for upload.

### 3. Mobile Transaction History & Detail Sheet
- **Story:** As a merchant, I want to search, filter, and inspect both local phone SMS and server ledger transactions directly on my phone.
- **Given/When/Then:**
  - **Given** the History tab is opened, **When** toggling between "On this phone" (Room `searchFlow`) and "Server" (`GET /api/v1/device/transactions`), **Then** merchants can search by TrxID/sender/order ID, filter by status and provider, see tabular BDT amounts and warning badges for flagged rows, and tap any row to open a detail bottom sheet with raw SMS and copy-TrxID action.

### 4. Mobile Manual Verification (Typo Rescue)
- **Story:** As a merchant, I want to manually link an unclaimed SMS to a pending order from my phone when a customer makes a TrxID typo.
- **Given/When/Then:**
  - **Given** the Verify tab is opened, **When** selecting an `UNCLAIMED` transaction from `GET /api/v1/device/transactions?status=UNCLAIMED`, **Then** pending `GET /api/v1/device/queue` candidates are ranked by matching provider, TrxID edit distance ≤ 2, amount proximity (±1 BDT), and sender number; confirming calls `POST /api/v1/device/manual-match` (or matches by manual order ID input).

### 5. Mobile Diagnostics & Parser Self-Test
- **Story:** As a merchant, I want a Diagnostics screen showing all permissions, service health, blocked messages, inbox rescan, and a parser tester so I can troubleshoot capture issues on my phone.
- **Given/When/Then:**
  - **Given** the Diagnostics tab is opened, **When** viewing the checklist, **Then** it displays live status and fix buttons for `RECEIVE_SMS`/`READ_SMS`, `POST_NOTIFICATIONS`, Notification Listener access, Battery Optimization exemption, Foreground Service, Firebase availability & FCM token, last heartbeat/sync timestamps, pending uploads, blocked message log, a "Rescan inbox (72h)" trigger, and an interactive Parser Self-Test tool.

### 6. Bangla & English Localization + Apple HIG Craft
- **Story:** As a Bangladeshi merchant, I want to switch the Android app between Bangla, English, and System language seamlessly with clean HIG-compliant UI.
- **Given/When/Then:**
  - **Given** Settings is opened, **When** selecting System / English / বাংলা in the Language control, **Then** `AppCompatDelegate.setApplicationLocales` updates the app language immediately across all screens (`strings.xml`, `strings_screens.xml`, `strings_core.xml` and `values-bn/` equivalents).

### 7. Real-Time FCM HTTP v1 Push + Polling Fallback
- **Story:** As a merchant, I want instant push notifications for verified payments and new orders using Firebase HTTP v1 on Cloudflare Workers, while still receiving updates automatically via polling if Firebase is not configured.
- **Given/When/Then:**
  - **Given** `FCM_SERVICE_ACCOUNT_JSON` is configured on the Cloudflare Worker and `google-services.json` is bundled in the APK, **When** a payment is verified or an order arrives, **Then** the Worker signs an RS256 OAuth2 JWT with Web Crypto and dispatches a data-only FCM v1 push (`HIGH` priority); unregistered tokens are cleared automatically.
  - **Given** Firebase is not configured (`isFirebaseAvailable == false`), **When** `StickyForegroundService` is running, **Then** it polls `GET /api/v1/device/sync?since=...` every 60s (or 300s when FCM is active), updates Room DB verified transactions, and fires local notifications for unseen orders.

### 8. OTP SMS Send & Verify API + Admin Messaging Panel
- **Story:** As an OrbitSaaS storefront or merchant, I want to send and verify 6-digit phone OTPs via BulkSMSBD/SSL Wireless/Twilio with rate limiting and manage/test SMS & Push from `/admin`.
- **Given/When/Then:**
  - **Given** an authenticated storefront calls `POST /api/v1/otp/send` with a phone number, **When** rate limits pass (≥60s cooldown, ≤5/hour), **Then** a CSPRNG 6-digit OTP is hashed with HMAC-SHA256 in `otp_codes` (5 min TTL) and sent via `routeSmsOrPush` (returning `devCode` only in non-production when no SMS provider is configured).
  - **Given** `POST /api/v1/otp/verify` is called with the code, **When** valid and under 5 attempts, **Then** it consumes the OTP atomically and returns `{ verified: true }`.
  - **Given** an admin opens `/admin` → "SMS & Push", **Then** they can inspect SMS provider capabilities, FCM v1 status, 24h OTP stats, and send test SMS or test Push notifications.
