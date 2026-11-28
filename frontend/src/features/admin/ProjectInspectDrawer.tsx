import { useState, type FormEvent } from 'react';
import {
  RiAddLine,
  RiBankCardLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiFileList3Line,
  RiGlobalLine,
  RiLinksLine,
  RiPulseLine,
  RiShieldCheckLine,
  RiShoppingCart2Line,
  RiSmartphoneLine,
  RiStarLine,
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
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { Switch } from '@/components/base/switch/switch';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, formatDate, MFS_METADATA, type MfsProvider } from '@/shared/utils/format';
import {
  type AdminInspectPaymentLink,
  type AdminInspectPendingIntent,
  type AdminProjectSummary,
  type AdminWalletAccountType,
  useAdminCreatePaymentLinkMutation,
  useAdminCreateWalletMutation,
  useAdminDeleteWalletMutation,
  useAdminProjectInspect,
  useAdminResolvePaymentMutation,
  useAdminUpdateWalletMutation,
} from './useAdmin';

interface ProjectInspectDrawerProps {
  project: AdminProjectSummary | null;
  onClose: () => void;
}

const PROVIDERS: MfsProvider[] = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'];

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
  const projectId = project?.id ?? null;
  const { data, isLoading, isError, error } = useAdminProjectInspect(projectId);

  const createWalletMutation = useAdminCreateWalletMutation(projectId);
  const updateWalletMutation = useAdminUpdateWalletMutation(projectId);
  const deleteWalletMutation = useAdminDeleteWalletMutation(projectId);
  const createLinkMutation = useAdminCreatePaymentLinkMutation(projectId);
  const resolvePaymentMutation = useAdminResolvePaymentMutation(projectId);

  // Add MFS Wallet inline form state
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [newProvider, setNewProvider] = useState<MfsProvider>('BKASH');
  const [newWalletNumber, setNewWalletNumber] = useState('');
  const [newAccountType, setNewAccountType] = useState<AdminWalletAccountType>('PERSONAL');
  const [newWalletLabel, setNewWalletLabel] = useState('');
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const [walletFormError, setWalletFormError] = useState<string | null>(null);
  const [confirmDeleteWalletId, setConfirmDeleteWalletId] = useState<string | null>(null);

  // Add Payment Link inline form state
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkAmountType, setLinkAmountType] = useState<'FIXED' | 'OPEN'>('OPEN');
  const [linkFixedAmount, setLinkFixedAmount] = useState('');
  const [linkSlug, setLinkSlug] = useState('');
  const [linkFormError, setLinkFormError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);

  const summary = data?.project ?? project;
  const wallets = data?.wallets ?? [];
  const paymentLinks = data?.paymentLinks ?? [];
  const pendingIntents = data?.pendingIntents ?? [];
  const recentSms = data?.recentSms ?? [];
  const recentOrders = data?.recentOrders ?? [];

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://payment.orbitsaas.cloud';
  const merchantSlug = summary?.slug || project?.slug || summary?.id || 'merchant';

  const getShareUrl = (link: AdminInspectPaymentLink) =>
    link.shareUrl || `${origin}${link.sharePath || `/${link.merchantSlug || merchantSlug}/${link.slug}`}`;

  const handleCopyUrl = (url: string, keyId: string, label: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(keyId);
    toast.success(`${label} copied`);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleAddWallet = async (e: FormEvent) => {
    e.preventDefault();
    if (createWalletMutation.isPending) return;
    setWalletFormError(null);

    const cleanNum = newWalletNumber.trim().replace(/^\+88/, '').replace(/\s+/g, '');
    const regex = newProvider === 'ROCKET' ? /^01[3-9]\d{8,9}$/ : /^01[3-9]\d{8}$/;
    if (!regex.test(cleanNum)) {
      setWalletFormError(
        newProvider === 'ROCKET'
          ? 'Rocket numbers must be 11 or 12 digits starting with 01.'
          : `${MFS_METADATA[newProvider].name} numbers must be 11 digits starting with 01.`,
      );
      return;
    }

    try {
      await createWalletMutation.mutateAsync({
        provider: newProvider,
        walletNumber: cleanNum,
        accountType: newAccountType,
        label: newWalletLabel.trim() || undefined,
        isPrimary: newIsPrimary,
      });
      toast.success(`${MFS_METADATA[newProvider].name} (${cleanNum}) added`);
      setNewWalletNumber('');
      setNewWalletLabel('');
      setNewIsPrimary(false);
      setShowAddWallet(false);
    } catch (err: unknown) {
      setWalletFormError(err instanceof Error ? err.message : 'Failed to add wallet');
    }
  };

  const handleToggleWalletActive = async (walletId: string, currentActive: boolean) => {
    if (updateWalletMutation.isPending) return;
    try {
      await updateWalletMutation.mutateAsync({
        walletId,
        updates: { isActive: !currentActive },
      });
      toast.success(currentActive ? 'Wallet disabled' : 'Wallet activated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update wallet');
    }
  };

  const handleSetPrimaryWallet = async (walletId: string) => {
    if (updateWalletMutation.isPending) return;
    try {
      await updateWalletMutation.mutateAsync({
        walletId,
        updates: { isPrimary: true },
      });
      toast.success('Primary wallet updated');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to promote wallet');
    }
  };

  const handleDeleteWallet = async (walletId: string) => {
    if (deleteWalletMutation.isPending) return;
    try {
      await deleteWalletMutation.mutateAsync(walletId);
      setConfirmDeleteWalletId(null);
      toast.success('Wallet deleted');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete wallet');
    }
  };

  const handleCreatePaymentLink = async (e: FormEvent) => {
    e.preventDefault();
    if (createLinkMutation.isPending) return;
    setLinkFormError(null);

    const trimmedTitle = linkTitle.trim();
    if (trimmedTitle.length < 2) {
      setLinkFormError('Title must be at least 2 characters.');
      return;
    }

    let parsedAmount: number | undefined;
    if (linkAmountType === 'FIXED') {
      parsedAmount = Number(linkFixedAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setLinkFormError('Fixed amount must be greater than 0.');
        return;
      }
    }

    try {
      const created = await createLinkMutation.mutateAsync({
        title: trimmedTitle,
        slug: linkSlug.trim() || undefined,
        amountType: linkAmountType,
        fixedAmount: parsedAmount,
      });
      toast.success('Payment link created', { description: getShareUrl(created) });
      setLinkTitle('');
      setLinkFixedAmount('');
      setLinkSlug('');
      setShowAddLink(false);
    } catch (err: unknown) {
      setLinkFormError(err instanceof Error ? err.message : 'Failed to create payment link');
    }
  };

  const handleResolveIntent = async (
    intent: AdminInspectPendingIntent,
    decision: 'APPROVE' | 'REJECT',
  ) => {
    if (resolvePaymentMutation.isPending) return;
    setResolvingKey(`${decision}:${intent.id}`);
    try {
      await resolvePaymentMutation.mutateAsync({
        paymentIntentId: intent.id,
        decision,
        expectedStateVersion: intent.stateVersion,
        trxId: intent.trxId || undefined,
        reason: decision === 'REJECT' ? 'Rejected by Hub Admin review' : undefined,
      });
      toast.success(
        decision === 'APPROVE'
          ? `${intent.externalRefId} approved`
          : `${intent.externalRefId} rejected`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve payment');
    } finally {
      setResolvingKey(null);
    }
  };

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
            description={`Account configuration, SIM wallet pool, payment links, manual reviews, and telemetry for ${project.id}.`}
          />

          <DrawerBody className="space-y-6">
            {/* Storefront / Account Summary */}
            <section className="rounded-2xl border border-separator-border bg-background-secondary-default p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <RiStore2Line className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
                  <span className="text-body-medium text-text-primary truncate">
                    Account Summary
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip variant="bold" color={summary?.isActive ? 'lime' : 'neutral'}>
                    {summary?.isActive ? 'Active' : 'Paused'}
                  </Chip>
                  <Chip
                    variant="caption"
                    color={summary?.accountMode === 'STANDALONE' ? 'cyan' : 'soft'}
                  >
                    {summary?.accountMode === 'STANDALONE' ? 'Standalone' : 'Webhook-Connected'}
                  </Chip>
                  <Chip
                    variant="caption"
                    color={summary?.verificationMode === 'PURE_MANUAL' ? 'yellow' : 'lime'}
                  >
                    {summary?.verificationMode === 'PURE_MANUAL' ? 'PURE_MANUAL' : 'AUTO'}
                  </Chip>
                  {summary?.ignoreStorefrontSync && (
                    <Chip variant="caption" color="orange">
                      Sync Ignored
                    </Chip>
                  )}
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
                    {summary?.webhookUrl ||
                      (summary?.accountMode === 'STANDALONE'
                        ? 'Standalone mode (no webhook required)'
                        : 'Not configured (portal verification only)')}
                  </span>
                </div>
              </div>
            </section>

            {isError && (
              <div
                role="alert"
                className="rounded-xl border border-border-error-default/20 bg-notification-error-background px-3.5 py-2.5 text-caption-1-medium text-notification-error-foreground"
              >
                {error instanceof Error ? error.message : 'Unable to load project inspection details'}
              </div>
            )}

            {/* Pending Manual Reviews */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-body-medium text-text-primary flex items-center gap-2">
                  <RiShieldCheckLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                  <span>Pending Manual Reviews ({pendingIntents.length})</span>
                </h4>
              </div>

              {isLoading ? (
                <div aria-busy="true" className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : pendingIntents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-button-default p-3.5 text-center text-caption-1-regular text-text-secondary">
                  No pending manual reviews right now.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingIntents.map((intent) => {
                    const amount = intent.paidAmount ?? intent.uniqueAmount ?? intent.baseAmount;
                    const customerLabel =
                      intent.customer?.name ||
                      intent.customerName ||
                      intent.customer?.email ||
                      intent.customerEmail ||
                      'Customer';
                    return (
                      <div
                        key={intent.id}
                        className="rounded-xl border border-border-button-default bg-background-primary-default p-3.5 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-caption-1-semibold text-text-primary">
                                {intent.externalRefId}
                              </span>
                              {intent.provider && (
                                <Chip variant="caption" color="soft">
                                  {MFS_METADATA[intent.provider as MfsProvider]?.name || intent.provider}
                                </Chip>
                              )}
                              <Chip variant="caption" color="yellow">
                                {intent.status}
                              </Chip>
                            </div>
                            <div className="text-caption-2-regular text-text-secondary">
                              {customerLabel}
                              {intent.senderNumber ? ` · From ${intent.senderNumber}` : ''}
                              {intent.trxId ? ` · TrxID ${intent.trxId}` : ''}
                            </div>
                          </div>

                          <span className="font-mono text-body-medium text-text-primary tabular-nums shrink-0">
                            {formatBDT(amount)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-separator-border">
                          <div className="flex items-center gap-2 text-caption-2-regular text-text-tertiary">
                            {intent.createdAt && <span>{formatDate(intent.createdAt)}</span>}
                            {intent.receiptUrl &&
                              (intent.receiptUrl.startsWith('/api/v1/router/image/') ||
                                /^https?:\/\//i.test(intent.receiptUrl)) && (
                              <a
                                href={intent.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-text-primary underline"
                              >
                                <RiExternalLinkLine className="size-3" aria-hidden />
                                Receipt
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="danger"
                              size="xs"
                              leadingIcon={RiCloseLine}
                              isLoading={resolvingKey === `REJECT:${intent.id}`}
                              disabled={resolvePaymentMutation.isPending}
                              onClick={() => handleResolveIntent(intent, 'REJECT')}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="primary"
                              size="xs"
                              leadingIcon={RiCheckLine}
                              isLoading={resolvingKey === `APPROVE:${intent.id}`}
                              disabled={resolvePaymentMutation.isPending}
                              onClick={() => handleResolveIntent(intent, 'APPROVE')}
                            >
                              Approve
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* SIM Wallet Pool */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-body-medium text-text-primary flex items-center gap-2">
                  <RiSmartphoneLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                  <span>SIM Wallet Pool ({wallets.length})</span>
                </h4>
                <Button
                  variant="secondary"
                  size="xs"
                  leadingIcon={RiAddLine}
                  onClick={() => {
                    setShowAddWallet((prev) => !prev);
                    setWalletFormError(null);
                  }}
                >
                  {showAddWallet ? 'Close form' : 'Add MFS Number'}
                </Button>
              </div>

              {showAddWallet && (
                <form
                  onSubmit={handleAddWallet}
                  className="rounded-xl border border-separator-border bg-background-secondary-default p-3.5 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="MFS Provider"
                      selectedKey={newProvider}
                      onSelectionChange={(key) => {
                        if (key != null) setNewProvider(String(key) as MfsProvider);
                      }}
                    >
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p} id={p} textValue={MFS_METADATA[p].name}>
                          {MFS_METADATA[p].name}
                        </SelectItem>
                      ))}
                    </Select>

                    <Input
                      label="Wallet Number"
                      placeholder="017XXXXXXXX"
                      value={newWalletNumber}
                      onChange={setNewWalletNumber}
                      inputClassName="font-mono tabular-nums"
                      isRequired
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Account Type"
                      selectedKey={newAccountType}
                      onSelectionChange={(key) => {
                        if (key != null) setNewAccountType(String(key) as AdminWalletAccountType);
                      }}
                    >
                      <SelectItem id="PERSONAL" textValue="Personal">Personal</SelectItem>
                      <SelectItem id="PRA" textValue="Personal Retail (PRA)">Personal Retail (PRA)</SelectItem>
                      <SelectItem id="MERCHANT" textValue="Merchant">Merchant</SelectItem>
                    </Select>

                    <Input
                      label="Label (Optional)"
                      placeholder="e.g. Primary bKash"
                      value={newWalletLabel}
                      onChange={setNewWalletLabel}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Switch
                      size="sm"
                      isSelected={newIsPrimary}
                      onChange={setNewIsPrimary}
                    >
                      Set as primary
                    </Switch>

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setShowAddWallet(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="xs"
                        isLoading={createWalletMutation.isPending}
                      >
                        Save Number
                      </Button>
                    </div>
                  </div>

                  {walletFormError && (
                    <div
                      role="alert"
                      className="rounded-lg bg-notification-error-background px-2.5 py-2 text-caption-2-medium text-notification-error-foreground flex items-center gap-1.5"
                    >
                      <RiErrorWarningLine className="size-3.5 shrink-0" aria-hidden />
                      <span>{walletFormError}</span>
                    </div>
                  )}
                </form>
              )}

              {isLoading ? (
                <div aria-busy="true" className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : wallets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-button-default p-4 text-center text-caption-1-regular text-text-secondary">
                  No SIM wallets configured for this account. Click &ldquo;Add MFS Number&rdquo; above to add one.
                </div>
              ) : (
                <div className="space-y-2">
                  {wallets.map((w) => {
                    const isConfirmingDelete = confirmDeleteWalletId === w.id;
                    return (
                      <div
                        key={w.id}
                        className="rounded-xl border border-border-button-default bg-background-primary-default p-3.5 space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-body-medium text-text-primary">
                                {MFS_METADATA[w.provider as MfsProvider]?.name || w.provider}
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
                              {w.label ? ` · ${w.label}` : ''}
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

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-separator-border">
                          <Switch
                            size="sm"
                            isSelected={w.isActive}
                            onChange={() => handleToggleWalletActive(w.id, w.isActive)}
                            aria-label={`Toggle ${w.provider} ${w.walletNumber}`}
                          >
                            {w.isActive ? 'Active' : 'Disabled'}
                          </Switch>

                          <div className="flex items-center gap-1.5">
                            {!w.isPrimary && w.isActive && !isConfirmingDelete && (
                              <Button
                                variant="secondary"
                                size="xs"
                                leadingIcon={RiStarLine}
                                onClick={() => handleSetPrimaryWallet(w.id)}
                              >
                                Set primary
                              </Button>
                            )}

                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="danger"
                                  size="xs"
                                  isLoading={deleteWalletMutation.isPending}
                                  onClick={() => handleDeleteWallet(w.id)}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setConfirmDeleteWalletId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="xs"
                                leadingIcon={RiDeleteBinLine}
                                className="text-text-destructive"
                                onClick={() => setConfirmDeleteWalletId(w.id)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Payment Links */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-body-medium text-text-primary flex items-center gap-2">
                  <RiLinksLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                  <span>Payment Links ({paymentLinks.length})</span>
                </h4>
                <Button
                  variant="secondary"
                  size="xs"
                  leadingIcon={RiAddLine}
                  onClick={() => {
                    setShowAddLink((prev) => !prev);
                    setLinkFormError(null);
                  }}
                >
                  {showAddLink ? 'Close form' : 'Create Payment Link'}
                </Button>
              </div>

              {showAddLink && (
                <form
                  onSubmit={handleCreatePaymentLink}
                  className="rounded-xl border border-separator-border bg-background-secondary-default p-3.5 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Title"
                      placeholder="e.g. Quick Pay / Course Fee"
                      value={linkTitle}
                      onChange={setLinkTitle}
                      isRequired
                    />
                    <Input
                      label="Custom Slug (Optional)"
                      placeholder="quick-pay"
                      value={linkSlug}
                      onChange={(val) => setLinkSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      inputClassName="font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Amount Mode"
                      selectedKey={linkAmountType}
                      onSelectionChange={(key) => {
                        if (key != null) setLinkAmountType(String(key) as 'FIXED' | 'OPEN');
                      }}
                    >
                      <SelectItem id="OPEN" textValue="Open (Buyer enters)">
                        Open (Buyer enters)
                      </SelectItem>
                      <SelectItem id="FIXED" textValue="Fixed Amount">
                        Fixed Amount
                      </SelectItem>
                    </Select>

                    {linkAmountType === 'FIXED' && (
                      <Input
                        label="Fixed Amount (BDT)"
                        type="number"
                        placeholder="500"
                        value={linkFixedAmount}
                        onChange={setLinkFixedAmount}
                        inputClassName="font-mono tabular-nums"
                        isRequired
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowAddLink(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="xs"
                      isLoading={createLinkMutation.isPending}
                    >
                      Create Link
                    </Button>
                  </div>

                  {linkFormError && (
                    <div
                      role="alert"
                      className="rounded-lg bg-notification-error-background px-2.5 py-2 text-caption-2-medium text-notification-error-foreground flex items-center gap-1.5"
                    >
                      <RiErrorWarningLine className="size-3.5 shrink-0" aria-hidden />
                      <span>{linkFormError}</span>
                    </div>
                  )}
                </form>
              )}

              {isLoading ? (
                <div aria-busy="true" className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : paymentLinks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-button-default p-4 text-center text-caption-1-regular text-text-secondary">
                  No payment links created yet for this account.
                </div>
              ) : (
                <div className="divide-y divide-separator-border rounded-xl border border-separator-border bg-background-primary-default">
                  {paymentLinks.map((lnk) => {
                    const shareUrl = getShareUrl(lnk);
                    const isCopied = copiedId === lnk.id;
                    return (
                      <div
                        key={lnk.id}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-body-medium text-text-primary truncate">
                              {lnk.title}
                            </span>
                            <Chip variant="caption" color={lnk.isActive ? 'lime' : 'neutral'}>
                              {lnk.isActive ? 'Active' : 'Paused'}
                            </Chip>
                            <Chip variant="caption" color="soft" className="font-mono tabular-nums">
                              {lnk.amountType === 'FIXED' && lnk.fixedAmount != null
                                ? formatBDT(lnk.fixedAmount)
                                : 'Open amount'}
                            </Chip>
                          </div>
                          <span className="font-mono text-caption-2-regular text-text-tertiary block truncate">
                            {lnk.sharePath || `/${lnk.merchantSlug || merchantSlug}/${lnk.slug}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="secondary"
                            size="xs"
                            leadingIcon={isCopied ? RiCheckLine : RiFileCopyLine}
                            onClick={() => handleCopyUrl(shareUrl, lnk.id, 'Payment link')}
                          >
                            {isCopied ? 'Copied' : 'Copy'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            iconOnly
                            leadingIcon={RiExternalLinkLine}
                            aria-label={`Open ${lnk.title}`}
                            onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                          />
                        </div>
                      </div>
                    );
                  })}
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
                  No e-commerce orders synced for this account yet.
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
