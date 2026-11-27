# Spec: 3-Phase Checkout Hierarchy, OrbitMail Invoice Delivery & Full-App UI Polish

## 1. Problem Statement
1. **Broken Checkout Hierarchy & Content Clutter**:
   - The checkout stepper mixes provider selection, send-money instructions, and verification fields with redundant banners (`Exact amount to send` duplicated across Step 1, Step 2, and Step 3 alongside the header total).
   - On mobile, the session countdown timer wraps awkwardly beneath `1. Provider`, receipt rows (`Reference ID`, `Confirmed at`) wrap mid-label, and verbose helper copy clutters every input.
2. **Missing OrbitMail Confirmation & Invoice Delivery**:
   - `backend/src/router/email.ts` implements `routeEmail` / `sendEmail` with OrbitMail (`https://mail.orbitsaas.cloud/api/v1/send`), but no payment lifecycle hook sends buyer confirmation or invoice emails when a buyer provides an email address.
   - `PublicPaymentLinkPage.tsx` hides the email field behind `+ Add email or reference note`, and `CheckoutStepper.tsx` Step 3 does not allow buyers to enter/confirm their email for receipt & invoice delivery.
3. **Inconsistent UI Polish Across Pages**:
   - Several Merchant Portal and Admin Hub screens carry dense helper copy and inconsistent visual spacing.

## 2. User Stories & Acceptance Criteria

### US-1: Strict 3-Phase Checkout Hierarchy
- **Given** a buyer opens a hosted checkout or payment link checkout:
  - **When** on **Phase 1 (Select Method)**: ONLY provider selection tiles, a concise prompt, and the primary `Continue with <Provider>` CTA are shown. Receiver number and exact-amount banners are NOT shown in Phase 1.
  - **When** on **Phase 2 (Send Money / Payment)**: ONLY the receiver wallet number (with Copy), exact unique amount (with Copy + code note), and a concise 3-step transfer checklist are shown, with `Back` and `I Have Sent the Money` CTAs.
  - **When** on **Phase 3 (Verify)**: ONLY the 3 verification fields (`Sender Mobile Number`, `Amount Sent`, `TrxID`), an optional `Email for receipt & invoice` input, and the optional/required screenshot proof dropzone are shown. Redundant amount banners, receiver numbers, and stacked trust badges are NOT shown.
- **Given** a mobile viewport (360px–430px):
  - **Then** the 3-step navigation bar and countdown timer fit cleanly on a single header row without wrapping below step labels.
  - **And** the verified receipt card aligns every label and value cleanly on single rows (`Reference ID` truncates gracefully with copy/title, `Confirmed at` uses `whitespace-nowrap`).

### US-2: OrbitMail Confirmation & HTML Invoice Delivery
- **Given** a buyer provides a valid real email address (not empty and not `'buyer@orbitsaas.cloud'`) on a Public Payment Link, Embedded Checkout, Checkout Step 3, or Merchant API (`customer.email`):
  - **When** the buyer submits proof and status is `PENDING_VERIFICATION` or `MANUAL_REVIEW_REQUIRED`:
    - **Then** OrbitMail (`routeEmail` with `preferredProvider: 'orbitmail'`) sends a clean **Payment Submitted / Under Review** confirmation email asynchronously via `safeWaitUntil`.
  - **When** the payment transitions to `VERIFIED` via ANY path (instant 6-factor match in `verifyCheckoutPayment`, delayed/late SMS match in `ingestDeviceSmsBatch`, merchant/admin manual approval in `resolvePaymentIntent`, or typo-rescue match in `manualMatchTransaction`):
    - **Then** OrbitMail sends a **Payment Verified & Official Invoice** HTML email exactly once (guarded by an idempotency key in `routerKvStore`).
- **Given** the buyer reaches the `VERIFIED` screen (`PollingStatus.tsx`):
  - **Then** they see a subtle confirmation note if their email was provided (`Invoice sent to <email>`) and can also click **Print / Save Invoice** or **Copy Receipt**.

### US-3: Editorial Monochrome Luxury UI Across All Pages
- **Given** any page in the application (Public Payment Link, Hosted Checkout, Merchant Login, Merchant Portal tabs, Admin Auth Gate, and Admin Central Hub):
  - **Then** every page uses BoardUI semantic tokens (`theme.css`, `typography.css`), `cx()`, `@remixicon/react`, Apple HIG 44px touch targets on primary interactive controls, crisp tabular numbers (`.tnum`), concise scannable copy, and subtle `Transitions.dev` / `Bencho` CSS motion with `prefers-reduced-motion` support.
