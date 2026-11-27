# Technical Architecture Plan: Unified Wallet Sync & Device Preflight

## 1. ORBIT Payment Backend (`Orbit Payment/backend`)
- **Wallet Sync (`src/features/wallets/`)**:
  - `wallets.schema.ts`: Add `syncWalletsSchema` (`wallets: Array<{ provider, walletNumber, accountType?, isActive?, isPrimary?, monthlyVolumeLimit? }>`, `replacePlaceholders?: boolean`).
  - `wallets.service.ts`: Add `isPlaceholderWalletNumber(num)` (`01700000000`, `01800000000`) and `syncMerchantWallets(db, merchantId, input)`:
    - Normalizes 11/12-digit BD numbers via `sanitizePhoneNumber`.
    - Deletes un-used placeholder rows (`01700000000`, `01800000000`) when `replacePlaceholders !== false` and at least one real wallet is provided.
    - Upserts each `(merchantId, provider, walletNumber)` row (updating `accountType`, `isActive`, `isPrimary`, `priorityOrder`, ensuring at most one primary per provider).
    - Returns `{ wallets, activeCount, syncedCount, placeholderCount }`.
  - `wallets.routes.ts`: Add `POST /api/v1/wallets/sync` guarded by `requireOwnerRoleMiddleware` (allows `MERCHANT_OWNER`, `api_key`, `webhook_secret`).
- **Device Preflight (`src/features/device/`)**:
  - `device.schema.ts`: Add `preflightCheckSchema` (`deviceSimNumbers?: Array<{ slotIndex?: number; carrierName?: string; phoneNumber: string }>`, `smsPermission?: boolean`, `listenerEnabled?: boolean`, `batteryOptimizationIgnored?: boolean`, `fcmEnabled?: boolean`).
  - `device.service.ts`: Add `getDevicePreflight(db, env, merchant, input?)`:
    - Queries `merchant_wallets` for `merchant.id`, computes `computeDeviceOnlineStatus`, checks `merchant.webhookUrl` validity, checks placeholder numbers.
    - Compares normalized `deviceSimNumbers` against every active wallet (plus checks if any `deviceSimNumbers` are unused or mismatched).
    - Computes `overallStatus`: `'READY'` if `activeCount > 0`, `!placeholderOnly`, `webhookConfigured`, and (if SIM numbers provided) all active wallets match at least one device SIM (or `'ACTION_REQUIRED'` otherwise).
  - `device.routes.ts`: Add `GET /api/v1/device/preflight` and `POST /api/v1/device/preflight/check` guarded by `authDeviceMiddleware`.

## 2. ORBIT Payment Frontend (`Orbit Payment/frontend`)
- `src/App.tsx`: Mount `<CheckoutModal>` only when `isDemoModalOpen` is `true` so `useCheckout` never calls `POST /api/v1/checkout/session` on login.
- `src/features/wallets/WalletManager.tsx`: Add a BoardUI semantic warning banner when active wallet count is `0` or placeholder numbers (`01700000000`, `01800000000`) are present, guiding the merchant to replace/activate them or sync from their storefront.

## 3. Ecomm-Demo Storefront (`Ecomm-Demo`)
- `functions/api/routers/orbitPayment.ts`:
  - Add `extractStorefrontMfsWallets(settingsMap)` reading `payment.bkash.*`, `payment.nagad.*`, `payment.rocket.*`, `payment.upay.*` (normalizing BD numbers and mapping `Agent` -> `PRA`, `Merchant` -> `MERCHANT`, `Personal` -> `PERSONAL`).
  - Add `syncWalletsToOrbitHub(db, env, cfg?)` calling `POST /api/v1/wallets/sync` on ORBIT Hub.
  - Trigger `syncWalletsToOrbitHub` inside `PUT /api/v1/payments/orbit/config` (when `enabled` & credentials exist) and expose `POST /api/v1/payments/orbit/sync-wallets` for `PaymentGatewayManager.handleSave`.
  - Enrich `GET /api/v1/payments/orbit/config` and `POST /api/v1/payments/orbit/test-connection` with `wallets` summary (`wallets`, `activeWalletCount`, `placeholderOnly`).
- `frontend/src/services/api.ts`, `PaymentGatewayManager.tsx`, `OrbitPayControlCard.tsx`:
  - Call `syncOrbitWallets()` after saving gateway settings in `PaymentGatewayManager.handleSave` when ORBIT Pay is configured.
  - Render synced wallet badges & placeholder warnings inside `OrbitPayControlCard.tsx` using BoardUI components (`Chip`, `Notification`, `Button`), semantic tokens, and `cx()`.

## 4. Android Companion App (`Orbit Payment/app`)
- `AndroidManifest.xml`: Add `READ_PHONE_NUMBERS` and `READ_PHONE_STATE`.
- `data/local/PreferencesManager.kt`: Persist `confirmedSimNumbersJson` (map/list of user-confirmed SIM slot numbers for carriers that mask MSISDN).
- `util/SimSlotReader.kt`: Safely queries `SubscriptionManager.activeSubscriptionInfoList` when `READ_PHONE_NUMBERS`/`READ_PHONE_STATE` is granted, normalizes BD numbers (`01XXXXXXXXX`), merges with `confirmedSimNumbers` fallback.
- `data/remote/DevicePayloads.kt` & `OrbitApiClient.kt`: Add `DevicePreflightResponse`, `PreflightWalletDto`, `PreflightProfileMatchDto`, `PreflightCheckRequest`, plus `fetchPreflight()` and `runPreflightCheck()`.
- `ui/viewmodel/MainViewModel.kt` & `DiagnosticsViewModel.kt`: Run preflight automatically on login/resume and on demand ("Run Full System & Number Check"), expose `preflightState` to `DashboardScreen` and `DiagnosticsScreen`.
- `ui/DashboardScreen.kt` & `ui/diagnostics/DiagnosticsScreen.kt` & `res/values/strings.xml`:
  - `DashboardScreen`: Compact **System & Number Profile** status banner above metrics when action is required (or compact Ready chip), tapping navigates to Diagnostics.
  - `DiagnosticsScreen`: Dedicated **Number Profile & System Check** card at the top showing Storefront/Hub link, Active Wallets, Device SIM ↔ Hub Wallet Match per provider (`MATCHED` / `MISMATCH` / `SIM_HIDDEN`), inline SIM slot number confirmation dialog/inputs for masked SIMs, and **Run Full System & Number Check** button.
