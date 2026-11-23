# Technical Plan: Unique Poisha Checkout, Admin-Provisioned Client Auth & Bi-Directional Order Sync

## 1. Database Schema & Migration (`backend/src/db/schema.ts` + `backend/drizzle/0002_auth_unique_orders.sql`)

### New & Updated Tables
1. `checkout_sessions`:
   - `id` (PK `chk_...`), `merchant_id`, `external_order_id`, `customer_email`, `base_amount` (REAL), `unique_amount` (REAL), `offset_cents` (INTEGER), `provider` (nullable), `status` (`OPEN` | `SUBMITTED` | `VERIFIED` | `EXPIRED`), `expires_at`, `created_at`.
   - Index: `idx_checkout_active` on `(merchant_id, base_amount, status, expires_at)` and `idx_checkout_order` on `(merchant_id, external_order_id)`.
2. `verification_queue` (columns added):
   - `base_amount` (REAL), `unique_amount` (REAL), `submitted_amount` (REAL).
3. `sms_ledger` (columns added):
   - `match_type` (TEXT: `EXACT_UNIQUE` | `BASE_AMOUNT_FALLBACK` | `OVERPAID` | `MANUAL_VERIFIED`).
4. `merchant_users`:
   - `id` (PK `usr_...`), `merchant_id` (FK), `email` (unique), `full_name`, `password_hash`, `role` (`MERCHANT_OWNER` | `MERCHANT_STAFF`), `is_active`, `last_login_at`, `created_at`, `updated_at`.
5. `auth_sessions`:
   - `id` (PK `ses_...`), `user_id` (FK), `merchant_id` (FK), `device_type` (`WEB` | `ANDROID`), `device_name`, `ip_address`, `expires_at`, `revoked_at`, `created_at`.
6. `merchant_devices`:
   - `id` (PK `dev_...`), `merchant_id` (FK), `user_id` (nullable FK), `device_name`, `device_key_hash`, `fcm_token`, `last_seen_at`, `is_active`, `created_at`.
7. `merchant_orders`:
   - `id` (PK `ord_...`), `merchant_id` (FK), `external_order_id`, `customer_name`, `customer_phone`, `customer_email`, `shipping_address`, `items_summary`, `payment_method` (`ORBIT_MFS` | `COD` | `CARD` | `BANK_TRANSFER` | `OTHER`), `payment_status` (`UNPAID` | `PENDING_VERIFICATION` | `PAID` | `COD_COLLECTIBLE` | `FAILED`), `order_status` (`NEW` | `AWAITING_CONFIRMATION` | `CONFIRMED` | `READY_TO_SHIP` | `SHIPPED` | `CANCELLED`), `base_amount` (REAL), `unique_amount` (REAL), `paid_amount` (REAL), `trx_id`, `match_type`, `store_callback_url`, `metadata_json`, `created_at`, `updated_at`.
   - Unique index `unique_merchant_order` on `(merchant_id, external_order_id)`.

## 2. Backend API Contracts (`backend/src/`)

- **Auth (`features/auth/`)**:
  - `POST /api/v1/auth/login` -> validates email/password, creates `auth_sessions`, signs JWT, if `deviceType === 'ANDROID'` provisions a `merchant_devices` entry and returns `deviceApiKey`.
  - `GET /api/v1/auth/me` -> returns current user, session, and safe merchant profile.
  - `POST /api/v1/auth/logout` -> revokes current `auth_sessions` row.
  - `GET /api/v1/auth/sessions` -> lists active sessions for the logged-in merchant.
- **Admin Extensions (`features/admin/`)**:
  - `POST /api/v1/admin/projects` -> optionally accepts `ownerEmail`, `ownerPassword`, `ownerName` (or auto-generates credentials) and creates initial `merchant_users` record.
  - `GET /api/v1/admin/projects/:id/users` & `POST /api/v1/admin/projects/:id/users` & `POST /api/v1/admin/users/:userId/reset-password` & `DELETE /api/v1/admin/sessions/:sessionId`.
  - `POST /api/v1/merchants/register` -> locked behind `authMasterAdminMiddleware`.
- **Checkout (`features/checkout/`)**:
  - `POST /api/v1/checkout/session` -> reserves positive 2-decimal `uniqueAmount = baseAmount + offsetCents / 100`.
  - `POST /api/v1/checkout/verify` -> accepts `senderNumber`, `paidAmount` (or `amount`), `trxId`; verifies if `trxId` matches unclaimed SMS AND `sms.amount >= baseAmount` (recording `EXACT_UNIQUE` vs `BASE_AMOUNT_FALLBACK` vs `OVERPAID`); updates `checkout_sessions` and `merchant_orders`.
  - `POST /api/v1/device/ingest` -> auto-reconciliation checks `verification_queue` with `sms.amount >= coalesce(baseAmount, expectedAmount)`!
