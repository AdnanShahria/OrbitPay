# Tasks: Mobile App Completion, SMS Hardening, OTP & FCM v1

## B1 — Backend Ingest & Anti-Spoof Engineer
- [x] Update `backend/src/db/schema.ts` with `smsLedger` (`smsSender`, `source`, `trustFlag`) and `otpCodes` table + exported types
- [x] Create `backend/drizzle/0003_sms_trust_otp.sql` and update `backend/drizzle/meta/_journal.json`
- [x] Rewrite `backend/src/shared/parsers/mfs.ts` to match all `sms-samples.json` cases and reject outgoing/OTP messages
- [x] Create `backend/src/shared/sms-trust.ts` implementing `evaluateSmsTrust(msg)`
- [x] Update `backend/src/features/device/device.schema.ts` and `device.service.ts` for v2 ingest, trust flags, `SMS_FLAGGED` realtime broadcast, and `listOrdersUpdatedSince`
- [x] Update `backend/src/features/checkout/checkout.service.ts` to exclude flagged `sms_ledger` rows (`isNull(smsLedger.trustFlag)`) from instant match
- [x] Lock `POST /api/v1/realtime/simulate` in `backend/src/features/realtime/realtime.routes.ts` when `ENVIRONMENT === 'production'` without valid `X-Admin-Key`, and set `source: 'SMS'`, `smsSender: 'SIMULATOR'`
- [x] Add `GET /transactions`, `GET /queue`, `POST /manual-match`, and `GET /sync` to `backend/src/features/device/device.routes.ts`

## B2 — Backend Messaging Engineer (FCM v1 + OTP)
- [x] Create `backend/src/router/fcm.ts` implementing FCM HTTP v1 with Web Crypto RS256 JWT + cached OAuth2 access token
- [x] Update `backend/src/router/sms.ts` to replace legacy `fcm.googleapis.com/fcm/send` adapter with FCM HTTP v1 (`FCM_SERVICE_ACCOUNT_JSON`)
- [x] Update `backend/src/features/webhooks/webhook.dispatcher.ts` to pass `env` and null out `UNREGISTERED` FCM tokens
- [x] Create `backend/src/features/otp/{otp.schema,otp.service,otp.routes}.ts` implementing rate-limited 6-digit OTP send/verify
- [x] Create `backend/src/features/admin/messaging.routes.ts` implementing `/status`, `/test-sms`, and `/test-push`
- [x] Mount `/api/v1/otp` and `/api/v1/admin/messaging` in `backend/src/index.ts`
- [x] Update `backend/src/shared/types.ts` (`Env`) with `FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID`, `OTP_TTL_SECONDS`
- [x] Create `.dev.vars.example` documenting all secrets and SMS/FCM variables

## A1 — Android Core Engineer (Build, Capture, Data, Sync)
- [x] Fix Gradle wrapper (`8.9`), `app/build.gradle.kts`, optional `google-services` plugin, `firebase-messaging` (non-ktx), `appcompat`, release signing, and minify/proguard rules
- [x] Harden `AndroidManifest.xml`, add `network_security_config.xml` (main + debug), adaptive launcher icon, `locales_config.xml`, `AppLocalesMetadataHolderService`, and `Theme.AppCompat.DayNight.NoActionBar`
- [x] Create `interceptors/SenderTrust.kt` with trusted sender/package lists, personal phone rejection, extra senders support, and provider consistency check
- [x] Rewrite `interceptors/parsers/MfsParser.kt` & `ParsedTransaction.kt` with `ParseOutcome` (`Accepted`, `Rejected`, `NotPayment`) and tolerant regexes matching `sms-samples.json`
- [x] Upgrade Room DB to v2 (`SmsEntity` columns, `BlockedMessageEntity`, `BlockedMessageDao`, `MIGRATION_1_2`, `SmsDao` search/unclaimed queries)
- [x] Update `SmsReceiver.kt` and `PushListener.kt` to enforce `ParseOutcome` and log rejected messages to `blocked_messages`
- [x] Create `interceptors/InboxScanner.kt` and integrate with `SyncWorker.kt`
- [x] Update `DevicePayloads.kt` & `OrbitApiClient.kt` with v2 ingest, transactions, queue, manualMatch, syncSince, and extended heartbeat
- [x] Create `service/FcmTokenRegistrar.kt` and update `OrbitApplication.kt` & `FcmService.kt` for optional Firebase + data-only payloads
- [x] Add polling fallback loop to `StickyForegroundService.kt` (60s without FCM / 300s with FCM) and update `PreferencesManager.kt`
- [x] Update `MfsParserTest.kt` with full corpus + `SenderTrust` tests and write `app/README.md` + `res/values*/strings_core.xml`

## A2 — Android Feature UI Engineer
- [x] Update `MainActivity.kt` to extend `AppCompatActivity` and host logged-in Material 3 `NavigationBar` (Home, History, Verify, Diagnostics, Settings)
- [x] Build History screen (`ui/history/`) with "On this phone" + "Server" tabs, search/filter chips, trust warning badge, and detail bottom sheet
- [x] Build Verify screen (`ui/verify/`) with unclaimed ledger list, ranked queue candidates, manual order ID fallback, and confirm dialog
- [x] Build Diagnostics screen (`ui/diagnostics/`) with live permission/service checklist, fix intents, blocked message log, inbox rescan button, and parser self-test
- [x] Update/add ViewModels (`ui/viewmodel/`) and trigger `FcmTokenRegistrar.refreshToken` + `InboxScanner.scheduleNow` on login
- [x] Add all UI strings to `res/values/strings_screens.xml` and `res/values-bn/strings_screens.xml`

## A3 — Android Localization & Polish Engineer
- [x] Extract all hardcoded strings from `DashboardScreen.kt`, `LoginScreen.kt`, `OnboardingScreen.kt`, and `SettingsScreen.kt` into `res/values/strings.xml` and `res/values-bn/strings.xml`
- [x] Create `ui/locale/LocaleHelper.kt` and wire Language selector + Extra Trusted Senders input in `SettingsScreen.kt`
- [x] Add SMS Spoof Protection & `READ_SMS` rationale step to `OnboardingScreen.kt`
- [x] Apply Apple HIG polish pass across all 4 screens (≥48dp touch targets, 8dp grid, tabular numbers, contentDescriptions, light/dark contrast)

## F1 — Web Admin & Docs Engineer
- [x] Add messaging hooks and types to `frontend/src/features/admin/useAdmin.ts`
- [x] Create `frontend/src/features/admin/SmsPushPanel.tsx` and wire "SMS & Push" tab into `AdminDashboard.tsx`
- [x] Add `trustFlag` warning chip + tooltip to `frontend/src/features/transactions/TransactionTable.tsx` (and ledger type)
- [x] Add OTP API section to `ECOMMERCE_INTEGRATION.md` and create `docs/SMS_AND_PUSH_SETUP.md`

## QA — Convergence Lead
- [x] Verify TS ↔ Kotlin ↔ Frontend contract alignment (endpoints, fields, nullability, ISO dates)
- [x] Verify Room v2 `MIGRATION_1_2` SQL exact match with entities and `@Database(version = 2)`
- [x] Verify Kotlin imports, `MfsParser.parse` call sites, and `values` vs `values-bn` string key parity
- [x] Verify TS imports, schema column names, `index.ts` mounts, and removal of legacy `fcm/send` URL
- [x] Verify security invariants (flagged rows excluded, `/realtime/simulate` locked in prod, OTP never logged/leaked)
