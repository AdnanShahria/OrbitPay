# Feature Specification: Merchant-Centric Mobile App, Home Screen Widget & OTP-Locked Web Setup Hub

## Overview
Transform ORBIT Pay's merchant experience across Web (`Orbit Payment/frontend`), Backend (`Orbit Payment/backend`), and Android (`Orbit Payment/app`) so merchants get a clear, business-owner-friendly mobile experience with 5 core modules, a live home-screen widget for pending verifications, automatic Bangladesh (`bn`) / international (`en`) localization, and plain-language onboarding for Play Protect / Android permission hurdles — while consolidating all developer/setup web pages into a single read-only-until-OTP-unlocked web page protected by an OTP sent to `adnanshahria2019@gmail.com`.

## User Stories & Acceptance Criteria

### US-1: Auto-Localized Merchant-Friendly Onboarding & Play Protect Guide (Android)
- **Given** a merchant installs ORBIT Pay for the first time
- **When** the app launches on a Bangladesh phone (SIM/Network country `BD`, timezone `Asia/Dhaka`, or `bn` locale)
- **Then** the app automatically selects Bengali (`bn`), and selects English (`en`) in other countries (without requiring a manual toggle during onboarding, while keeping Settings switcher available).
- **Given** the merchant views the onboarding wizard
- **Then** every step uses plain business-owner language (no developer jargon like API, webhook, SHA-256, daemon, intent) explaining:
  1. **How ORBIT Pay Works & Website Setup**: Customer pays via bKash/Nagad -> Merchant phone receives confirmation SMS -> App verifies in seconds -> Order updates automatically (and website setup is handled by ORBIT team).
  2. **Overcoming Installation & Android Hurdles**: Step-by-step instructions for Google Play Protect ("More details -> Install anyway"), Android 13/14+ "Allow restricted settings", Battery "Unrestricted", and OEM Auto-start.
  3. **Permissions & Why Each Is Needed**: Transparent plain-language breakdown of SMS (`RECEIVE_SMS`, `READ_SMS`), Notification Access, Phone/SIM state (`READ_PHONE_NUMBERS`, `READ_PHONE_STATE`), Notifications (`POST_NOTIFICATIONS`), and Battery Exemption — plus direct action buttons to grant/open each setting.

### US-2: 5 Core Merchant-Friendly App Modules (Android)
- **Given** a logged-in merchant in the Android app
- **Then** the app exposes the 5 business-centric features in plain language:
  1. **Overview**: Verified volume this month, a prominent **Waiting for Verification** live widget card (with instant Approve/Reject/Inspect), active SIM rotation limits, and recent pending items.
  2. **Universal Payments**: Search/filter and 1-tap Approve/Reject/View Receipt for incoming customer payments across any connected channel.
  3. **Payment Links**: List, create (Fixed or Open amount, title, description), copy/share URL, toggle active/paused, and delete payment links via `/api/v1/payment-links`.
  4. **Orders & COD Sync**: View storefront orders and trigger 1-tap Confirm, Ready to Ship, Shipped, Mark Paid, or Cancel actions.
  5. **SIM Pool & Limits**: View all connected MFS SIM numbers with ৳2.5L safe / ৳3.0L monthly limits, rotation status, add new SIM wallet, toggle Active/Paused, set Primary, or delete via `/api/v1/wallets`.
- **And** developer-only terminology and screens (Webhook config, Device Pairing QR, Integration Guide, Checkout Widget Demo, raw SMS typo console) are removed from main merchant navigation (Diagnostics remains quietly accessible via Settings/preflight tap using plain merchant language).

### US-3: Android Home Screen Widget & In-App Widget for "Waiting for Verification"
- **Given** a merchant adds the **ORBIT Pay Pending Payments** widget to their Android home screen
- **Then** the widget displays the count of payments waiting for verification (`WAITING_FOR_SMS`, `MANUAL_REVIEW_REQUIRED`, `OPEN`), up to 2–3 latest pending payment summaries (amount, provider, reference), a Refresh button, and tapping any pending item or the widget opens the app directly to inspect/verify that payment.
- **And** the widget automatically refreshes whenever `MainViewModel` syncs intents, `DynamicPushDispatcher` receives a push notification, or `PackageReplacedReceiver` / `MainActivity.onResume` runs.

### US-4: Consolidated Single-Page Setup & Developer Hub with OTP Lock (`adnanshahria2019@gmail.com`) (Web + Backend)
- **Given** the Web Merchant Portal (`Orbit Payment/frontend`)
- **Then** the primary merchant navigation shows the 5 core business tabs:
  1. `Overview`
  2. `Universal Payments`
  3. `Payment Links`
  4. `Orders & COD Sync`
  5. `SIM Pool & Limits`
- **And** the remaining 5 technical/setup sections (`Transactions & Typo`, `Device Pairing QR`, `Storefront & Webhook`, `Integration Guide`, `Checkout Widget Demo`) are merged into **one single consolidated page** (`Setup & Advanced Hub`) with collapsible dropdown/dashboard cards.
- **Given** a user opens `Setup & Advanced Hub`
- **Then** a **Lock / Unlock** control is **LOCKED by default** (`read-only`):
  - Users can **view and copy** values (codes, URLs, keys, QR payload, transaction ledger) freely.
  - All edit/mutation controls (saving webhook/storefront settings, rotating keys, replaying webhooks, manual matching, test webhook, checkout demo edits) are disabled/locked.
- **When** the user clicks **Unlock to Edit**
- **Then** the backend sends a 6-digit OTP specifically to `adnanshahria2019@gmail.com` via `routeEmail` (never trusting a client-supplied email address!), returns an `otpId` & masked email confirmation, and upon entering the valid 6-digit OTP returns a short-lived `unlockToken` (HMAC-signed JWT or session-bound token) that unlocks editing on that page until locked again or expired.
- **And** backend mutation endpoints for merchant setup (`/api/v1/merchants/settings`, `/api/v1/merchants/keys/rotate`, `/api/v1/merchants/webhook/test`, `/api/v1/merchants/webhooks/:id/replay`) verify the setup unlock token when called from a web JWT session (or allow API key / Master Admin bypass if applicable — wait: let's check if `Ecomm-Demo` or merchant web sessions call these; merchant web JWT sessions should require `X-Setup-Unlock-Token` or keep backward compatibility cleanly while enforcing it when setup lock is active!). Let's enforce `X-Setup-Unlock-Token` cleanly on web JWT calls or verify via dedicated unlock verification + middleware!
