# Task Breakdown

- [x] **T1**: Map codebase symbols, routes, schemas, Android screens, and Ecomm-Demo sync endpoints.
- [x] **T2**: Author `.spec/multi-device-sim-rotation/{spec.md, plan.md, tasks.md}`.
- [x] **T3 (Backend Schema & Auth)**: Update `schema.ts`, `bootstrap.ts`, `types.ts`, and `middleware.ts` for multi-device telemetry, `deviceId` context, `safeVolumeLimit` (250k), and SIM slot tracking.
- [x] **T4 (Intelligent Rotation & Multi-Device APIs)**: Update `wallets.schema.ts`, `wallets.service.ts`, `wallets.routes.ts`, `device.schema.ts`, `device.service.ts`, `device.routes.ts`, `checkout.service.ts`, and `payments.service.ts`.
- [x] **T5 (Ecomm-Demo Bi-Directional Sync Backend)**: Update `Ecomm-Demo/functions/api/routers/orbitPayment.ts` for multi-account MFS storage, bi-directional wallet sync, and `wallet.rotated` / `wallet.synced` webhooks.
- [x] **T6 (Ecomm-Demo Frontend UI)**: Update `Ecomm-Demo/frontend/src/services/api.ts`, `OrbitPayControlCard.tsx`, and `PaymentGatewayManager.tsx` to manage multiple accounts per provider, show 250k/300k rotation limits & multi-device status, and sync bi-directionally.
- [x] **T7 (Orbit Payment Web Portal UI)**: Update `Orbit Payment/frontend/src/features/wallets/` (`useWallets.ts`, `VolumeProgressBar.tsx`, `AddWalletDialog.tsx`, `WalletManager.tsx`) for multi-device status and 250k/300k SIM rotation controls.
- [x] **T8 (Android Multi-Device & Dual-SIM Sync)**: Update `DevicePayloads.kt`, `OrbitApiClient.kt`, `SmsReceiver.kt`, `SimSlotReader.kt`, `SyncWorker.kt`/`StickyForegroundService.kt`, and `MainViewModel.kt`.
- [x] **T9 (Android Minimal UI Redesign)**: Update `MainActivity.kt`, `DashboardScreen.kt`, `SettingsScreen.kt`, and string resources for the calm 4-tab Apple HIG + Unslop design.
- [x] **T10 (Verification & Convergence)**: Validated Kotlin/TypeScript/schema consistency across all codebases via static inspection (build CLI commands blocked by local `'bash' is not recognized` PreToolUse hook).
