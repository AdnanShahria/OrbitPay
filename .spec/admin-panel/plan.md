# Technical Architecture & Blueprint: Hidden Admin Panel (`/admin`)

## 1. Backend Architecture (`backend/src/features/admin/`)

### Endpoints (`/api/v1/admin/*`)
- **`POST /api/v1/admin/auth/verify`**: Validates `adminKey` against `MASTER_ADMIN_KEY` or dev default.
- **`GET /api/v1/admin/overview`**: Computes aggregated cross-project KPIs (total volume, active stores, device fleet status, webhook success rate).
- **`GET /api/v1/admin/projects`**: Lists all merchants with live device status, wallet count, and monthly BDT volume.
- **`POST /api/v1/admin/projects`**: Onboards a new client store with auto-generated Webhook Secret and Device Key.
- **`PATCH /api/v1/admin/projects/:id`**: Updates store name, webhook URL, grace period, or active toggle.
- **`GET /api/v1/admin/webhooks`**: Queries `webhook_deliveries` across all merchants with delivery status and response bodies.
- **`GET /api/v1/admin/queue`**: Queries all `WAITING_FOR_SMS` records in `verification_queue`.

### Security Middleware
- `authMasterAdminMiddleware`: Requires `X-Admin-Key` header matching `c.env.MASTER_ADMIN_KEY || 'orbit_master_admin_2026'`.

## 2. Frontend Architecture (`frontend/src/features/admin/`)

### Directory Structure
```
frontend/src/features/admin/
├── AdminDashboard.tsx       # Master Admin Container with Sub-tabs
├── AdminAuthGate.tsx        # Password / Key authentication modal & session lock
├── AdminOverviewCards.tsx   # Cross-project telemetry and health metrics
├── ProjectManagerTable.tsx  # Interactive list of connected storefronts
├── AddProjectModal.tsx      # Modal to register a new client merchant
├── GlobalWebhookTable.tsx   # Audit log of all outgoing webhooks & retry trigger
├── GlobalQueueTable.tsx     # Cross-storefront verification queue inspector
└── useAdmin.ts              # TanStack Query hooks & mutations for /api/v1/admin
```

### Routing & Hidden Access
- `frontend/src/App.tsx`:
  - Detects if `window.location.pathname.startsWith('/admin')` or `window.location.hash === '#admin'` or internal state `isAdminMode`.
  - When in admin mode, renders `<AdminDashboard />`.
  - Renders a discreet discreet lock icon in the footer (`title="Admin Access"`).
  - Listens for keyboard shortcut `Ctrl+Alt+A`.

## 3. Design System & Apple HIG Aesthetics
- Built with BoardUI semantic tokens (`bg-background-primary-default`, `text-text-primary`, `border-border-button-default`).
- High-contrast typography with monospace formatting for API keys, TrxIDs, and amounts.
- Fluid transitions and responsive layout with seamless dark mode support.
