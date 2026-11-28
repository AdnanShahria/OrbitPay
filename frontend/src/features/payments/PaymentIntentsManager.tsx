import { useState } from 'react';
import {
  usePaymentIntents,
  useResolvePaymentIntent,
  useTriggerPaymentAction,
  useCreatePaymentIntent,
  type PaymentIntentStatus,
  type PaymentIntentView,
  type VerticalProfile,
} from './usePaymentIntents';
import { useMerchantProjects } from '@/features/projects/useProjects';
import { Card, CardContent } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { SearchField } from '@/components/base/search-field/search-field';
import { Select, SelectItem } from '@/components/base/select/select';
import { PillTabList, PillTab } from '@/components/base/tabs/pill-tab';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/base/modal/modal';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/base/table/table';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, formatDate, MFS_METADATA } from '@/shared/utils/format';
import {
  RiBankCardLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiExternalLinkLine,
  RiEyeLine,
  RiFileCopyLine,
  RiFilter3Line,
  RiImageLine,
  RiRefreshLine,
  RiAddLine,
} from '@remixicon/react';

const STATUS_FILTERS: Array<{ label: string; value: PaymentIntentStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Manual review', value: 'MANUAL_REVIEW_REQUIRED' },
  { label: 'Waiting for SMS', value: 'WAITING_FOR_SMS' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const VERTICAL_FILTERS: Array<{ label: string; value: VerticalProfile | 'ALL' }> = [
  { label: 'All verticals', value: 'ALL' },
  { label: 'E-Commerce', value: 'ecommerce' },
  { label: 'SaaS Subscription', value: 'saas_subscription' },
  { label: 'LMS / Course', value: 'lms_course' },
  { label: 'Booking / Event', value: 'booking_appointment' },
  { label: 'B2B Invoice', value: 'invoice_b2b' },
  { label: 'Donation', value: 'donation' },
  { label: 'Digital Topup', value: 'digital_topup' },
  { label: 'Custom', value: 'custom' },
];

function getStatusChip(status: PaymentIntentStatus): { label: string; color: ChipColor } {
  switch (status) {
    case 'VERIFIED':
      return { label: 'Verified', color: 'lime' };
    case 'MANUAL_REVIEW_REQUIRED':
      return { label: 'Manual review', color: 'yellow' };
    case 'WAITING_FOR_SMS':
      return { label: 'Waiting SMS', color: 'blue' };
    case 'OPEN':
      return { label: 'Open', color: 'neutral' };
    case 'REJECTED':
      return { label: 'Rejected', color: 'rose' };
    case 'EXPIRED':
      return { label: 'Expired', color: 'neutral' };
    case 'REFUNDED':
      return { label: 'Refunded', color: 'purple' };
    default:
      return { label: status, color: 'neutral' };
  }
}

function getVerticalChip(vertical: string): { label: string; color: ChipColor } {
  switch (vertical) {
    case 'ecommerce':
      return { label: 'E-Commerce', color: 'blue' };
    case 'saas_subscription':
      return { label: 'SaaS', color: 'purple' };
    case 'lms_course':
      return { label: 'Course / LMS', color: 'cyan' };
    case 'booking_appointment':
      return { label: 'Event / Booking', color: 'orange' };
    case 'invoice_b2b':
      return { label: 'B2B Invoice', color: 'gray' };
    case 'donation':
      return { label: 'Donation', color: 'lime' };
    case 'digital_topup':
      return { label: 'Topup', color: 'yellow' };
    default:
      return { label: vertical.replace(/_/g, ' '), color: 'soft' };
  }
}

function isResolvable(status: PaymentIntentStatus): boolean {
  return status === 'MANUAL_REVIEW_REQUIRED' || status === 'WAITING_FOR_SMS' || status === 'OPEN';
}

export function PaymentIntentsManager() {
  const { data: subProjects = [] } = useMerchantProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<PaymentIntentStatus | 'ALL'>('ALL');
  const [selectedVertical, setSelectedVertical] = useState<VerticalProfile | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [inspectingIntent, setInspectingIntent] = useState<PaymentIntentView | null>(null);
  const [rejectingIntent, setRejectingIntent] = useState<PaymentIntentView | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRefId, setNewRefId] = useState(() => `INV-${Math.floor(10000 + Math.random() * 90000)}`);
  const [newTitle, setNewTitle] = useState('');
  const [newVertical, setNewVertical] = useState<VerticalProfile>('custom');
  const [newAmount, setNewAmount] = useState('500');
  const [createdCheckoutUrl, setCreatedCheckoutUrl] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = usePaymentIntents({
    projectId: selectedProjectId,
    status: selectedStatus,
    vertical: selectedVertical,
    search: searchQuery,
  });

  const resolveMutation = useResolvePaymentIntent();
  const actionMutation = useTriggerPaymentAction();
  const createMutation = useCreatePaymentIntent();

  const items = data?.items ?? [];
  const manualReviewCount = items.filter((i) => i.status === 'MANUAL_REVIEW_REQUIRED').length;

  const handleApprove = async (intent: PaymentIntentView) => {
    if (resolveMutation.isPending) return;
    setActiveActionId(`approve:${intent.id}`);
    try {
      await resolveMutation.mutateAsync({
        paymentIntentId: intent.id,
        decision: 'APPROVE',
        expectedStateVersion: intent.stateVersion,
        trxId: intent.trxId || undefined,
      });
      toast.success(`${intent.externalRefId} approved`, {
        description: 'Ledger settled and signed webhook dispatched.',
      });
      if (inspectingIntent?.id === intent.id) {
        setInspectingIntent(null);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setActiveActionId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingIntent || resolveMutation.isPending) return;
    setActiveActionId(`reject:${rejectingIntent.id}`);
    try {
      await resolveMutation.mutateAsync({
        paymentIntentId: rejectingIntent.id,
        decision: 'REJECT',
        expectedStateVersion: rejectingIntent.stateVersion,
        reason: rejectReason.trim() || 'Rejected by merchant review',
      });
      toast.success(`${rejectingIntent.externalRefId} rejected`);
      setRejectingIntent(null);
      setRejectReason('');
      if (inspectingIntent?.id === rejectingIntent.id) {
        setInspectingIntent(null);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setActiveActionId(null);
    }
  };

  const handleCustomAction = async (intent: PaymentIntentView, actionId: string, label: string) => {
    setActiveActionId(`custom:${intent.id}:${actionId}`);
    try {
      await actionMutation.mutateAsync({
        paymentIntentId: intent.id,
        actionId,
      });
      toast.success(`${label} dispatched`, {
        description: `Action webhook triggered for ${intent.externalRefId}.`,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActiveActionId(null);
    }
  };

  const handleCreateIntent = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(newAmount);
    if (!newRefId.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Provide a valid reference ID and positive amount');
      return;
    }

    try {
      const created = await createMutation.mutateAsync({
        externalRefId: newRefId.trim(),
        vertical: newVertical,
        amount: numericAmount,
        display: newTitle.trim()
          ? { title: newTitle.trim(), category: newVertical }
          : undefined,
      });
      setCreatedCheckoutUrl(created.checkoutUrl);
      toast.success('Payment intent & session created');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payment intent');
    }
  };

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Summary Header Card */}
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center sm:pt-6">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiBankCardLine className="size-5" aria-hidden />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-title-2-medium text-text-primary">
                  Universal Payments &amp; Manual Review
                </h2>
                {manualReviewCount > 0 && (
                  <Chip variant="bold" color="yellow" className="gap-1.5">
                    <StatusDot color="yellow" />
                    <span>{manualReviewCount} awaiting review</span>
                  </Chip>
                )}
              </div>
              <p className="text-body-regular text-text-secondary">
                Unified payment intents and screenshot proof review across every storefront channel.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="small"
              onClick={() => refetch()}
              isLoading={isFetching}
              leadingIcon={RiRefreshLine}
              className="min-h-11 sm:min-h-10"
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="small"
              leadingIcon={RiAddLine}
              onClick={() => {
                setCreatedCheckoutUrl(null);
                setNewRefId(`INV-${Math.floor(10000 + Math.random() * 90000)}`);
                setIsCreateOpen(true);
              }}
              className="min-h-11 sm:min-h-10"
            >
              New Payment Intent
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters + Intents Table */}
      <Card>
        <div className="flex flex-col justify-between gap-3 border-b border-separator-border p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <SearchField
              aria-label="Search payment intents"
              placeholder="Search reference ID, TrxID, sender, or title..."
              value={searchQuery}
              onChange={setSearchQuery}
              shape="pill"
              className="w-full lg:w-80"
            />

            <div className="flex flex-wrap items-center gap-2">
              <RiFilter3Line className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
              {subProjects.length > 0 && (
                <Select
                  aria-label="Filter by project"
                  size="md"
                  selectedKey={selectedProjectId}
                  onSelectionChange={(key) => {
                    if (key != null) setSelectedProjectId(String(key));
                  }}
                  className="min-w-[170px]"
                >
                  <SelectItem id="ALL" textValue="All projects">
                    All projects
                  </SelectItem>
                  {subProjects.map((sp) => (
                    <SelectItem key={sp.id} id={sp.id} textValue={sp.name}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </Select>
              )}
              <Select
                aria-label="Filter by vertical"
                size="md"
                selectedKey={selectedVertical}
                onSelectionChange={(key) => {
                  if (key != null) setSelectedVertical(String(key) as VerticalProfile | 'ALL');
                }}
                className="min-w-[180px]"
              >
                {VERTICAL_FILTERS.map((v) => (
                  <SelectItem key={v.value} id={v.value} textValue={v.label}>
                    {v.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

          <PillTabList aria-label="Filter payment intents by status" className="flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <PillTab
                key={f.value}
                variant="gray"
                isSelected={selectedStatus === f.value}
                onSelect={() => setSelectedStatus(f.value)}
              >
                {f.label}
              </PillTab>
            ))}
          </PillTabList>
        </div>

        {isLoading ? (
          <div aria-busy="true" aria-label="Loading payment intents" className="space-y-3 p-5">
            {Array.from({ length: 5 }, (_, idx) => (
              <Skeleton key={idx} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-14 text-center space-y-1.5">
            <RiBankCardLine className="size-8 mx-auto text-foreground-icon-tertiary" aria-hidden />
            <p className="text-body-medium text-text-primary">No payment intents found</p>
            <p className="text-caption-1-regular text-text-secondary max-w-md mx-auto">
              Create an intent via API, Payment Link, or click &quot;New Payment Intent&quot; above.
            </p>
          </div>
        ) : (
          <Table aria-label="Universal payment intents table">
            <TableHeader>
              <TableColumn isRowHeader>Reference &amp; Vertical</TableColumn>
              <TableColumn>Context &amp; Customer</TableColumn>
              <TableColumn>MFS &amp; TrxID</TableColumn>
              <TableColumn>Amount</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn className="text-end">Actions</TableColumn>
            </TableHeader>

            <TableBody>
              {items.map((intent) => {
                const statusBadge = getStatusChip(intent.status);
                const verticalBadge = getVerticalChip(intent.vertical);
                const providerMeta = intent.provider ? MFS_METADATA[intent.provider] : null;
                const canResolve = isResolvable(intent.status);

                return (
                  <TableRow key={intent.id} id={intent.id}>
                    <TableCell>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            title={intent.externalRefId}
                            className="font-mono text-body-medium text-text-primary truncate max-w-[160px]"
                          >
                            {intent.externalRefId}
                          </span>
                          <Chip variant="caption" color={verticalBadge.color} className="shrink-0">
                            {verticalBadge.label}
                          </Chip>
                          {intent.projectName && (
                            <Chip variant="caption" color="purple" className="shrink-0">
                              {intent.projectName}
                            </Chip>
                          )}
                        </div>
                        <span className="text-caption-2-regular text-text-tertiary block whitespace-nowrap tabular-nums tnum">
                          {formatDate(intent.createdAt)} · v{intent.stateVersion}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="max-w-xs space-y-0.5">
                        <div
                          title={intent.display?.title || intent.display?.appName || 'Payment Intent'}
                          className="text-caption-1-medium text-text-primary truncate"
                        >
                          {intent.display?.title || intent.display?.appName || 'Payment Intent'}
                        </div>
                        {intent.display?.subtitle && (
                          <div className="text-caption-2-regular text-text-secondary truncate">
                            {intent.display.subtitle}
                          </div>
                        )}
                        {(intent.customer?.name || intent.customer?.email || intent.customer?.phone) && (
                          <div className="text-caption-2-regular text-text-tertiary truncate">
                            {intent.customer.name || intent.customer.email || intent.customer.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          {providerMeta ? (
                            <Chip
                              variant="caption"
                              style={{ backgroundColor: providerMeta.bgSoft, color: providerMeta.color }}
                            >
                              {providerMeta.name}
                            </Chip>
                          ) : (
                            <Chip variant="caption" color="neutral">
                              Pending method
                            </Chip>
                          )}
                          {intent.receiptUrl && (
                            <Chip variant="caption" color="cyan" className="gap-1">
                              <RiImageLine className="size-3" aria-hidden />
                              <span>Proof</span>
                            </Chip>
                          )}
                        </div>
                        {intent.trxId && (
                          <div
                            title={intent.trxId}
                            className="font-mono text-caption-2-medium text-text-primary truncate max-w-[160px]"
                          >
                            {intent.trxId}
                          </div>
                        )}
                        {intent.senderNumber && (
                          <div className="font-mono text-caption-2-regular text-text-tertiary whitespace-nowrap tabular-nums tnum">
                            {intent.senderNumber}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="font-mono tabular-nums tnum whitespace-nowrap space-y-0.5">
                        <div className="text-body-medium text-text-primary">
                          {formatBDT(intent.paidAmount ?? intent.uniqueAmount)}
                        </div>
                        {intent.uniqueAmount !== intent.baseAmount && (
                          <div className="text-caption-2-regular text-text-tertiary">
                            Base {formatBDT(intent.baseAmount)}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        <Chip variant="bold" color={statusBadge.color}>
                          {statusBadge.label}
                        </Chip>
                        {intent.escalationReason && (
                          <div
                            title={intent.escalationReason}
                            className="text-caption-2-regular text-text-tertiary max-w-[160px] truncate"
                          >
                            {intent.escalationReason}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-end">
                      <div className="shrink-0 flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="xs"
                          leadingIcon={RiEyeLine}
                          onClick={() => setInspectingIntent(intent)}
                        >
                          Inspect
                        </Button>

                        {canResolve && (
                          <>
                            <Button
                              variant="primary"
                              size="xs"
                              leadingIcon={RiCheckboxCircleLine}
                              isLoading={activeActionId === `approve:${intent.id}`}
                              onClick={() => handleApprove(intent)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              leadingIcon={RiCloseCircleLine}
                              onClick={() => {
                                setRejectingIntent(intent);
                                setRejectReason('');
                              }}
                              className="text-text-destructive"
                            >
                              Reject
                            </Button>
                          </>
                        )}

                        {(intent.actions || []).map((act) => (
                          <Button
                            key={act.id}
                            variant={act.style === 'danger' ? 'danger' : act.style === 'primary' ? 'primary' : 'secondary'}
                            size="xs"
                            isLoading={activeActionId === `custom:${intent.id}:${act.id}`}
                            onClick={() => handleCustomAction(intent, act.id, act.label)}
                          >
                            {act.label}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Inspect Payment Intent + Receipt Proof Modal */}
      <Modal
        isOpen={Boolean(inspectingIntent)}
        onOpenChange={(open) => !open && setInspectingIntent(null)}
        size="lg"
      >
        {inspectingIntent && (
          <>
            <ModalHeader
              title={inspectingIntent.display?.title || inspectingIntent.externalRefId}
              description={inspectingIntent.display?.appName || 'Merchant'}
            />
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-background-secondary-default border border-separator-border">
                <div>
                  <span className="text-caption-2-medium text-text-tertiary block">Status</span>
                  <Chip variant="caption" color={getStatusChip(inspectingIntent.status).color} className="mt-1">
                    {getStatusChip(inspectingIntent.status).label}
                  </Chip>
                </div>
                <div>
                  <span className="text-caption-2-medium text-text-tertiary block">Amount</span>
                  <span className="font-mono text-body-medium text-text-primary tabular-nums">
                    {formatBDT(inspectingIntent.paidAmount ?? inspectingIntent.uniqueAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-caption-2-medium text-text-tertiary block">TrxID</span>
                  <span className="font-mono text-caption-1-semibold text-text-primary">
                    {inspectingIntent.trxId || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-caption-2-medium text-text-tertiary block">Sender</span>
                  <span className="font-mono text-caption-1-medium text-text-secondary tabular-nums">
                    {inspectingIntent.senderNumber || '—'}
                  </span>
                </div>
              </div>

              {(() => {
                const seenLabels = new Set<string>();
                const filteredHighlights = (inspectingIntent.display?.highlights ?? []).filter((h) => {
                  const normalizedLabel = h.label.trim().toLowerCase();
                  if (!h.value || normalizedLabel === 'customer' || normalizedLabel === 'payable') {
                    return false;
                  }
                  if (seenLabels.has(normalizedLabel)) {
                    return false;
                  }
                  seenLabels.add(normalizedLabel);
                  return true;
                });

                if (filteredHighlights.length === 0) return null;

                return (
                  <div className="space-y-2">
                    <h4 className="text-caption-1-semibold text-text-primary">
                      Context highlights
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredHighlights.map((h, idx) => (
                        <div
                          key={`${h.label}-${idx}`}
                          className="px-3 py-2 rounded-xl bg-background-secondary-default border border-separator-border flex items-center justify-between gap-2 text-caption-1-regular"
                        >
                          <span className="text-text-tertiary">{h.label}</span>
                          <span className="text-text-primary font-medium">{h.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {inspectingIntent.escalationReason && (
                <div className="p-3 rounded-xl bg-background-secondary-default border border-separator-border text-caption-1-regular">
                  <span className="text-text-tertiary">Escalation reason: </span>
                  <span className="font-mono text-text-primary">{inspectingIntent.escalationReason}</span>
                </div>
              )}

              {inspectingIntent.receiptUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-caption-1-semibold text-text-primary">
                      Uploaded receipt proof
                    </h4>
                    <a
                      href={inspectingIntent.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-caption-1-medium text-text-primary underline underline-offset-2"
                    >
                      <span>Open full image</span>
                      <RiExternalLinkLine className="size-3.5" aria-hidden />
                    </a>
                  </div>
                  <div className="rounded-2xl overflow-hidden border border-border-button-default bg-background-secondary-default">
                    <img
                      src={inspectingIntent.receiptUrl}
                      alt={`Payment proof for ${inspectingIntent.externalRefId}`}
                      className="max-h-72 w-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-border-button-default text-center text-caption-1-regular text-text-tertiary">
                  No receipt screenshot attached to this submission.
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              {inspectingIntent.display?.adminDeepLink && (
                <a
                  href={inspectingIntent.display.adminDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:me-auto inline-flex items-center gap-1 text-caption-1-medium text-text-secondary hover:text-text-primary underline underline-offset-2"
                >
                  <span>Open external admin record</span>
                  <RiExternalLinkLine className="size-3.5" aria-hidden />
                </a>
              )}
              {isResolvable(inspectingIntent.status) && (
                <>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setRejectingIntent(inspectingIntent);
                      setRejectReason('');
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    isLoading={activeActionId === `approve:${inspectingIntent.id}`}
                    onClick={() => handleApprove(inspectingIntent)}
                  >
                    Approve Payment
                  </Button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* Reject Reason Dialog */}
      <Modal
        isOpen={Boolean(rejectingIntent)}
        onOpenChange={(open) => !open && setRejectingIntent(null)}
        size="sm"
        role="alertdialog"
      >
        <ModalHeader
          title="Reject payment submission"
          description={`Ref: ${rejectingIntent?.externalRefId || ''}. Provide a reason visible to the customer or team.`}
          tone="danger"
        />
        <ModalBody>
          <Input
            label="Rejection reason"
            placeholder="e.g. TrxID not found in MFS statement"
            value={rejectReason}
            onChange={setRejectReason}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setRejectingIntent(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={Boolean(rejectingIntent && activeActionId === `reject:${rejectingIntent.id}`)}
            onClick={handleConfirmReject}
          >
            Confirm Reject
          </Button>
        </ModalFooter>
      </Modal>

      {/* New Payment Intent Modal */}
      <Modal
        isOpen={isCreateOpen}
        onOpenChange={(open) => setIsCreateOpen(open)}
        size="md"
      >
        <ModalHeader
          title="Create Universal Payment Intent"
          description="Generate a hosted checkout session for any vertical."
        />
        <form onSubmit={handleCreateIntent}>
          <ModalBody className="space-y-4">
            <Input
              label="External Reference ID"
              value={newRefId}
              onChange={setNewRefId}
              placeholder="e.g. REG-2026-881"
              inputClassName="font-mono"
              isRequired
            />
            <Input
              label="Display Title (Optional)"
              value={newTitle}
              onChange={setNewTitle}
              placeholder="e.g. Ovijatrik 10K Marathon Registration"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Vertical Profile"
                selectedKey={newVertical}
                onSelectionChange={(key) => {
                  if (key != null) setNewVertical(String(key) as VerticalProfile);
                }}
              >
                {VERTICAL_FILTERS.filter((v) => v.value !== 'ALL').map((v) => (
                  <SelectItem key={v.value} id={v.value} textValue={v.label}>
                    {v.label}
                  </SelectItem>
                ))}
              </Select>
              <Input
                label="Base Amount (BDT)"
                type="number"
                value={newAmount}
                onChange={setNewAmount}
                inputClassName="font-mono tabular-nums"
                isRequired
              />
            </div>

            {createdCheckoutUrl && (
              <div className="p-3.5 rounded-2xl bg-notification-success-background text-notification-success-foreground space-y-2">
                <span className="text-caption-1-semibold block">
                  Hosted checkout URL ready
                </span>
                <div className="flex items-center gap-2">
                  <code className="text-caption-2-regular font-mono truncate flex-1">
                    {createdCheckoutUrl}
                  </code>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    leadingIcon={RiFileCopyLine}
                    onClick={() => {
                      navigator.clipboard.writeText(createdCheckoutUrl);
                      toast.success('Checkout URL copied');
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Close
            </Button>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending}>
              Create Session
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
