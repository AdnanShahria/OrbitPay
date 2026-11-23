# Spec: White + Premium Black Themes, BoardUI Components, Apple HIG & Unslop Redesign

## Overview
Unify the ORBIT Payment Hub visual system across both the React 19 Web Frontend (`frontend/`) and Android Jetpack Compose Companion App (`app/`) under two deliberate, non-AI-slop themes:
- **White Theme (Default)**: Crisp gallery-paper ground (`#FAFAFA`), pure `#FFFFFF` BoardUI `rounded-3xl` cards with 1px `#E4E4E7` hairlines and subtle contact shadows, obsidian `#09090B` primary actions, and accessible `#09090B` / `#52525B` / `#71717A` ink hierarchy.
- **Premium Black Theme**: True obsidian OLED ground (`#050506`), stepped charcoal surfaces (`#0D0D0F` cards, `#141417` inner trays), 8-10% white hairlines with subtle top rim highlight, Apple softened off-white `#F5F5F7` primary text, and high-contrast `#F5F5F7` primary actions with dark ink.

## Acceptance Criteria (Given / When / Then)
1. **Default White Theme & 2-Way Switcher**:
   - **Given** a fresh browser session with no stored theme preference, **When** the Merchant Portal, Admin Hub (`/admin`), or Embedded Checkout (`/checkout`) loads, **Then** the White Theme renders by default without dark flash.
   - **Given** the user clicks the BoardUI `ThemeToggle` in the Merchant Portal sidebar or Admin Hub header, **When** switching between White and Premium Black, **Then** the theme transitions cleanly via click-origin reveal, persists across page reloads and routes (`boardui:theme`), and updates `<html class="dark">` and `color-scheme`.
2. **Official BoardUI Component Adoption**:
   - **Given** any UI screen in `frontend/src/` (`App.tsx`, `transactions/`, `wallets/`, `device/`, `merchants/`, `checkout/`, `admin/`), **When** inspecting its imports and JSX, **Then** all buttons, inputs, search fields, selects, modals, drawers, tabs, tables, switches, meters, chips, stat cards, and toasts use installed BoardUI components (`@/components/base/*`, `@/components/application/*`, `@remixicon/react`), `cx()` from `@/utils/cx`, semantic CSS tokens only (no raw palette classes or `dark:` overrides), and BoardUI composite typography classes.
3. **Apple HIG & Unslop Craft**:
   - **Given** every web and mobile screen, **When** auditing visual craft and accessibility, **Then** there are zero indigo/violet gradients, zero neon glows, zero uppercase wide-tracked labels, zero exclamation marks, 4px-grid spacing, `tabular-nums` on all monetary figures, >= 4.5:1 text contrast, 44px touch targets on mobile controls, and Liquid Glass blur restricted strictly to floating functional layers (sticky headers, modals, mobile drawer).
4. **Android Companion App Parity**:
   - **Given** the Android Compose app (`app/`), **When** launching or toggling theme in Settings / TopAppBar, **Then** the app defaults to the White Theme, supports switching to the Premium Black Theme (`PreferencesManager`), and every screen (`DashboardScreen`, `OnboardingScreen`, `SettingsScreen`) uses `MaterialTheme.colorScheme` tokens rather than hardcoded dark/blue constants.
