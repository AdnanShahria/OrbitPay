import { useState } from 'react';
import {
  useWalletsOverview,
  useToggleWalletStatusMutation,
  useSetPrimaryWalletMutation,
  useDeleteWalletMutation,
  type Wallet,
  type WalletRotationState,
} from './useWallets';
import { VolumeProgressBar } from './VolumeProgressBar';
import { AddWalletDialog } from './AddWalletDialog';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Switch } from '@/components/base/switch/switch';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { Notification } from '@/components/base/notification/notification';
import { toast } from '@/components/base/toast/toast';
import { MFS_METADATA } from '@/shared/utils/format';
import { cx } from '@/utils/cx';
import {
  RiAddLine,
  RiSmartphoneLine,
  RiFileCopyLine,
  RiCheckLine,
  RiStarFill,
  RiStarLine,
  RiFlashlightLine,
  RiErrorWarningLine,
  RiDeleteBinLine,
  RiBatteryLine,
  RiSimCard2Line,
} from '@remixicon/react';

const PLACEHOLDER_WALLET_NUMBERS = new Set(['01700000000', '01800000000']);

function isPlaceholderWallet(wallet: Wallet): boolean {
  return Boolean(wallet.isPlaceholder) || PLACEHOLDER_WALLET_NUMBERS.has(wallet.walletNumber.trim());
}

function resolveRotationState(wallet: Wallet): WalletRotationState {
  if (wallet.rotationState) return wallet.rotationState;
  if (!wallet.isActive) return 'DISABLED';
  const hardLimit = wallet.monthlyVolumeLimit > 0 ? wallet.monthlyVolumeLimit : 300000;
  const safeLimit = wallet.safeVolumeLimit > 0 ? wallet.safeVolumeLimit : 250000;
  if (wallet.currentMonthVolume >= hardLimit) return 'HARD_LIMIT_REACHED';
  if (wallet.deviceOnline === false) return 'DEVICE_OFFLINE';
  if (wallet.currentMonthVolume >= safeLimit) return 'SAFE_LIMIT_OVERFLOW';
  return wallet.isPrimary ? 'ACTIVE_PRIMARY' : 'HEALTHY_STANDBY';
}

function RotationStateBadge({ state }: { state: WalletRotationState }) {
  switch (state) {
    case 'ACTIVE_PRIMARY':
      return (
        <Chip variant="bold" color="lime" className="gap-1.5">
          <StatusDot color="green" />
          <span>Primary route</span>
        </Chip>
      );
    case 'HEALTHY_STANDBY':
      return (
        <Chip variant="bold" color="neutral">
          Standby
        </Chip>
      );
    case 'SAFE_LIMIT_OVERFLOW':
      return (
        <Chip variant="bold" color="yellow" className="gap-1">
          <RiFlashlightLine className="size-3.5 shrink-0" aria-hidden />
          <span>250k overflow</span>
        </Chip>
      );
    case 'HARD_LIMIT_REACHED':
      return (
        <Chip variant="bold" color="rose">
          300k hard limit
        </Chip>
      );
    case 'DEVICE_OFFLINE':
      return (
        <Chip variant="bold" color="orange" className="gap-1.5">
          <StatusDot color="yellow" />
          <span>Device offline</span>
        </Chip>
      );
    case 'DISABLED':
    default:
      return (
        <Chip variant="bold" color="neutral">
          Disabled
        </Chip>
      );
  }
}

