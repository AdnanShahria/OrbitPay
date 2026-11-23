import { useState, useEffect } from 'react';
import { DeviceLiveBadge } from '@/features/device/DeviceLiveBadge';
import { DevicePairingQR } from '@/features/device/DevicePairingQR';
import { AnalyticsOverview } from '@/features/transactions/AnalyticsOverview';
import { TransactionTable } from '@/features/transactions/TransactionTable';
import { WalletManager } from '@/features/wallets/WalletManager';
import { useWallets } from '@/features/wallets/useWallets';
import { MerchantSettings } from '@/features/merchants/MerchantSettings';
import { IntegrationGuide } from '@/features/merchants/IntegrationGuide';
import { OrdersManager } from '@/features/orders/OrdersManager';
import { AuthProvider, useAuth } from '@/features/auth/useAuth';
import { MerchantLoginScreen } from '@/features/auth/MerchantLoginScreen';
import { CheckoutModal } from '@/features/checkout/CheckoutModal';
import { CheckoutStepper } from '@/features/checkout/CheckoutStepper';
import { PollingStatus } from '@/features/checkout/PollingStatus';
import { useCheckout } from '@/features/checkout/useCheckout';
import { Button } from '@/components/base/buttons/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/base/card/card';
import { Input } from '@/components/base/input/input';
import { Drawer, DrawerHeader, DrawerBody } from '@/components/base/drawer/drawer';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Spinner } from '@/components/base/spinner/spinner';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { useRealtime } from '@/shared/hooks/useRealtime';
import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { formatBDT, MFS_METADATA } from '@/shared/utils/format';
import {
  RiLayoutGridLine,
  RiSmartphoneLine,
  RiFileList3Line,
  RiQrCodeLine,
  RiSettings3Line,
  RiShoppingBag3Line,
  RiArrowDownSLine,
  RiStackLine,
  RiStore2Line,
  RiExternalLinkLine,
  RiFlashlightLine,
  RiLock2Line,
  RiMenuLine,
  RiFileCopyLine,
  RiShoppingCart2Line,
  RiCodeSSlashLine,
  RiLogoutBoxRLine,
  RiUser3Line,
} from '@remixicon/react';

export type PortalTab =
  | 'overview'
  | 'orders'
  | 'wallets'
  | 'transactions'
  | 'device'
  | 'settings'
  | 'integration'
  | 'checkout_demo';

