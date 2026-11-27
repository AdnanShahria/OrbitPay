# Plan: 3-Phase Checkout Hierarchy, OrbitMail Invoice Engine & All-Page UI Polish

## Architecture & Data Contracts

### 1. Backend: OrbitMail Payment & Invoice Notifications
- **New Module**: `backend/src/features/notifications/payment-email.service.ts`
  - `extractRealCustomerEmail(...candidates)`: trims, validates email regex, excludes `'buyer@orbitsaas.cloud'`.
  - `buildPaymentSubmittedEmailHtml(data)` & `buildVerifiedInvoiceHtml(data)`: clean editorial monochrome HTML email templates with inline CSS, BDT tabular formatting, invoice number (`ORB-INV-<ref>`), itemized base amount + unique poisha offset + ৳0.00 fee = total paid, TrxID, provider, sender, verification mode, and Orbit branding.
  - `notifyPaymentSubmittedEmail(db, env, params)`: sends via `routeEmail(env, ..., { db, callerId })` with `preferredProvider: 'orbitmail'`, wrapped safely so email failures never block checkout responses.
  - `notifyPaymentVerifiedInvoiceEmail(db, env, params)`: checks `routerKvStore` key `invoice_sent:${merchantId}:${externalRefId}` before sending to guarantee idempotent single invoice delivery across all 4 verification paths; persists sentinel in `routerKvStore` with 90-day expiry.
- **Integration Points**:
  1. `backend/src/features/checkout/checkout.schema.ts`: already accepts optional `customerEmail`.
  2. `backend/src/features/checkout/checkout.service.ts`:
     - `createCheckoutSession` & `getPublicCheckoutSession`: return `customerEmail` (null if `'buyer@orbitsaas.cloud'`).
     - `verifyCheckoutPayment`: persist real `payload.customerEmail` into `paymentIntents.customerJson`, `checkoutSessions.customerEmail`, `verificationQueue.customerEmail`, and `merchantOrders.customerEmail`; trigger `notifyPaymentVerifiedInvoiceEmail` on `VERIFIED` or `notifyPaymentSubmittedEmail` on `PENDING_VERIFICATION` / `MANUAL_REVIEW_REQUIRED` inside `safeWaitUntil`; include `customerEmail` in `VerifyResult` & `getCheckoutStatus`.
  3. `backend/src/features/device/device.service.ts`:
     - `ingestDeviceSmsBatch`: resolve real customer email from `pendingQueueRecord.customerEmail` or `intent?.customerJson` and trigger `notifyPaymentVerifiedInvoiceEmail` inside `safeWaitUntil`.
  4. `backend/src/features/payments/payments.service.ts`:
     - `resolvePaymentIntent` (`APPROVE`): resolve real customer email from `intent.customerJson` (or `checkoutSessions`) and trigger `notifyPaymentVerifiedInvoiceEmail` inside `safeWaitUntil`.
  5. `backend/src/features/transactions/transactions.service.ts`:
     - `manualMatchTransaction`: resolve real customer email from `payload.customerEmail` or `intent?.customerJson` and trigger `notifyPaymentVerifiedInvoiceEmail` inside `safeWaitUntil`.

### 2. Frontend: Checkout Hierarchy & Email/Invoice UX
- `frontend/src/styles/globals.css`: add pure CSS `orbit-step-enter` animation (respecting `prefers-reduced-motion`).
- `frontend/src/features/checkout/useCheckout.ts`: add `customerEmail` / `setCustomerEmail` state hydrated from `config.customerEmail` and `CheckoutSessionData.customerEmail`, sent on `POST /api/v1/checkout/verify`, and returned to `PollingStatus` / `CheckoutStepper`.
- `frontend/src/features/checkout/CheckoutDisplayHeader.tsx`: crisp 2-zone header (Store/Ref left, Total Payable + code caption right).
- `frontend/src/features/checkout/CheckoutStepper.tsx`:
  - Single-row stepper (`1. Method`, `2. Send`, `3. Verify`) + inline countdown pill.
  - Strict phase isolation:
    - Step 1: Provider cards + single CTA.
    - Step 2: Receiver number card (Copy) + Exact amount card (Copy) + concise 3-bullet checklist + Back/Next.
    - Step 3: Clean 3-field Verify form + optional `Email for receipt & invoice` field + compact optional/required screenshot upload + Back/Verify Payment.
- `frontend/src/features/checkout/PollingStatus.tsx`:
  - Single-line aligned receipt rows, graceful truncation + copy on long Reference IDs, OrbitMail confirmation badge when `customerEmail` exists, and printable/downloadable HTML invoice action.
- `frontend/src/features/payment-links/PublicPaymentLinkPage.tsx`:
  - Visibly show `Email (for receipt & invoice)` field in the initial form, clean editorial spacing, single subtle footer.
- `frontend/src/features/checkout/CheckoutModal.tsx` & `frontend/src/App.tsx` (`EmbeddedCheckoutView`):
  - Pass `customerEmail` props cleanly and eliminate duplicate footer noise.

### 3. Frontend: All-Page Editorial UI Polish
- Refine copy density, header alignment, card rhythm, and responsive tables across:
  - `App.tsx` (Portal Shell & Demo Playground)
  - `MerchantLoginScreen.tsx` & `AdminAuthGate.tsx`
  - `AnalyticsOverview.tsx` & `AdminOverviewCards.tsx`
  - `PaymentIntentsManager.tsx`, `PaymentLinksManager.tsx`, `OrdersManager.tsx`, `TransactionTable.tsx`
  - `WalletManager.tsx`, `DevicePairingQR.tsx`, `MerchantSettings.tsx`, `IntegrationGuide.tsx`
  - `AdminDashboard.tsx` and admin panels (`ProjectManagerTable`, `GlobalQueueTable`, `GlobalWebhookTable`, `SmsPushPanel`, `AppReleasesPanel`, `AdminPlatformSettingsPanel`, `AdminSecurityPanel`).
