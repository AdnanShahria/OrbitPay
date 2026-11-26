# ORBIT Pay — Android Companion App

Native Kotlin + Jetpack Compose companion application for **ORBIT Payment Hub**. It captures incoming Bangladeshi MFS payment alerts (bKash, Nagad, Rocket, Upay, CellFin) with anti-spoofing verification, syncs transactions to the ORBIT Worker API, supports manual typo-rescue matching, and delivers sub-second order and verification alerts out of the box with a **zero-Firebase 3-tier push architecture**:

1. **Tier 1 — Self-Hosted Cloudflare Durable Object WebSocket (`\$0`, Primary)**: `PushWebSocketClient` maintains a persistent WebSocket to `GET /api/v1/device/ws` (backed by Cloudflare `MerchantPushHub` with WebSocket Hibernation and 45s `"ping"` / `"pong"` keepalives), plus exponential backoff reconnection and immediate catch-up `/sync`.
2. **Tier 2 — Optional FCM HTTP v1 Backup**: If `google-services.json` is bundled and `FCM_SERVICE_ACCOUNT_JSON` is configured on the backend, `FcmService` and `FcmTokenRegistrar` act as an automatic OS wake-up backup.
3. **Tier 3 — Adaptive `/api/v1/device/sync` Polling Fallback**: `StickyForegroundService` polls every **60s** when both WebSocket is disconnected and Firebase is absent, relaxing to **300s (5m)** whenever WebSocket is connected or FCM is active.

## Requirements

- **JDK**: 17
- **Gradle**: 8.9 (`gradle/wrapper/gradle-wrapper.properties`)
- **Android SDK**: Compile SDK 34, Target SDK 34, Min SDK 26 (Android 8.0+)

## Setup & Build

1. **Zero-Firebase Instant Push (Default)**:
   - Works immediately with no Firebase project or `google-services.json` required. `PushWebSocketClient` connects to `wss://<your-worker-host>/api/v1/device/ws` automatically once signed in.
2. **Optional Firebase Cloud Messaging (`google-services.json`)**:
   - Place `google-services.json` inside `app/app/` to enable optional Tier-2 FCM v1 push backup.
   - If omitted, the build skips the `com.google.gms.google-services` plugin cleanly and relies on Tier-1 WebSocket + Tier-3 60-second `/api/v1/device/sync` polling fallback.
3. **Optional Release Signing (`keystore.properties`)**:
   - Create `app/keystore.properties` with `storeFile`, `storePassword`, `keyAlias`, and `keyPassword` for signed release builds; otherwise release artifacts build unsigned with R8 minification and resource shrinking enabled.
4. **Build Commands** (run inside `app/`):
   ```bash
   ./gradlew testDebugUnitTest
   ./gradlew assembleDebug
   ./gradlew assembleRelease
   ```

## Architecture Overview

- `interceptors/`:
  - `SenderTrust.kt`: Enforces exact trusted SMS shortcodes/headers, exact trusted MFS notification package IDs, personal phone number rejection (`^\+?(88)?01\d{9}$`), numeric-sender checks, and user-configured `extraTrustedSenders` (`PROVIDER:Sender`).
  - `parsers/MfsParser.kt` & `ParsedTransaction.kt`: Returns `ParseOutcome` (`Accepted`, `Rejected`, `NotPayment`), rejects outgoing transfers and OTP SMS, normalizes Rocket `A/C:` numbers to 11 digits, and verifies provider consistency.
  - `SmsReceiver.kt` & `PushListener.kt`: Capture live SMS/notifications while signed in, store accepted payments in `local_sms`, and log spoof/rejected payloads to `blocked_messages`.
  - `InboxScanner.kt`: Recovers missed SMS from `Telephony.Sms.Inbox` (default 72h lookback) on login, `SyncWorker` runs, or manual diagnostics trigger.
- `data/local/`:
  - `OrbitDatabase.kt` (Room v2 with `MIGRATION_1_2`), `SmsEntity`, `SmsDao`, `BlockedMessageEntity`, `BlockedMessageDao`, and `PreferencesManager.kt` (including bounded `markOrderSeen` deduplication across WS, FCM, and `/sync`).
- `data/remote/`:
  - `OrbitApiClient.kt` & `DevicePayloads.kt`: Ktor client for `/api/v1/device/ingest`, `/transactions`, `/queue`, `/manual-match`, `/sync`, `/orders`, `/stats`, and `/heartbeat`.
- `service/`:
  - `PushWebSocketClient.kt`: OkHttp WebSocket client for `/api/v1/device/ws` with 45s `"ping"` keepalive, exponential backoff (`2s -> 60s`), `WsPushState` telemetry, Room verification updates, and `ORBIT_ALERT_CHANNEL` notifications.
  - `FcmTokenRegistrar.kt` & `FcmService.kt`: Safe optional Firebase registration and data-only FCM v1 payload handling.
  - `StickyForegroundService.kt`: Persistent foreground service managing `PushWebSocketClient`, dynamic notification status (**Instant Push Active** vs **Polling Fallback (60s)**), immediate catch-up `/sync` on reconnect, and adaptive polling (60s fallback / 300s safety net).
  - `SyncWorker.kt` & `BootReceiver.kt`: WorkManager background inbox scan, batch ingest, stats refresh, and telemetry heartbeat.

## Network Security & Localization

- **HTTPS-Only Release**: `src/main/res/xml/network_security_config.xml` disables cleartext traffic in release builds. `src/debug/res/xml/network_security_config.xml` permits cleartext only for `10.0.2.2`, `localhost`, and `127.0.0.1` during local development.
- **Languages**: Per-app English (`en`) and Bangla (`bn`) localization configured via `res/xml/locales_config.xml` and `AppLocalesMetadataHolderService`.
