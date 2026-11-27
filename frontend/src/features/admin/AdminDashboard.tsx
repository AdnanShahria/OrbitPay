import { useState } from 'react';
import {
  RiArrowLeftLine,
  RiBarChartBoxLine,
  RiErrorWarningLine,
  RiFlashlightLine,
  RiLogoutBoxRLine,
  RiMessage2Line,
  RiRadioButtonLine,
  RiShieldCheckLine,
  RiShieldKeyholeLine,
  RiSmartphoneLine,
  RiSparklingLine,
  RiStore2Line,
  RiTimeLine,
  RiWebhookLine,
} from '@remixicon/react';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Button } from '@/components/base/buttons/button';
import { Spinner } from '@/components/base/spinner/spinner';
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs';
import { toast } from '@/components/base/toast/toast';
import { useRealtime } from '@/shared/hooks/useRealtime';
import { AdminAuthGate } from './AdminAuthGate';
import { AdminOverviewCards } from './AdminOverviewCards';
import { AdminSecurityPanel } from './AdminSecurityPanel';
import { AppReleasesPanel } from './AppReleasesPanel';
import { GlobalQueueTable } from './GlobalQueueTable';
import { GlobalWebhookTable } from './GlobalWebhookTable';
import { ProjectManagerTable } from './ProjectManagerTable';
import { SmsPushPanel } from './SmsPushPanel';
import { AdminPlatformSettingsPanel } from './AdminPlatformSettingsPanel';
import {
  type AdminAuthSessionInfo,
  type AdminUserProfile,
  useAdminAuth,
  useAdminOverview,
  useAdminProjects,
  useAdminQueue,
  useAdminReleases,
  useAdminSystemHealth,
  useAdminWebhooks,
  useEnsureAdminSchemaMutation,
} from './useAdmin';

export type AdminTab =
  | 'projects'
  | 'telemetry'
  | 'webhooks'
  | 'queue'
  | 'messaging'
  | 'releases'
  | 'growth'
  | 'security';

interface AdminDashboardProps {
  onExit: () => void;
}

export function AdminDashboard({ onExit }: AdminDashboardProps) {
  const {
    admin,
    session,
    hasAdminUsers,
    isAuthenticated,
    isVerifying,
    isLoggingOut,
    loginWithPassword,
    loginWithMasterKey,
    logout,
    logoutAll,
    refreshAuth,
  } = useAdminAuth();

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-background-full flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" aria-label="Verifying admin session" className="text-text-primary" />
        <span className="text-body-regular text-text-secondary">
          Verifying admin session...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AdminAuthGate
        onLoginPassword={loginWithPassword}
        onLoginMasterKey={loginWithMasterKey}
        onExit={onExit}
      />
    );
  }

  return (
    <AdminDashboardContent
      admin={admin}
      session={session}
      hasAdminUsers={hasAdminUsers}
      isLoggingOut={isLoggingOut}
      onLogout={logout}
      onLogoutAll={logoutAll}
      onRefreshAuth={refreshAuth}
      onExit={onExit}
    />
  );
}

