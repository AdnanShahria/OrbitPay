import { useState } from 'react';
import { useWallets, useToggleWalletStatusMutation } from './useWallets';
import { VolumeProgressBar } from './VolumeProgressBar';
import { AddWalletDialog } from './AddWalletDialog';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
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
  RiFlashlightLine,
  RiErrorWarningLine,
} from '@remixicon/react';

const PLACEHOLDER_WALLET_NUMBERS = new Set(['01700000000', '01800000000']);

function isPlaceholderWallet(walletNumber: string): boolean {
  return PLACEHOLDER_WALLET_NUMBERS.has(walletNumber.trim());
}

export function WalletManager() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);

  const { data: wallets, isLoading } = useWallets();
  const toggleMutation = useToggleWalletStatusMutation();

  const placeholderWallets = (wallets ?? []).filter((w) => isPlaceholderWallet(w.walletNumber));
  const activeRealWalletCount = (wallets ?? []).filter(
    (w) => w.isActive && !isPlaceholderWallet(w.walletNumber)
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
                Automatic standby rotation across bKash, Nagad, Rocket, Upay, and Cellfin near ৳250k.
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
            <Skeleton key={index} className="h-[264px] w-full rounded-3xl" />
          ))
        ) : !wallets || wallets.length === 0 ? (
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

            return (
              <Card
                key={wallet.id}
                variant={wallet.isActive ? 'default' : 'inset'}
                className={cx('hover:border-border-button-hover', !wallet.isActive && 'opacity-70')}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-caption-1-semibold text-text-white shadow-xs"
                        style={{ backgroundColor: meta.color }}
                      >
                        {wallet.provider.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-1.5 text-headline-medium">
                          <span>{meta.name}</span>
                          {wallet.isPrimary && (
                            <span title="Primary active SIM" className="inline-flex text-status-yellow-text">
                              <RiStarFill className="size-4" aria-hidden />
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-caption-1-regular">
                          {wallet.accountType} account
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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
                    limitVolume={wallet.monthlyVolumeLimit}
                  />

                  {/* Badges footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-separator-border pt-3">
                    {wallet.isPrimary ? (
                      <Chip variant="bold" color="lime" className="gap-1.5">
                        <StatusDot color="green" />
                        <span>Primary route</span>
                      </Chip>
                    ) : (
                      <Chip variant="bold" color="neutral">
                        Standby rotation
                      </Chip>
                    )}

                    {isPlaceholderWallet(wallet.walletNumber) && (
                      <Chip variant="caption" color="orange">
                        Placeholder
                      </Chip>
                    )}

                    {wallet.isActive && wallet.currentMonthVolume > 240000 && (
                      <Chip variant="caption" color="yellow" className="gap-1">
                        <RiFlashlightLine className="size-3.5 shrink-0" aria-hidden />
                        <span>Ready to rotate</span>
                      </Chip>
                    )}
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
