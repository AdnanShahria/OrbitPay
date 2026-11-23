import { useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Input, InputBase, TextField } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import { HintText } from '@/components/base/input/hint-text';
import { Chip } from '@/components/base/badges/chip';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { formatBDT, MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import { ActiveWallet } from './useCheckout';
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
} from '@remixicon/react';

export interface CheckoutStepperProps {
  baseAmount: number;
  uniqueAmount: number;
  offsetCents: number;
  orderId: string;
  selectedProvider: MfsProvider;
  onSelectProvider: (provider: MfsProvider) => void;
  activeWallet: ActiveWallet;
  activeWallets: ActiveWallet[];
  senderNumber: string;
  onChangeSenderNumber: (val: string) => void;
  paidAmount: string;
  onChangePaidAmount: (val: string) => void;
  trxId: string;
  onChangeTrxId: (val: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  isSessionLoading?: boolean;
  errorMessage: string | null;
}

export function CheckoutStepper({
  baseAmount,
  uniqueAmount,
  offsetCents,
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
  onSubmit,
  isSubmitting,
  isSessionLoading = false,
  errorMessage,
}: CheckoutStepperProps) {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  const exactAmountText = uniqueAmount.toFixed(2);
  const offsetBdt = offsetCents / 100;

  const handleCopyNumber = () => {
    if (!activeWallet.walletNumber || activeWallet.walletNumber === 'Unavailable') return;
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
    <div className="w-full space-y-6">
      {/* 3-Step Pill Stepper Navigation */}
      <div className="flex items-center justify-between border-b border-separator-border pb-4">
        {[
          { step: 1, label: '1. Select Provider' },
          { step: 2, label: '2. Send Money' },
          { step: 3, label: '3. Verify Payment' },
        ].map((s) => {
          const isCurrent = activeStep === s.step;
          const isCompleted = activeStep > s.step;
          return (
            <button
              key={s.step}
              type="button"
              onClick={() => setActiveStep(s.step as 1 | 2 | 3)}
              className={cx(
                'flex items-center gap-1.5 text-caption-1-semibold transition-colors cursor-pointer select-none pb-1 border-b-2 -mb-4.5',
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
            size="xs"
            onClick={handleCopyAmount}
            leadingIcon={copiedAmount ? RiCheckLine : RiFileCopyLine}
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
              Select your mobile financial service to view the active receiver number.
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
                    'p-3 rounded-2xl border flex flex-col items-center gap-2 transition-colors cursor-pointer',
                    isSelected
                      ? cx('border-2 shadow-card', pMeta.borderClass)
                      : 'border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover',
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
          <div className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-default space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption-1-medium text-text-secondary">
                Receiver {meta.name} number ({activeWallet.accountType})
              </span>
              <Chip
                variant="caption"
                className="rounded-full px-2"
                style={{ backgroundColor: meta.bgSoft, color: meta.color }}
              >
                Zero gateway fee
              </Chip>
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background-primary-default border border-border-button-default">
              <span className="font-mono text-title-2-medium text-text-primary tabular-nums tnum">
                {isSessionLoading ? 'Loading...' : activeWallet.walletNumber}
              </span>
              <Button
                variant="secondary"
                size="small"
                onClick={handleCopyNumber}
                leadingIcon={copiedNumber ? RiCheckLine : RiFileCopyLine}
                disabled={isSessionLoading || activeWallet.walletNumber === 'Unavailable'}
              >
                {copiedNumber ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <Button
            variant="primary"
            size="medium"
            className="w-full"
            onClick={() => setActiveStep(2)}
            trailingIcon={RiArrowRightLine}
          >
            Next: Send Money Instructions
          </Button>
        </div>
      )}

      {/* STEP 2: TRANSFER INSTRUCTIONS */}
      {activeStep === 2 && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h4 className="text-body-medium text-text-primary">
              How to pay via {meta.name}
            </h4>
            <p className="text-caption-1-regular text-text-secondary">
              Follow these simple steps from your {meta.name} mobile app:
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                num: '1',
                title: `Open your ${meta.name} App`,
                desc: `Log into your ${meta.name} account and tap 'Send Money' option.`,
              },
              {
                num: '2',
                title: `Enter Number: ${activeWallet.walletNumber}`,
                desc: `Paste the receiver number (${activeWallet.accountType}) into the recipient field.`,
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
                desc: 'Upon successful transfer, copy the 8 to 10-character TrxID from SMS or screen.',
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
                <div>
                  <h5 className="text-body-medium text-text-primary">
                    {st.title}
                  </h5>
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
              className="w-1/3"
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="medium"
              onClick={() => setActiveStep(3)}
              trailingIcon={RiArrowRightLine}
              className="w-2/3"
            >
              Next: I Have Sent the Money
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: 3-FIELD VERIFICATION (SENDER, AMOUNT SENT, TRXID) */}
      {activeStep === 3 && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h4 className="text-body-medium text-text-primary">
              Verify your payment
            </h4>
            <p className="text-caption-1-regular text-text-secondary">
              Enter your sender phone number, exact amount sent, and TrxID to complete verification.
            </p>
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
              className="w-1/3"
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="medium"
              onClick={onSubmit}
              isLoading={isSubmitting}
              className="w-2/3"
            >
              Verify Payment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
