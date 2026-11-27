# Feature Specification: Admin Auth, Logout System, Console Error Fixes & Hub Hardening

## Overview
Upgrade ORBIT Central Hub (`/admin`) from a stateless raw `MASTER_ADMIN_KEY` prompt into a full DB-backed Admin Authentication & Session Management system, eliminate all red console errors (`401 /realtime/stream` loop and `500 /admin/releases`), and deliver Admin Security/Audit, System Diagnostics, and Project Lifecycle & Quick-Inspect tools.

## User Stories

### 1. Admin Authentication & Server-Side Logout
- **As a Root Admin**, I want to sign in to `/admin` using either my **Admin Email & Password** or the **Master Admin Security Key**, receiving a signed Admin JWT backed by a tracked `admin_sessions` record in D1.
- **As a Root Admin**, I want a real **Logout** button that calls `POST /api/v1/admin/auth/logout`, revokes my current session in D1, clears client credentials, and returns me to the login gate.
- **As a Root Admin**, if there are no `admin_users` provisioned yet, I want to bootstrap my first `SUPER_ADMIN` email/password account directly from the Security tab (or setup card) after authenticating with the Master Admin Key.

### 2. Zero Red Console Errors in Admin & Merchant Portals
- **Given** an authenticated Admin in `/admin`, **When** `AdminDashboard` connects to `/api/v1/realtime/stream`, **Then** it authenticates via `?adminToken=<jwt>` and receives cross-tenant live events with `200 OK` (no `401` infinite reconnect spam).
- **Given** an unauthenticated user on `/admin` or `/`, **When** no valid token is present, **Then** `useRealtime` does not open `EventSource` at all.
- **Given** `GlobalQueueTable` is mounted, **Then** it does not open a duplicate `EventSource` connection.
- **Given** `app_releases` (or `admin_*`) tables were not yet migrated on remote D1, **When** `/api/v1/admin/releases` or `/api/v1/admin/system/health` is called, **Then** the backend safely auto-bootstraps missing tables idempotently and returns `200 OK` instead of `500 Internal Server Error`.
- **Given** the app is running in `production`, **When** `AdminDashboard` or `GlobalQueueTable` renders, **Then** the dev-only simulator actions are hidden/disabled cleanly based on `/api/v1/admin/system/health` (`simulatorEnabled: false`) so clicking or polling never triggers `403 Forbidden` console errors.

### 3. Admin Security & Sessions, System Diagnostics & Project Lifecycle
- **Admin Security & Sessions Tab**: View active/revoked admin sessions (IP, User-Agent, auth method, expiry), revoke individual sessions, revoke all other sessions, create/manage `SUPER_ADMIN` and `ADMIN_OPERATOR` accounts, and inspect the Admin Audit Log.
- **System Health & Schema Diagnostics**: View D1 schema readiness, R2 binding status, Durable Object `PUSH_HUB` status, and trigger an idempotent schema verification/bootstrap check.
- **Project Lifecycle & Quick-Inspect**: Edit a connected storefront's name, webhook URL, grace period, and active state; inspect a project's SIM wallets, recent SMS ledger transactions, and recent orders in a slide-over drawer; and safely delete test storefronts with explicit confirmation.
