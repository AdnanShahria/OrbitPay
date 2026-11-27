import { useState, useEffect } from 'react';
import { DeviceLiveBadge } from '@/features/device/DeviceLiveBadge';
import { AnalyticsOverview } from '@/features/transactions/AnalyticsOverview';
import { TransactionTable } from '@/features/transactions/TransactionTable';
import { WalletManager } from '@/features/wallets/WalletManager';
import { useWallets } from '@/features/wallets/useWallets';
import { useMerchant } from '@/features/merchants/useMerchant';
import {
  ConsolidatedSetupHub,
  type DemoVerifiedResult,
} from '@/features/merchants/ConsolidatedSetupHub';
import { OrdersManager } from '@/features/orders/OrdersManager';
import { PaymentIntentsManager } from '@/features/payments/PaymentIntentsManager';
import { PaymentLinksManager } from '@/features/payment-links/PaymentLinksManager';
import { PublicPaymentLinkPage } from '@/features/payment-links/PublicPaymentLinkPage';
import { AuthProvider, useAuth } from '@/features/auth/useAuth';
import { MerchantLoginScreen } from '@/features/auth/MerchantLoginScreen';
import { CheckoutModal } from '@/features/checkout/CheckoutModal';
import { CheckoutDisplayHeader } from '@/features/checkout/CheckoutDisplayHeader';
import { CheckoutStepper } from '@/features/checkout/CheckoutStepper';
import { PollingStatus } from '@/features/checkout/PollingStatus';
import { useCheckout, type CheckoutConfig } from '@/features/checkout/useCheckout';
import { Button } from '@/components/base/buttons/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/base/card/card';
import { Drawer, DrawerHeader, DrawerBody } from '@/components/base/drawer/drawer';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Spinner } from '@/components/base/spinner/spinner';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { OrbitFloatingWhatsapp, OrbitMarketingBar } from '@/features/platform/OrbitMarketingBar';
import { cx } from '@/utils/cx';
import { useRealtime } from '@/shared/hooks/useRealtime';
import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { formatBDT, MFS_METADATA } from '@/shared/utils/format';
import {
  RiLayoutGridLine,
  RiSmartphoneLine,
  RiSettings3Line,
  RiShoppingBag3Line,
  RiArrowDownSLine,
  RiStackLine,
  RiStore2Line,
  RiExternalLinkLine,
  RiFlashlightLine,
  RiLock2Line,
  RiMenuLine,
  RiShoppingCart2Line,
  RiLogoutBoxRLine,
  RiUser3Line,
  RiBankCardLine,
  RiLinksLine,
  RiShieldCheckLine,
} from '@remixicon/react';

export type PortalTab =
  | 'overview'
  | 'payments'
  | 'payment_links'
  | 'orders'
  | 'wallets'
  | 'setup';

const ALL_NAV_ITEMS: Array<{
  id: PortalTab;
  label: string;
  icon: typeof RiLayoutGridLine;
  requiresEcommerceModule?: boolean;
}> = [
  { id: 'overview', label: 'Overview', icon: RiLayoutGridLine },
  { id: 'payments', label: 'Universal Payments', icon: RiBankCardLine },
  { id: 'payment_links', label: 'Payment Links', icon: RiLinksLine },
  {
    id: 'orders',
    label: 'Orders & COD Sync',
    icon: RiShoppingCart2Line,
    requiresEcommerceModule: true,
  },
  { id: 'wallets', label: 'SIM Pool & Limits', icon: RiSmartphoneLine },
  { id: 'setup', label: 'Setup & Controls', icon: RiSettings3Line },
];

