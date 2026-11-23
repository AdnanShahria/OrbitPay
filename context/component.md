# ORBIT Payment Hub — UI Component Architecture

> **Part of ORBIT Context Directory** | [Back to Master Context](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/context.md)

---

## 📌 Document Metadata & Activity Tracker

| Field | Value |
|---|---|
| **Document** | UI Components, Design System & Screen Inventory |
| **Status** | Active / Production Implemented |
| **Last Updated** | 2026-11-23 00:05:00 +06:00 |
| **Last Prompt / Trigger** | Unique poisha 3-field checkout, admin-provisioned merchant login, Orders & COD Sync UI, Integration Guide, and Android Login/Orders screens |
| **Actions Taken** | Added `MerchantLoginScreen.tsx`, `OrdersManager.tsx`, `IntegrationGuide.tsx`, `ProjectUsersModal.tsx`, 3-field `CheckoutStepper.tsx` + genuine `PollingStatus.tsx`, and Android `LoginScreen.kt` + `DashboardScreen.kt` Orders & Alerts feed. |

---

## 1. Design System & Styling Conventions

### 1.1 Web Portal & Checkout Widget (`frontend/`)
* **Framework:** React 19 + TypeScript + Vite 6 + `@remixicon/react` + `react-aria-components`.
* **Styling Engine:** Official **BoardUI** (`src/styles/theme.css`, `typography.css`, `globals.css`) + Tailwind CSS v4.
* **Themes (2-Way Switcher via `ThemeToggle`, persisted as `boardui:theme`):**
  - **White Theme (Default — Porcelain Ledger):** `#FAFAFA` page ground, `#FFFFFF` `rounded-3xl` cards with `#E4E4E7` 1px hairlines and contact `shadow-card`, obsidian `#09090B` primary actions.
  - **Premium Black Theme (Obsidian OLED):** `#050506` deep obsidian ground, `#0D0D0F` stepped cards and `#141417` inner trays with `rgba(255,255,255,0.10)` hairlines, Apple softened `#F5F5F7` primary text, and off-white `#F5F5F7` primary actions with dark ink.
* **Design Guidelines (Apple HIG + Unslop):**
  - Tabular numbers (`tabular-nums` / `tnum`) for all monetary figures and counts.
  - 44x44px minimum touch targets on mobile interactive controls.
  - Semantic tokens only (`bg-background-full`, `bg-background-primary-default`, `text-text-primary`, `border-border-button-default`, `border-separator-border`); zero `dark:` overrides, zero indigo/violet slop, Liquid Glass blur restricted strictly to floating sticky headers/drawers/modals.
  - Class composition via `cx()` from `@/utils/cx` and `DirectionProvider` wrapping root.

### 1.2 Android Companion App (`app/`)
* **Toolkit:** Jetpack Compose + Material 3 (M3), using `MaterialTheme.colorScheme` semantic tokens across `DashboardScreen.kt`, `OnboardingScreen.kt`, and `SettingsScreen.kt`.
* **Themes:** Porcelain White (default) and Obsidian OLED (`#050506` / `#0D0D0F` / `#F5F5F7`), persisted in `PreferencesManager` (`isDarkTheme`) with quick toggle in TopAppBar and Appearance switch in Settings.
* **Color Palette:** Dynamic MFS branded accents reserved strictly for MFS provider badges (`bKash`, `Nagad`, `Rocket`, `Upay`, `Cellfin`).

---

## 2. Mirrored Component Inventory (`frontend/src/features/`)

Every feature directly mirrors its backend counterpart in `backend/src/features/`:

### 2.1 Feature: Checkout (`frontend/src/features/checkout/`)

| Component | Purpose & Description |
|---|---|
| `CheckoutModal.tsx` | Main payment modal container (used standalone at `/checkout/:sessionId` or injected via `widget.js`). |
| `CheckoutStepper.tsx` | 3-step interactive UI: 1. Select MFS Provider -> 2. Copy Number -> 3. Enter TrxID & Phone. |
| `MfsNumberCapsule.tsx`| High-contrast number display with 1-click "Copy Number" button and "Personal vs PRA" tag. |
| `PollingStatus.tsx` | Circular progress ring with 10-minute countdown, polling state, and animated checkmark on verification. |
| `useCheckout.ts` | React hook managing session fetching, timer, form validation, and polling. |

### 2.2 Feature: Device Pairing & Health (`frontend/src/features/device/`)

| Component | Purpose & Description |
|---|---|
| `DevicePairingQR.tsx` | Generates a high-density QR code containing server URL and encrypted device key for companion app pairing. |
| `DeviceLiveBadge.tsx` | Pulsing pill badge showing live status: Green (`● Phone Online & Syncing`) vs Amber (`Offline`). |
| `useDeviceStats.ts` | React hook polling `/api/v1/device/stats` every 10 seconds. |

### 2.3 Feature: Wallets & Limit Rotation (`frontend/src/features/wallets/`)

| Component | Purpose & Description |
|---|---|
| `WalletManager.tsx` | Grid of registered MFS numbers across bKash, Nagad, Rocket, Upay, Cellfin. |
| `VolumeProgressBar.tsx`| Visual meter tracking current month volume against the ৳300,000 personal ceiling. |
| `AddWalletDialog.tsx` | Modal form allowing merchants to add secondary SIMs for automated quota rotation. |
| `useWallets.ts` | Hook for wallet CRUD operations. |

### 2.4 Feature: Transactions & Typo Rescue (`frontend/src/features/transactions/`)

| Component | Purpose & Description |
|---|---|
| `TransactionTable.tsx` | Real-time BoardUI data table with filter chips (`ALL`, `VERIFIED`, `UNCLAIMED`, `MANUAL`). |
| `UnclaimedModal.tsx` | The "Typo Rescue" sheet allowing merchants to bind an `UNCLAIMED` SMS to a pending order with 1 click. |
| `AnalyticsOverview.tsx`| BoardUI `stat-cards` displaying Total BDT Volume, Verified Orders, and Unclaimed Transfers. |
| `useTransactions.ts` | React hook for ledger queries and manual resolution mutations. |

---

## 3. Standalone Third-Party Embed Widget (`frontend/src/widget/`)

* **Source File:** `frontend/src/widget/widget.ts` (Compiles to `dist/widget.js`).
* **Embed Code for Client Stores (`ecom.orbitsaas.cloud`, `aurelia.shop`, `newznbd.shop`):**
  ```html
  <script src="https://payment.orbitsaas.cloud/widget.js"></script>
  <script>
    OrbitPay.init({
      merchantId: "mer_aurelia_01",
      orderId: "ORDER-10492",
      amount: 1250.00,
      customerEmail: "buyer@example.com",
      onSuccess: function(data) {
        window.location.href = "/order-confirmed?id=" + data.orderId;
      }
    });
  </script>
  ```
* **Mechanics:** Injects a responsive modal iframe overlay communicating with the parent page via `window.postMessage`.

---

## 4. Android Companion UI (`app/src/main/java/com/orbitsaas/payment/ui/`)

| Screen / Component | Purpose & Description |
|---|---|
| `DashboardScreen.kt` | Main overview: Online/Offline sync pill, today's verified volume, and real-time transaction feed. |
| `OnboardingScreen.kt` | Step-by-step interactive guide for bypassing Android 13/14 Restricted Settings and battery optimization. |
| `SettingsScreen.kt` | Camera QR scanner to pair phone with ORBIT Hub and manual device API key entry. |