function AdminDashboardContent({
  admin,
  session,
  hasAdminUsers,
  isLoggingOut,
  onLogout,
  onLogoutAll,
  onRefreshAuth,
  onExit,
}: {
  admin: AdminUserProfile | null;
  session: AdminAuthSessionInfo | null;
  hasAdminUsers: boolean | null;
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
  onLogoutAll: () => Promise<void>;
  onRefreshAuth: () => Promise<boolean>;
  onExit: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>('projects');
  const [isSimulating, setIsSimulating] = useState(false);

  const { status: realtimeStatus, simulateTransaction } = useRealtime({
    mode: 'admin',
    enabled: true,
  });

  const { data: stats, isLoading: statsLoading } = useAdminOverview(true);
  const { data: projects, isLoading: projectsLoading } = useAdminProjects(true);
  const { data: webhooks, isLoading: webhooksLoading } = useAdminWebhooks(true);
  const { data: queue, isLoading: queueLoading } = useAdminQueue(true);
  const { data: releasesData } = useAdminReleases(true);
  const { data: systemHealth, isLoading: healthLoading } = useAdminSystemHealth(true);
  const ensureSchemaMutation = useEnsureAdminSchemaMutation();

  const simulatorEnabled = Boolean(systemHealth?.simulatorEnabled);
  const hasMissingTables = Boolean(
    systemHealth && (!systemHealth.schemaHealthy || systemHealth.missingTables.length > 0),
  );
  const hasMissingR2 = Boolean(systemHealth && !systemHealth.r2Configured);

  const handleSimulateGlobal = async () => {
    setIsSimulating(true);
    try {
      const result = await simulateTransaction();
      if (result) {
        toast.success('Simulated MFS SMS transaction dispatched');
      } else {
        toast.error('Failed to simulate transaction influx');
      }
    } finally {
      setTimeout(() => setIsSimulating(false), 600);
    }
  };

  const handleQuickRepairSchema = async () => {
    try {
      await ensureSchemaMutation.mutateAsync();
      toast.success('D1 schema verified and repaired');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Schema repair failed');
    }
  };

  const identityRoleLabel =
    admin?.role && admin.role !== 'MASTER_ADMIN' ? admin.role : 'Master Key';
  const identityEmail =
    admin?.email && admin.email !== 'Master Security Key' ? admin.email : null;

  return (
    <div className="min-h-screen bg-background-full flex flex-col font-sans antialiased">
      {/* Top Admin Command Header — Liquid Glass restricted to floating sticky bar */}
      <header className="sticky top-0 z-30 h-16 border-b border-separator-border bg-background-primary-default/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary flex items-center justify-center shrink-0">
            <RiShieldCheckLine className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-headline-semibold text-text-primary truncate">
                ORBIT Central Hub
              </h1>
              <Chip variant="caption" color="rose">
                {identityRoleLabel}
              </Chip>
              {identityEmail && (
                <span className="hidden lg:inline text-caption-1-regular text-text-secondary truncate max-w-48">
                  {identityEmail}
                </span>
              )}
            </div>
            <p className="text-caption-1-regular text-text-tertiary hidden sm:block truncate">
              Multi-tenant orchestration &amp; fleet monitor
            </p>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Realtime Live Pulse */}
          <div
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border-button-default bg-background-primary-default text-caption-1-medium text-text-secondary"
            title={
              realtimeStatus === 'connected'
                ? 'Real-time Server-Sent Events stream active'
                : 'Connecting to real-time edge stream'
            }
          >
            <StatusDot color={realtimeStatus === 'connected' ? 'green' : 'yellow'} />
            <RiRadioButtonLine className="size-3.5 text-foreground-icon-secondary" aria-hidden />
            <span className="hidden md:inline">
              {realtimeStatus === 'connected' ? 'SSE live' : 'Connecting'}
            </span>
          </div>

          <ThemeToggle appearance="segmented" size="small" />

          {/* Quick Realtime Simulator (only when enabled by environment) */}
          {simulatorEnabled && (
            <Button
              variant="secondary"
              size="small"
              onClick={handleSimulateGlobal}
              isLoading={isSimulating}
              leadingIcon={RiFlashlightLine}
              title="Simulate incoming MFS SMS transaction across connected storefronts"
            >
              <span className="hidden sm:inline">Simulate</span> Influx
            </Button>
          )}

          {/* Server-Side Logout */}
          <Button
            variant="ghost"
            size="small"
            onClick={() => void onLogout()}
            isLoading={isLoggingOut}
            leadingIcon={RiLogoutBoxRLine}
            title="Logout & revoke current admin session"
          >
            Logout
          </Button>

          {/* Exit Back to Storefront Portal */}
          <Button
            variant="secondary"
            size="small"
            onClick={onExit}
            leadingIcon={RiArrowLeftLine}
          >
            Exit Admin
          </Button>
        </div>
      </header>

      {/* Main Admin Workspace Area */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
        {(hasMissingTables || hasMissingR2) && (
          <div
            role="status"
            className="rounded-2xl border border-separator-border bg-status-yellow-background px-4 py-3 text-status-yellow-text flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start sm:items-center gap-2.5">
              <RiErrorWarningLine className="size-5 shrink-0 mt-0.5 sm:mt-0" aria-hidden />
              <div className="text-caption-1-medium space-y-0.5">
                {hasMissingTables && (
                  <p>
                    Missing Cloudflare D1 schema tables detected:{' '}
                    <span className="font-mono">
                      {systemHealth?.missingTables.join(', ')}
                    </span>
                  </p>
                )}
                {hasMissingR2 && (
                  <p>
                    Cloudflare R2 storage binding (<span className="font-mono">R2_BUCKET</span>) is not configured — APK uploads are unavailable.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasMissingTables && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={handleQuickRepairSchema}
                  isLoading={ensureSchemaMutation.isPending}
                >
                  Repair Schema
                </Button>
              )}
              <Button
                variant="secondary"
                size="small"
                onClick={() => setActiveTab('security')}
              >
                Open Security &amp; System
              </Button>
            </div>
          </div>
        )}

        <AdminOverviewCards stats={stats} isLoading={statsLoading} />

        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(k) => setActiveTab(k as AdminTab)}
        >
          <TabList
            aria-label="Admin central hub sections"
            className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <Tab id="projects" icon={RiStore2Line} count={projects?.length}>
              Projects
            </Tab>
            <Tab id="telemetry" icon={RiBarChartBoxLine}>
              Telemetry
            </Tab>
            <Tab id="webhooks" icon={RiWebhookLine} count={webhooks?.length}>
              Webhooks
            </Tab>
            <Tab id="queue" icon={RiTimeLine} count={queue?.length}>
              Queue
            </Tab>
            <Tab id="messaging" icon={RiMessage2Line}>
              SMS &amp; Push
            </Tab>
            <Tab id="releases" icon={RiSmartphoneLine} count={releasesData?.releases.length}>
              Releases
            </Tab>
            <Tab id="growth" icon={RiSparklingLine}>
              WhatsApp &amp; CTA
            </Tab>
            <Tab id="security" icon={RiShieldKeyholeLine}>
              Security
            </Tab>
          </TabList>

          <TabPanel id="projects">
            <ProjectManagerTable projects={projects} isLoading={projectsLoading} />
          </TabPanel>

          <TabPanel id="telemetry">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProjectManagerTable projects={projects} isLoading={projectsLoading} />
              <GlobalWebhookTable webhooks={webhooks} isLoading={webhooksLoading} />
            </div>
          </TabPanel>

          <TabPanel id="webhooks">
            <GlobalWebhookTable webhooks={webhooks} isLoading={webhooksLoading} />
          </TabPanel>

          <TabPanel id="queue">
            <GlobalQueueTable
              queue={queue}
              isLoading={queueLoading}
              simulatorEnabled={simulatorEnabled}
            />
          </TabPanel>

          <TabPanel id="messaging">
            <SmsPushPanel />
          </TabPanel>

          <TabPanel id="releases">
            <AppReleasesPanel />
          </TabPanel>

          <TabPanel id="growth">
            <AdminPlatformSettingsPanel />
          </TabPanel>

          <TabPanel id="security">
            <AdminSecurityPanel
              admin={admin}
              session={session}
              hasAdminUsersProp={hasAdminUsers}
              systemHealth={systemHealth}
              isHealthLoading={healthLoading}
              isLoggingOut={isLoggingOut}
              onLogout={onLogout}
              onLogoutAll={onLogoutAll}
              onRefreshAuth={onRefreshAuth}
            />
          </TabPanel>
        </Tabs>
      </main>
    </div>
  );
}
