import {
  RiBankCardLine,
  RiFileList3Line,
  RiGlobalLine,
  RiPulseLine,
  RiShoppingCart2Line,
  RiSmartphoneLine,
  RiStore2Line,
  RiTimeLine,
} from '@remixicon/react';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Button } from '@/components/base/buttons/button';
import {
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
} from '@/components/base/drawer/drawer';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { formatBDT, formatDate } from '@/shared/utils/format';
import {
  type AdminProjectSummary,
  useAdminProjectInspect,
} from './useAdmin';

interface ProjectInspectDrawerProps {
  project: AdminProjectSummary | null;
  onClose: () => void;
}

function getLedgerStatusColor(status: string): ChipColor {
  switch (status) {
    case 'VERIFIED':
    case 'MANUAL_VERIFIED':
      return 'lime';
    case 'UNCLAIMED':
      return 'yellow';
    case 'FLAGGED':
    case 'REJECTED':
      return 'rose';
    default:
      return 'neutral';
  }
}

function getOrderStatusColor(status: string): ChipColor {
  switch (status) {
    case 'PAID':
    case 'CONFIRMED':
    case 'DELIVERED':
      return 'lime';
    case 'PENDING':
    case 'PROCESSING':
    case 'SHIPPED':
      return 'cyan';
    case 'FAILED':
    case 'CANCELLED':
      return 'rose';
    default:
      return 'neutral';
  }
}

