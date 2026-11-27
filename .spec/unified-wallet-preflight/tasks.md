# Atomic Task Breakdown

## Track 1: ORBIT Payment Backend & Portal (`Orbit Payment`)
- [x] `T1.1` Add `syncWalletsSchema` in `backend/src/features/wallets/wallets.schema.ts`.
- [x] `T1.2` Implement `syncMerchantWallets` & placeholder detection in `backend/src/features/wallets/wallets.service.ts` and `POST /sync` in `wallets.routes.ts`.
- [x] `T1.3` Add `preflightCheckSchema` in `backend/src/features/device/device.schema.ts`, `getDevicePreflight` in `device.service.ts`, and `GET /preflight` + `POST /preflight/check` in `device.routes.ts`.
- [x] `T1.4` Fix conditional `<CheckoutModal>` mount in `frontend/src/App.tsx` and add placeholder/zero-active-wallet alert banner in `frontend/src/features/wallets/WalletManager.tsx`.

## Track 2: Storefront Integration (`Ecomm-Demo`)
- [x] `T2.1` Add `extractStorefrontMfsWallets`, `syncWalletsToOrbitHub`, and `POST /sync-wallets` in `Ecomm-Demo/functions/api/routers/orbitPayment.ts`, and invoke sync from `PUT /config` plus enrich `/config` and `/test-connection`.
- [x] `T2.2` Update `Ecomm-Demo/frontend/src/services/api.ts`, `PaymentGatewayManager.tsx`, and `OrbitPayControlCard.tsx` to sync gateway numbers on save and display synced wallet & placeholder status.

## Track 3: Android Companion App (`Orbit Payment/app`)
- [x] `T3.1` Add `READ_PHONE_NUMBERS` & `READ_PHONE_STATE` to `AndroidManifest.xml`, add `confirmedSimNumbers` storage to `PreferencesManager.kt`, and create `SimSlotReader.kt`.
- [x] `T3.2` Add preflight DTOs & API methods to `DevicePayloads.kt` and `OrbitApiClient.kt`.
- [x] `T3.3` Integrate preflight state into `MainViewModel.kt` and `DiagnosticsViewModel.kt` (auto-run on login/resume + manual full check + SIM number confirmation).
- [x] `T3.4` Build Number Profile & System Check UI in `DiagnosticsScreen.kt`, compact status banner in `DashboardScreen.kt`, and strings in `strings.xml` + `values-bn/strings.xml`.

## Convergence
- [x] `C1` Cross-checked API contracts, schema enums (`HARDWARE`/`CONFIRMED`), and `checkedAt` field across all modified files.