- **Orders (`features/orders/`)**:
  - `POST /api/v1/orders/notify` (storefront `X-Merchant-Secret` or Bearer JWT) -> upserts `merchant_orders`, broadcasts SSE `ORDER_CREATED` / `ORDER_UPDATED`, sends FCM push to merchant Android devices.
  - `GET /api/v1/orders` (Merchant JWT or `X-Device-Key` or `X-Merchant-Secret`) -> lists orders with filters (`orderStatus`, `paymentMethod`, `search`).
  - `POST /api/v1/orders/:externalOrderId/action` -> updates status (`CONFIRM`, `READY_TO_SHIP`, `SHIP`, `MARK_PAID`, `CANCEL`) and dispatches HMAC-SHA256 webhook (`order.confirmed`, `order.shipped`, etc.) back to the storefront.
  - `GET /api/v1/device/orders` & `POST /api/v1/device/orders/:externalOrderId/action` -> convenience aliases on `/api/v1/device/*` for Android client.

## 3. Frontend (`frontend/src/`)
- Fix response unwrapping (`json.data`) and Bearer JWT injection in shared API client (`shared/utils/api.ts`).
- **Merchant Auth Gate (`features/auth/MerchantLoginScreen.tsx`)**: Clean BoardUI + Apple HIG login screen (Email + Password only, explicit note that accounts are issued by OrbitSaaS Admin).
- **Checkout (`CheckoutModal.tsx`, `CheckoutStepper.tsx`, `PollingStatus.tsx`, `useCheckout.ts`)**:
  - Displays `uniqueAmount` (`৳50.01`) clearly with base price (`৳50.00`) + poisha verification code (`+৳0.01`).
  - Step 3 collects **Sender Mobile Number**, **Payment Total Amount** (pre-filled with `uniqueAmount`, editable), and **Transaction ID (TrxID)**.
  - Remove fake 10-second mock auto-verify in `PollingStatus.tsx` when real backend polling is active (only show real status + verified match badge `EXACT_UNIQUE` / `BASE_AMOUNT_FALLBACK`).
- **Orders & Storefront Integration (`features/orders/OrdersManager.tsx`, `features/merchants/IntegrationGuide.tsx`)**:
  - Live Order & COD/Card Confirmation Queue tab in Merchant Dashboard with Confirm / Ship / Cancel actions.
  - Copy-paste Storefront Integration Guide with exact TypeScript/Hono/Next.js/Express code for:
    1. Checkout widget & session API
    2. Webhook receiver (`/payment/v1`) handling both `payment.verified` & `order.*`
    3. Order notification sender (`POST /api/v1/orders/notify`) for COD/Card/Other orders.
- **Hidden `/admin` (`AddProjectModal.tsx`, `ProjectManagerTable.tsx`)**:
  - Account email & password generation when creating a storefront, plus a "Users & Sessions" modal to create extra users, reset passwords, or revoke active JWT sessions.

## 4. Android Kotlin App (`app/`)
- `PreferencesManager.kt`: Store `authToken` (JWT), `sessionId`, `userEmail`, `storeName`.
- `LoginScreen.kt`: Clean Material 3 white/black OrbitSaaS Merchant Sign-In screen (Email, Password, Server URL), calling `POST /api/v1/auth/login` with `deviceType: "ANDROID"`, automatically storing `merchantId`, `deviceApiKey`, `authToken`, and starting `StickyForegroundService`.
- `OrbitApiClient.kt` & `DevicePayloads.kt`: Add `login`, `logout`, `fetchOrders`, `performOrderAction`, and support Bearer JWT alongside `X-Device-Key`.
- `FcmService.kt`: Handle BOTH `payment.verified` AND `order.created` / `order.action_required` push notifications with high-priority alert notification.
- `DashboardScreen.kt` & `MainViewModel.kt`: Add a segmented switcher (**Orders & Alerts** | **Live MFS Feed**), show pending COD/Card/MFS orders awaiting confirmation, and allow 1-tap **Confirm**, **Ready to Ship**, **Mark Shipped**, or **Cancel** directly from the Kotlin app (triggering webhook back to e-commerce admin panel!).