export function ProjectInspectDrawer({ project, onClose }: ProjectInspectDrawerProps) {
  const { data, isLoading, isError, error } = useAdminProjectInspect(project?.id ?? null);

  const summary = data?.project ?? project;
  const wallets = data?.wallets ?? [];
  const recentSms = data?.recentSms ?? [];
  const recentOrders = data?.recentOrders ?? [];

  return (
    <Drawer
      isOpen={project !== null}
      onOpenChange={(open) => !open && onClose()}
      placement="end"
      size="lg"
      aria-label={project ? `Inspect ${project.storeName}` : 'Inspect project'}
    >
      {project && (
        <>
          <DrawerHeader
            icon={RiPulseLine}
            title={`Inspect: ${summary?.storeName ?? project.storeName}`}
            description={`Live storefront telemetry, SIM wallet pool, SMS ledger, and e-commerce orders for ${project.id}.`}
          />

          <DrawerBody className="space-y-6">
            {/* Storefront Summary */}
            <section className="rounded-2xl border border-separator-border bg-background-secondary-default p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <RiStore2Line className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
                  <span className="text-body-medium text-text-primary truncate">
                    Storefront Summary
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Chip variant="bold" color={summary?.isActive ? 'lime' : 'neutral'}>
                    {summary?.isActive ? 'Active' : 'Paused'}
                  </Chip>
                  <Chip variant="caption" color={summary?.isOnline ? 'lime' : 'yellow'} className="gap-1.5">
                    <StatusDot color={summary?.isOnline ? 'green' : 'yellow'} />
                    <span>{summary?.isOnline ? 'Device online' : 'Device offline'}</span>
                  </Chip>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-caption-1-regular">
                <div className="space-y-0.5">
                  <span className="text-caption-2-medium text-text-tertiary block">
                    Project ID
                  </span>
                  <span className="font-mono text-text-primary break-all">{project.id}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-caption-2-medium text-text-tertiary block">
                    Grace Period
                  </span>
                  <span className="inline-flex items-center gap-1 text-text-primary tabular-nums">
                    <RiTimeLine className="size-3.5 text-foreground-icon-tertiary" aria-hidden />
                    {summary?.gracePeriodMinutes ?? project.gracePeriodMinutes} mins
                  </span>
                </div>
                <div className="space-y-0.5 sm:col-span-2">
                  <span className="text-caption-2-medium text-text-tertiary block">
                    Webhook URL
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-text-primary break-all">
                    <RiGlobalLine className="size-3.5 text-foreground-icon-tertiary shrink-0" aria-hidden />
                    {summary?.webhookUrl || 'Not configured (portal verification only)'}
                  </span>
                </div>
              </div>
            </section>

            {isError && (
              <div
                role="alert"
                className="rounded-xl border border-border-error-default/20 bg-notification-error-background px-3.5 py-2.5 text-caption-1-medium text-notification-error-foreground"
              >
                {error instanceof Error ? error.message : 'Unable to load storefront inspection details'}
              </div>
            )}

            {/* SIM Wallet Pool */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-body-medium text-text-primary flex items-center gap-2">
                  <RiSmartphoneLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                  <span>SIM Wallet Pool ({wallets.length})</span>
                </h4>
              </div>

              {isLoading ? (
                <div aria-busy="true" className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : wallets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-button-default p-4 text-center text-caption-1-regular text-text-secondary">
                  No SIM wallets configured for this storefront.
                </div>
              ) : (
                <div className="space-y-2">
                  {wallets.map((w) => (
                    <div
                      key={w.id}
                      className="rounded-xl border border-border-button-default bg-background-primary-default p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-body-medium text-text-primary">
                            {w.provider}
                          </span>
                          <Chip variant="caption" color="soft">
                            {w.accountType}
                          </Chip>
                          {w.isPrimary && (
                            <Chip variant="caption" color="cyan">
                              Primary
                            </Chip>
                          )}
                          <Chip variant="caption" color={w.isActive ? 'lime' : 'neutral'}>
                            {w.isActive ? 'Active' : 'Inactive'}
                          </Chip>
                        </div>
                        <span className="font-mono text-caption-1-regular text-text-secondary tabular-nums block">
                          {w.walletNumber}
                        </span>
                      </div>

                      <div className="text-start sm:text-end shrink-0">
                        <span className="font-mono text-caption-1-medium text-text-primary tabular-nums block">
                          {formatBDT(w.currentMonthVolume)}
                        </span>
                        <span className="font-mono text-caption-2-regular text-text-tertiary tabular-nums">
                          Limit {formatBDT(w.monthlyVolumeLimit)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent SMS Ledger */}
            <section className="space-y-2.5">
              <h4 className="text-body-medium text-text-primary flex items-center gap-2">
                <RiFileList3Line className="size-4 text-foreground-icon-secondary" aria-hidden />
                <span>Recent SMS Ledger ({recentSms.length})</span>
              </h4>

              {isLoading ? (
                <div aria-busy="true" className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : recentSms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-button-default p-4 text-center text-caption-1-regular text-text-secondary">
                  No SMS ledger entries recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-separator-border rounded-xl border border-separator-border bg-background-primary-default">
                  {recentSms.map((sms) => (
                    <div
                      key={sms.id}
                      className="p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip variant="caption" color="neutral">
                            {sms.provider}
                          </Chip>
                          <span className="font-mono text-caption-1-medium text-text-primary truncate">
                            {sms.trxId}
                          </span>
                          <Chip variant="caption" color={getLedgerStatusColor(sms.status)}>
                            {sms.status}
                          </Chip>
                        </div>
                        <div className="text-caption-2-regular text-text-tertiary tabular-nums">
                          From <span className="font-mono">{sms.senderNumber}</span> ·{' '}
                          {formatDate(sms.createdAt)}
                        </div>
                      </div>
                      <span className="font-mono text-body-medium text-status-lime-text tabular-nums shrink-0">
                        {formatBDT(sms.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent E-Commerce Orders */}
            <section className="space-y-2.5">
              <h4 className="text-body-medium text-text-primary flex items-center gap-2">
                <RiShoppingCart2Line className="size-4 text-foreground-icon-secondary" aria-hidden />
                <span>Recent E-Commerce Orders ({recentOrders.length})</span>
              </h4>

              {isLoading ? (
                <div aria-busy="true" className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-button-default p-4 text-center text-caption-1-regular text-text-secondary">
                  No e-commerce orders synced for this storefront yet.
                </div>
              ) : (
                <div className="divide-y divide-separator-border rounded-xl border border-separator-border bg-background-primary-default">
                  {recentOrders.map((ord) => {
                    const orderAmount =
                      ord.paidAmount ??
                      ord.uniqueAmount ??
                      ord.baseAmount ??
                      ord.totalAmount ??
                      ord.expectedAmount ??
                      ord.amount ??
                      0;
                    return (
                      <div
                        key={ord.id}
                        className="p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-caption-1-medium text-text-primary">
                              {ord.externalOrderId}
                            </span>
                            <Chip variant="caption" color={getOrderStatusColor(ord.paymentStatus)}>
                              {ord.paymentStatus}
                            </Chip>
                            <Chip variant="caption" color="soft">
                              {ord.orderStatus}
                            </Chip>
                          </div>
                          <div className="text-caption-2-regular text-text-tertiary truncate">
                            {ord.customerName || ord.customerEmail || 'Guest customer'}
                          </div>
                        </div>

                        <span className="font-mono text-body-medium text-text-primary tabular-nums shrink-0 flex items-center gap-1">
                          <RiBankCardLine className="size-3.5 text-foreground-icon-tertiary" aria-hidden />
                          {formatBDT(orderAmount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </DrawerBody>

          <DrawerFooter>
            <Button variant="primary" size="medium" onClick={onClose}>
              Close
            </Button>
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
}
