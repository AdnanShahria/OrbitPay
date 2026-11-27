# Feature Spec: Multi-Device Verification, Intelligent 250k/300k SIM Rotation, E-Commerce Bi-Directional Sync & Minimal Android UI

## Overview
Upgrade **ORBIT Payment Hub**, **Ecomm-Demo**, and the **ORBIT Android Companion App** to support:
1. **Multi-Device Verification**: Multiple Android phones can stay logged in simultaneously for the same merchant, each reporting per-device heartbeats, WebSocket presence, and SIM slot telemetry (`SIM 1` / `SIM 2`). Any online device belonging to the merchant can ingest MFS SMS and auto-verify payments.
2. **Intelligent SIM Rotation (250k Safe / 300k Hard Limit)**:
   - Each MFS wallet tracks `safeVolumeLimit` (default `250,000` BDT) and `monthlyVolumeLimit` (default `300,000` BDT).
   - Smart selection prioritizes active wallets strictly under `250,000` BDT whose linked/matching device is online.
   - If a SIM reaches `250,000` BDT or its device goes offline, checkout automatically rotates to the next healthy SIM (on the same device or another online device).
   - **Graceful Overflow Zone (250k–300k)**: If all active SIMs for a provider have reached `250,000` BDT, the engine selects the lowest-volume active SIM strictly under `300,000` BDT with an overflow warning. SIMs at or above `300,000` BDT are hard-blocked from checkout routing.
3. **Full Bi-Directional E-Commerce Sync (`Ecomm-Demo` <-> `Orbit Payment`)**:
   - Merchants can add, edit, reorder, enable/disable, and view **multiple MFS accounts per provider** (bKash, Nagad, Rocket, Upay, Cellfin) in either Ecomm-Demo or Orbit Payment.
   - Changes push to Orbit Hub immediately, while Orbit Hub rotation updates, live monthly usage (`vs 250k / 300k`), and multi-device online status sync back into Ecomm-Demo via both pull APIs and signed webhooks (`wallet.rotated`, `wallet.synced`).
4. **Minimalist, Calm & Functional Android Companion UI**:
   - Apply Apple HIG Simplicity + Unslop quiet-chrome design principles (Porcelain light `#FAFAFA` / Obsidian OLED dark `#050506`, 4dp/8dp grid, 1dp hairline borders, `tabular-nums`, sentence case, zero stacked noisy pills).
   - Streamline bottom navigation from 5 tabs to **4 tabs** (`Home`, `Verify`, `Activity`, `Settings` — integrating System Health & Diagnostics cleanly inside `Settings`).
   - Redesign `DashboardScreen` with a quiet TopBar, a single calm hero metric + SIM rotation progress card, segmented feed switching, and uncluttered compact rows.

## Acceptance Criteria (`Given / When / Then`)
- **AC1 (Multi-Device Presence & Verification)**:
  - *Given* Device A (SIM 1 & SIM 2) and Device B (SIM 3) are logged into the same merchant account,
  - *When* Device A or Device B sends a heartbeat or receives a valid MFS SMS,
  - *Then* both devices appear as active in `merchant_devices` with individual `lastSeenAt` and `simSlotsJson`, and SMS from either device auto-verifies matching `WAITING_FOR_SMS` orders.
- **AC2 (250k Safe Limit & 300k Hard Limit Rotation)**:
  - *Given* SIM A (`bKash`, `currentMonthVolume = 250000`) and SIM B (`bKash`, `currentMonthVolume = 40000`),
  - *When* a new checkout session is created or `getActiveRotatedWallet` runs,
  - *Then* SIM B is selected automatically; if both SIM A (`260000`) and SIM B (`255000`) are in the 250k–300k zone, SIM B (lowest under 300k) is selected with overflow warning; if a SIM reaches `300000`, it is excluded from routing.
- **AC3 (Device Offline Failover)**:
  - *Given* SIM A is linked to Device 1 (offline > 5m) and SIM B is linked to Device 2 (online),
  - *When* checkout requests an active wallet,
  - *Then* the rotation engine skips SIM A on the offline device and selects SIM B on Device 2.
- **AC4 (Bi-Directional E-Commerce Sync)**:
  - *Given* a merchant adds multiple bKash/Nagad accounts in Ecomm-Demo `PaymentGatewayManager`,
  - *When* they save or click Sync,
  - *Then* all accounts sync to Orbit Hub with 250k safe / 300k max limits, and Orbit Hub's live usage, rotated primary status, and connected device list sync back to Ecomm-Demo.
- **AC5 (Minimal Android UI)**:
  - *Given* a merchant opens the Android app,
  - *Then* bottom navigation has 4 clean tabs (`Home`, `Verify`, `Activity`, `Settings`), Dashboard shows live device count + active SIM rotation progress without visual clutter, and Diagnostics is accessible from `Settings`.
