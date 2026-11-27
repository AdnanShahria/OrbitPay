import { useState } from 'react';
import { usePublicPaymentLink, usePayPublicLink } from './usePaymentLinks';
import { useCheckout } from '@/features/checkout/useCheckout';
import { CheckoutDisplayHeader } from '@/features/checkout/CheckoutDisplayHeader';
import { CheckoutStepper } from '@/features/checkout/CheckoutStepper';
import { PollingStatus } from '@/features/checkout/PollingStatus';
import { Card, CardContent } from '@/components/base/card/card';
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
  RiLinksLine,
  RiShieldCheckLine,
} from '@remixicon/react';

export interface PublicPaymentLinkPageProps {
  slug: string;
}

export function PublicPaymentLinkPage({ slug }: PublicPaymentLinkPageProps) {
  const { data: link, isLoading, error } = usePublicPaymentLink(slug);
  const payMutation = usePayPublicLink(slug);

  const [openAmount, setOpenAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
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
        <span className="text-body-regular text-text-secondary">
          Loading payment page...
        </span>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-background-full flex items-center justify-center p-4">
        <Card variant="elevated" className="w-full max-w-md">
          <CardContent className="p-6 text-center space-y-4">
            <div className="size-12 rounded-full bg-notification-error-background text-notification-error-foreground flex items-center justify-center mx-auto">
              <RiErrorWarningLine className="size-6" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="text-title-3-semibold text-text-primary">
                Payment link unavailable
              </h1>
              <p className="text-body-regular text-text-secondary">
                {error instanceof Error ? error.message : 'This link is expired, inactive, or does not exist.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const effectiveProvider =
    selectedProvider || link.activeWallets[0]?.provider || 'BKASH';

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

    try {
      const result = await payMutation.mutateAsync({
        amount: numericAmount,
        provider: effectiveProvider,
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        referenceNote: referenceNote.trim() || undefined,
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
    <div className="min-h-screen bg-background-full flex items-center justify-center p-4">
      <Card variant="elevated" className="w-full max-w-lg">
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-separator-border">
            <div className="flex items-start gap-3 min-w-0">
              <div className="size-10 rounded-xl bg-background-secondary-default border border-border-button-default flex items-center justify-center text-foreground-icon-primary shrink-0">
                <RiLinksLine className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-caption-1-medium text-text-secondary">
                    {link.display?.appName || link.storeName}
                  </span>
                  <Chip variant="caption" color="soft" className="capitalize">
                    {link.vertical.replace(/_/g, ' ')}
                  </Chip>
                </div>
                <h1 className="text-title-2-medium text-text-primary">{link.title}</h1>
                {link.description && (
                  <p className="text-body-regular text-text-secondary">{link.description}</p>
                )}
              </div>
            </div>

            {link.amountType === 'FIXED' && link.fixedAmount != null && (
              <div className="text-end shrink-0">
                <span className="text-caption-2-medium text-text-tertiary block">Amount</span>
                <span className="font-mono text-title-2-medium text-text-primary tabular-nums tnum">
                  {formatBDT(link.fixedAmount)}
                </span>
              </div>
            )}
          </div>

          {/* Device / Mode pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-caption-1-medium">
            <span className="inline-flex items-center gap-1.5 text-text-secondary">
              <StatusDot color={link.deviceStatus.online ? 'green' : 'yellow'} />
              <span>
                {link.deviceStatus.online
                  ? 'Instant SMS verification active'
                  : 'Admin review mode active (safe offline queue)'}
              </span>
            </span>
            <span className="text-caption-2-medium text-text-tertiary">0% gateway fee</span>
          </div>

          <form onSubmit={handleProceed} className="space-y-4">
            {link.amountType === 'OPEN' && (
              <Input
                label="Payment Amount (BDT)"
                type="number"
                value={openAmount}
                onChange={setOpenAmount}
                placeholder={link.minAmount ? `Min ${link.minAmount}` : 'Enter amount'}
                hint={
                  link.minAmount != null || link.maxAmount != null
                    ? `${link.minAmount != null ? `Min ${formatBDT(link.minAmount)}` : ''}${link.minAmount != null && link.maxAmount != null ? ' · ' : ''}${link.maxAmount != null ? `Max ${formatBDT(link.maxAmount)}` : ''}`
                    : undefined
                }
                inputClassName="font-mono tabular-nums"
                isRequired
              />
            )}

            {/* Quick active MFS method selection */}
            {link.activeWallets.length > 0 && (
              <div className="space-y-2">
                <span className="text-body-medium text-text-primary block">
                  Preferred payment wallet
                </span>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(link.activeWallets.map((w) => w.provider))).map((prov) => {
                    const meta = MFS_METADATA[prov];
                    const selected = effectiveProvider === prov;
                    return (
                      <button
                        key={prov}
                        type="button"
                        onClick={() => setSelectedProvider(prov)}
                        className={cx(
                          'min-h-11 px-3.5 rounded-xl border text-body-medium inline-flex items-center gap-2 transition-colors cursor-pointer',
                          selected
                            ? 'border-2 bg-background-secondary-default text-text-primary'
                            : 'border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover',
                        )}
                        style={{
                          borderColor: selected ? meta?.color : undefined,
                          backgroundColor: selected ? meta?.bgSoft : undefined,
                        }}
                      >
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: meta?.color }}
                        />
                        <span>{meta?.name || prov}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Your Name (Optional)"
                value={customerName}
                onChange={setCustomerName}
                placeholder="e.g. Rafiq Ahmed"
              />
              <Input
                label="Phone Number (Optional)"
                type="tel"
                value={customerPhone}
                onChange={setCustomerPhone}
                placeholder="e.g. 017XXXXXXXX"
                inputClassName="font-mono tabular-nums"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Email (Optional)"
                type="email"
                value={customerEmail}
                onChange={setCustomerEmail}
                placeholder="you@example.com"
              />
              <Input
                label="Reference / Note (Optional)"
                value={referenceNote}
                onChange={setReferenceNote}
                placeholder="e.g. T-shirt size L / Invoice #4"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="medium"
              isLoading={payMutation.isPending}
              trailingIcon={RiArrowRightLine}
              className="w-full min-h-11"
            >
              Continue to Payment
            </Button>
          </form>

          <div className="pt-4 border-t border-separator-border flex items-center justify-between text-caption-2-medium text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <RiShieldCheckLine className="size-3.5 text-status-lime-text" aria-hidden />
              <span>Powered by ORBIT Payment Hub</span>
            </span>
            <span>/{link.slug}</span>
          </div>
        </CardContent>
      </Card>
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
  });

  return (
    <div className="min-h-screen bg-background-full flex items-center justify-center p-4">
      <Card variant="elevated" className="w-full max-w-lg">
        <CardContent className="p-6 space-y-6">
          <div className="pb-4 border-b border-separator-border space-y-3">
            <Button
              variant="ghost"
              size="xs"
              leadingIcon={RiArrowLeftLine}
              onClick={onReset}
            >
              Back to link details
            </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}
