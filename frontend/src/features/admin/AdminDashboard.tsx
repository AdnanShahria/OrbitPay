import { useState } from 'react';
import {
  RiArrowLeftLine,
  RiBarChartBoxLine,
  RiFlashlightLine,
  RiLockLine,
  RiMessage2Line,
  RiRadioButtonLine,
  RiShieldCheckLine,
  RiSmartphoneLine,
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
import { GlobalQueueTable } from './GlobalQueueTable';
import { GlobalWebhookTable } from './GlobalWebhookTable';
import { ProjectManagerTable } from './ProjectManagerTable';
import { SmsPushPanel } from './SmsPushPanel';
import { AppReleasesPanel } from './AppReleasesPanel';
import {
  useAdminAuth,
  useAdminOverview,
  useAdminProjects,
  useAdminQueue,
  useAdminReleases,
  useAdminWebhooks,
} from './useAdmin';

export type AdminTab = 'projects' | 'telemetry' | 'webhooks' | 'queue' | 'messaging' | 'releases';

interface AdminDashboardProps {
  onExit: () => void;
}

export function AdminDashboard({ onExit }: AdminDashboardProps) {
  const { isAuthenticated, isVerifying, login, logout } = useAdminAuth();

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
    return <AdminAuthGate onSuccess={login} onExit={onExit} />;
  }

  return <AdminDashboardContent onLogout={logout} onExit={onExit} />;
}

function AdminDashboardContent({
  onLogout,
  onExit,
}: {
  onLogout: () => void;
  onExit: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>('projects');
  const [isSimulating, setIsSimulating] = useState(false);

  const { status: realtimeStatus, simulateTransaction } = useRealtime();

  const { data: stats, isLoading: statsLoading } = useAdminOverview(true);
  const { data: projects, isLoading: projectsLoading } = useAdminProjects(true);
  const { data: webhooks, isLoading: webhooksLoading } = useAdminWebhooks(true);
  const { data: queue, isLoading: queueLoading } = useAdminQueue(true);
  const { data: releasesData } = useAdminReleases(true);

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
                Root admin
              </Chip>
            </div>
            <p className="text-caption-1-regular text-text-tertiary hidden sm:block truncate">
              Multi-tenant storefront orchestration & fleet monitor
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

          {/* Quick Realtime Simulator */}
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

          {/* Lock / Logout */}
          <Button
            variant="ghost"
            size="small"
            onClick={onLogout}
            leadingIcon={RiLockLine}
            title="Lock Master Admin Session"
          >
            Lock
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
        <AdminOverviewCards stats={stats} isLoading={statsLoading} />

        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(k) => setActiveTab(k as AdminTab)}
        >
          <TabList aria-label="Admin central hub sections" className="overflow-x-auto">
            <Tab id="projects" icon={RiStore2Line} count={projects?.length}>
              Connected Projects
            </Tab>
            <Tab id="telemetry" icon={RiBarChartBoxLine}>
              Global Telemetry
            </Tab>
            <Tab id="webhooks" icon={RiWebhookLine} count={webhooks?.length}>
              Webhook Audit
            </Tab>
            <Tab id="queue" icon={RiTimeLine} count={queue?.length}>
              Verification Queue
            </Tab>
            <Tab id="messaging" icon={RiMessage2Line}>
              SMS &amp; Push
            </Tab>
            <Tab id="releases" icon={RiSmartphoneLine} count={releasesData?.releases.length}>
              App Releases
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
            <GlobalQueueTable queue={queue} isLoading={queueLoading} />
          </TabPanel>

          <TabPanel id="messaging">
            <SmsPushPanel />
          </TabPanel>

          <TabPanel id="releases">
            <AppReleasesPanel />
          </TabPanel>
        </Tabs>
      </main>
    </div>
  );
}
