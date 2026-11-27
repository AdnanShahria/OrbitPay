# Technical Architecture Plan: Merchant UX, Home Widget & OTP-Locked Web Setup Hub

## 1. Backend (`Orbit Payment/backend`) — Setup Unlock OTP (`adnanshahria2019@gmail.com`)
- **Files**:
  - `src/features/merchants/setup-lock.service.ts` (new):
    - Hardcoded authorized unlock email constant: `SETUP_LOCK_ADMIN_EMAIL = 'adnanshahria2019@gmail.com'`.
    - `requestSetupUnlockOtp(db, env, merchant, sessionId)`:
      - Enforces 60s cooldown & hourly rate limit using `otpCodes` table (`purpose = 'MERCHANT_SETUP_UNLOCK'`, `phone = SETUP_LOCK_ADMIN_EMAIL`).
      - Generates CSPRNG 6-digit OTP, stores HMAC-SHA256 hash in `otpCodes`, and sends formatted HTML + text email via `routeEmail` to `adnanshahria2019@gmail.com`.
      - In non-production with no email provider configured, optionally returns `devCode` (never in production).
    - `verifySetupUnlockOtp(db, env, merchant, sessionId, input)`:
      - Atomically verifies & consumes OTP in `otpCodes` (max 5 attempts, 10-min TTL).
      - Signs a short-lived (30-minute) HMAC-JWT (`typ: 'ORBIT_SETUP_UNLOCK'`, `merchantId`, `sid: sessionId`, `email: SETUP_LOCK_ADMIN_EMAIL`) using `resolveJwtSecret(env)`.
    - `verifySetupUnlockToken(env, token, merchantId, sessionId)`:
      - Verifies token signature, expiry, `typ === 'ORBIT_SETUP_UNLOCK'`, and `merchantId` match (plus `sid` match when present).
  - `src/features/merchants/merchants.schema.ts` & `merchants.routes.ts`:
    - Add `POST /api/v1/merchants/setup-lock/request-otp` (`authMerchantMiddleware`, `requireOwnerRoleMiddleware`)
    - Add `POST /api/v1/merchants/setup-lock/verify-otp` (`authMerchantMiddleware`, `requireOwnerRoleMiddleware`)
    - Add `GET /api/v1/merchants/setup-lock/status` (`authMerchantMiddleware`) — validates `X-Setup-Unlock-Token` if provided and returns `{ locked: boolean, emailHint: 'adn***@gmail.com', expiresAt?: string }`.
    - Enforce `X-Setup-Unlock-Token` on `POST /settings`, `POST /keys/rotate`, `POST /webhook/test`, `POST /webhooks/:id/replay` when `c.get('authType') === 'jwt'`! (API key / Master Admin callers remain unaffected if ever used server-to-server).

## 2. Web Portal (`Orbit Payment/frontend`) — 5 Core Tabs + 1 Locked Consolidated Setup Page
- **Files**:
  - `src/features/merchants/useSetupLock.ts` (new):
    - Manages `unlockToken` in `sessionStorage` (`orbit_setup_unlock_token`), attaches `X-Setup-Unlock-Token` when calling protected setup mutations, exposes `isLocked`, `unlockExpiresAt`, `requestOtp()`, `verifyOtp(code)`, `lockNow()`.
  - `src/features/merchants/ConsolidatedSetupHub.tsx` (new):
    - Single consolidated page merging the 5 technical/setup sections into clean collapsible/dropdown dashboard cards (using BoardUI `Card`, `Button`, `Chip`, `Modal`, `Input`, `Drawer` & semantic tokens only, `cx()`):
      1. **Storefront & Webhook Settings** (`MerchantSettings`)
      2. **Companion Device Pairing QR** (`DevicePairingQR`)
      3. **Transactions & Typo Resolver** (`TransactionTable`)
      4. **Integration Guide & Snippets** (`IntegrationGuide`)
      5. **Checkout Widget Playground** (Demo checkout launcher + embed snippet)
    - Top sticky **Lock Banner**:
      - Shows Locked (Read-Only: View & Copy allowed, Editing locked) vs Unlocked (with remaining session time & "Lock Now" button).
      - Clicking **Unlock Editing** opens a BoardUI `Modal` explaining an OTP will be sent to `adnanshahria2019@gmail.com`, triggers `POST /api/v1/merchants/setup-lock/request-otp`, and lets the admin enter the 6-digit OTP to unlock.
    - When `isLocked === true`, wraps edit controls safely (disabling form inputs/save/rotate/test/replay/manual-match actions with a clear `Locked — Copy Only` state while keeping all Copy buttons & View toggles 100% functional!).
  - `src/features/merchants/MerchantSettings.tsx`, `src/features/device/DevicePairingQR.tsx`, `src/features/transactions/TransactionTable.tsx`:
    - Accept optional `readOnlyLocked?: boolean` and `setupUnlockToken?: string | null` props so copy buttons always work, while edit/save/rotate/replay/match buttons disable cleanly when locked and pass `X-Setup-Unlock-Token` when unlocked!
  - `src/App.tsx`:
    - Update `ALL_NAV_ITEMS` to show the **5 core merchant tabs** (`Overview`, `Universal Payments`, `Payment Links`, `Orders & COD Sync`, `SIM Pool & Limits`) + **1 consolidated setup tab** (`Setup & Controls` with a Lock icon indicator), removing separate sidebar entries for `transactions`, `device`, `settings`, `integration`, and `checkout_demo`.
    - Also clean up Overview sidebar card quick-links to point cleanly to `wallets` and `setup` (the consolidated page).

