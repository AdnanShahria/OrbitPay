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
  RiShieldCheckLine,
  RiErrorWarningLine,
  RiQuestionLine,
  RiHashtag,
  RiMoneyDollarCircleLine,
  RiTimeLine,
  RiWifiOffLine,
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
  baseAmount,
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
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    computeSecondsRemaining(expiresAt),
  );

  useEffect(() => {
    setActiveStep(initialStep);
  }, [initialStep]);

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
  const showOfflineOrManualBanner = isDeviceOffline || isPureManual;
  const allowReceiptUpload =
    receiptPolicy !== 'DISABLED' || isDeviceOffline || isPureManual;
  const isReceiptRequired =
    receiptPolicy === 'ALWAYS_REQUIRED' || receiptPolicy === 'REQUIRED_ON_MANUAL';

  const isMerchantWallet = activeWallet?.accountType === 'MERCHANT';
  const mfsActionLabel = isMerchantWallet ? 'Payment' : 'Send Money';
  const walletTypeLabel = isMerchantWallet
    ? 'Merchant Account'
    : activeWallet?.accountType === 'PRA'
      ? 'Personal Retail (PRA)'
      : 'Personal Account';

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
      {/* 3-Step Pill Stepper Navigation + Session Countdown */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-separator-border pb-3.5">
        <div className="flex items-center gap-4 sm:gap-5">
          {[
            { step: 1, label: '1. Provider' },
            { step: 2, label: `2. ${mfsActionLabel}` },
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
                  'min-h-11 flex items-center gap-1.5 text-caption-1-semibold transition-colors cursor-pointer select-none border-b-2 -mb-3.5 pb-1 disabled:opacity-50 disabled:cursor-not-allowed',
                  isCurrent
                    ? 'border-text-primary text-text-primary'
                    : isCompleted
                      ? 'border-status-lime-text text-status-lime-text'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary',
                )}
              >
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background-secondary-default border border-border-button-default text-caption-2-medium text-text-secondary tabular-nums"
          title="Remaining time for unique poisha reservation"
        >
          <RiTimeLine className="size-3.5 text-foreground-icon-secondary" aria-hidden />
          <span className="font-mono text-text-primary">
            {formatCountdown(secondsLeft)}
          </span>
        </div>
      </div>

      {/* Calm Informational Banner for Offline Phone or Manual Verification */}
      {showOfflineOrManualBanner && (
        <div
          role="status"
          className="p-3.5 rounded-2xl bg-background-secondary-default border border-border-button-default flex items-start gap-3"
        >
          <div className="size-8 rounded-xl bg-status-yellow-background text-status-yellow-text flex items-center justify-center shrink-0 mt-0.5">
            {isDeviceOffline ? (
              <RiWifiOffLine className="size-4" aria-hidden />
            ) : (
              <StatusDot color="yellow" />
            )}
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption-1-semibold text-text-primary">
                {isPureManual
                  ? 'Manual Admin Verification Mode'
                  : 'Verification Phone Offline — Safe Submission Active'}
              </span>
              <Chip variant="caption" color="yellow">
                {isPureManual ? 'Admin Review' : 'Queued Safe'}
              </Chip>
            </div>
            <p className="text-caption-1-regular text-text-secondary leading-relaxed">
              Verification phone is offline or in manual mode — you can still complete payment normally and optionally attach a screenshot proof; the admin panel already receives your submission.
            </p>
          </div>
        </div>
      )}

      {/* Unique Amount Callout Banner */}
      <div className="p-3.5 rounded-2xl bg-background-secondary-default border border-border-button-default flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-caption-1-medium text-text-secondary">
              Exact amount to send
            </span>
            {offsetCents > 0 && (
              <Chip variant="caption" color="lime">
                Unique code +{formatBDT(offsetBdt)}
              </Chip>
            )}
          </div>
          <p className="text-caption-2-medium text-text-tertiary tabular-nums">
            {offsetCents > 0
              ? `Base ${formatBDT(baseAmount)} + ${formatBDT(offsetBdt)} unique verification code`
              : `Standard order total ${formatBDT(baseAmount)}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-title-2-medium text-text-primary tabular-nums tnum">
            {isSessionLoading ? '...' : formatBDT(uniqueAmount)}
          </span>
          <Button
            variant="secondary"
            size="small"
            onClick={handleCopyAmount}
            leadingIcon={copiedAmount ? RiCheckLine : RiFileCopyLine}
            className="min-h-11 sm:min-h-8"
          >
            {copiedAmount ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      {/* STEP 1: SELECT MFS & COPY NUMBER */}
      {activeStep === 1 && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h4 className="text-body-medium text-text-primary">
              Choose your payment method
            </h4>
            <p className="text-caption-1-regular text-text-secondary">
              Select an active mobile financial service to view the receiver number.
            </p>
          </div>

          {/* Provider Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
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
                    'min-h-11 p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer',
                    isSelected
                      ? cx('border-2 shadow-card', pMeta.borderClass)
                      : 'border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover',
                    !hasWallet && !isSelected && 'opacity-70',
                  )}
                  style={{
                    backgroundColor: isSelected ? pMeta.bgSoft : undefined,
                    borderColor: isSelected ? pMeta.color : undefined,
                  }}
                >
                  <span
                    className="size-4 rounded-full shadow-2xs"
                    style={{ backgroundColor: pMeta.color }}
                  />
                  <span
                    className={cx(
                      'text-body-medium',
                      isSelected ? pMeta.textClass : 'text-text-primary',
                    )}
                  >
                    {pMeta.name}
                  </span>
                  <span className="text-caption-2-medium text-text-tertiary">
                    {hasWallet ? 'Active' : 'Standby'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* High-Contrast Number Capsule */}
          {activeWallet ? (
            <div className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-default space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-caption-1-medium text-text-secondary">
                    Receiver {meta.name} number
                  </span>
                  <Chip variant="caption" color={isMerchantWallet ? 'blue' : 'soft'}>
                    {walletTypeLabel}
                  </Chip>
                </div>
                <Chip
                  variant="caption"
                  className="rounded-full px-2"
                  style={{ backgroundColor: meta.bgSoft, color: meta.color }}
                >
                  Use {mfsActionLabel}
                </Chip>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background-primary-default border border-border-button-default">
                <span className="font-mono text-title-2-medium text-text-primary tabular-nums tnum">
                  {isSessionLoading ? 'Loading...' : activeWallet.walletNumber}
                </span>
                <Button
                  variant="secondary"
                  size="medium"
                  onClick={handleCopyNumber}
                  leadingIcon={copiedNumber ? RiCheckLine : RiFileCopyLine}
                  disabled={isSessionLoading}
                  className="min-h-11 shrink-0"
                >
                  {copiedNumber ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          ) : (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-default text-caption-1-regular text-text-secondary flex items-center gap-2.5"
            >
              <RiErrorWarningLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span>
                {isSessionLoading
                  ? 'Loading active payment numbers...'
                  : `${meta.name} is currently on standby. Please select an Active payment method above.`}
              </span>
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
            Next: {mfsActionLabel} Instructions
          </Button>
        </div>
      )}

      {/* STEP 2: TRANSFER INSTRUCTIONS (MERCHANT Payment vs PERSONAL Send Money) */}
      {activeStep === 2 && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h4 className="text-body-medium text-text-primary">
              How to pay via {meta.name} ({mfsActionLabel})
            </h4>
            <p className="text-caption-1-regular text-text-secondary">
              Follow these steps in your {meta.name} app using{' '}
              <strong className="text-text-primary">{mfsActionLabel}</strong>:
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                num: '1',
                title: `Open your ${meta.name} App`,
                desc: isMerchantWallet
                  ? `Log into your ${meta.name} account and tap 'Payment' (Merchant Payment).`
                  : `Log into your ${meta.name} account and tap 'Send Money'.`,
              },
              {
                num: '2',
                title: `Enter ${isMerchantWallet ? 'Merchant' : 'Receiver'} Number: ${activeWallet?.walletNumber || 'Unavailable'}`,
                desc: `Paste the ${walletTypeLabel.toLowerCase()} number into the recipient field.`,
              },
              {
                num: '3',
                title: `Enter Exact Amount: ${formatBDT(uniqueAmount)}`,
                desc:
                  offsetCents > 0
                    ? `Send ${exactAmountText} BDT (includes +${formatBDT(offsetBdt)} unique verification code) for instant matching.`
                    : 'Transfer the exact amount shown. No extra fee required.',
              },
              {
                num: '4',
                title: 'Copy the Transaction ID (TrxID)',
                desc: 'After confirming, copy the 8 to 10-character TrxID from your confirmation SMS or app screen.',
              },
            ].map((st) => (
              <div
                key={st.num}
                className="p-3.5 rounded-2xl border border-border-button-default bg-background-primary-default flex items-start gap-3"
              >
                <div
                  className="size-7 rounded-full flex items-center justify-center text-caption-1-semibold tabular-nums shrink-0 mt-0.5"
                  style={{ backgroundColor: meta.bgSoft, color: meta.color }}
                >
                  {st.num}
                </div>
                <div className="min-w-0">
                  <h5 className="text-body-medium text-text-primary">{st.title}</h5>
                  <p className="text-caption-1-regular text-text-secondary mt-0.5">
                    {st.desc}
                  </p>
                </div>
              </div>
            ))}
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
              Next: I Have Sent the Money
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: 3-FIELD VERIFICATION + OPTIONAL RECEIPT UPLOAD */}
      {activeStep === 3 && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h4 className="text-body-medium text-text-primary">
                Verify your payment
              </h4>
              <p className="text-caption-1-regular text-text-secondary">
                Enter your sender phone number, exact amount sent, and TrxID.
              </p>
            </div>
            {submitAttempts > 0 && (
              <Chip variant="caption" color="neutral">
                Attempt {Math.min(submitAttempts + 1, maxSubmitAttempts)}/{maxSubmitAttempts}
              </Chip>
            )}
          </div>

          <div className="space-y-4">
            <Input
              label="Sender Mobile Number"
              type="tel"
              placeholder="e.g. 017XXXXXXXX"
              value={senderNumber}
              onChange={onChangeSenderNumber}
              leadingIcon={RiSmartphoneLine}
              hint="The phone number you used to send the payment"
              inputClassName="font-mono tabular-nums"
              isRequired
            />

            <TextField
              value={paidAmount}
              onChange={onChangePaidAmount}
              inputClassName="font-mono tabular-nums tnum"
              isRequired
            >
              {({ isRequired }) => (
                <>
                  <Label isRequired={isRequired}>Payment Total Amount Sent (BDT)</Label>
                  <InputBase
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder={exactAmountText}
                    leadingIcon={RiMoneyDollarCircleLine}
                  />
                  <HintText>
                    {`Enter the exact amount you sent — e.g. ${exactAmountText} or ${baseAmount.toFixed(2)} if you sent the base amount`}
                  </HintText>
                </>
              )}
            </TextField>

            <Input
              label={`${meta.name} Transaction ID (TrxID)`}
              placeholder="e.g. BLM4918239 or 72J49281"
              value={trxId}
              onChange={(val) => onChangeTrxId(val.toUpperCase())}
              leadingIcon={RiHashtag}
              hint="Auto-capitalized alphanumeric ID from your MFS confirmation"
              inputClassName="font-mono uppercase"
              isRequired
            />

            {/* Optional / Required Receipt Screenshot Upload */}
            {allowReceiptUpload && onUploadReceipt && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-body-medium text-text-primary">
                    <RiImageAddLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                    <span>
                      Payment screenshot proof{' '}
                      <span className="text-caption-1-regular text-text-tertiary">
                        ({isReceiptRequired ? 'Required' : 'Optional'})
                      </span>
                    </span>
                  </span>
                  {receiptUploadCount > 0 && (
                    <span className="text-caption-2-medium text-text-tertiary tabular-nums">
                      {receiptUploadCount}/{receiptMaxUploads} uploaded
                    </span>
                  )}
                </div>

                {receiptUrl && (
                  <div className="p-3 rounded-xl bg-notification-success-background text-notification-success-foreground flex items-center justify-between gap-2">
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

          <div className="flex items-center justify-between text-caption-2-medium text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <RiShieldCheckLine className="size-3.5 text-status-lime-text" aria-hidden />
              <span>Automated 0-fee edge reconciliation</span>
            </span>
            <span className="flex items-center gap-1.5">
              <RiQuestionLine className="size-3.5" aria-hidden />
              <span>Typo protection active</span>
            </span>
          </div>

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
