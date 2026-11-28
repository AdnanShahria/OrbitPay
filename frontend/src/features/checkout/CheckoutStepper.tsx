import { useEffect, useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { FileUpload } from '@/components/base/file-upload/file-upload';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { formatBDT, MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import type {
  ActiveWallet,
  DeviceStatusSnapshot,
  ReceiptPolicy,
  ReceiptUploadResponse,
  VerificationMode,
} from './useCheckout';
import {
  RiFileCopyLine,
  RiCheckLine,
  RiSmartphoneLine,
  RiArrowRightLine,
  RiErrorWarningLine,
  RiHashtag,
  RiImageAddLine,
  RiExternalLinkLine,
} from '@remixicon/react';

export interface CheckoutStepperProps {
  initialStep?: 1 | 2 | 3;
  baseAmount: number;
  uniqueAmount: number;
  offsetCents: number;
  orderId: string;
  expiresAt?: string;
  selectedProvider: MfsProvider;
  onSelectProvider: (provider: MfsProvider) => void;
  activeWallet: ActiveWallet | null;
  activeWallets: ActiveWallet[];
  senderNumber: string;
  onChangeSenderNumber: (val: string) => void;
  paidAmount: string;
  onChangePaidAmount: (val: string) => void;
  trxId: string;
  onChangeTrxId: (val: string) => void;
  customerEmail?: string;
  onChangeCustomerEmail?: (val: string) => void;
  verificationMode?: VerificationMode;
  receiptPolicy?: ReceiptPolicy;
  deviceStatus?: DeviceStatusSnapshot;
  sessionToken?: string;
  receiptUrl?: string | null;
  receiptUploadCount?: number;
  receiptMaxUploads?: number;
  isUploadingReceipt?: boolean;
  receiptError?: string | null;
  onUploadReceipt?: (file: File) => Promise<ReceiptUploadResponse | undefined>;
  submitAttempts?: number;
  maxSubmitAttempts?: number;
  onStepChange?: (step: 1 | 2) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isSessionLoading?: boolean;
  errorMessage: string | null;
}

const ALL_PROVIDERS: MfsProvider[] = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'];

export function CheckoutStepper({
  initialStep = 1,
  baseAmount,
  uniqueAmount,
  selectedProvider,
  onSelectProvider,
  activeWallet,
  activeWallets,
  senderNumber,
  onChangeSenderNumber,
  trxId,
  onChangeTrxId,
  receiptPolicy = 'OFFLINE_OPTIONAL',
  sessionToken,
  receiptUrl,
  receiptUploadCount = 0,
  receiptMaxUploads = 3,
  isUploadingReceipt = false,
  receiptError,
  onUploadReceipt,
  onStepChange,
  onSubmit,
  isSubmitting,
  isSessionLoading = false,
  errorMessage,
}: CheckoutStepperProps) {
  const [activeStep, setActiveStep] = useState<1 | 2>(initialStep >= 2 ? 2 : 1);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  useEffect(() => {
    setActiveStep(initialStep >= 2 ? 2 : 1);
  }, [initialStep]);

  const handleStepChange = (nextStep: 1 | 2) => {
    setActiveStep(nextStep);
    onStepChange?.(nextStep);
  };

  const payAmount = baseAmount > 0 ? baseAmount : uniqueAmount;
  const exactAmountText = payAmount.toFixed(2);
  const isReceiptRequired = receiptPolicy === 'ALWAYS_REQUIRED';

  const isMerchantWallet = activeWallet?.accountType === 'MERCHANT';
  const mfsActionLabel = isMerchantWallet ? 'Payment' : 'Send Money';

  const handleCopyNumber = () => {
    if (!activeWallet?.walletNumber) return;
    navigator.clipboard.writeText(activeWallet.walletNumber);
    setCopiedNumber(true);
    toast.success('Number copied');
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleCopyAmount = () => {
    navigator.clipboard.writeText(exactAmountText);
    setCopiedAmount(true);
    toast.success(`Amount ${formatBDT(payAmount)} copied`);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const meta = MFS_METADATA[selectedProvider] || {
    name: selectedProvider,
    color: 'currentColor',
    hoverColor: 'currentColor',
    bgSoft: 'var(--color-background-secondary-default)',
    textClass: 'text-text-primary',
    borderClass: 'border-border-button-active',
  };

  const visibleProviders =
    activeWallets.length > 0
      ? ALL_PROVIDERS.filter((p) => activeWallets.some((w) => w.provider === p))
      : ALL_PROVIDERS;

  return (
    <div className="w-full space-y-5">
      {/* Minimal 2-Step Indicator */}
      <div className="flex items-center gap-5 border-b border-separator-border pb-3">
        {[
          { step: 1 as const, label: '1. Method' },
          { step: 2 as const, label: '2. Pay & Verify' },
        ].map((s) => {
          const isCurrent = activeStep === s.step;
          const isCompleted = activeStep > s.step;
          const isBlocked = s.step > 1 && !activeWallet;
          return (
            <button
              key={s.step}
              type="button"
              disabled={isBlocked}
              onClick={() => handleStepChange(s.step)}
              className={cx(
                'min-h-10 flex items-center text-caption-1-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer select-none border-b-2 -mb-3 pb-1 disabled:opacity-45 disabled:cursor-not-allowed',
                isCurrent
                  ? 'border-text-primary text-text-primary'
                  : isCompleted
                    ? 'border-status-lime-text text-status-lime-text'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary',
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* STEP 1: SELECT PAYMENT METHOD */}
      {activeStep === 1 && (
        <div key="step-1" className="orbit-step-enter space-y-4">
          <div className="space-y-0.5">
            <h4 className="text-headline-medium text-text-primary">
              Select payment method
            </h4>
            <p className="text-caption-1-regular text-text-secondary">
              Choose a mobile wallet to pay {formatBDT(payAmount)}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {visibleProviders.map((p) => {
              const pMeta = MFS_METADATA[p];
              const isSelected = selectedProvider === p;
              const hasWallet = activeWallets.some((w) => w.provider === p);

              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSelectProvider(p)}
                  className={cx(
                    'min-h-12 px-3.5 py-3 rounded-2xl border flex items-center gap-2.5 text-start transition-colors cursor-pointer',
                    isSelected
                      ? cx('border-2 shadow-card', pMeta.borderClass)
                      : 'border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover',
                    !hasWallet && !isSelected && 'opacity-65',
                  )}
                  style={{
                    backgroundColor: isSelected ? pMeta.bgSoft : undefined,
                    borderColor: isSelected ? pMeta.color : undefined,
                  }}
                >
                  <span
                    className="size-3 rounded-full shrink-0"
                    style={{ backgroundColor: pMeta.color }}
                  />
                  <span
                    className={cx(
                      'text-body-medium truncate',
                      isSelected ? pMeta.textClass : 'text-text-primary',
                    )}
                  >
                    {pMeta.name}
                  </span>
                </button>
              );
            })}
          </div>

          {!activeWallet && !isSessionLoading && (
            <p className="text-caption-1-regular text-text-secondary flex items-center gap-1.5">
              <RiErrorWarningLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
              <span>{meta.name} is currently unavailable. Please choose another method.</span>
            </p>
          )}

          <Button
            variant="primary"
            size="medium"
            className="w-full min-h-11"
            disabled={!activeWallet || isSessionLoading}
            onClick={() => handleStepChange(2)}
            trailingIcon={RiArrowRightLine}
          >
            Continue with {meta.name}
          </Button>
        </div>
      )}

      {/* STEP 2: SEND & VERIFY (MOBILE NUMBER + TRX ID ONLY) */}
      {activeStep === 2 && (
        <div key="step-2" className="orbit-step-enter space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: meta.color }}
              />
              <h4 className="text-headline-medium text-text-primary truncate">
                {meta.name} · {mfsActionLabel}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => handleStepChange(1)}
              className="text-caption-1-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0"
            >
              Change
            </button>
          </div>

          {/* Clean Receiver Number & Amount Box */}
          <div className="rounded-2xl bg-background-secondary-default border border-border-button-default divide-y divide-separator-border">
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-caption-2-medium text-text-tertiary block">
                  {meta.name} Number ({mfsActionLabel})
                </span>
                <span className="font-mono text-title-3-medium text-text-primary tnum block truncate">
                  {isSessionLoading ? '...' : activeWallet?.walletNumber || 'Unavailable'}
                </span>
              </div>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCopyNumber}
                leadingIcon={copiedNumber ? RiCheckLine : RiFileCopyLine}
                disabled={isSessionLoading || !activeWallet?.walletNumber}
                className="shrink-0"
              >
                {copiedNumber ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-caption-2-medium text-text-tertiary block">
                  Amount to Send
                </span>
                <span className="font-mono text-title-3-medium text-text-primary tnum block">
                  {isSessionLoading ? '...' : formatBDT(payAmount)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCopyAmount}
                leadingIcon={copiedAmount ? RiCheckLine : RiFileCopyLine}
                disabled={isSessionLoading}
                className="shrink-0"
              >
                {copiedAmount ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          {/* Minimal 2-Field Form: Mobile Number + TrxID */}
          <div className="space-y-3.5">
            <Input
              label={`Your ${meta.name} Mobile Number`}
              type="tel"
              placeholder="017XXXXXXXX"
              value={senderNumber}
              onChange={onChangeSenderNumber}
              leadingIcon={RiSmartphoneLine}
              inputClassName="font-mono tnum"
              isRequired
            />

            <Input
              label="Transaction ID (TrxID)"
              placeholder="e.g. DKS43RJ1P4"
              value={trxId}
              onChange={(val) => onChangeTrxId(val.toUpperCase())}
              leadingIcon={RiHashtag}
              inputClassName="font-mono uppercase"
              isRequired
            />

            {isReceiptRequired && onUploadReceipt && (
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-caption-1-medium text-text-primary">
                    <RiImageAddLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
                    <span>Payment screenshot (Required)</span>
                  </span>
                  {receiptUploadCount > 0 && (
                    <span className="text-caption-2-medium text-text-tertiary tnum">
                      {receiptUploadCount}/{receiptMaxUploads}
                    </span>
                  )}
                </div>

                {receiptUrl && (
                  <div className="px-3 py-2 rounded-xl bg-notification-success-background text-notification-success-foreground flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <RiCheckLine className="size-4 shrink-0" aria-hidden />
                      <span className="text-caption-1-medium truncate">Screenshot attached</span>
                    </div>
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-caption-1-semibold underline underline-offset-2 shrink-0"
                    >
                      <span>View</span>
                      <RiExternalLinkLine className="size-3.5" aria-hidden />
                    </a>
                  </div>
                )}

                {receiptUploadCount < receiptMaxUploads && sessionToken && (
                  <FileUpload
                    allowedExtensions={['png', 'jpg', 'jpeg', 'webp']}
                    maxBytes={5 * 1024 * 1024}
                    isDisabled={isUploadingReceipt}
                    onUploadComplete={async (file) => {
                      try {
                        await onUploadReceipt(file);
                        toast.success('Screenshot attached');
                      } catch (err: unknown) {
                        toast.error(
                          err instanceof Error ? err.message : 'Receipt upload failed',
                        );
                      }
                    }}
                  />
                )}

                {receiptError && (
                  <p className="text-caption-1-medium text-text-error-primary">{receiptError}</p>
                )}
              </div>
            )}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-notification-error-background border border-border-error-default/25 text-notification-error-foreground text-caption-1-medium flex items-center gap-2"
            >
              <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
              <span>{errorMessage}</span>
            </div>
          )}

          <Button
            variant="primary"
            size="medium"
            onClick={onSubmit}
            isLoading={isSubmitting}
            disabled={isUploadingReceipt}
            className="w-full min-h-11"
          >
            Verify Payment
          </Button>
        </div>
      )}
    </div>
  );
}
