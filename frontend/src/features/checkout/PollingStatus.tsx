import { useState, useEffect } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { ProgressBar } from '@/components/base/progress/progress';
import { Spinner } from '@/components/base/spinner/spinner';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, formatDate, MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import {
  RiCheckboxCircleLine,
  RiTimeLine,
  RiShieldCheckLine,
  RiArrowRightLine,
  RiFileCopyLine,
  RiCheckLine,
} from '@remixicon/react';

export interface PollingStatusProps {
  orderId: string;
  expectedAmount: number;
  provider: MfsProvider;
  trxId: string;
  senderNumber: string;
  merchantId: string;
  initialVerified?: boolean;
  initialMatchType?: string | null;
  onVerified: (trxId: string, amount: number, matchType?: string | null) => void;
  onClose?: () => void;
}

interface CheckoutStatusResponse {
  status: string;
  trxId?: string;
  amount?: number;
  baseAmount?: number;
  uniqueAmount?: number;
  matchType?: string | null;
  verifiedAt?: string | number | null;
}

function formatMatchTypeLabel(matchType?: string | null): string {
  switch (matchType) {
    case 'EXACT_UNIQUE':
      return 'Exact Poisha Match';
    case 'BASE_AMOUNT_FALLBACK':
      return 'Base Amount Verified';
    case 'OVERPAID':
      return 'Overpayment Verified';
    case 'MANUAL_VERIFIED':
      return 'Manual Verified';
    default:
      return 'Payment Verified';
  }
}

