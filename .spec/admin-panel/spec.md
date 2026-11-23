# Feature Specification: Hidden Central Hub Admin Panel (`/admin`)

## 1. Objective
Provide a unified, multi-tenant administrative command center accessible exclusively via the `/admin` path (or `/#admin`) to monitor and manage all connected client projects (e.g. `aurelia.shop`, `newznbd.shop`, `ecom.orbitsaas.cloud`), view cross-merchant transaction volumes, oversee companion device fleet health, audit webhook deliveries with instant retry capabilities, and onboard new client stores.

## 2. Access Control & Stealth Requirements
- **Stealth / Hidden**: The `/admin` route is not rendered in the public merchant portal navigation sidebar.
- **Access Paths**:
  - Direct URL entry: `/admin` or `/#admin`
  - Subtle footer lock icon or keyboard shortcut (`Ctrl+Alt+A`)
- **Master Authentication**:
  - Gated by Master Admin Key (`X-Admin-Key`), default configured in environment (`MASTER_ADMIN_KEY` or dev default `orbit_master_admin_2026`).
  - Session remembered in browser `sessionStorage` with instant 1-click lock/logout.

## 3. User Stories & Acceptance Criteria

### Story 1: Global Health & Telemetry Overview
- **Given** an authenticated system administrator on `/admin`,
- **When** the dashboard loads,
- **Then** display high-level KPI cards:
  - Total Multi-Tenant Volume (৳ BDT)
  - Connected Client Projects (Total, Active, Paused)
  - Android Device Fleet (Online / Total)
  - Global Webhook Delivery Success Rate (%)
  - Verification Queue Backlog (Pending orders waiting for SMS)

### Story 2: Connected Projects / Multi-Storefront Monitor
- **Given** multiple connected client stores,
- **When** the administrator views the "Projects" tab,
- **Then** display an interactive data table of all stores with:
  - Store Name, Domain, Webhook URL, Grace Period
  - Companion Phone state (Online green badge with last seen / Offline gray badge)
  - Active SIM wallets and combined daily/monthly volume
  - Actions: Copy Credentials, Toggle Status (Active / Paused), Edit Settings, Delete / Deactivate.
- **And** provide a "+ Add New Project" modal with automatic API Key & HMAC Webhook Secret generation.

### Story 3: Global Webhook Audit & 1-Click Retry
- **Given** failed or pending third-party webhooks,
- **When** the administrator views the "Webhooks" tab,
- **Then** list all delivery attempts with HTTP response codes and timestamp,
- **And** allow triggering the edge retry dispatcher with 1 click (`POST /api/v1/webhooks/retry`).

### Story 4: Cross-Project Verification Queue & Live Influx
- **Given** customers submitting payments across various client sites,
- **When** viewing the "Live Queue" tab,
- **Then** display all pending matching operations in real-time,
- **And** allow injecting simulated test transactions for any specific store directly from the admin panel.
