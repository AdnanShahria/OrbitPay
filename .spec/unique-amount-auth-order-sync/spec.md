# Feature Specification: Unique Poisha Checkout, Admin-Provisioned Client Auth & Bi-Directional Order Sync

**Feature ID**: `unique-amount-auth-order-sync`  
**Status**: Approved Specification  
**Target Platforms**: Cloudflare Workers + D1 (`backend/`), React 19 + BoardUI (`frontend/`), Native Android Kotlin + Jetpack Compose (`app/`)

---

## 1. User Stories & Functional Requirements

### US-1: Positive 2-Decimal Poisha Unique Amount Allocation
- **As a** separate e-commerce storefront integrating ORBIT Pay,  
- **I want** to pass only my standard order `amount` (e.g., `10` or `50` BDT) when creating a checkout session, and have ORBIT Pay automatically assign a unique positive 2-decimal poisha amount (`10.01`, `10.02`, ..., `10.99`, `11.00`, ...),  
- **So that** 300+ concurrent buyers purchasing the same product receive distinct payable amounts without negative rounding (never `9.99` for a `10` BDT item) and without requiring decimal logic on the e-commerce website.

**Acceptance Criteria (Given/When/Then)**:
1. **Given** an active merchant and `baseAmount = 50`, **When** `POST /api/v1/checkout/session` is called for `ORD-1`, **Then** ORBIT allocates `offsetCents = 1` and returns `baseAmount: 50`, `uniqueAmount: 50.01`.
2. **Given** `ORD-1` holds an active `OPEN`/`SUBMITTED` session for `50.01`, **When** `POST /api/v1/checkout/session` is called for `ORD-2` with `amount: 50`, **Then** ORBIT allocates `offsetCents = 2` (`uniqueAmount: 50.02`) and guarantees uniqueness across all active unexpired sessions for that merchant and base amount.
3. **Given** a page refresh on `ORD-1` while the session is still active, **When** `POST /api/v1/checkout/session` is called again with `orderId: ORD-1` and `amount: 50`, **Then** ORBIT idempotently returns the existing `50.01` reservation rather than burning a new offset.

### US-2: Buyer Checkout Inputs & Base-Amount Fallback Verification
- **As a** buyer on the checkout modal/page,  
- **I want** to enter my **Sender Mobile Number**, **Payment Total Amount**, and **Transaction ID (TrxID)**,  
- **So that** ORBIT verifies my payment immediately whether I paid the exact instructed `uniqueAmount` (`50.01`) OR ignored the fractional instruction and paid the `baseAmount` (`50.00`).

**Acceptance Criteria (Given/When/Then)**:
1. **Given** an active session (`baseAmount = 50`, `uniqueAmount = 50.01`) and an `UNCLAIMED` SMS in `sms_ledger` with `trxId = "BLM12345"` and `amount = 50.01`, **When** buyer submits `senderNumber`, `paidAmount = 50.01`, and `trxId = "BLM12345"`, **Then** ORBIT marks it `VERIFIED` with `matchType: "EXACT_UNIQUE"` and dispatches `payment.verified` webhook.
2. **Given** an active session (`baseAmount = 50`, `uniqueAmount = 50.01`) and an `UNCLAIMED` SMS with `trxId = "BLM99999"` and `amount = 50.00` (buyer didn't read the `.01` instruction), **When** buyer submits `trxId = "BLM99999"` and `paidAmount = 50`, **Then** ORBIT verifies it because `trxId` matches and `sms.amount >= baseAmount`, recording `matchType: "BASE_AMOUNT_FALLBACK"`, and dispatches `payment.verified` webhook.
3. **Given** an SMS with `trxId = "BLM11111"` and `amount = 40.00` (less than `baseAmount = 50`), **When** buyer submits `trxId = "BLM11111"`, **Then** ORBIT does NOT auto-verify and returns a clear underpayment rejection/flag.

### US-3: Admin-Provisioned OrbitSaaS Client Auth (JWT + Session ID, No Public Signup)
- **As an** OrbitSaaS Root Administrator in the hidden `/admin` panel,  
- **I want** to generate client merchant accounts with custom email and password credentials and manage/revoke their sessions,  
- **So that** clients cannot self-register publicly, and can securely sign into both the Web Merchant Portal and the Android Companion App using JWT + tracked Session IDs.

**Acceptance Criteria (Given/When/Then)**:
1. **Given** an unauthenticated request to `POST /api/v1/merchants/register`, **When** invoked publicly, **Then** ORBIT rejects it (`401` — only Master Admin can provision merchant accounts).
2. **Given** a Root Admin in `/admin`, **When** creating a project or provisioning a user with `email` and `password`, **Then** ORBIT stores a PBKDF2-SHA256 salted hash in `merchant_users` and returns the credentials once for delivery.
3. **Given** a valid client email and password, **When** `POST /api/v1/auth/login` is called from Web or Android (`deviceType: "WEB" | "ANDROID"`), **Then** ORBIT creates an `auth_sessions` row, returns an HMAC-SHA256 signed JWT (`accessToken`) with `sid` (session ID), and for `ANDROID` automatically provisions/returns a paired `deviceApiKey`.
4. **Given** an active session revoked from `/admin` or `/api/v1/auth/logout`, **When** a subsequent API call presents that JWT, **Then** `authMerchantMiddleware` rejects it with `401 Session revoked or expired`.

### US-4: Bi-Directional E-Commerce Order Notification & Confirmation Sync
- **As a** merchant running a separate e-commerce storefront (accepting ORBIT MFS, Cash on Delivery, Card, or other gateways),  
- **I want** my storefront to push new order notifications to ORBIT Pay (`POST /api/v1/orders/notify`), receive real-time notifications on my Android Kotlin app and Web Dashboard, and confirm/ship/cancel orders from the app or dashboard so ORBIT notifies my e-commerce admin panel via signed webhook,  
- **So that** both sides stay synchronized in real time ("double-side rendering").

**Acceptance Criteria (Given/When/Then)**:
1. **Given** a separate storefront submits `POST /api/v1/orders/notify` with `X-Merchant-Secret` for a `COD` or `CARD` order, **When** ingested, **Then** ORBIT stores it in `merchant_orders`, broadcasts `ORDER_CREATED` over SSE, and sends an FCM push to the merchant's Android device.
2. **Given** an order visible in the Android Kotlin App or Web Dashboard, **When** the merchant taps **Confirm Order**, **Ready to Ship**, **Mark Shipped**, or **Cancel**, **Then** ORBIT updates `merchant_orders.orderStatus` and dispatches an HMAC-SHA256 signed webhook (`order.confirmed`, `order.shipped`, etc.) to the storefront's callback URL.

---

## 2. Error Conditions & Security Invariants
- All passwords hashed with PBKDF2-SHA256 (`100,000` iterations, random 16-byte salt) via Web Crypto `crypto.subtle`.
- JWT verified in constant time via `crypto.subtle` HMAC-SHA256 + active `auth_sessions` check (`revokedAt IS NULL AND expiresAt > now`).
- `UNIQUE (merchant_id, trx_id)` in `sms_ledger` prevents double-spend replay across orders.
- Every outgoing webhook carries `X-Orbit-Signature` (HMAC-SHA256 over raw JSON body).