export function PollingStatus({
  orderId,
  expectedAmount,
  provider,
  trxId,
  senderNumber,
  merchantId,
  initialVerified = false,
  initialMatchType = null,
  onVerified,
  onClose,
}: PollingStatusProps) {
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [isSuccess, setIsSuccess] = useState(initialVerified);
  const [verifiedAmount, setVerifiedAmount] = useState<number>(expectedAmount);
  const [matchType, setMatchType] = useState<string | null>(initialMatchType);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  useEffect(() => {
    if (initialVerified) {
      setIsSuccess(true);
    }
  }, [initialVerified]);

  useEffect(() => {
    if (initialMatchType) {
      setMatchType(initialMatchType);
    }
  }, [initialMatchType]);

  // 10-Minute Countdown Timer
  useEffect(() => {
    if (isSuccess || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isSuccess, secondsLeft]);

  // Genuine backend polling loop (every 2.5s, zero fake auto-verify bypass)
  useEffect(() => {
    if (isSuccess) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/v1/checkout/status?merchantId=${encodeURIComponent(merchantId)}&orderId=${encodeURIComponent(orderId)}&trxId=${encodeURIComponent(trxId)}`,
        );
        if (!res.ok) return false;
        const json = await res.json();
        const data: CheckoutStatusResponse = json?.data ?? json;

        if (data?.status === 'VERIFIED') {
          const finalAmount = Number(data.amount ?? expectedAmount);
          const resolvedMatchType = data.matchType ?? null;
          setVerifiedAmount(finalAmount);
          setMatchType(resolvedMatchType);
          setIsSuccess(true);
          onVerified(data.trxId || trxId, finalAmount, resolvedMatchType);
          return true;
        }
      } catch {
        // Network retry on next interval
      }
      return false;
    };

    const interval = setInterval(async () => {
      const done = await checkStatus();
      if (done) {
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [merchantId, orderId, trxId, expectedAmount, isSuccess, onVerified]);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const meta = MFS_METADATA[provider] || {
    name: provider,
    color: 'currentColor',
    bgSoft: 'var(--color-background-secondary-default)',
    textClass: 'text-text-primary',
    borderClass: 'border-border-button-default',
  };

  if (isSuccess) {
    return (
      <div className="py-4 flex flex-col items-center text-center space-y-6">
        <div className="size-16 rounded-full bg-notification-success-background text-notification-success-foreground flex items-center justify-center">
          <RiCheckboxCircleLine className="size-9" aria-hidden />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center">
            <Chip
              variant="caption"
              color={matchType === 'BASE_AMOUNT_FALLBACK' ? 'cyan' : 'lime'}
            >
              {formatMatchTypeLabel(matchType)}
            </Chip>
          </div>
          <h3 className="text-title-2-medium text-text-primary">
            Payment verified
          </h3>
          <p className="text-body-regular text-text-secondary">
            Your transaction has been confirmed by ORBIT Payment Hub.
          </p>
        </div>

        {/* Receipt Box */}
        <div className="w-full p-5 rounded-2xl bg-background-secondary-default border border-border-button-default text-start space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-separator-border">
            <span className="text-caption-1-medium text-text-tertiary">
              Amount paid
            </span>
            <span className="text-title-2-medium text-text-primary font-mono tabular-nums tnum">
              {formatBDT(verifiedAmount)}
            </span>
          </div>

          <div className="space-y-2 text-caption-1-regular">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-tertiary">Store order ID</span>
              <span className="font-mono text-caption-1-medium text-text-primary">{orderId}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-tertiary">Payment method</span>
              <Chip
                variant="caption"
                style={{ backgroundColor: meta.bgSoft, color: meta.color }}
              >
                {meta.name}
              </Chip>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-tertiary">Transaction ID</span>
              <span className="font-mono text-caption-1-medium text-text-primary">{trxId}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-tertiary">Sender number</span>
              <span className="font-mono text-text-secondary tabular-nums">{senderNumber}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-tertiary">Verification mode</span>
              <span className="text-text-primary font-medium">{formatMatchTypeLabel(matchType)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-tertiary">Confirmed at</span>
              <span className="text-text-secondary tabular-nums">{formatDate(new Date())}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex items-center gap-3">
          <Button
            variant="secondary"
            size="medium"
            onClick={() => {
              navigator.clipboard.writeText(
                `Order ${orderId}: Paid ${formatBDT(verifiedAmount)} via ${meta.name} (TrxID: ${trxId})`,
              );
              setCopiedReceipt(true);
              toast.success('Receipt copied to clipboard');
              setTimeout(() => setCopiedReceipt(false), 2000);
            }}
            leadingIcon={copiedReceipt ? RiCheckLine : RiFileCopyLine}
            className="flex-1"
          >
            {copiedReceipt ? 'Copied' : 'Copy Receipt'}
          </Button>

          <Button
            variant="primary"
            size="medium"
            onClick={onClose}
            trailingIcon={RiArrowRightLine}
            className="flex-1"
          >
            Continue to Store
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 flex flex-col items-center text-center space-y-6">
      <div className="size-16 rounded-full bg-background-secondary-default border border-border-button-default flex items-center justify-center">
        <Spinner size="lg" aria-label="Listening for payment confirmation" className="text-text-primary" />
      </div>

      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-title-3-semibold text-text-primary">
          Listening for payment confirmation
        </h3>
        <p className="text-body-regular text-text-secondary">
          Waiting for incoming SMS from your {meta.name} transfer. Automated edge reconciler will verify as soon as the SMS arrives.
        </p>
      </div>

      <ProgressBar
        aria-label="Edge SMS verification progress"
        isIndeterminate
        size="sm"
        className="max-w-xs"
      />

      {/* Countdown Timer Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-background-secondary-default border border-border-button-default text-caption-1-medium">
        <RiTimeLine className="size-4 text-foreground-icon-secondary" aria-hidden />
        <span className="text-text-secondary">Session expires in</span>
        <span className="font-mono text-text-primary tabular-nums tnum">
          {formatTimer(secondsLeft)}
        </span>
      </div>

      {/* Submitted parameters confirmation strip */}
      <div className="w-full p-3.5 rounded-2xl bg-background-secondary-default border border-border-button-default grid grid-cols-3 gap-2 text-center">
        <div className="min-w-0">
          <span className="text-caption-2-medium text-text-tertiary block">TrxID</span>
          <span className="font-mono text-caption-1-semibold text-text-primary truncate block">
            {trxId}
          </span>
        </div>
        <div className="min-w-0 border-x border-separator-border px-2">
          <span className="text-caption-2-medium text-text-tertiary block">Amount</span>
          <span className="font-mono text-caption-1-semibold text-text-primary tabular-nums tnum block">
            {formatBDT(expectedAmount)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-caption-2-medium text-text-tertiary block">Sender</span>
          <span className="font-mono text-caption-1-medium text-text-secondary tabular-nums truncate block">
            {senderNumber}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-caption-2-medium text-text-tertiary">
        <RiShieldCheckLine className="size-3.5 text-status-lime-text" aria-hidden />
        <span>Safe &amp; encrypted 256-bit edge reconciliation</span>
      </div>
    </div>
  );
}
