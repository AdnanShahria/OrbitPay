import { useState } from 'react';
import {
  usePaymentLinks,
  useCreatePaymentLink,
  useUpdatePaymentLink,
  useDeletePaymentLink,
  type PaymentLinkAmountType,
  type PaymentLinkView,
} from './usePaymentLinks';
import type { VerticalProfile } from '@/features/payments/usePaymentIntents';
import type { VerificationMode } from '@/features/checkout/useCheckout';
import { Card, CardContent } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { Switch } from '@/components/base/switch/switch';
import { Chip } from '@/components/base/badges/chip';
import { Modal, ModalHeader, ModalBody, ModalFooter, AlertDialog } from '@/components/base/modal/modal';
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
import { formatBDT, formatDate } from '@/shared/utils/format';
import {
  RiAddLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiLinksLine,
} from '@remixicon/react';

const VERTICAL_OPTIONS: Array<{ label: string; value: VerticalProfile }> = [
  { label: 'Custom / General', value: 'custom' },
  { label: 'Event / Marathon / Booking', value: 'booking_appointment' },
  { label: 'Course / LMS', value: 'lms_course' },
  { label: 'SaaS Subscription', value: 'saas_subscription' },
  { label: 'B2B Invoice', value: 'invoice_b2b' },
  { label: 'Donation / Charity', value: 'donation' },
  { label: 'Digital Topup', value: 'digital_topup' },
  { label: 'E-Commerce', value: 'ecommerce' },
];