function extractHost(url?: string): string {
  if (!url) return 'orbit-storefront';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

function AppRouter() {
  const { merchant: authMerchant, isLoading: authLoading } = useAuth();

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const urlParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );

  // Public shareable Payment Link routes:
  // 1) /:merchantSlug/:slug (preferred: https://payment.orbitsaas.cloud/<merchant>/<slug>)
  // 2) /l/:slug (legacy backward compatibility)
  const RESERVED_SEGMENTS = new Set([
    'admin',
    'checkout',
    'l',
    'api',
    'assets',
    'health',
    'widget',
    'public',
    'auth',
    'static',
    'app',
  ]);
  const legacyLinkMatch = pathname.match(/^\/l\/([^/]+)\/?$/);
  const merchantLinkMatch = pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);
  const matchedMerchantSegment = merchantLinkMatch
    ? decodeURIComponent(merchantLinkMatch[1])
    : null;
  const matchedLinkSegment = merchantLinkMatch
    ? decodeURIComponent(merchantLinkMatch[2])
    : null;
  const isMerchantScopedLink =
    Boolean(matchedMerchantSegment && matchedLinkSegment) &&
    !RESERVED_SEGMENTS.has(matchedMerchantSegment!.toLowerCase()) &&
    !matchedMerchantSegment!.includes('.') &&
    !matchedLinkSegment!.includes('.');

  const publicLinkSlug = legacyLinkMatch
    ? decodeURIComponent(legacyLinkMatch[1])
    : isMerchantScopedLink
      ? matchedLinkSegment
      : null;
  const publicLinkMerchantSlug = isMerchantScopedLink
    ? matchedMerchantSegment || undefined
    : undefined;

  // First-class checkout session route (/checkout/:sessionId or ?sessionId=...)
  const sessionPathMatch = pathname.match(/^\/checkout\/([^/]+)\/?$/);
  const pathSessionId = sessionPathMatch ? decodeURIComponent(sessionPathMatch[1]) : '';
  const querySessionId = urlParams.get('sessionId') || '';
  const resolvedSessionId = pathSessionId || querySessionId || undefined;
  const resolvedSessionToken =
    urlParams.get('token') || urlParams.get('sessionToken') || undefined;
  const paramOrigin = urlParams.get('origin') || undefined;
  const paramTheme = urlParams.get('theme');

  const isEmbedded =
    urlParams.get('embedded') === 'true' ||
    window.location.hash === '#checkout' ||
    pathname.startsWith('/checkout');

  // Sync light/dark theme when embedded via ?theme=dark|light
  useEffect(() => {
    if (!isEmbedded || (paramTheme !== 'dark' && paramTheme !== 'light')) return;
    const root = document.documentElement;
    if (paramTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isEmbedded, paramTheme]);

  // Stealth Admin Mode detection (/admin or /#admin or ?admin=true)
  const checkIsAdmin = () =>
    window.location.pathname.startsWith('/admin') ||
    window.location.hash === '#admin' ||
    urlParams.get('admin') === 'true';

  const [isAdminMode, setIsAdminMode] = useState<boolean>(checkIsAdmin);

  const DEFAULT_MERCHANT_ID = 'mer_live_fb8eb757cceb7c35';
  const paramMerchantId = urlParams.get('merchantId') || '';
  const resolvedMerchantId = paramMerchantId || authMerchant?.id || DEFAULT_MERCHANT_ID;
  const paramOrderId = urlParams.get('orderId') || 'ORD-10492';
  const paramAmount = Number(urlParams.get('amount')) || 50;
  const paramStoreName =
    urlParams.get('storeName') || authMerchant?.storeName || 'ORBIT Secure Checkout';
  const paramCustomerEmail = urlParams.get('customerEmail') || undefined;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setIsAdminMode((prev) => {
          const next = !prev;
          window.history.pushState({}, '', next ? '/admin' : '/');
          return next;
        });
      }
    };

    const handlePopState = () => {
      setIsAdminMode(checkIsAdmin());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const enterAdminMode = () => {
    setIsAdminMode(true);
    window.history.pushState({}, '', '/admin');
  };

  // 1. Public Payment Link Route (/:merchantSlug/:slug or /l/:slug)
  if (publicLinkSlug) {
    return (
      <PublicPaymentLinkPage
        slug={publicLinkSlug}
        merchantSlug={publicLinkMerchantSlug}
      />
    );
  }

  // 2. Hidden Multi-Tenant Central Hub Admin Panel (/admin)
  if (isAdminMode) {
    return (
      <AdminDashboard
        onExit={() => {
          setIsAdminMode(false);
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

  // 3. Embedded / Standalone Checkout Mode — bypasses merchant login
  if (isEmbedded) {
    if (!resolvedSessionId && !paramMerchantId && authLoading) {
      return (
        <div className="min-h-screen bg-background-full flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" aria-label="Loading checkout session" className="text-text-primary" />
          <span className="text-body-regular text-text-secondary">
            Loading checkout session...
          </span>
        </div>
      );
    }

    return (
      <EmbeddedCheckoutView
        config={{
          sessionId: resolvedSessionId,
          sessionToken: resolvedSessionToken,
          merchantId: resolvedSessionId ? undefined : resolvedMerchantId,
          orderId: resolvedSessionId ? undefined : paramOrderId,
          amount: resolvedSessionId ? undefined : paramAmount,
          storeName: paramStoreName,
          customerEmail: paramCustomerEmail,
          parentOrigin: paramOrigin,
        }}
      />
    );
  }

  // 4. Authenticated Merchant Portal
  return <MerchantPortalGate onEnterAdmin={enterAdminMode} />;
}

function MerchantPortalGate({ onEnterAdmin }: { onEnterAdmin: () => void }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-full flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" aria-label="Verifying merchant session" className="text-text-primary" />
        <span className="text-body-regular text-text-secondary">
          Restoring merchant session...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <MerchantLoginScreen onEnterAdmin={onEnterAdmin} />;
  }

  return <AuthenticatedMerchantPortal onEnterAdmin={onEnterAdmin} />;
}

function AuthenticatedMerchantPortal({ onEnterAdmin }: { onEnterAdmin: () => void }) {
  const { user, merchant, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const merchantId = merchant!.id;
  const { data: merchantProfile } = useMerchant(merchantId);
  const storeName = merchantProfile?.storeName || merchant!.storeName;
  const storeHost = extractHost(merchantProfile?.webhookUrl || merchant!.webhookUrl);

  const ecommerceEnabled =
    merchantProfile?.enabledModules?.ecommerce_fulfillment !== false;

  const navItems = ALL_NAV_ITEMS.filter(
    (item) => !item.requiresEcommerceModule || ecommerceEnabled,
  );

  useEffect(() => {
    if (!ecommerceEnabled && activeTab === 'orders') {
      setActiveTab('payments');
    }
  }, [ecommerceEnabled, activeTab]);

  const { status: realtimeStatus, simulateTransaction } = useRealtime();
  const { data: wallets } = useWallets(merchantId);

  const [demoAmount, setDemoAmount] = useState(50);
  const [demoOrderId, setDemoOrderId] = useState('ORD-10492');
  const [demoCustomerEmail, setDemoCustomerEmail] = useState('');
  const [demoVerifiedResult, setDemoVerifiedResult] = useState<DemoVerifiedResult | null>(null);

  const handleSimulateSms = async () => {
    setIsSimulating(true);
    try {
      await simulateTransaction();
    } finally {
      setTimeout(() => setIsSimulating(false), 600);
    }
  };

  const handleEnterAdmin = () => {
    setIsMobileMenuOpen(false);
    onEnterAdmin();
  };

  const activeNavItem = navItems.find((item) => item.id === activeTab) ?? navItems[0];

  const renderNavList = (onSelect?: () => void) => (
    <nav className="space-y-1" aria-label="Portal sections">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActiveTab(item.id);
              onSelect?.();
            }}
            className={cx(
              'w-full h-9 px-3 rounded-2lg flex items-center gap-2.5 text-body-medium transition-colors cursor-pointer border',
              isActive
                ? 'bg-background-secondary-default text-text-primary border-border-button-default shadow-card'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-background-secondary-default/60',
            )}
          >
            <Icon
              className={cx(
                'size-4 shrink-0',
                isActive ? 'text-foreground-icon-primary' : 'text-foreground-icon-tertiary',
              )}
              aria-hidden
            />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  const renderUserAndFooterControls = (isDrawer = false) => (
    <div className={cx('space-y-3', !isDrawer && 'p-4 border-t border-separator-border')}>
      <div className="p-2.5 rounded-2xl bg-background-secondary-default border border-separator-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-7 rounded-lg bg-background-primary-default border border-border-button-default text-foreground-icon-primary flex items-center justify-center shrink-0">
            <RiUser3Line className="size-3.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <span className="text-caption-1-semibold text-text-primary block truncate">
              {user?.fullName || user?.email}
            </span>
            <span className="text-caption-2-medium text-text-tertiary block truncate">
              {user?.email}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          leadingIcon={RiLogoutBoxRLine}
          onClick={() => {
            setIsMobileMenuOpen(false);
            logout();
          }}
          aria-label="Sign out"
          title="Sign out"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <ThemeToggle appearance={isDrawer ? 'segmented' : 'sidebar-segmented'} size="small" />

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-caption-2-medium text-text-secondary">
            <StatusDot color="green" />
            <span>0% fee</span>
          </span>

          <Button
            variant="ghost"
            size="xs"
            iconOnly
            leadingIcon={RiLock2Line}
            onClick={handleEnterAdmin}
            aria-label="Central Hub Admin Access"
            title="Central Hub Admin Access (Ctrl+Alt+A)"
          />
        </div>
      </div>
    </div>
  );

  const overviewWallets = (wallets || []).slice(0, 3);

  return (
    <div className="min-h-screen bg-background-full flex flex-col md:flex-row antialiased">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex w-64 bg-background-primary-default border-e border-separator-border flex-col shrink-0">
        <div className="h-16 px-5 border-b border-separator-border flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              aria-hidden
              className="size-8 rounded-2lg bg-text-primary text-background-primary-default flex items-center justify-center shrink-0"
            >
              <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="7" />
                <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-body-medium text-text-primary truncate">
                ORBIT Pay Hub
              </span>
              <span className="text-caption-2-medium text-text-tertiary">
                v2.0.0-PROD
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-separator-border">
          <div className="p-2.5 rounded-2lg bg-background-secondary-default border border-border-button-default flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-7 rounded-lg bg-background-primary-default border border-border-button-default text-foreground-icon-primary flex items-center justify-center shrink-0">
                <RiStore2Line className="size-4" aria-hidden />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-caption-1-semibold text-text-primary truncate">
                  {storeName}
                </span>
                <span className="text-caption-2-medium text-text-tertiary truncate">
                  {storeHost}
                </span>
              </div>
            </div>
            <RiArrowDownSLine className="size-4 text-foreground-icon-tertiary shrink-0" aria-hidden />
          </div>
        </div>

        <div className="flex-1 p-3 overflow-y-auto">{renderNavList()}</div>

        {renderUserAndFooterControls(false)}
      </aside>

      {/* Mobile Navigation Drawer */}
      <Drawer
        isOpen={isMobileMenuOpen}
        onOpenChange={setIsMobileMenuOpen}
        placement="start"
        size="sm"
        aria-label="Navigation menu"
      >
        <DrawerHeader
          title="ORBIT Pay Hub"
          description={`${storeName} · ${storeHost}`}
        />
        <DrawerBody className="flex flex-col justify-between gap-6">
          {renderNavList(() => setIsMobileMenuOpen(false))}

          <div className="pt-4 border-t border-separator-border">
            {renderUserAndFooterControls(true)}
          </div>
        </DrawerBody>
      </Drawer>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 bg-background-primary-default/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background-primary-default/75 border-b border-separator-border px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <Button
              variant="ghost"
              size="small"
              iconOnly
              leadingIcon={RiMenuLine}
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden shrink-0"
            />
            <h1 className="text-title-3-semibold text-text-primary truncate">
              {activeNavItem.label}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background-secondary-default border border-border-button-default text-caption-2-medium text-text-secondary"
              title={
                realtimeStatus === 'connected'
                  ? 'Real-time Server-Sent Events (SSE) stream active'
                  : 'Connecting to real-time edge stream...'
              }
            >
              <StatusDot
                color={realtimeStatus === 'connected' ? 'green' : 'yellow'}
                className={realtimeStatus === 'connected' ? 'animate-pulse' : undefined}
              />
              <span className="hidden sm:inline">
                {realtimeStatus === 'connected' ? 'Realtime Live' : 'Connecting...'}
              </span>
            </div>

            <Button
              variant="secondary"
              size="small"
              onClick={handleSimulateSms}
              isLoading={isSimulating}
              leadingIcon={RiFlashlightLine}
              title="Simulate incoming MFS SMS transaction in real time"
            >
              <span className="hidden sm:inline">Simulate</span> SMS
            </Button>

            <DeviceLiveBadge merchantId={merchantId} showDetails={true} />

            <Button
              variant="primary"
              size="small"
              onClick={() => setIsDemoModalOpen(true)}
              leadingIcon={RiShoppingBag3Line}
            >
              Test Checkout
            </Button>
          </div>
        </header>

        <main className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <AnalyticsOverview merchantId={merchantId} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-title-3-semibold text-text-primary">
                      Recent verified &amp; unclaimed ledger
                    </h2>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => setActiveTab('setup')}
                      trailingIcon={RiExternalLinkLine}
                    >
                      View full ledger
                    </Button>
                  </div>
                  <TransactionTable />
                </div>

                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-headline-medium flex items-center gap-2">
                        <RiSmartphoneLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                        <span>Active SIM health</span>
                      </CardTitle>
                      <CardDescription>
                        Multi-SIM automated quota balancer status.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {overviewWallets.length === 0 ? (
                        <div className="p-3.5 rounded-2xl bg-background-secondary-default border border-dashed border-border-button-default text-caption-1-regular text-text-secondary">
                          No MFS SIM wallets configured yet. Add a bKash, Nagad, Rocket, Upay, or Cellfin number to start accepting payments.
                        </div>
                      ) : (
                        overviewWallets.map((w) => {
                          const meta = MFS_METADATA[w.provider];
                          return (
                            <div
                              key={w.id}
                              className="p-3.5 rounded-2xl bg-background-secondary-default border border-separator-border space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-body-medium">
                                <span className="text-text-primary">
                                  {w.isPrimary ? 'Primary' : 'Standby'} {meta?.name || w.provider} SIM
                                </span>
                                <Chip variant="caption" color={w.isActive ? 'lime' : 'neutral'}>
                                  {w.isActive ? 'Active' : 'Disabled'}
                                </Chip>
                              </div>
                              <span className="font-mono text-caption-1-regular text-text-secondary tabular-nums tnum block">
                                {w.walletNumber} ({formatBDT(w.currentMonthVolume)} / {formatBDT(w.monthlyVolumeLimit)})
                              </span>
                            </div>
                          );
                        })
                      )}

                      <Button
                        variant="secondary"
                        size="medium"
                        className="w-full"
                        onClick={() => setActiveTab('wallets')}
                      >
                        Manage SIM Pool
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-headline-medium flex items-center gap-2">
                        <RiStackLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                        <span>Companion daemon</span>
                      </CardTitle>
                      <CardDescription>
                        Foreground sticky listener status.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-caption-1-regular text-text-secondary space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span>Sync mode</span>
                          <span className="text-caption-1-semibold text-text-primary">FCM Push (Sub-second)</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>Battery optimization</span>
                          <Chip variant="caption" color="lime">Unrestricted</Chip>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span>Active shortcodes</span>
                          <span className="font-mono text-caption-1-medium text-text-primary tabular-nums">
                            16247, 16167, 16216
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="small"
                        className="w-full"
                        onClick={() => setActiveTab('setup')}
                      >
                        Open Setup &amp; Controls
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payments' && <PaymentIntentsManager />}

          {activeTab === 'payment_links' && <PaymentLinksManager />}

          {activeTab === 'orders' && ecommerceEnabled && <OrdersManager />}

          {activeTab === 'wallets' && <WalletManager />}

          {activeTab === 'setup' && (
            <ConsolidatedSetupHub
              merchantId={merchantId}
              storeName={storeName}
              demoAmount={demoAmount}
              onChangeDemoAmount={setDemoAmount}
              demoOrderId={demoOrderId}
              onChangeDemoOrderId={setDemoOrderId}
              demoCustomerEmail={demoCustomerEmail}
              onChangeDemoCustomerEmail={setDemoCustomerEmail}
              demoVerifiedResult={demoVerifiedResult}
              onLaunchDemoModal={() => setIsDemoModalOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Interactive Demo Checkout Modal */}
      {isDemoModalOpen && (
        <CheckoutModal
          isOpen={isDemoModalOpen}
          onClose={() => setIsDemoModalOpen(false)}
          config={{
            merchantId,
            orderId: demoOrderId,
            amount: demoAmount,
            customerEmail: demoCustomerEmail || undefined,
            storeName,
            onSuccess: (data) => {
              setDemoVerifiedResult(data);
              setIsDemoModalOpen(false);
            },
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Standalone Embedded Checkout Container for iframe / hosted URL
// -------------------------------------------------------------
function EmbeddedCheckoutView({ config }: { config: CheckoutConfig }) {
  const {
    currentStep,
    preferredStepperStep,
    selectedProvider,
    setSelectedProvider,
    activeWallet,
    activeWallets,
    senderNumber,
    setSenderNumber,
    paidAmount,
    setPaidAmount,
    trxId,
    setTrxId,
    customerEmail,
    setCustomerEmail,
    sessionToken,
    merchantId,
    orderId,
    storeName,
    vertical,
    baseAmount,
    uniqueAmount,
    offsetCents,
    expiresAt,
    graceExpiresAt,
    returnUrl,
    cancelUrl,
    verificationMode,
    receiptPolicy,
    deviceStatus,
    display,
    pollingStatus,
    escalationReason,
    submitAttempts,
    maxSubmitAttempts,
    receiptUrl,
    receiptUploadCount,
    receiptMaxUploads,
    isUploadingReceipt,
    receiptError,
    isSessionLoading,
    isSubmitting,
    errorMessage,
    verifiedData,
    uploadReceipt,
    submitPayment,
    editSubmission,
    markVerified,
    handlePollStateChange,
    emitClose,
  } = useCheckout(config);

  return (
    <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6 antialiased">
      <div className="w-full max-w-[460px] space-y-4">
        <Card variant="elevated" className="w-full">
          <CardContent className="p-6 space-y-5">
            <div className="pb-4 border-b border-separator-border">
              <CheckoutDisplayHeader
                storeName={storeName}
                orderId={orderId || config.orderId || ''}
                vertical={vertical}
                display={display}
                baseAmount={baseAmount}
                uniqueAmount={uniqueAmount}
                offsetCents={offsetCents}
                isSessionLoading={isSessionLoading}
              />
            </div>

            {currentStep === 'POLLING' || currentStep === 'SUCCESS' ? (
              <PollingStatus
                orderId={orderId || config.orderId || ''}
                expectedAmount={verifiedData?.amount ?? (baseAmount > 0 ? baseAmount : uniqueAmount)}
                provider={selectedProvider}
                trxId={verifiedData?.trxId || trxId}
                senderNumber={senderNumber}
                merchantId={merchantId}
                customerEmail={customerEmail}
                storeName={storeName}
                baseAmount={baseAmount}
                offsetCents={offsetCents}
                initialVerified={currentStep === 'SUCCESS'}
                initialMatchType={verifiedData?.matchType ?? null}
                initialStatus={pollingStatus}
                initialEscalationReason={escalationReason}
                receiptUrl={receiptUrl}
                returnUrl={returnUrl}
                cancelUrl={cancelUrl}
                graceExpiresAt={graceExpiresAt}
                submitAttempts={submitAttempts}
                maxSubmitAttempts={maxSubmitAttempts}
                onEditSubmission={editSubmission}
                onStatusChange={handlePollStateChange}
                onVerified={markVerified}
                onClose={emitClose}
              />
            ) : (
              <CheckoutStepper
                initialStep={preferredStepperStep}
                baseAmount={baseAmount}
                uniqueAmount={uniqueAmount}
                offsetCents={offsetCents}
                orderId={orderId || config.orderId || ''}
                expiresAt={expiresAt}
                selectedProvider={selectedProvider}
                onSelectProvider={setSelectedProvider}
                activeWallet={activeWallet}
                activeWallets={activeWallets}
                senderNumber={senderNumber}
                onChangeSenderNumber={setSenderNumber}
                paidAmount={paidAmount}
                onChangePaidAmount={setPaidAmount}
                trxId={trxId}
                onChangeTrxId={setTrxId}
                customerEmail={customerEmail}
                onChangeCustomerEmail={setCustomerEmail}
                verificationMode={verificationMode}
                receiptPolicy={receiptPolicy}
                deviceStatus={deviceStatus}
                sessionToken={sessionToken}
                receiptUrl={receiptUrl}
                receiptUploadCount={receiptUploadCount}
                receiptMaxUploads={receiptMaxUploads}
                isUploadingReceipt={isUploadingReceipt}
                receiptError={receiptError}
                onUploadReceipt={uploadReceipt}
                submitAttempts={submitAttempts}
                maxSubmitAttempts={maxSubmitAttempts}
                onSubmit={submitPayment}
                isSubmitting={isSubmitting}
                isSessionLoading={isSessionLoading}
                errorMessage={errorMessage}
              />
            )}

            <div className="pt-4 border-t border-separator-border flex items-center justify-center text-caption-2-medium text-text-tertiary">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <RiShieldCheckLine className="size-3.5 text-status-lime-text shrink-0" aria-hidden />
                <span>ORBIT Pay Hub · 0% gateway fee</span>
              </span>
            </div>
          </CardContent>
        </Card>

        <OrbitMarketingBar compact />
      </div>
      <OrbitFloatingWhatsapp />
    </div>
  );
}

export default App;
