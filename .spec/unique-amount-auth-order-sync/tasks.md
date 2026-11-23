# Task Breakdown: Unique Poisha Checkout, Admin-Provisioned Client Auth & Bi-Directional Order Sync

- [x] **Task 1: Database Schema & Migration** (`backend/src/db/schema.ts`, `backend/drizzle/0002_auth_unique_orders.sql`, `backend/drizzle/meta/_journal.json`)
- [x] **Task 2: Crypto & Auth Middleware** (`backend/src/shared/crypto.ts`, `backend/src/shared/middleware.ts`, `backend/src/shared/types.ts`) — PBKDF2 password hashing, HMAC-SHA256 JWT sign/verify, D1 session revocation check, `merchant_devices` key check.
- [x] **Task 3: Auth & Admin Provisioning Routes/Services** (`backend/src/features/auth/*`, `backend/src/features/admin/*`, `backend/src/features/merchants/merchants.routes.ts`)
- [x] **Task 4: Positive 2-Decimal Poisha Unique Amount & Base-Amount Fallback Checkout** (`backend/src/features/checkout/*`, `backend/src/features/device/device.service.ts`, `backend/src/worker.ts`)
- [x] **Task 5: Bi-Directional Order Sync Engine** (`backend/src/features/orders/*`, `backend/src/features/device/device.routes.ts`, `backend/src/index.ts`)
- [x] **Task 6: Frontend Auth Gate, Shared API Client & Admin Credential Provisioning** (`frontend/src/shared/utils/api.ts`, `frontend/src/features/auth/*`, `frontend/src/features/admin/*`)
- [x] **Task 7: Frontend Checkout 3-Field Flow, Orders Tab & Storefront Integration Guide** (`frontend/src/features/checkout/*`, `frontend/src/features/orders/*`, `frontend/src/features/merchants/*`, `frontend/src/App.tsx`, `frontend/src/shared/hooks/useRealtime.ts`)
- [x] **Task 8: Android Kotlin App Auth, Bi-Directional Orders UI & FCM** (`app/app/src/main/java/com/orbitsaas/payment/*`)
- [x] **Task 9: Storefront Integration Documentation & Context Sync** (`ECOMMERCE_INTEGRATION.md`, `context/*`)
- [x] **Task 10: Build & Verification** (Backend `tsc --noEmit`, Frontend `tsc && vite build`, D1 local migration, API smoke tests)
