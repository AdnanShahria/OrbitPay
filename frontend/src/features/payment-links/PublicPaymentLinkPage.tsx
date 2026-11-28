import { useState } from 'react';
import { usePublicPaymentLink, usePayPublicLink } from './usePaymentLinks';
import { useCheckout } from '@/features/checkout/useCheckout';
import { CheckoutDisplayHeader } from '@/features/checkout/CheckoutDisplayHeader';
import { CheckoutStepper } from '@/features/checkout/CheckoutStepper';
import { PollingStatus } from '@/features/checkout/PollingStatus';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Notification } from '@/components/base/notification/notification';
import { Spinner } from '@/components/base/spinner/spinner';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { formatBDT, MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiErrorWarningLine,
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
  const [selectedProvider, setSelectedProvider] = useState<MfsProvider | undefined>(undefined);

  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    sessionToken: string;
  } | null>(null);

  if (activeSession) {
    return (
      <PublicLinkActiveCheckout
        sessionId={activeSession.sessionId}
        sessionToken={activeSession.sessionToken}
        onReset={() => setActiveSession(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-full flex flex-col items-center justify-center gap-3 p-4">
        <Spinner size="lg" aria-label="Loading payment link" className="text-text-primary" />
        <span className="text-caption-1-medium text-text-secondary tracking-tight">
          Loading...
        </span>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-[440px]">
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
        </div>
      </div>
    );
  }

  const hasNoActiveWallets =
    link.hasActiveWallets === false || link.activeWallets.length === 0;
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
    if (hasNoActiveWallets) {
      return;
    }
    const trimmedName = customerName.trim();
    if (trimmedName.length < 2) {
      toast.error('Please enter your name');
      return;
    }

    const trimmedEmail = customerEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

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

    try {
      const result = await payMutation.mutateAsync({
        amount: numericAmount,
        provider: effectiveProvider,
        customerName: trimmedName,
        customerEmail: trimmedEmail || undefined,
      });

      setActiveSession({
        sessionId: result.sessionId,
        sessionToken: result.sessionToken,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not start payment session');
    }
  };

  return (
    <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6 antialiased">
      <div className="w-full max-w-[440px] flex items-center justify-between gap-3 mb-4 px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-xl bg-text-primary text-background-primary-default flex items-center justify-center text-caption-1-semibold tracking-tight shrink-0">
            {monogram}
          </div>
          <span className="text-body-medium text-text-primary truncate block">
            {displayStoreName}
          </span>
        </div>

        <ThemeToggle appearance="segmented" size="small" />
      </div>

      <div className="w-full max-w-[440px]">
        <div className="rounded-3xl border border-separator-border bg-background-primary-default shadow-card overflow-hidden">
          <div className="p-6 border-b border-separator-border bg-background-secondary-default/40 space-y-2.5">
            <h1 className="text-title-2-medium text-text-primary tracking-tight">
              {link.title}
            </h1>
            {link.description && (
              <p className="text-body-regular text-text-secondary leading-relaxed">
                {link.description}
              </p>
            )}
            {link.amountType === 'FIXED' && link.fixedAmount != null && (
              <div className="pt-1 flex items-baseline justify-between gap-3">
                <span className="text-caption-1-medium text-text-tertiary">Amount</span>
                <span className="font-mono text-title-1-semibold text-text-primary tnum whitespace-nowrap tracking-tight">
                  {formatBDT(link.fixedAmount)}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={handleProceed} className="p-6 space-y-5">
            {hasNoActiveWallets && (
              <Notification
                status="information"
                dismissible={false}
                title="Payments not active yet"
                description="Receiving MFS numbers are not configured yet. Please contact the merchant to activate payments."
                className="shadow-none pe-4 bg-background-secondary-default"
              />
            )}

            {link.amountType === 'OPEN' && (
              <Input
                label="Amount (BDT)"
                type="number"
                value={openAmount}
                onChange={setOpenAmount}
                placeholder={link.minAmount ? `Min ${link.minAmount}` : '0'}
                hint={
                  link.minAmount != null || link.maxAmount != null
                    ? `${link.minAmount != null ? `Min ${formatBDT(link.minAmount)}` : ''}${link.minAmount != null && link.maxAmount != null ? ' · ' : ''}${link.maxAmount != null ? `Max ${formatBDT(link.maxAmount)}` : ''}`
                    : undefined
                }
                inputClassName="font-mono text-title-3-semibold tnum"
                isRequired
              />
            )}

            <div className="space-y-3.5">
              <Input
                label="Your Name"
                value={customerName}
                onChange={setCustomerName}
                placeholder="Enter your name"
                isRequired
              />

              <Input
                label="Gmail / Email (Optional)"
                type="email"
                value={customerEmail}
                onChange={setCustomerEmail}
                placeholder="you@gmail.com"
              />
            </div>

            {uniqueProviders.length > 0 && (
              <div className="space-y-2">
                <span className="text-caption-1-medium text-text-secondary block">
                  Pay with
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {uniqueProviders.map((prov) => {
                    const meta = MFS_METADATA[prov];
                    const selected = effectiveProvider === prov;
                    return (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => setSelectedProvider(prov)}
                        className={cx(
                          'min-h-11 px-3.5 rounded-2xl border text-caption-1-semibold inline-flex items-center gap-2 transition-colors cursor-pointer',
                          selected
                            ? 'border-text-primary bg-background-secondary-default text-text-primary shadow-2xs'
                            : 'border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:text-text-primary',
                        )}
                      >
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: meta?.color }}
                        />
                        <span>{meta?.name || prov}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="medium"
              disabled={hasNoActiveWallets}
              isLoading={payMutation.isPending}
              trailingIcon={RiArrowRightLine}
              className="w-full min-h-11 rounded-2xl"
            >
              {resolvedAmountPreview
                ? `Continue · ${formatBDT(resolvedAmountPreview)}`
                : 'Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function PublicLinkActiveCheckout({
  sessionId,
  sessionToken,
  onReset,
}: {
  sessionId: string;
  sessionToken: string;
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
    initialStep: 2,
  });

  return (
    <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6 antialiased">
      <div className="w-full max-w-[440px] flex items-center justify-between gap-3 mb-4 px-1">
        <Button
          variant="ghost"
          size="xs"
          leadingIcon={RiArrowLeftLine}
          onClick={onReset}
          className="min-h-11 sm:min-h-8"
        >
          Back
        </Button>

        <ThemeToggle appearance="segmented" size="small" />
      </div>

      <div className="w-full max-w-[440px]">
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
              expectedAmount={verifiedData?.amount ?? (baseAmount > 0 ? baseAmount : uniqueAmount)}
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
        </div>
      </div>
    </div>
  );
}