export function WalletManager() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: overview, isLoading } = useWalletsOverview();
  const toggleMutation = useToggleWalletStatusMutation();
  const setPrimaryMutation = useSetPrimaryWalletMutation();
  const deleteMutation = useDeleteWalletMutation();

  const wallets = overview?.wallets ?? [];
  const devices = overview?.devices ?? [];
  const summary = overview?.summary;

  const placeholderWallets = wallets.filter((w) => isPlaceholderWallet(w));
  const activeRealWalletCount = wallets.filter(
    (w) => w.isActive && !isPlaceholderWallet(w)
  ).length;
  const hasPlaceholderWallets = placeholderWallets.length > 0;
  const showReadinessWarning = !isLoading && (activeRealWalletCount === 0 || hasPlaceholderWallets);

  const handleCopy = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedNumber(num);
    toast.success('Wallet number copied', { description: num });
    setTimeout(() => setCopiedNumber(null), 1800);
  };

  const handleToggleActive = (id: string, currentStatus: boolean) => {
    if (toggleMutation.isPending) return;
    toggleMutation.mutate(
      { id, isActive: !currentStatus },
      {
        onSuccess: () => {
          toast.success(currentStatus ? 'SIM disabled' : 'SIM activated');
        },
        onError: () => {
          toast.error('Failed to update SIM status');
        },
      }
    );
  };

  const handleSetPrimary = (wallet: Wallet) => {
    if (setPrimaryMutation.isPending) return;
    const metaName = MFS_METADATA[wallet.provider]?.name ?? wallet.provider;
    setPrimaryMutation.mutate(wallet.id, {
      onSuccess: () => {
        toast.success('Primary SIM updated', {
          description: `${metaName} (${wallet.walletNumber}) is now the primary route.`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to promote SIM';
        toast.error(message);
      },
    });
  };

  const handleConfirmDelete = (wallet: Wallet) => {
    if (deleteMutation.isPending) return;
    const metaName = MFS_METADATA[wallet.provider]?.name ?? wallet.provider;
    deleteMutation.mutate(wallet.id, {
      onSuccess: () => {
        setConfirmDeleteId(null);
        toast.success('SIM removed', {
          description: `${metaName} (${wallet.walletNumber}) was removed from the pool.`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to remove SIM';
        toast.error(message);
      },
    });
  };

  const onlineDeviceCount = summary?.onlineDeviceCount ?? devices.filter((d) => d.isOnline).length;
  const totalDeviceCount = summary?.totalDeviceCount ?? devices.length;

  return (
    <div className="w-full space-y-6">
      {/* Top Banner & Add Action */}
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center sm:pt-6">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiSmartphoneLine className="size-5" aria-hidden />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-title-2-medium text-text-primary">
                MFS SIM Rotation Pool
              </h2>
              <p className="text-body-regular text-text-secondary">
                Automatic standby rotation across bKash, Nagad, Rocket, Upay, and Cellfin at ৳250k safe / ৳300k hard cap.
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="small"
            onClick={() => setIsAddOpen(true)}
            leadingIcon={RiAddLine}
            className="min-h-11 sm:min-h-10 shrink-0"
          >
            Add new SIM
          </Button>
        </CardContent>
      </Card>

      {/* Connected Verifier Devices Strip */}
      <Card>
        <CardContent className="space-y-3.5 pt-5 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-body-medium text-text-primary">
                Connected verifier devices
              </span>
              <Chip
                variant="caption"
                color={onlineDeviceCount > 0 ? 'lime' : 'yellow'}
                className="gap-1.5"
              >
                <StatusDot color={onlineDeviceCount > 0 ? 'green' : 'yellow'} />
                <span className="tabular-nums">
                  {onlineDeviceCount}/{totalDeviceCount} online
                </span>
              </Chip>
            </div>

            {summary && (summary.overflowWarningCount > 0 || summary.hardLimitReachedCount > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {summary.overflowWarningCount > 0 && (
                  <Chip variant="caption" color="yellow" className="tabular-nums">
                    {summary.overflowWarningCount} in 250k overflow
                  </Chip>
                )}
                {summary.hardLimitReachedCount > 0 && (
                  <Chip variant="caption" color="rose" className="tabular-nums">
                    {summary.hardLimitReachedCount} at 300k cap
                  </Chip>
                )}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 2 }, (_, idx) => (
                <Skeleton key={idx} className="h-[76px] w-full rounded-2xl" />
              ))}
            </div>
          ) : devices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-button-default bg-background-secondary-default px-4 py-3 text-caption-1-regular text-text-secondary">
              No companion Android verifier devices paired yet. Pair a phone in Device Pairing QR to monitor battery and SIM slots live.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="flex flex-col gap-2 rounded-2xl border border-separator-border bg-background-secondary-default p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot color={device.isOnline ? 'green' : 'yellow'} />
                      <span className="truncate text-body-medium text-text-primary">
                        {device.deviceName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-caption-2-medium text-text-secondary tabular-nums">
                      <RiBatteryLine className="size-3.5 text-foreground-icon-secondary" aria-hidden />
                      <span>{device.batteryLevel != null ? `${device.batteryLevel}%` : '—'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {device.simSlots.length > 0 ? (
                      device.simSlots.map((slot) => (
                        <Chip
                          key={`${device.id}-sim-${slot.slotIndex}`}
                          variant="caption"
                          color="soft"
                          className="gap-1 border border-separator-border"
                        >
                          <RiSimCard2Line className="size-3 text-foreground-icon-secondary" aria-hidden />
                          <span>
                            SIM {slot.slotIndex}
                            {slot.carrierName ? ` · ${slot.carrierName}` : ''}
                          </span>
                        </Chip>
                      ))
                    ) : (
                      <span className="text-caption-2-medium text-text-tertiary">
                        SIM slots awaiting telemetry
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showReadinessWarning && (
        <Notification
          status="error"
          icon={RiErrorWarningLine}
          dismissible={false}
          title={
            activeRealWalletCount === 0 && hasPlaceholderWallets
              ? 'Placeholder SIM wallets detected — no active real MFS numbers'
              : activeRealWalletCount === 0
                ? 'No active MFS SIM wallets'
                : 'Placeholder SIM wallet detected'
          }
          description={
            hasPlaceholderWallets
              ? 'Placeholder numbers (01700000000 / 01800000000) cannot receive payments. Add or activate your real MFS SIM numbers here, or save Payment Gateways in your connected storefront to sync automatically.'
              : 'Activate an existing SIM below, add a new SIM, or save Payment Gateways in your connected storefront so checkout can display a live payment number.'
          }
          actions={[
            {
              label: 'Add real SIM',
              onClick: () => setIsAddOpen(true),
              variant: 'primary',
            },
          ]}
        />
      )}

      {/* Grid of SIM Wallets */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-[296px] w-full rounded-3xl" />
          ))
        ) : wallets.length === 0 ? (
          <Card className="col-span-full border-dashed">
            <CardContent className="py-12 text-center text-body-regular text-text-secondary">
              No SIM numbers registered yet. Click &ldquo;Add new SIM&rdquo; to configure your first MFS number.
            </CardContent>
          </Card>
        ) : (
          wallets.map((wallet) => {
            const meta = MFS_METADATA[wallet.provider] || {
              name: wallet.provider,
              color: 'var(--color-text-secondary)',
              hoverColor: 'var(--color-text-primary)',
              bgSoft: 'var(--color-background-secondary-default)',
              textClass: 'text-text-primary',
              borderClass: 'border-border-button-default',
            };
            const rotationState = resolveRotationState(wallet);
            const isPlaceholder = isPlaceholderWallet(wallet);
            const canSetPrimary =
              !wallet.isPrimary &&
              wallet.isActive &&
              rotationState !== 'HARD_LIMIT_REACHED';
            const canRemove = !wallet.isPrimary || !wallet.isActive;
            const isConfirmingDelete = confirmDeleteId === wallet.id;

            const deviceBadgeColor: ChipColor = wallet.deviceName
              ? wallet.deviceOnline === false
                ? 'orange'
                : 'blue'
              : 'soft';

            return (
              <Card
                key={wallet.id}
                variant={wallet.isActive ? 'default' : 'inset'}
                className={cx('hover:border-border-button-hover', !wallet.isActive && 'opacity-75')}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-caption-1-semibold text-text-white shadow-xs"
                        style={{ backgroundColor: meta.color }}
                      >
                        {wallet.provider.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-1.5 text-headline-medium">
                          <span className="truncate">{meta.name}</span>
                          {wallet.isPrimary && (
                            <span title="Primary active SIM" className="inline-flex shrink-0 text-status-yellow-text">
                              <RiStarFill className="size-4" aria-hidden />
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="truncate text-caption-1-regular">
                          {wallet.label
                            ? `${wallet.label} · ${wallet.accountType}`
                            : `${wallet.accountType} account`}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-caption-2-medium text-text-tertiary">
                        {wallet.isActive ? 'Active' : 'Disabled'}
                      </span>
                      <Switch
                        size="sm"
                        isSelected={wallet.isActive}
                        onChange={() => handleToggleActive(wallet.id, wallet.isActive)}
                        aria-label={`Toggle ${meta.name} ${wallet.walletNumber}`}
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Linked Device Badge */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip variant="caption" color={deviceBadgeColor} className="gap-1.5">
                      {wallet.deviceName ? (
                        <>
                          <StatusDot color={wallet.deviceOnline === false ? 'yellow' : 'green'} />
                          <span>
                            {wallet.deviceName}
                            {wallet.simSlotIndex != null ? ` · SIM ${wallet.simSlotIndex}` : ''}
                          </span>
                        </>
                      ) : (
                        <>
                          <RiSmartphoneLine className="size-3.5 shrink-0" aria-hidden />
                          <span>Any online device</span>
                        </>
                      )}
                    </Chip>

                    {isPlaceholder && (
                      <Chip variant="caption" color="orange">
                        Placeholder
                      </Chip>
                    )}
                  </div>

                  {/* Phone Number Box */}
                  <div className="flex items-center justify-between rounded-xl border border-separator-border bg-background-secondary-default px-3 py-2.5">
                    <span className="font-mono text-title-3-semibold text-text-primary tabular-nums tnum">
                      {wallet.walletNumber}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      iconOnly
                      leadingIcon={copiedNumber === wallet.walletNumber ? RiCheckLine : RiFileCopyLine}
                      aria-label={`Copy ${wallet.walletNumber}`}
                      onClick={() => handleCopy(wallet.walletNumber)}
                      className={
                        copiedNumber === wallet.walletNumber
                          ? 'text-notification-success-foreground'
                          : 'text-foreground-icon-secondary'
                      }
                    />
                  </div>

                  {/* Volume Quota Progress */}
                  <VolumeProgressBar
                    currentVolume={wallet.currentMonthVolume}
                    safeLimit={wallet.safeVolumeLimit}
                    limitVolume={wallet.monthlyVolumeLimit}
                  />

                  {/* Badges & Quick Actions Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-separator-border pt-3">
                    <RotationStateBadge state={rotationState} />

                    <div className="flex items-center gap-1.5">
                      {canSetPrimary && !isConfirmingDelete && (
                        <Button
                          variant="secondary"
                          size="xs"
                          leadingIcon={RiStarLine}
                          isLoading={setPrimaryMutation.isPending && setPrimaryMutation.variables === wallet.id}
                          onClick={() => handleSetPrimary(wallet)}
                        >
                          Set primary
                        </Button>
                      )}

                      {canRemove && (
                        isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="danger"
                              size="xs"
                              isLoading={deleteMutation.isPending && deleteMutation.variables === wallet.id}
                              onClick={() => handleConfirmDelete(wallet)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="xs"
                            leadingIcon={RiDeleteBinLine}
                            onClick={() => setConfirmDeleteId(wallet.id)}
                          >
                            Remove
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AddWalletDialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </div>
  );
}