export function PaymentLinksManager() {
  const { data: links = [], isLoading } = usePaymentLinks();
  const createMutation = useCreatePaymentLink();
  const updateMutation = useUpdatePaymentLink();
  const deleteMutation = useDeletePaymentLink();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingLink, setDeletingLink] = useState<PaymentLinkView | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [vertical, setVertical] = useState<VerticalProfile>('custom');
  const [amountType, setAmountType] = useState<PaymentLinkAmountType>('FIXED');
  const [fixedAmount, setFixedAmount] = useState('500');
  const [minAmount, setMinAmount] = useState('50');
  const [maxAmount, setMaxAmount] = useState('');
  const [verificationMode, setVerificationMode] = useState<'DEFAULT' | VerificationMode>('DEFAULT');
  const [maxUses, setMaxUses] = useState('');
  const [returnUrl, setReturnUrl] = useState('');

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://payment.orbitsaas.cloud';

  const getShareUrl = (linkSlug: string) => `${origin}/l/${linkSlug}`;

  const handleCopyLink = (link: PaymentLinkView) => {
    const url = getShareUrl(link.slug);
    navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    toast.success('Payment link copied', { description: url });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resetForm = () => {
    setTitle('');
    setSlug('');
    setDescription('');
    setVertical('custom');
    setAmountType('FIXED');
    setFixedAmount('500');
    setMinAmount('50');
    setMaxAmount('');
    setVerificationMode('DEFAULT');
    setMaxUses('');
    setReturnUrl('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a link title');
      return;
    }

    const numericFixed = Number(fixedAmount);
    if (amountType === 'FIXED' && (!Number.isFinite(numericFixed) || numericFixed <= 0)) {
      toast.error('Fixed amount must be greater than 0');
      return;
    }

    try {
      const created = await createMutation.mutateAsync({
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        vertical,
        amountType,
        fixedAmount: amountType === 'FIXED' ? numericFixed : undefined,
        minAmount: amountType === 'OPEN' && Number(minAmount) > 0 ? Number(minAmount) : undefined,
        maxAmount: amountType === 'OPEN' && Number(maxAmount) > 0 ? Number(maxAmount) : undefined,
        verificationMode: verificationMode === 'DEFAULT' ? undefined : verificationMode,
        maxUses: Number(maxUses) > 0 ? Number(maxUses) : undefined,
        returnUrl: returnUrl.trim() || undefined,
      });

      toast.success('Payment link created', {
        description: getShareUrl(created.slug),
      });
      setIsCreateOpen(false);
      resetForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create payment link');
    }
  };

  const handleToggleActive = async (link: PaymentLinkView, isSelected: boolean) => {
    try {
      await updateMutation.mutateAsync({
        id: link.id,
        patch: { isActive: isSelected },
      });
      toast.success(isSelected ? 'Payment link activated' : 'Payment link paused');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update link status');
    }
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center sm:pt-6">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-title-2-medium text-text-primary">
              <RiLinksLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span>Shareable No-Code Payment Links</span>
            </h2>
            <p className="text-body-regular text-text-secondary">
              Create instant <code className="font-mono text-text-primary">/l/your-slug</code> checkout pages for events, marathons, courses, donations, or freelance invoices — zero code required.
            </p>
          </div>

          <Button
            variant="primary"
            size="medium"
            leadingIcon={RiAddLine}
            onClick={() => setIsCreateOpen(true)}
            className="min-h-11 shrink-0"
          >
            Create Payment Link
          </Button>
        </CardContent>
      </Card>

      <Card>
        {isLoading ? (
          <div aria-busy="true" aria-label="Loading payment links" className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, idx) => (
              <Skeleton key={idx} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : links.length === 0 ? (
          <div className="px-5 py-14 text-center space-y-3">
            <RiLinksLine className="size-8 mx-auto text-foreground-icon-tertiary" aria-hidden />
            <div className="space-y-1">
              <p className="text-body-medium text-text-primary">No payment links yet</p>
              <p className="text-caption-1-regular text-text-secondary max-w-md mx-auto">
                Publish a fixed-price or open-amount checkout link that buyers can pay via bKash, Nagad, Rocket, Upay, or Cellfin.
              </p>
            </div>
            <Button
              variant="secondary"
              size="small"
              leadingIcon={RiAddLine}
              onClick={() => setIsCreateOpen(true)}
            >
              Create your first link
            </Button>
          </div>
        ) : (
          <Table aria-label="Merchant payment links">
            <TableHeader>
              <TableColumn isRowHeader>Title &amp; Share URL</TableColumn>
              <TableColumn>Vertical</TableColumn>
              <TableColumn>Pricing</TableColumn>
              <TableColumn>Usage</TableColumn>
              <TableColumn>Active</TableColumn>
              <TableColumn className="text-end">Actions</TableColumn>
            </TableHeader>

            <TableBody>
              {links.map((link) => {
                const shareUrl = getShareUrl(link.slug);
                const isCopied = copiedId === link.id;
                return (
                  <TableRow key={link.id} id={link.id}>
                    <TableCell>
                      <div className="space-y-1 min-w-0">
                        <div className="text-body-medium text-text-primary truncate">
                          {link.title}
                        </div>
                        <div className="flex items-center gap-2 text-caption-2-medium text-text-tertiary">
                          <span className="font-mono truncate max-w-xs">/l/{link.slug}</span>
                          <span aria-hidden>·</span>
                          <span>{formatDate(link.createdAt)}</span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Chip variant="caption" color="soft" className="capitalize">
                        {link.vertical.replace(/_/g, ' ')}
                      </Chip>
                    </TableCell>

                    <TableCell>
                      <div className="font-mono tabular-nums tnum">
                        {link.amountType === 'FIXED' && link.fixedAmount != null ? (
                          <span className="text-body-medium text-text-primary">
                            {formatBDT(link.fixedAmount)}
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <Chip variant="caption" color="cyan" className="font-sans">
                              Open amount
                            </Chip>
                            {(link.minAmount != null || link.maxAmount != null) && (
                              <div className="text-caption-2-regular text-text-tertiary">
                                {link.minAmount != null ? `Min ${formatBDT(link.minAmount)}` : ''}
                                {link.minAmount != null && link.maxAmount != null ? ' · ' : ''}
                                {link.maxAmount != null ? `Max ${formatBDT(link.maxAmount)}` : ''}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-caption-1-medium text-text-primary tabular-nums">
                        {link.usedCount}
                        {link.maxUses != null ? ` / ${link.maxUses}` : ' uses'}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Switch
                        aria-label={`Toggle ${link.title} active state`}
                        size="sm"
                        isSelected={link.isActive}
                        onChange={(val) => handleToggleActive(link, val)}
                      />
                    </TableCell>

                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="xs"
                          leadingIcon={isCopied ? RiCheckLine : RiFileCopyLine}
                          onClick={() => handleCopyLink(link)}
                        >
                          {isCopied ? 'Copied' : 'Copy Link'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          leadingIcon={RiExternalLinkLine}
                          aria-label={`Open ${link.title}`}
                          onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                        />
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          leadingIcon={RiDeleteBinLine}
                          aria-label={`Delete ${link.title}`}
                          className="text-text-destructive"
                          onClick={() => setDeletingLink(link)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create Payment Link Modal */}
      <Modal isOpen={isCreateOpen} onOpenChange={setIsCreateOpen} size="lg">
        <ModalHeader
          title="Create Shareable Payment Link"
          description="Generate a standalone hosted checkout URL for buyers — no integration code needed."
        />
        <form onSubmit={handleCreate}>
          <ModalBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Link Title"
                value={title}
                onChange={setTitle}
                placeholder="e.g. Ovijatrik 10K Half Marathon"
                isRequired
              />
              <Input
                label="Custom Slug (Optional)"
                value={slug}
                onChange={(val) => setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="e.g. ovijatrik-10k"
                hint={`Public URL: /l/${slug || 'auto-generated'}`}
                inputClassName="font-mono"
              />
            </div>

            <Input
              label="Description / Buyer Note (Optional)"
              value={description}
              onChange={setDescription}
              placeholder="Includes race kit, medal, and timing bib"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Vertical Profile"
                selectedKey={vertical}
                onSelectionChange={(key) => {
                  if (key != null) setVertical(String(key) as VerticalProfile);
                }}
              >
                {VERTICAL_OPTIONS.map((v) => (
                  <SelectItem key={v.value} id={v.value} textValue={v.label}>
                    {v.label}
                  </SelectItem>
                ))}
              </Select>

              <Select
                label="Pricing Type"
                selectedKey={amountType}
                onSelectionChange={(key) => {
                  if (key != null) setAmountType(String(key) as PaymentLinkAmountType);
                }}
              >
                <SelectItem id="FIXED" textValue="Fixed Amount">
                  Fixed Amount
                </SelectItem>
                <SelectItem id="OPEN" textValue="Open / Buyer-Entered Amount">
                  Open / Buyer-Entered Amount
                </SelectItem>
              </Select>
            </div>

            {amountType === 'FIXED' ? (
              <Input
                label="Fixed Amount (BDT)"
                type="number"
                value={fixedAmount}
                onChange={setFixedAmount}
                inputClassName="font-mono tabular-nums"
                isRequired
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Minimum Amount (BDT)"
                  type="number"
                  value={minAmount}
                  onChange={setMinAmount}
                  inputClassName="font-mono tabular-nums"
                />
                <Input
                  label="Maximum Amount (BDT, Optional)"
                  type="number"
                  value={maxAmount}
                  onChange={setMaxAmount}
                  inputClassName="font-mono tabular-nums"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Verification Mode"
                selectedKey={verificationMode}
                onSelectionChange={(key) => {
                  if (key != null) {
                    setVerificationMode(String(key) as 'DEFAULT' | VerificationMode);
                  }
                }}
              >
                <SelectItem id="DEFAULT" textValue="Use Merchant Default">
                  Use Merchant Default
                </SelectItem>
                <SelectItem id="AUTO" textValue="AUTO (SMS + Fallback)">
                  AUTO (SMS + Fallback)
                </SelectItem>
                <SelectItem id="PURE_MANUAL" textValue="PURE_MANUAL (Admin Review)">
                  PURE_MANUAL (Admin Review)
                </SelectItem>
              </Select>

              <Input
                label="Max Uses (Optional)"
                type="number"
                value={maxUses}
                onChange={setMaxUses}
                placeholder="Unlimited"
                inputClassName="font-mono tabular-nums"
              />
            </div>

            <Input
              label="Success Return URL (Optional)"
              type="url"
              value={returnUrl}
              onChange={setReturnUrl}
              placeholder="https://yoursite.com/thank-you"
            />
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending}>
              Publish Payment Link
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <AlertDialog
        isOpen={Boolean(deletingLink)}
        onOpenChange={(open) => !open && setDeletingLink(null)}
        title="Delete payment link?"
        description={`"${deletingLink?.title || ''}" (/l/${deletingLink?.slug || ''}) will stop accepting new checkouts immediately.`}
        confirmLabel="Delete link"
        pendingLabel="Deleting..."
        onConfirm={async () => {
          if (!deletingLink) return;
          await deleteMutation.mutateAsync(deletingLink.id);
          toast.success('Payment link deleted');
          setDeletingLink(null);
        }}
      />
    </div>
  );
}
