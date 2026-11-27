# Feature Spec: Unified Storefront Wallet Sync, Device Preflight & SIM Number Profile Match

## Overview
Eliminates configuration drift between connected storefronts (`Ecomm-Demo` / Aurelia), ORBIT Payment Hub (`merchant_wallets`), and the Android Companion App by:
1. Automatically syncing MFS numbers, account types, and verification mode from the storefront Payment Gateways UI to ORBIT Hub (`POST /api/v1/wallets/sync`).
2. Replacing disabled placeholder wallets (`01700000000` / `01800000000`) cleanly and preventing premature `POST /api/v1/checkout/session` calls on portal login.
3. Providing a `GET /api/v1/device/preflight` & `POST /api/v1/device/preflight/check` API and an Android Companion **System Readiness & Number Profile Match** diagnostic screen/card that verifies device SIM numbers against ORBIT Hub active wallets and storefront settings.

## User Stories & Acceptance Criteria

### US-1: Storefront -> ORBIT Hub Automatic Wallet & Mode Sync
- **Given** an admin saves bKash/Nagad/Rocket/Upay numbers and Account Type (`Personal`/`Merchant`/`Agent`) in `Ecomm-Demo` Payment Gateways (`PaymentGatewayManager.tsx`) while ORBIT Pay Hub credentials (`merchantId` + `apiKey`/`webhookSecret`) are configured,
- **When** settings are saved or Orbit config is saved,
- **Then** `Ecomm-Demo` calls `POST /api/v1/wallets/sync` on ORBIT Hub with the normalized MFS wallet entries.
- **And** ORBIT Hub upserts real wallets (`isActive = true` for enabled gateways), deactivates/replaces disabled placeholder numbers (`01700000000`, `01800000000`), and returns the synced active wallet count and placeholder warning state.

### US-2: ORBIT Hub Device Preflight & Number Profile Match API
- **Given** an authenticated Android Companion device (`Bearer JWT` or `X-Device-Key`),
- **When** the app calls `GET /api/v1/device/preflight` or `POST /api/v1/device/preflight/check` with `deviceSimNumbers` (from `SubscriptionManager` and/or local SIM slot confirmation),
- **Then** ORBIT Hub returns:
  - `overallStatus`: `'READY' | 'ACTION_REQUIRED' | 'ERROR'`
  - `merchant`: `id`, `storeName`, `verificationMode`, `webhookConfigured`, `webhookUrl`
  - `walletSummary`: `totalCount`, `activeCount`, `placeholderOnly`, `hasPlaceholderWallets`
  - `wallets`: list of configured `merchant_wallets` (with `isPlaceholder` flag)
  - `profileMatches`: per-active-wallet comparison against `deviceSimNumbers` (`MATCHED`, `MISMATCH`, `SIM_NUMBER_UNAVAILABLE`, `PLACEHOLDER_NUMBER`)
  - `deviceStatus`: `online`, `lastSeenAt`, `activeSockets`
  - `recommendations`: actionable human-readable items when checks fail.

### US-3: Android App System Readiness & Number Profile Match
- **Given** a merchant signs into the Android Companion App or opens the **Diagnostics** tab,
- **When** the app runs preflight checks,
- **Then** it reads device SIM slot numbers via `SubscriptionManager` (with `READ_PHONE_NUMBERS` / `READ_PHONE_STATE` runtime permission) and allows 1-time local SIM 1 / SIM 2 number confirmation when the carrier hides MSISDN.
- **And** displays a **System Readiness & Number Profile Match** card showing:
  - Active Wallets & Storefront Webhook status
  - Number Profile Match per provider (e.g. `bKash 01619138898 ↔ SIM 1: Matched` or `Mismatch`)
  - Capture pipeline health (SMS permissions, Notification Listener, Battery Optimization, Foreground Service, WebSocket, FCM)
  - A **Run Full System & Number Check** button with live progress and clear pass/warn/fail results.
- **And** `DashboardScreen` shows a compact status banner when action is required (e.g., no active wallets, placeholder numbers, or SIM number mismatch) with a direct tap to Diagnostics.

### US-4: No Spurious 400 Bad Request on Portal Login
- **Given** a merchant logs into the ORBIT Web Portal without opening the Test Checkout modal,
- **When** `AuthenticatedMerchantPortal` mounts,
- **Then** `<CheckoutModal>` does not mount or fire `POST /api/v1/checkout/session` until `isDemoModalOpen` is `true`.
