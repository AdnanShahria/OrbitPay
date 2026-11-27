# Implementation Plan: Multi-Device Verification, 250k/300k SIM Rotation & Minimal Android UI

## 1. Orbit Payment Backend (`Orbit Payment/backend`)
- **`src/db/schema.ts` & `src/db/bootstrap.ts`**:
  - Extend `merchantDevices` with `simSlotsJson`, `batteryLevel`, `networkType`, `appVersion`, `smsPermission`, `listenerEnabled`.
  - Extend `merchantWallets` with `safeVolumeLimit` (default `250000`), `deviceId`, `simSlotIndex`, `label`, `lastRotatedAt`.
  - Extend `smsLedger` with `deviceId`, `simSlotIndex`, `receiverNumber`.
  - Extend `checkoutSessions` with `assignedWalletId`.
  - Add idempotent `ALTER TABLE` statements to `ALTER_COLUMN_STATEMENTS` in `bootstrap.ts`.
- **`src/shared/types.ts` & `src/shared/middleware.ts`**:
  - Add `deviceId?: string` to `AppContextEnv['Variables']`.
  - In `authDeviceMiddleware`, resolve `matchedDevice` for both JWT+`X-Device-Key` and `X-Device-Key` auth paths and call `c.set('deviceId', matchedDevice.id)`.
- **`src/features/wallets/wallets.schema.ts` & `wallets.service.ts` & `wallets.routes.ts`**:
  - Support `safeVolumeLimit` (default 250000), `monthlyVolumeLimit` (default 300000), `deviceId`, `simSlotIndex`, `label`, `priorityOrder` in create/update/sync schemas.
  - Implement device-aware, 250k-safe / 300k-hard smart rotation in `getActiveRotatedWallet`, `getAllActiveRotatedWallets`, and `getSmartRotationSnapshot`:
    - Check online devices (`lastSeenAt` within 5 minutes).
    - Tier 1: `< safeVolumeLimit` (250k) & device online (or unpinned with >=1 online device).
    - Tier 2: `< safeVolumeLimit` (250k) fallback.
    - Tier 3: `>= safeVolumeLimit && < monthlyVolumeLimit` (250k–300k overflow), lowest volume first.
    - Tier 4: `>= monthlyVolumeLimit` (300k) excluded.
  - Auto-update `isPrimary` and emit `wallet.rotated` webhook + realtime broadcast when rotation switches active wallet.
  - Update `incrementWalletVolume` to match `receiverNumber` -> `walletNumber` or `assignedWalletId`, increment volume, and trigger rotation check when crossing `safeVolumeLimit` or `monthlyVolumeLimit`.
  - Add `GET /api/v1/wallets/overview` (returns enriched wallets with rotation status + connected devices list).
- **`src/features/device/device.schema.ts`, `device.service.ts`, `device.routes.ts`**:
  - Accept `deviceId`, `simSlotIndex`, `receiverNumber` on ingest messages; accept `simSlots`, `batteryLevel`, `networkType`, `appVersion`, `fcmEnabled`, `smsPermission`, `listenerEnabled` on heartbeat.
  - Add `GET /api/v1/device/devices` and `POST /api/v1/device/devices/:id/deactivate` (or `DELETE /api/v1/device/devices/:id`) to view & manage multi-device connections.
  - Enrich `GET /api/v1/device/stats` with `onlineDeviceCount`, `devices`, and `wallets` (rotation summary).
- **`src/features/checkout/checkout.service.ts` & `src/features/payments/payments.service.ts`**:
  - Include `assignedWalletId` / `safeLimit` / `rotationStatus` metadata when creating sessions and crediting wallet volume on verification.

## 2. E-Commerce Storefront (`Ecomm-Demo`)
- **`functions/api/routers/orbitPayment.ts`**:
  - Store & parse multi-account MFS array in `payment.mfs.accounts_json`, keeping primary active account per provider mirrored into legacy `payment.<provider>.number` keys.
  - Upgrade `syncWalletsToOrbitHub` and add `pullWalletsFromOrbitHub` + `syncWalletsBidirectional` supporting `push` / `pull` / `bidirectional`.
  - Handle `wallet.rotated` and `wallet.synced` in `orbitWebhookHandler` to update local `payment.mfs.accounts_json` volumes and rotated primary flags.
  - Enrich `GET /api/v1/payments/orbit/config` and `POST /api/v1/payments/orbit/test-connection` with `devices`, `onlineDeviceCount`, `safeVolumeLimit`, `monthlyVolumeLimit`, `currentMonthVolume`, `rotationStatus`.
  - Add `GET /api/v1/payments/orbit/wallets` and update `POST /api/v1/payments/orbit/sync-wallets` for multi-account bi-directional sync.
- **`frontend/src/services/api.ts`, `OrbitPayControlCard.tsx`, `PaymentGatewayManager.tsx`**:
  - Add multi-account MFS manager inside `PaymentGatewayManager` & `OrbitPayControlCard`: add/edit/remove multiple numbers per provider (SIM A, SIM B...), show 250k safe / 300k max progress bar, connected Android devices strip, and Bi-Directional Sync controls.

## 3. Orbit Payment Web Portal (`Orbit Payment/frontend`)
- **`src/features/wallets/useWallets.ts`, `VolumeProgressBar.tsx`, `AddWalletDialog.tsx`, `WalletManager.tsx`**:
  - Show multi-device status strip (online devices + SIM slots).
  - Show 250k safe limit marker & 300k hard limit on `VolumeProgressBar`.
  - Support `safeVolumeLimit`, `label`, `deviceId`, `simSlotIndex` in `AddWalletDialog` and `WalletManager`.

## 4. Orbit Payment Android App (`Orbit Payment/app`)
- **Multi-Device & Dual-SIM Telemetry**:
  - Update `DevicePayloads.kt` (`IngestSmsItem` with `simSlotIndex`, `receiverNumber`; `HeartbeatRequest` with `simSlots`, `networkType`; `DeviceStatsResponse` with `onlineDeviceCount`, `devices`, `wallets`).
  - Update `SmsReceiver.kt` to extract `subscription` / `slot` extras from SMS intents and resolve `simSlotIndex` & `receiverNumber` via `SimSlotReader`.
  - Update `OrbitApiClient.kt` & `MainViewModel.kt` to send `simSlots` in heartbeats, load connected devices + wallet rotation status, and expose clean UI state.
- **Minimalist Apple HIG + Unslop UI Redesign**:
  - Update `MainActivity.kt` to 4 clean bottom nav tabs (`Home`, `Verify`, `Activity`, `Settings`) with hairline divider and subtle icon/label hierarchy; route `Diagnostics` from `Settings`.
  - Redesign `DashboardScreen.kt` to eliminate clutter: quiet TopBar (no competing FAB), 1 Hero Summary Card (verified volume + active SIM rotation meters toward 250k/300k + connected devices pill), clean segmented switcher (`Pending` | `Orders` | `SMS`), compact single-purpose rows.
  - Refine `SettingsScreen.kt` to include a clean "Device Health & SIM Diagnostics" entry card + multi-device summary, and polish `VerifyScreen.kt` / `HistoryScreen.kt` card density.
