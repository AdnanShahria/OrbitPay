import { useState } from 'react';
import { usePublicPaymentLink, usePayPublicLink } from './usePaymentLinks';
import { useCheckout } from '@/features/checkout/useCheckout';
import { CheckoutDisplayHeader } from '@/features/checkout/CheckoutDisplayHeader';
import { CheckoutStepper } from '@/features/checkout/CheckoutStepper';
import { PollingStatus } from '@/features/checkout/PollingStatus';
import {
  OrbitFloatingWhatsapp,
  OrbitMarketingBar,
} from '@/features/platform/OrbitMarketingBar';
import type { PlatformPublicConfig } from '@/features/platform/usePlatformConfig';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Spinner } from '@/components/base/spinner/spinner';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { formatBDT, MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiErrorWarningLine,
  RiLock2Line,
  RiMailLine,
  RiShieldCheckLine,
} from '@remixicon/react';

export interface PublicPaymentLinkPageProps {
  slug: string;
  merchantSlug?: string;
}

function getStoreMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'O';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function PublicPaymentLinkPage({ slug, merchantSlug }: PublicPaymentLinkPageProps) {
  const { data: link, isLoading, error } = usePublicPaymentLink(slug, merchantSlug);
  const payMutation = usePayPublicLink(slug, merchantSlug);

  const [openAmount, setOpenAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [showReferenceNote, setShowReferenceNote] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<MfsProvider | undefined>(undefined);

  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    sessionToken: string;
    initialCustomerEmail?: string;
  } | null>(null);

  if (activeSession) {
    return (
      <PublicLinkActiveCheckout
        sessionId={activeSession.sessionId}
        sessionToken={activeSession.sessionToken}
        initialCustomerEmail={activeSession.initialCustomerEmail}
        sharePath={link?.sharePath || (merchantSlug ? `/${merchantSlug}/${slug}` : `/l/${slug}`)}
        platformConfig={link?.platformConfig}
        onReset={() => setActiveSession(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-full flex flex-col items-center justify-center gap-3 p-4">
        <Spinner size="lg" aria-label="Loading payment link" className="text-text-primary" />
        <span className="text-caption-1-medium text-text-secondary tracking-tight">
          Preparing secure checkout...
        </span>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-[460px] space-y-4">
          <div className="rounded-3xl border border-separator-border bg-background-primary-default shadow-card p-8 text-center space-y-4">
            <div className="size-12 rounded-2xl bg-notification-error-background text-notification-error-foreground flex items-center justify-center mx-auto">
              <RiErrorWarningLine className="size-6" aria-hidden />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-title-3-semibold text-text-primary">
                Payment link unavailable
              </h1>
              <p className="text-body-regular text-text-secondary">
                {error instanceof Error
                  ? error.message
                  : 'This link is expired, paused, or does not exist.'}
              </p>
            </div>
          </div>

          <OrbitMarketingBar compact />
        </div>
        <OrbitFloatingWhatsapp />
      </div>
    );
  }

  const uniqueProviders = Array.from(new Set(link.activeWallets.map((w) => w.provider)));
  const effectiveProvider = selectedProvider || uniqueProviders[0] || 'BKASH';
  const displayStoreName = link.display?.appName || link.storeName;
  const monogram = getStoreMonogram(displayStoreName);
  const resolvedAmountPreview =
    link.amountType === 'FIXED' && link.fixedAmount != null
      ? link.fixedAmount
      : Number(openAmount) > 0
        ? Number(openAmount)
        : null;

  const handleProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    let numericAmount: number | undefined;
    if (link.amountType === 'OPEN') {
      numericAmount = Number(openAmount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        toast.error('Please enter a valid amount in BDT');
        return;
      }
      if (link.minAmount != null && numericAmount < link.minAmount) {
        toast.error(`Minimum amount is ${formatBDT(link.minAmount)}`);
        return;
      }
      if (link.maxAmount != null && numericAmount > link.maxAmount) {
        toast.error(`Maximum amount is ${formatBDT(link.maxAmount)}`);
        return;
      }
    }

    const trimmedEmail = customerEmail.trim();

    try {
      const result = await payMutation.mutateAsync({
        amount: numericAmount,
        provider: effectiveProvider,
        customerName: customerName.trim() || undefined,
        customerEmail: trimmedEmail || undefined,
        customerPhone: customerPhone.trim() || undefined,
        referenceNote: referenceNote.trim() || undefined,
      });

      setActiveSession({
        sessionId: result.sessionId,
        sessionToken: result.sessionToken,
        initialCustomerEmail: trimmedEmail || undefined,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not start payment session');
    }
  };

  return (
    <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6 antialiased relative">
      {/* Serene monochrome top bar */}
      <div className="w-full max-w-[460px] flex items-center justify-between gap-3 mb-4 px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-xl bg-text-primary text-background-primary-default flex items-center justify-center text-caption-1-semibold tracking-tight shrink-0">
            {monogram}
          </div>
          <span className="text-body-medium text-text-primary truncate block">
            {displayStoreName}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-separator-border bg-background-primary-default text-caption-2-medium text-text-secondary whitespace-nowrap">
            <StatusDot color={link.deviceStatus.online ? 'green' : 'yellow'} />
            <span>{link.deviceStatus.online ? 'Instant' : 'Safe Queue'}</span>
          </span>
          <ThemeToggle appearance="segmented" size="small" />
        </div>
      </div>

      {/* Main Editorial Checkout Card */}
      <div className="w-full max-w-[460px] space-y-4">
        <div className="rounded-3xl border border-separator-border bg-background-primary-default shadow-card overflow-hidden">
          {/* Amount & Offer Header */}
          <div className="p-6 border-b border-separator-border bg-background-secondary-default/40 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <Chip variant="caption" color="soft" className="capitalize">
                {link.vertical.replace(/_/g, ' ')}
              </Chip>
              <span className="inline-flex items-center gap-1 text-caption-2-medium text-text-tertiary whitespace-nowrap">
                <RiLock2Line className="size-3 shrink-0" aria-hidden />
                <span>0% gateway fee</span>
              </span>
            </div>

            <div className="space-y-1">
              <h1 className="text-title-2-medium text-text-primary tracking-tight">
                {link.title}
              </h1>
              {link.description && (
                <p className="text-body-regular text-text-secondary leading-relaxed">
                  {link.description}
                </p>
              )}
            </div>

            {link.amountType === 'FIXED' && link.fixedAmount != null && (
              <div className="pt-1 flex items-baseline justify-between gap-3">
                <span className="text-caption-1-medium text-text-tertiary">Total payable</span>
                <span className="font-mono text-title-1-semibold text-text-primary tnum whitespace-nowrap tracking-tight">
                  {formatBDT(link.fixedAmount)}
                </span>
              </div>
            )}
          </div>

          {/* Interactive Payment Form */}
          <form onSubmit={handleProceed} className="p-6 space-y-5">
            {link.amountType === 'OPEN' && (
              <Input
                label="Enter Amount (BDT)"
                type="number"
                value={openAmount}
                onChange={setOpenAmount}
                placeholder={link.minAmount ? `Min ${link.minAmount}` : '0.00'}
                hint={
                  link.minAmount != null || link.maxAmount != null
                    ? `${link.minAmount != null ? `Min ${formatBDT(link.minAmount)}` : ''}${link.minAmount != null && link.maxAmount != null ? ' · ' : ''}${link.maxAmount != null ? `Max ${formatBDT(link.maxAmount)}` : ''}`
                    : 'Enter amount in BDT'
                }
                inputClassName="font-mono text-title-3-semibold tnum"
                isRequired
              />
            )}

            {/* Minimal MFS Method Pills */}
            {uniqueProviders.length > 0 && (
              <div className="space-y-2">
                <span className="text-caption-1-medium text-text-secondary block">
                  Pay with
                </span>
                <div className="flex flex-wrap gap-2">
                  {uniqueProviders.map((prov) => {
                    const meta = MFS_METADATA[prov];
                    const selected = effectiveProvider === prov;
                    return (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => setSelectedProvider(prov)}
                        className={cx(
                          'min-h-11 px-3.5 rounded-full border text-caption-1-semibold inline-flex items-center gap-2 transition-colors cursor-pointer',
                          selected
                            ? 'border-text-primary bg-background-secondary-default text-text-primary shadow-2xs'
                            : 'border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:text-text-primary',
                        )}
                      >
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: meta?.color }}
                        />
                        <span>{meta?.name || prov}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Buyer Details with Visibly Rendered Email */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Your Name"
                  value={customerName}
                  onChange={setCustomerName}
                  placeholder="Optional"
                />
                <Input
                  label="Mobile Number"
                  type="tel"
                  value={customerPhone}
                  onChange={setCustomerPhone}
                  placeholder="017XXXXXXXX"
                  inputClassName="font-mono tnum"
                />
              </div>

              <Input
                label="Email (for receipt & invoice)"
                type="email"
                value={customerEmail}
                onChange={setCustomerEmail}
                placeholder="you@example.com"
                leadingIcon={RiMailLine}
                hint="Confirmation & invoice via OrbitMail"
              />

              {showReferenceNote ? (
                <Input
                  label="Reference / Note (Optional)"
                  value={referenceNote}
                  onChange={setReferenceNote}
                  placeholder="Order ID or note"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReferenceNote(true)}
                  className="text-caption-1-medium text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                >
                  + Add reference note
                </button>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="medium"
              isLoading={payMutation.isPending}
              trailingIcon={RiArrowRightLine}
              className="w-full min-h-11 rounded-2xl"
            >
              {resolvedAmountPreview
                ? `Continue to Pay ${formatBDT(resolvedAmountPreview)}`
                : 'Continue to Payment'}
            </Button>

            <div className="flex items-center justify-between gap-2 text-caption-2-medium text-text-tertiary pt-1">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <RiShieldCheckLine className="size-3.5 text-status-lime-text shrink-0" aria-hidden />
                <span>ORBIT Pay Hub</span>
              </span>
              <span className="whitespace-nowrap">0% gateway fee</span>
            </div>
          </form>
        </div>

        <OrbitMarketingBar initialConfig={link.platformConfig} compact />
      </div>

      <OrbitFloatingWhatsapp initialConfig={link.platformConfig} />
    </div>
  );
}

function PublicLinkActiveCheckout({
  sessionId,
  sessionToken,
  initialCustomerEmail,
  sharePath,
  platformConfig,
  onReset,
}: {
  sessionId: string;
  sessionToken: string;
  initialCustomerEmail?: string;
  sharePath: string;
  platformConfig?: PlatformPublicConfig;
  onReset: () => void;
}) {
  const {
    currentStep,
    preferredStepperStep,
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
    customerEmail,
    setCustomerEmail,
    merchantId,
    orderId,
    storeName,
    vertical,
    baseAmount,
    uniqueAmount,
    offsetCents,
    expiresAt,
    graceExpiresAt,
    returnUrl,
    cancelUrl,
    verificationMode,
    receiptPolicy,
    deviceStatus,
    display,
    pollingStatus,
    escalationReason,
    submitAttempts,
    maxSubmitAttempts,
    receiptUrl,
    receiptUploadCount,
    receiptMaxUploads,
    isUploadingReceipt,
    receiptError,
    isSessionLoading,
    isSubmitting,
    errorMessage,
    verifiedData,
    uploadReceipt,
    submitPayment,
    editSubmission,
    markVerified,
    handlePollStateChange,
  } = useCheckout({
    sessionId,
    sessionToken,
    customerEmail: initialCustomerEmail,
  });

  return (
    <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6 antialiased">
      <div className="w-full max-w-[460px] flex items-center justify-between gap-3 mb-4 px-1">
        <Button
          variant="ghost"
          size="xs"
          leadingIcon={RiArrowLeftLine}
          onClick={onReset}
          className="min-h-11 sm:min-h-8"
        >
          Back to details
        </Button>

        <div className="flex items-center gap-2">
          <span className="font-mono text-caption-2-medium text-text-tertiary hidden sm:inline truncate max-w-44">
            {sharePath}
          </span>
          <ThemeToggle appearance="segmented" size="small" />
        </div>
      </div>

      <div className="w-full max-w-[460px] space-y-4">
        <div className="rounded-3xl border border-separator-border bg-background-primary-default shadow-card p-6 space-y-5">
          <div className="pb-4 border-b border-separator-border">
            <CheckoutDisplayHeader
              storeName={storeName}
              orderId={orderId}
              vertical={vertical}
              display={display}
              baseAmount={baseAmount}
              uniqueAmount={uniqueAmount}
              offsetCents={offsetCents}
              isSessionLoading={isSessionLoading}
            />
          </div>

          {currentStep === 'POLLING' || currentStep === 'SUCCESS' ? (
            <PollingStatus
              orderId={orderId}
              expectedAmount={verifiedData?.amount ?? (Number(paidAmount) || uniqueAmount)}
              provider={selectedProvider}
              trxId={verifiedData?.trxId || trxId}
              senderNumber={senderNumber}
              merchantId={merchantId}
              customerEmail={customerEmail}
              storeName={storeName}
              baseAmount={baseAmount}
              offsetCents={offsetCents}
              initialVerified={currentStep === 'SUCCESS'}
              initialMatchType={verifiedData?.matchType ?? null}
              initialStatus={pollingStatus}
              initialEscalationReason={escalationReason}
              receiptUrl={receiptUrl}
              returnUrl={returnUrl}
              cancelUrl={cancelUrl}
              graceExpiresAt={graceExpiresAt}
              submitAttempts={submitAttempts}
              maxSubmitAttempts={maxSubmitAttempts}
              onEditSubmission={editSubmission}
              onStatusChange={handlePollStateChange}
              onVerified={markVerified}
            />
          ) : (
            <CheckoutStepper
              initialStep={preferredStepperStep}
              baseAmount={baseAmount}
              uniqueAmount={uniqueAmount}
              offsetCents={offsetCents}
              orderId={orderId}
              expiresAt={expiresAt}
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
              customerEmail={customerEmail}
              onChangeCustomerEmail={setCustomerEmail}
              verificationMode={verificationMode}
              receiptPolicy={receiptPolicy}
              deviceStatus={deviceStatus}
              sessionToken={sessionToken}
              receiptUrl={receiptUrl}
              receiptUploadCount={receiptUploadCount}
              receiptMaxUploads={receiptMaxUploads}
              isUploadingReceipt={isUploadingReceipt}
              receiptError={receiptError}
              onUploadReceipt={uploadReceipt}
              submitAttempts={submitAttempts}
              maxSubmitAttempts={maxSubmitAttempts}
              onSubmit={submitPayment}
              isSubmitting={isSubmitting}
              isSessionLoading={isSessionLoading}
              errorMessage={errorMessage}
            />
          )}

          <div className="pt-4 border-t border-separator-border flex items-center justify-center text-caption-2-medium text-text-tertiary">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <RiShieldCheckLine className="size-3.5 text-status-lime-text shrink-0" aria-hidden />
              <span>ORBIT Pay Hub · 0% gateway fee</span>
            </span>
          </div>
        </div>

        <OrbitMarketingBar initialConfig={platformConfig} compact />
      </div>

      <OrbitFloatingWhatsapp initialConfig={platformConfig} />
    </div>
  );
}