const NAV_ITEMS: Array<{
  id: PortalTab;
  label: string;
  icon: typeof RiLayoutGridLine;
}> = [
  { id: 'overview', label: 'Overview', icon: RiLayoutGridLine },
  { id: 'orders', label: 'Orders & COD Sync', icon: RiShoppingCart2Line },
  { id: 'wallets', label: 'SIM Pool & Limits', icon: RiSmartphoneLine },
  { id: 'transactions', label: 'Transactions & Typo', icon: RiFileList3Line },
  { id: 'device', label: 'Device Pairing QR', icon: RiQrCodeLine },
  { id: 'settings', label: 'Storefront & Webhook', icon: RiSettings3Line },
  { id: 'integration', label: 'Integration Guide', icon: RiCodeSSlashLine },
  { id: 'checkout_demo', label: 'Checkout Widget Demo', icon: RiShoppingBag3Line },
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
  // Check URL query and hash for standalone / embedded checkout mode
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded =
    urlParams.get('embedded') === 'true' ||
    window.location.hash === '#checkout' ||
    window.location.pathname.startsWith('/checkout');

  // Stealth Admin Mode detection (/admin or /#admin or ?admin=true)
  const checkIsAdmin = () =>
    window.location.pathname.startsWith('/admin') ||
    window.location.hash === '#admin' ||
    urlParams.get('admin') === 'true';

  const [isAdminMode, setIsAdminMode] = useState<boolean>(checkIsAdmin);

  // Read URL parameters if provided for embedded checkout
  const paramMerchantId = urlParams.get('merchantId') || '';
  const paramOrderId = urlParams.get('orderId') || 'ORD-10492';
  const paramAmount = Number(urlParams.get('amount')) || 50;
  const paramStoreName = urlParams.get('storeName') || 'ORBIT Secure Checkout';
  const paramCustomerEmail = urlParams.get('customerEmail') || 'customer@example.com';

  // Listen for Ctrl+Alt+A stealth hotkey and URL changes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setIsAdminMode((prev) => {
          const next = !prev;
          if (next) {
            window.history.pushState({}, '', '/admin');
          } else {
            window.history.pushState({}, '', '/');
          }
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

  // 1. Hidden Multi-Tenant Central Hub Admin Panel (/admin) — bypasses merchant login
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

  // 2. Embedded / Standalone Checkout Mode — bypasses merchant login so buyers can pay
  if (isEmbedded) {
    return (
      <EmbeddedCheckoutView
        config={{
          merchantId: paramMerchantId,
          orderId: paramOrderId,
          amount: paramAmount,
          storeName: paramStoreName,
          customerEmail: paramCustomerEmail,
          onSuccess: (data) => {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ event: 'payment.verified', ...data }, '*');
            }
          },
          onClose: () => {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ event: 'checkout.close', orderId: paramOrderId }, '*');
            }
          },
        }}
      />
    );
  }

  // 3. Authenticated Merchant Portal
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
  const storeName = merchant!.storeName;
  const storeHost = extractHost(merchant!.webhookUrl);

  const { status: realtimeStatus, simulateTransaction } = useRealtime();
  const { data: wallets } = useWallets(merchantId);

  // Demo Checkout Config State
  const [demoAmount, setDemoAmount] = useState(50);
  const [demoOrderId, setDemoOrderId] = useState('ORD-10492');
  const [demoCustomerEmail, setDemoCustomerEmail] = useState('buyer@example.com');
  const [demoVerifiedResult, setDemoVerifiedResult] = useState<{
    orderId: string;
    trxId: string;
    amount: number;
    matchType?: string | null;
  } | null>(null);

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

  const activeNavItem = NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0];

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://payment.orbitsaas.cloud';

  const embedSnippet = `<!-- 1. Include ORBIT Widget Script -->
<script src="${origin}/widget.js"></script>

<!-- 2. Trigger Checkout on Place Order Button -->
<script>
  function launchOrbitPay() {
    OrbitPay.open({
      merchantId: "${merchantId}",
      orderId: "${demoOrderId}",
      amount: ${demoAmount},
      customerEmail: "${demoCustomerEmail}",
      storeName: "${storeName}",
      onSuccess: function(data) {
        window.location.href = "/order-confirmed?id=" + data.orderId + "&trxId=" + data.trxId;
      }
    });
  }
</script>`;

  const renderNavList = (onSelect?: () => void) => (
    <nav className="space-y-1" aria-label="Portal sections">
      {NAV_ITEMS.map((item) => {
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
      {/* Active Authenticated User Badge + Logout */}
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
        {/* Brand Header */}
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
                v1.0.0-PROD
              </span>
            </div>
          </div>
        </div>

        {/* Store Profile Selector Row */}
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

        {/* Navigation Items */}
        <div className="flex-1 p-3 overflow-y-auto">{renderNavList()}</div>

        {/* Footer Controls */}
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
        {/* Top Header Bar (Liquid Glass functional layer) */}
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
            {/* Realtime Live SSE Indicator */}
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

            {/* Quick 1-Click Realtime Transaction Simulator */}
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

        {/* Page Content Body */}
        <main className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <AnalyticsOverview merchantId={merchantId} />

              {/* Quick SIM status & Recent Ledger */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-title-3-semibold text-text-primary">
                      Recent verified &amp; unclaimed ledger
                    </h2>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => setActiveTab('transactions')}
                      trailingIcon={RiExternalLinkLine}
                    >
                      View full ledger
                    </Button>
                  </div>
                  <TransactionTable />
                </div>

                <div className="space-y-6">
                  {/* SIM limits widget summary (real backend data) */}
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

                  {/* Device Sync Info */}
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
                        onClick={() => setActiveTab('device')}
                      >
                        Device Pairing Instructions
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ORDERS & COD SYNC */}
          {activeTab === 'orders' && <OrdersManager />}

          {/* TAB 3: WALLETS */}
          {activeTab === 'wallets' && <WalletManager />}

          {/* TAB 4: TRANSACTIONS */}
          {activeTab === 'transactions' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-title-2-medium text-text-primary">
                  SMS Transaction Ledger &amp; Typo Resolver
                </h2>
                <p className="text-body-regular text-text-secondary mt-1">
                  All captured MFS alerts from your Android companion phone. Click &quot;Rescue Typo&quot; to manually bind customer orders.
                </p>
              </div>
              <TransactionTable />
            </div>
          )}

          {/* TAB 5: DEVICE PAIRING */}
          {activeTab === 'device' && <DevicePairingQR merchantId={merchantId} />}

          {/* TAB 6: SETTINGS */}
          {activeTab === 'settings' && <MerchantSettings />}

          {/* TAB 7: INTEGRATION GUIDE */}
          {activeTab === 'integration' && <IntegrationGuide />}

          {/* TAB 8: CHECKOUT DEMO */}
          {activeTab === 'checkout_demo' && (
            <Card>
              <CardHeader>
                <CardTitle>Interactive Standalone &amp; Embed Checkout Playground</CardTitle>
                <CardDescription>
                  Test the exact buyer experience your customers see when checking out on {storeName}, including automatic positive poisha (.01, .02) allocation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Simulated Order Amount (BDT)"
                    type="number"
                    value={String(demoAmount)}
                    onChange={(val) => setDemoAmount(Number(val) || 0)}
                    inputClassName="font-mono tabular-nums tnum"
                  />
                  <Input
                    label="Simulated Order ID"
                    value={demoOrderId}
                    onChange={setDemoOrderId}
                    inputClassName="font-mono"
                  />
                  <Input
                    label="Customer Email"
                    type="email"
                    value={demoCustomerEmail}
                    onChange={setDemoCustomerEmail}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="medium"
                    onClick={() => setIsDemoModalOpen(true)}
                    leadingIcon={RiShoppingBag3Line}
                  >
                    Launch Modal Checkout
                  </Button>
                </div>

                {demoVerifiedResult && (
                  <div className="p-4 rounded-2xl bg-notification-success-background border border-separator-border text-notification-success-foreground space-y-1">
                    <span className="text-body-medium block">Demo payment verified</span>
                    <p className="text-caption-1-regular">
                      Order #{demoVerifiedResult.orderId} was matched with TrxID{' '}
                      <span className="font-mono">{demoVerifiedResult.trxId}</span> for{' '}
                      <span className="font-mono tabular-nums tnum">
                        {formatBDT(demoVerifiedResult.amount)}
                      </span>
                      {demoVerifiedResult.matchType ? ` (${demoVerifiedResult.matchType})` : ''}. Webhook dispatched to client store.
                    </p>
                  </div>
                )}

                {/* HTML Script Embed Code Snippet */}
                <div className="space-y-2.5 pt-4 border-t border-separator-border">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-body-medium text-text-primary">
                      Storefront Script Embed Code
                    </h3>
                    <Button
                      variant="secondary"
                      size="xs"
                      leadingIcon={RiFileCopyLine}
                      onClick={() => {
                        navigator.clipboard.writeText(embedSnippet);
                        toast.success('Embed snippet copied to clipboard');
                      }}
                    >
                      Copy snippet
                    </Button>
                  </div>
                  <pre className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-default text-text-primary font-mono text-caption-1-regular overflow-x-auto select-all leading-relaxed">
                    {embedSnippet}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {/* Interactive Demo Checkout Modal */}
      <CheckoutModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        config={{
          merchantId,
          orderId: demoOrderId,
          amount: demoAmount,
          customerEmail: demoCustomerEmail,
          storeName,
          onSuccess: (data) => {
            setDemoVerifiedResult(data);
            setIsDemoModalOpen(false);
          },
        }}
      />
    </div>
  );
}

// -------------------------------------------------------------
// Standalone Embedded Checkout Container for iframe embed
// -------------------------------------------------------------
function EmbeddedCheckoutView({
  config,
}: {
  config: {
    merchantId: string;
    orderId: string;
    amount: number;
    storeName?: string;
    customerEmail?: string;
    onSuccess: (data: { orderId: string; trxId: string; amount: number; matchType?: string | null }) => void;
    onClose: () => void;
  };
}) {
  const {
    currentStep,
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
    baseAmount,
    uniqueAmount,
    offsetCents,
    isSessionLoading,
    isSubmitting,
    errorMessage,
    verifiedData,
    submitPayment,
    markVerified,
  } = useCheckout(config);

  return (
    <div className="min-h-screen bg-background-full flex items-center justify-center p-4">
      <Card variant="elevated" className="w-full max-w-lg">
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-separator-border">
            <div className="min-w-0">
              <h2 className="text-title-3-semibold text-text-primary truncate">
                {config.storeName || 'ORBIT Secure Checkout'}
              </h2>
              <span className="text-caption-2-medium text-text-tertiary font-mono">
                Order #{config.orderId}
              </span>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="text-title-2-medium text-text-primary font-mono tabular-nums tnum">
                {formatBDT(uniqueAmount)}
              </span>
              {offsetCents > 0 && (
                <span className="text-caption-2-medium text-text-tertiary tabular-nums">
                  Base {formatBDT(baseAmount)} + {formatBDT(offsetCents / 100)} code
                </span>
              )}
            </div>
          </div>

          {currentStep === 'POLLING' || currentStep === 'SUCCESS' ? (
            <PollingStatus
              orderId={config.orderId}
              expectedAmount={verifiedData?.amount ?? (Number(paidAmount) || uniqueAmount)}
              provider={selectedProvider}
              trxId={verifiedData?.trxId || trxId}
              senderNumber={senderNumber}
              merchantId={config.merchantId}
              initialVerified={currentStep === 'SUCCESS'}
              initialMatchType={verifiedData?.matchType ?? null}
              onVerified={markVerified}
              onClose={config.onClose}
            />
          ) : (
            <CheckoutStepper
              baseAmount={baseAmount}
              uniqueAmount={uniqueAmount}
              offsetCents={offsetCents}
              orderId={config.orderId}
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
              onSubmit={submitPayment}
              isSubmitting={isSubmitting}
              isSessionLoading={isSessionLoading}
              errorMessage={errorMessage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
