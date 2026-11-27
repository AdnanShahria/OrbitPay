import { useEffect, useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input, InputBase, TextField } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import { HintText } from '@/components/base/input/hint-text';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
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
  RiMoneyDollarCircleLine,
  RiTimeLine,
  RiWifiOffLine,
  RiImageAddLine,
  RiExternalLinkLine,
  RiMailLine,
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
  onSubmit: () => void;
  isSubmitting: boolean;
  isSessionLoading?: boolean;
  errorMessage: string | null;
}

function computeSecondsRemaining(expiresAt?: string): number {
  if (!expiresAt) return 15 * 60;
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return 15 * 60;
  return Math.max(0, Math.floor((target - Date.now()) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function CheckoutStepper({
  initialStep = 1,
  baseAmount: _baseAmount,
  uniqueAmount,
  offsetCents,
  expiresAt,
  selectedProvider,
  onSelectProvider,
  activeWallet,
  activeWallets,
  senderNumber,
  onChangeSenderNumber,
  paidAmount,
  onChangePaidAmount,
  trxId,
  onChangeTrxId,
  customerEmail,
  onChangeCustomerEmail,
  verificationMode = 'AUTO',
  receiptPolicy = 'OFFLINE_OPTIONAL',
  deviceStatus,
  sessionToken,
  receiptUrl,
  receiptUploadCount = 0,
  receiptMaxUploads = 3,
  isUploadingReceipt = false,
  receiptError,
  onUploadReceipt,
  submitAttempts = 0,
  maxSubmitAttempts = 3,
  onSubmit,
  isSubmitting,
  isSessionLoading = false,
  errorMessage,
}: CheckoutStepperProps) {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(initialStep);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [localEmail, setLocalEmail] = useState(customerEmail ?? '');
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    computeSecondsRemaining(expiresAt),
  );

  useEffect(() => {
    setActiveStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    if (customerEmail !== undefined) {
      setLocalEmail(customerEmail);
    }
  }, [customerEmail]);

  useEffect(() => {
    setSecondsLeft(computeSecondsRemaining(expiresAt));
    const timer = setInterval(() => {
      setSecondsLeft(computeSecondsRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const exactAmountText = uniqueAmount.toFixed(2);
  const offsetBdt = offsetCents / 100;

  const isDeviceOffline = deviceStatus?.online === false;
  const isPureManual = verificationMode === 'PURE_MANUAL';
  const showManualPill = isDeviceOffline || isPureManual;
  const allowReceiptUpload =
    receiptPolicy !== 'DISABLED' || isDeviceOffline || isPureManual;
  const isReceiptRequired =
    receiptPolicy === 'ALWAYS_REQUIRED' || receiptPolicy === 'REQUIRED_ON_MANUAL';

  const isMerchantWallet = activeWallet?.accountType === 'MERCHANT';
  const mfsActionLabel = isMerchantWallet ? 'Payment' : 'Send Money';
  const walletTypeChip = isMerchantWallet
    ? 'Merchant'
    : activeWallet?.accountType === 'PRA'
      ? 'PRA'
      : 'Personal';

  const emailValue = onChangeCustomerEmail ? (customerEmail ?? '') : localEmail;
  const handleEmailChange = (val: string) => {
    if (onChangeCustomerEmail) {
      onChangeCustomerEmail(val);
    } else {
      setLocalEmail(val);
    }
  };

  const handleCopyNumber = () => {
    if (!activeWallet?.walletNumber) return;
    navigator.clipboard.writeText(activeWallet.walletNumber);
    setCopiedNumber(true);
    toast.success('Receiver number copied');
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleCopyAmount = () => {
    navigator.clipboard.writeText(exactAmountText);
    setCopiedAmount(true);
    toast.success(`Exact amount ${formatBDT(uniqueAmount)} copied`);
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

  const providers: MfsProvider[] = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'];

  return (
    <div className="w-full space-y-5">
      {/* Single-Row Stepper Navigation + Inline Countdown Pill */}
      <div className="flex items-center justify-between gap-2 border-b border-separator-border pb-3">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          {[
            { step: 1, label: '1. Method' },
            { step: 2, label: '2. Send' },
            { step: 3, label: '3. Verify' },
          ].map((s) => {
            const isCurrent = activeStep === s.step;
            const isCompleted = activeStep > s.step;
            const isBlocked = s.step > 1 && !activeWallet;
            return (
              <button
                key={s.step}
                type="button"
                disabled={isBlocked}
                onClick={() => setActiveStep(s.step as 1 | 2 | 3)}
                className={cx(
                  'min-h-11 flex items-center text-caption-1-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer select-none border-b-2 -mb-3 pb-1 disabled:opacity-45 disabled:cursor-not-allowed',
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

        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background-secondary-default border border-border-button-default text-caption-2-medium text-text-secondary tabular-nums tnum shrink-0 whitespace-nowrap"
          title="Remaining time for unique poisha reservation"
        >
          <RiTimeLine className="size-3.5 text-foreground-icon-secondary shrink-0" aria-hidden />
          <span className="font-mono text-text-primary">
            {formatCountdown(secondsLeft)}
          </span>
        </div>
      </div>

      {/* PHASE 1: METHOD SELECTION ONLY */}
      {activeStep === 1 && (
        <div key="step-1" className="orbit-step-enter space-y-5">
          <div className="space-y-1">
            <h4 className="text-headline-medium text-text-primary">
              Select payment method
            </h4>
            <p className="text-caption-1-regular text-text-secondary">
              Choose your mobile wallet to continue.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {providers.map((p) => {
              const pMeta = MFS_METADATA[p];
              const isSelected = selectedProvider === p;
              const hasWallet = activeWallets.some((w) => w.provider === p);

              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSelectProvider(p)}
                  className={cx(
                    'min-h-11 px-3 py-3 rounded-2xl border flex items-center gap-2.5 text-start transition-colors cursor-pointer',
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
                    className="size-3.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: pMeta.color }}
                  />
                  <div className="min-w-0">
                    <span
                      className={cx(
                        'text-body-medium block truncate',
                        isSelected ? pMeta.textClass : 'text-text-primary',
                      )}
                    >
                      {pMeta.name}
                    </span>
                    <span className="text-caption-2-medium text-text-tertiary block">
                      {hasWallet ? 'Active' : 'Standby'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {!activeWallet && !isSessionLoading && (
            <p className="text-caption-1-regular text-text-secondary flex items-center gap-1.5">
              <RiErrorWarningLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
              <span>{meta.name} is on standby. Select an active wallet above.</span>
            </p>
          )}

          {showManualPill && (
            <div
              role="status"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-background-secondary-default border border-border-button-default text-caption-1-medium text-text-secondary"
            >
              {isDeviceOffline ? (
                <RiWifiOffLine className="size-3.5 text-status-yellow-text shrink-0" aria-hidden />
              ) : (
                <StatusDot color="yellow" />
              )}
              <span>Manual review active — screenshot proof accepted</span>
            </div>
          )}

          <Button
            variant="primary"
            size="medium"
            className="w-full min-h-11"
            disabled={!activeWallet || isSessionLoading}
            onClick={() => setActiveStep(2)}
            trailingIcon={RiArrowRightLine}
          >
            Continue with {meta.name}
          </Button>
        </div>
      )}

      {/* PHASE 2: SEND MONEY / MERCHANT PAYMENT ONLY */}
      {activeStep === 2 && (
        <div key="step-2" className="orbit-step-enter space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-headline-medium text-text-primary">
              {mfsActionLabel} via {meta.name}
            </h4>
            <Chip variant="caption" color={isMerchantWallet ? 'blue' : 'soft'}>
              {walletTypeChip}
            </Chip>
          </div>

          {/* Two Architectural Summary Boxes */}
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-default flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <span className="text-caption-1-medium text-text-tertiary block">
                  Receiver {meta.name} number
                </span>
                <span className="font-mono text-title-2-medium text-text-primary tnum block truncate">
                  {isSessionLoading ? '...' : activeWallet?.walletNumber || 'Unavailable'}
                </span>
              </div>
              <Button
                variant="secondary"
                size="medium"
                onClick={handleCopyNumber}
                leadingIcon={copiedNumber ? RiCheckLine : RiFileCopyLine}
                disabled={isSessionLoading || !activeWallet?.walletNumber}
                className="min-h-11 shrink-0"
              >
                {copiedNumber ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-default flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-caption-1-medium text-text-tertiary">
                    Exact amount to send
                  </span>
                  {offsetCents > 0 && (
                    <Chip variant="caption" color="lime" className="tnum">
                      +{formatBDT(offsetBdt)} code
                    </Chip>
                  )}
                </div>
                <span className="font-mono text-title-2-medium text-text-primary tnum block">
                  {isSessionLoading ? '...' : formatBDT(uniqueAmount)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="medium"
                onClick={handleCopyAmount}
                leadingIcon={copiedAmount ? RiCheckLine : RiFileCopyLine}
                disabled={isSessionLoading}
                className="min-h-11 shrink-0"
              >
                {copiedAmount ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          {/* Compact Scannable 3-Step Micro-Checklist */}
          <div className="p-4 rounded-2xl bg-background-primary-default border border-separator-border">
            <ol className="space-y-2.5 text-caption-1-regular text-text-secondary">
              {[
                `Open ${meta.name} app and select ${mfsActionLabel}`,
                `Send ${formatBDT(uniqueAmount)} to the number above`,
                'Save the Transaction ID (TrxID) from confirmation',
              ].map((stepText, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span
                    className="size-5 rounded-full flex items-center justify-center text-caption-2-semibold tnum shrink-0 mt-0.5"
                    style={{ backgroundColor: meta.bgSoft, color: meta.color }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-text-primary leading-snug">{stepText}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="medium"
              onClick={() => setActiveStep(1)}
              className="w-1/3 min-h-11"
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="medium"
              onClick={() => setActiveStep(3)}
              trailingIcon={RiArrowRightLine}
              className="w-2/3 min-h-11"
            >
              I Have Sent the Money
            </Button>
          </div>
        </div>
      )}

      {/* PHASE 3: VERIFY TRANSFER ONLY */}
      {activeStep === 3 && (
        <div key="step-3" className="orbit-step-enter space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <h4 className="text-headline-medium text-text-primary">
                Confirm your transfer
              </h4>
              <p className="text-caption-1-regular text-text-secondary">
                Enter your {meta.name} sender details and TrxID.
              </p>
            </div>
            {submitAttempts > 0 && (
              <Chip variant="caption" color="neutral" className="shrink-0 tnum">
                Attempt {Math.min(submitAttempts + 1, maxSubmitAttempts)}/{maxSubmitAttempts}
              </Chip>
            )}
          </div>

          <div className="space-y-3.5">
            <Input
              label="Sender Mobile Number"
              type="tel"
              placeholder="017XXXXXXXX"
              value={senderNumber}
              onChange={onChangeSenderNumber}
              leadingIcon={RiSmartphoneLine}
              inputClassName="font-mono tnum"
              isRequired
            />

            <TextField
              value={paidAmount}
              onChange={onChangePaidAmount}
              inputClassName="font-mono tnum"
              isRequired
            >
              {({ isRequired }) => (
                <>
                  <Label isRequired={isRequired}>Amount Sent (BDT)</Label>
                  <InputBase
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder={exactAmountText}
                    leadingIcon={RiMoneyDollarCircleLine}
                  />
                  <HintText className="tnum">Exact: {formatBDT(uniqueAmount)}</HintText>
                </>
              )}
            </TextField>

            <Input
              label={`${meta.name} Transaction ID (TrxID)`}
              placeholder="e.g. DKS43RJ1P4"
              value={trxId}
              onChange={(val) => onChangeTrxId(val.toUpperCase())}
              leadingIcon={RiHashtag}
              inputClassName="font-mono uppercase"
              isRequired
            />

            <Input
              label="Email for Receipt & Invoice (Optional)"
              type="email"
              placeholder="you@example.com"
              value={emailValue}
              onChange={handleEmailChange}
              leadingIcon={RiMailLine}
              hint="Confirmation & invoice via OrbitMail"
            />

            {/* Compact Screenshot Proof Upload */}
            {allowReceiptUpload && onUploadReceipt && (
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-caption-1-medium text-text-primary">
                    <RiImageAddLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
                    <span>
                      Payment screenshot proof{' '}
                      <span className="text-text-tertiary">
                        ({isReceiptRequired ? 'Required' : 'Optional'})
                      </span>
                    </span>
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
                      <span className="text-caption-1-medium truncate">
                        Screenshot proof attached
                      </span>
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

                {receiptUploadCount < receiptMaxUploads && sessionToken ? (
                  <FileUpload
                    allowedExtensions={['png', 'jpg', 'jpeg', 'webp']}
                    maxBytes={5 * 1024 * 1024}
                    isDisabled={isUploadingReceipt}
                    onUploadComplete={async (file) => {
                      try {
                        await onUploadReceipt(file);
                        toast.success('Payment screenshot attached');
                      } catch (err: unknown) {
                        toast.error(
                          err instanceof Error ? err.message : 'Receipt upload failed',
                        );
                      }
                    }}
                  />
                ) : !sessionToken ? (
                  <p className="text-caption-2-medium text-text-tertiary">
                    Screenshot upload requires a signed session link.
                  </p>
                ) : null}

                {receiptError && (
                  <p className="text-caption-1-medium text-text-error-primary">
                    {receiptError}
                  </p>
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

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="medium"
              onClick={() => setActiveStep(2)}
              className="w-1/3 min-h-11"
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="medium"
              onClick={onSubmit}
              isLoading={isSubmitting}
              disabled={isUploadingReceipt}
              className="w-2/3 min-h-11"
            >
              Verify Payment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
