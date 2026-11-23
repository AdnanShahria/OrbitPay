# Plan: White + Premium Black Themes & BoardUI / Apple HIG Fusion

## 1. Foundation & Theme System (`frontend/src/styles/` & `frontend/index.html`)
- Update `frontend/index.html` to initialize `boardui:theme` defaulting to `'light'` (White Theme), remove dark-by-default class logic, and ensure Inter + JetBrains Mono Google Fonts map to `--font-inter` and `--font-mono-source`.
- Update `frontend/src/styles/theme.css` and `frontend/src/styles/globals.css`:
  - Retarget `--color-accent-50..950` to achromatic Obsidian/Graphite (`#FAFAFA` -> `#09090B`) so no indigo/blue slop remains.
  - Define White Theme (`:root`) and Premium Black Theme (`.dark`) semantic tokens (`background-full`, `background-primary-default`, `background-inner-default`, `background-secondary-default`, `border-button-default`, `separator-border`, `text-primary/secondary/tertiary`, `shadow-card`).
  - Define `--color-button-primary-foreground` (`#FFFFFF` in `:root`, `#09090B` in `.dark`) and `--gradient-button-primary-*` for crisp Obsidian-on-White and OffWhite-on-Obsidian primary CTAs.
  - Wire `DirectionProvider`, `Toaster`, and `@/styles/globals.css` in `frontend/src/main.tsx`.
- Update `frontend/src/components/base/buttons/button.tsx` (add `isLoading` spinner support + `text-button-primary-foreground` token) and create `frontend/src/components/base/card/card.tsx` (BoardUI `rounded-3xl`, `border-border-button-default`, `bg-background-primary-default`, `shadow-card`).
- Remove `dark:` raw color classes and unslop `stat-cards.tsx`, `pill-tab.tsx`, `tabs.tsx` if needed to ensure clean monochrome active states.

## 2. Web Portal, Features & Checkout Refactor (`frontend/src/`)
- **Shell (`App.tsx`)**: BoardUI desktop sidebar + mobile `Drawer` navigation, floating sticky Liquid Glass top header (`bg-background-primary-default/80 backdrop-blur-xl`), official `ThemeToggle` (`appearance="sidebar-segmented"`), `@remixicon/react` icons, sentence-case headings, clean EmbeddedCheckoutView.
- **Transactions & Overview (`features/transactions/`)**: Refactor `AnalyticsOverview.tsx` onto BoardUI `StatCards`, `TransactionTable.tsx` onto BoardUI `SearchField`, `PillTabList`/`PillTab`, `Select`, `Table`, `Chip`, `Button`, `toast`, and `UnclaimedModal.tsx` onto BoardUI `Modal`, `Input`, `Button`, `Chip`.
- **Wallets & Limits (`features/wallets/`)**: Refactor `WalletManager.tsx`, `VolumeProgressBar.tsx` (using BoardUI `Meter`), and `AddWalletDialog.tsx` (using BoardUI `Modal`, `Input`, `Select`, `Switch`, `Button`).
- **Device, Settings & Checkout (`features/device/`, `features/merchants/`, `features/checkout/`)**: Refactor onto BoardUI `Card`, `Button`, `Input`, `Select`, `Modal`, `ProgressBar`, `Spinner`, `Chip`, `toast`.
- **Admin Central Hub (`features/admin/`)**: Refactor `AdminDashboard.tsx`, `AdminAuthGate.tsx`, `AdminOverviewCards.tsx`, `ProjectManagerTable.tsx`, `GlobalQueueTable.tsx`, `GlobalWebhookTable.tsx`, `AddProjectModal.tsx` onto BoardUI components + `ThemeToggle` in admin header.

## 3. Android Companion App (`app/app/src/main/java/com/orbitsaas/payment/`)
- `ui/theme/Color.kt` & `Theme.kt`: Porcelain White & Obsidian Black color schemes with high-contrast monochrome primary buttons and MFS brand colors strictly for provider badges.
- `data/local/PreferencesManager.kt` & `ui/viewmodel/MainViewModel.kt` & `MainActivity.kt`: Persist `isDarkTheme` (default `false` = White Theme) and pass `darkTheme` + `onToggleTheme` to `OrbitPaymentTheme` and screens.
- `ui/DashboardScreen.kt`, `ui/OnboardingScreen.kt`, `ui/SettingsScreen.kt`, `ui/theme/Type.kt`: Replace hardcoded dark/blue colors with `MaterialTheme.colorScheme.*`, refine `RoundedCornerShape(20.dp)` cards, tabular numbers (`tnum`), 48dp touch targets, and add a theme switch in Settings + quick toggle in Dashboard TopAppBar.

## 4. Verification & Context Update
- Run `npm run build` (`tsc && vite build`) in `frontend/` and root `npm run build` / TypeScript checks.
- Re-index `codebase-memory-mcp` and check for zero dangling references or unused imports.
- Update `context/component.md` and `context/activity_log.md` if applicable.
