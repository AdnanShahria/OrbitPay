# Tasks: White + Premium Black Themes & BoardUI / Apple HIG Fusion

- [x] **T1**: Configure BoardUI theme tokens (Porcelain White + Obsidian Black), typography, `globals.css`, `index.html`, `main.tsx`, `Button` (`isLoading` + semantic foreground), `Card`, and `format.ts` (clean MFS metadata).
- [x] **T2**: Refactor `frontend/src/App.tsx` (Portal Shell, Sidebar, Mobile Drawer, Liquid Glass Sticky Header, ThemeToggle, Checkout Playground, EmbeddedCheckoutView) + `features/checkout/` (`CheckoutModal`, `CheckoutStepper`, `PollingStatus`).
- [x] **T3**: Refactor `frontend/src/features/transactions/`, `wallets/`, `device/`, `merchants/` onto BoardUI components (`StatCards`, `Table`, `SearchField`, `Select`, `Meter`, `Switch`, `Modal`, `Chip`, `toast`, `@remixicon/react`).
- [x] **T4**: Refactor `frontend/src/features/admin/` (`AdminDashboard`, `AdminAuthGate`, `AdminOverviewCards`, `ProjectManagerTable`, `GlobalQueueTable`, `GlobalWebhookTable`, `AddProjectModal`) onto BoardUI components + White/Black `ThemeToggle`.
- [x] **T5**: Refactor Android Companion App (`Color.kt`, `Theme.kt`, `Type.kt`, `PreferencesManager.kt`, `MainViewModel.kt`, `MainActivity.kt`, `DashboardScreen.kt`, `OnboardingScreen.kt`, `SettingsScreen.kt`) for White (default) + Premium Black themes and Apple HIG card craft.
- [x] **T6**: Verify build (`cd frontend && npm run build` & root `npm run build`), remove unused legacy lookalikes in `src/shared/components/`, re-index `codebase-memory-mcp`, and update context docs.
