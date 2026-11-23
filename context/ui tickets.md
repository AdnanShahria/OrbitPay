# ORBIT Payment Hub — UI / UX Task Tickets & Backlog

> **Part of ORBIT Context Directory** | [Back to Master Context](file:///c:/Users/Adnan/Desktop/OrbitSaaS/Orbit%20Payment/context/context.md)

---

## 📌 Document Metadata & Activity Tracker

| Field | Value |
|---|---|
| **Document** | UI/UX Work Items, Sprints & Ticket Backlog |
| **Status** | Active Sprint Execution |
| **Last Updated** | 2026-11-18 18:48:00 +06:00 |
| **Last Prompt / Trigger** | Complete React 19 Merchant Portal & Standalone Checkout Embed Widget implementation |
| **Actions Taken** | Implemented Epic 1 (Merchant Portal UI) and Epic 2 (Embeddable Checkout Widget) with 100% production code and verified build. |

---

## 1. Ticket System Standards

### Ticket Key Format
`ORBIT-UI-<NUMBER>`

### Priority Levels
* **P0 — Critical / Blocker:** Core payment flow blocked or verification UI unusable.
* **P1 — High:** Primary dashboard screen, key UX component, or critical state feedback.
* **P2 — Medium:** Secondary screens, settings drawers, filters, and non-blocking polish.
* **P3 — Low / Nice-to-Have:** Micro-interactions, animations, theme tweaks.

### Status Indicators
* 📝 `[BACKLOG]` — Specified, awaiting sprint pickup.
* 🟡 `[IN_PROGRESS]` — Currently being implemented.
* 🔍 `[IN_REVIEW]` — Code or design under review / QA.
* ✅ `[COMPLETED]` — Merged, tested, and verified.

---

## 2. Active Sprints & UI Backlog

### Epic 1: Central Hub Merchant Web Portal (`frontend/`)

| Ticket ID | Priority | Status | Title & Scope |
|---|---|---|---|
| `ORBIT-UI-101` | P1 | ✅ `[COMPLETED]` | **Merchant Metric Header & Status Pill**<br>Build top telemetry banner showing device connection status (`Online` / `Offline - Queued`) and aggregated BDT volume cards using BoardUI tokens. |
| `ORBIT-UI-102` | P1 | ✅ `[COMPLETED]` | **Live SMS Ledger Table**<br>Implement BoardUI `data-table` showing incoming SMS, TrxID, sender number, timestamp, and status badges (`VERIFIED` vs `UNCLAIMED`). |
| `ORBIT-UI-103` | P2 | ✅ `[COMPLETED]` | **SIM Pool Dynamic Allocation & Limit Progress Bar**<br>Card view to configure up to 5 SIM numbers, monthly ceiling limits (৳300k), and auto-rotation toggle. |
| `ORBIT-UI-104` | P2 | ✅ `[COMPLETED]` | **Third-Party Webhook & Secret Management Screen**<br>Input fields for custom client endpoints (`aurelia.shop/payment/v1`, `newznbd.shop/payment/v1`), secret regenerator, and HMAC ping test button. |
| `ORBIT-UI-105` | P0 | ✅ `[COMPLETED]` | **"Typo Rescue" 1-Click Match Modal (`UnclaimedModal.tsx`)**<br>Sheet drawer allowing merchants to click an `UNCLAIMED` SMS, view pending orders with matching amounts, and bind/verify with 1 click. |

---

### Epic 2: Client Storefront Embeddable Modal (`frontend/src/widget/`)

| Ticket ID | Priority | Status | Title & Scope |
|---|---|---|---|
| `ORBIT-UI-201` | P0 | ✅ `[COMPLETED]` | **Responsive Checkout Modal (`widget.js`)**<br>Create zero-dependency embedded modal for e-commerce checkout showing selected MFS number, tap-to-copy, and QR code. |
| `ORBIT-UI-202` | P0 | ✅ `[COMPLETED]` | **TrxID & Sender Input Verification Field**<br>Real-time input formatting for bKash, Nagad, Rocket (12 digits), Upay, and Cellfin with uppercase normalization. |
| `ORBIT-UI-203` | P1 | ✅ `[COMPLETED]` | **Pending Verification & Polling Progress Ring**<br>10-minute animated circular timer with status: *"Listening for payment confirmation... Confirmation email will be delivered automatically upon network sync."* |
| `ORBIT-UI-204` | P2 | ✅ `[COMPLETED]` | **Store Admin Manual Payment Approval Action**<br>Add "Verify Manually" action button in store admin `/admin/orders` for orders whose 60-minute grace window expired. |
| `ORBIT-UI-206` | P0 | ✅ `[COMPLETED]` | **Multi-Provider MFS Selector Pills**<br>Interactive selector tabs with brand logos for bKash (`#E2136E`), Nagad (`#F7941D`), Rocket (`#8C3494`), Upay (`#005696`), and Cellfin (`#00843D`). |

---

### Epic 3: Android Companion Daemon UI (`app/`)

| Ticket ID | Priority | Status | Title & Scope |
|---|---|---|---|
| `ORBIT-UI-301` | P0 | 📝 `[BACKLOG]` | **Jetpack Compose Dashboard Screen**<br>Build top connectivity chip, 3 summary cards (Total BDT, Verified Orders, Unclaimed SMS), and scrollable live transaction feed. |
| `ORBIT-UI-302` | P0 | 📝 `[BACKLOG]` | **Android 13+ Restricted Settings Onboarding Flow**<br>Step-by-step guidance dialog instructing user how to enable Notification Listener and SMS permissions past Google Play Protect / OS restrictions. |
| `ORBIT-UI-303` | P1 | 📝 `[BACKLOG]` | **Transaction Item Row with Status Badging**<br>Card design displaying bKash/Nagad logo icon, masked sender number, BDT amount, and prominent green `VERIFIED (Order #X)` or gray `UNCLAIMED` chip. |
| `ORBIT-UI-304` | P2 | 📝 `[BACKLOG]` | **Device Pairing & Key QR Scanner**<br>Camera/QR code scanner to pair the Android app with the merchant's Central Hub account by scanning the `device_key` from the web portal. |
