import type { ComponentType } from 'react';
import {
  RiMoneyDollarCircleLine,
  RiPulseLine,
  RiSmartphoneLine,
  RiStore2Line,
  RiTimeLine,
  RiWebhookLine,
} from '@remixicon/react';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { formatBDT } from '@/shared/utils/format';
import type { AdminOverviewStats } from './useAdmin';

interface AdminOverviewCardsProps {
  stats?: AdminOverviewStats;
  isLoading: boolean;
}

type IconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

interface OverviewMetric {
  label: string;
  value: string;
  caption: string;
  badge: string;
  badgeColor: ChipColor;
  icon: IconComponent;
}

export function AdminOverviewCards({ stats, isLoading }: AdminOverviewCardsProps) {
  if (isLoading || !stats) {
    return (
      <div
        aria-busy="true"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
      >
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            className="flex min-w-0 flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-2 shadow-card"
          >
            <div className="p-2.5">
              <Skeleton shape="rect" className="size-9 rounded-2lg" />
            </div>
            <div className="flex flex-col gap-2 px-2.5 pt-2 pb-3.5">
              <Skeleton shape="text" className="h-3.5 w-24" />
              <Skeleton shape="text" className="h-7 w-28" />
            </div>
            <div className="mt-auto rounded-2xl border border-separator-border bg-background-secondary-default px-2.5 py-2">
              <Skeleton shape="text" className="h-3.5 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const metrics: OverviewMetric[] = [
    {
      label: 'Platform gross volume',
      value: formatBDT(stats.totalVolume),
      caption: `${stats.verifiedTransactions} verified tx`,
      badge: 'Settled',
      badgeColor: 'lime',
      icon: RiMoneyDollarCircleLine,
    },
    {
      label: 'Connected stores',
      value: String(stats.totalProjects),
      caption: `${stats.activeProjects} active · ${stats.totalProjects - stats.activeProjects} paused`,
      badge: stats.activeProjects > 0 ? 'Live' : 'Idle',
      badgeColor: stats.activeProjects > 0 ? 'lime' : 'neutral',
      icon: RiStore2Line,
    },
    {
      label: 'Android phone fleet',
      value: `${stats.onlineDevices} / ${stats.totalProjects}`,
      caption: stats.onlineDevices > 0 ? 'Daemons syncing' : 'No phones active',
      badge: stats.onlineDevices > 0 ? 'Online' : 'Offline',
      badgeColor: stats.onlineDevices > 0 ? 'lime' : 'yellow',
      icon: RiSmartphoneLine,
    },
    {
      label: 'Active SIM wallets',
      value: String(stats.totalWallets),
      caption: 'Rotating under ৳300k',
      badge: 'Pooled',
      badgeColor: 'neutral',
      icon: RiPulseLine,
    },
    {
      label: 'Webhook success rate',
      value: `${stats.webhookSuccessRate}%`,
      caption: `${stats.totalWebhooksSent} deliveries`,
      badge: stats.webhookSuccessRate >= 95 ? 'Healthy' : 'Degraded',
      badgeColor: stats.webhookSuccessRate >= 95 ? 'lime' : 'yellow',
      icon: RiWebhookLine,
    },
    {
      label: 'Pending match queue',
      value: String(stats.pendingQueueCount),
      caption: stats.pendingQueueCount > 0 ? 'Awaiting SMS' : 'All reconciled',
      badge: stats.pendingQueueCount > 0 ? 'Queued' : 'Clear',
      badgeColor: stats.pendingQueueCount > 0 ? 'yellow' : 'neutral',
      icon: RiTimeLine,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <section
            key={metric.label}
            className="flex min-w-0 flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-2 shadow-card transition-colors duration-150 hover:border-border-button-hover"
          >
            <div className="flex w-full items-start justify-between gap-2.5 p-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2lg border border-border-button-default bg-background-primary-default text-foreground-icon-primary shadow-card">
                <Icon className="size-4 shrink-0" aria-hidden />
              </span>
            </div>

            <div className="flex flex-col gap-0.5 px-2.5 pt-1.5 pb-3.5">
              <p className="truncate text-body-medium text-text-secondary">
                {metric.label}
              </p>
              <p
                title={metric.value}
                className="truncate whitespace-nowrap text-title-2-medium text-text-primary tabular-nums tnum"
              >
                {metric.value}
              </p>
            </div>

            <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-2xl border border-separator-border bg-background-secondary-default py-1.5 pe-1.5 ps-2.5">
              <p className="truncate text-caption-1-regular text-text-secondary">
                {metric.caption}
              </p>
              <Chip variant="caption" color={metric.badgeColor} className="shrink-0">
                {metric.badge}
              </Chip>
            </div>
          </section>
        );
      })}
    </div>
  );
}