## 3. Android App (`Orbit Payment/app`) — Auto Locale, Onboarding, 5 Features & Home Screen Widget
- **Auto Country/Locale Detection**:
  - `ui/locale/LocaleHelper.kt` & `OrbitApplication.kt`:
    - Add `applyAutoCountryLocaleIfUnset(context)`: if the user has not explicitly picked a manual override, detect Bangladesh (`TelephonyManager.simCountryIso` / `networkCountryIso == "bd"` OR `TimeZone.getDefault().id == "Asia/Dhaka"` OR system locale `"bn"`) -> automatically apply `"bn"`, otherwise `"en"`.
- **Merchant-Friendly Bilingual Onboarding (`OnboardingScreen.kt` + `values/strings.xml` + `values-bn/strings.xml`)**:
  - 4 crisp, plain-language merchant steps:
    - Step 1: **How ORBIT Pay Works & Website Setup** (visual 3-step flow: Customer pays -> Phone gets SMS -> Auto-verified; explains ORBIT sets up the website for them).
    - Step 2: **Install & Play Protect / Phone Hurdles** (clear instructions for Play Protect "More details -> Install anyway", Android 13/14+ "Allow restricted settings" with direct App Info button, and Battery "Unrestricted" + Autostart).
    - Step 3: **Why We Need Permissions** (clean cards listing SMS, Notification Access, SIM/Phone Info, Notifications, Battery — plain reasons, privacy promise, and 1-tap Grant buttons).
    - Step 4: **Ready to Go & Safety Promise** (Official MFS senders only, 72h recovery scan, no personal messages uploaded -> Launch button).
- **5 Core Merchant Features in App**:
  - Update `MainActivity.kt` bottom navigation to 5 crisp business tabs (`Overview`, `Payments`, `Links`, `Orders`, `SIM Pool`) + Settings/Help icon in TopAppBar of Dashboard.
  - `data/remote/DevicePayloads.kt` & `OrbitApiClient.kt`:
    - Add DTOs & API methods for Payment Links (`listPaymentLinks`, `createPaymentLink`, `updatePaymentLink`, `deletePaymentLink`) and SIM Pool / Wallets (`fetchWalletsOverview`, `createWallet`, `updateWallet`, `deleteWallet`).
  - `ui/viewmodel/MainViewModel.kt`:
    - Expose `paymentLinks`, `walletsOverview` + loading/mutation states, and auto-sync Home Screen Widget whenever `paymentIntents` change!
  - `ui/DashboardScreen.kt` (Overview):
    - Pin a prominent **"Waiting for Verification" Live Widget Card** at the top whenever there are pending intents (`OPEN`, `WAITING_FOR_SMS`, `MANUAL_REVIEW_REQUIRED`), showing count, urgent items, and 1-tap Approve/Inspect, plus plain merchant copy throughout!
  - `ui/links/PaymentLinksScreen.kt` (new):
    - Merchant-friendly Payment Links manager (create Fixed/Open link, copy link, share intent, toggle active/paused, delete).
  - `ui/wallets/SimPoolScreen.kt` (new):
    - Merchant-friendly SIM Pool & Limits screen (2.5L safe / 3.0L monthly meters, connected phone badges, add bKash/Nagad/Rocket/Upay/Cellfin SIM number, toggle active, set Primary, delete).
  - `ui/verify/VerifyScreen.kt` (Payments) & `ui/orders/OrdersScreen.kt` (or integrated clean Orders tab):
    - Dedicated clean `OrdersScreen.kt` for **Orders & COD Sync** and `VerifyScreen.kt` refactored as **Universal Payments** (with plain merchant copy, no developer jargon).
- **Android Home Screen Widget (`AppWidgetProvider`)**:
  - `widget/PendingPaymentsWidgetProvider.kt` (new) + `res/layout/widget_pending_payments.xml` + `res/xml/pending_payments_widget_info.xml` + `AndroidManifest.xml` receiver registration:
    - Displays store name, live count of payments **Waiting for Verification**, up to 2 pending payment items (amount + provider + customer/order), Refresh button (broadcast action), and tap-to-open `MainActivity` with focused intent extras!
    - Also add a "Pin Widget to Home Screen" helper button in Dashboard/Settings on Android 8.0+ (`AppWidgetManager.requestPinAppWidget`) so merchants can add it in 1 tap!
