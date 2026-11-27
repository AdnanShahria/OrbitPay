import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { ProgressBar } from '@/components/base/progress/progress';
import { Spinner } from '@/components/base/spinner/spinner';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, formatDate, MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import type { CheckoutPollStatus } from './useCheckout';
import {
  RiCheckboxCircleLine,
  RiTimeLine,
  RiShieldCheckLine,
  RiArrowRightLine,
  RiFileCopyLine,
  RiCheckLine,
  RiEditLine,
  RiErrorWarningLine,
  RiAdminLine,
  RiExternalLinkLine,
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
  initialStatus?: CheckoutPollStatus;
  initialEscalationReason?: string | null;
  receiptUrl?: string | null;
  returnUrl?: string | null;
  cancelUrl?: string | null;
  graceExpiresAt?: string | null;
  submitAttempts?: number;
  maxSubmitAttempts?: number;
  onEditSubmission?: () => void;
  onStatusChange?: (next: {
    status: CheckoutPollStatus;
    escalationReason?: string | null;
    trxId?: string;
    amount?: number;
  }) => void;
  onVerified: (trxId: string, amount: number, matchType?: string | null) => void;
  onClose?: () => void;
}

interface CheckoutStatusResponse {
  status: string;
  paymentIntentId?: string;
  trxId?: string;
  amount?: number;
  baseAmount?: number;
  uniqueAmount?: number;
  matchType?: string | null;
  escalationReason?: string | null;
  receiptUrl?: string | null;
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
      return 'Admin Verified';
    default:
      return 'Payment Verified';
  }
}

function formatEscalationLabel(reason?: string | null): string {
  switch (reason) {
    case 'DEVICE_OFFLINE_IMMEDIATE':
      return 'Companion phone offline — queued for admin confirmation';
    case 'PURE_MANUAL_MODE':
      return 'Merchant manual verification mode';
    case 'GRACE_PERIOD_EXCEEDED':
      return 'SMS delayed — escalated to admin review';
    case 'TRUST_FLAG_ANOMALY':
      return 'Extra verification check required';
    case 'UNDERPAID_AMOUNT':
      return 'Submitted amount lower than expected';
    case 'OVERPAID_AMOUNT_MISMATCH':
      return 'Submitted amount differs from expected';
    case 'SENDER_MISMATCH':
      return 'Sender number requires manual confirmation';
    case 'STALE_SMS_TIMESTAMP':
      return 'SMS timestamp outside window';
    default:
      return 'Queued in merchant admin panel for review';
  }
}

function computeGraceSeconds(graceExpiresAt?: string | null): number {
  if (!graceExpiresAt) return 600;
  const target = new Date(graceExpiresAt).getTime();
  if (Number.isNaN(target)) return 600;
  return Math.max(0, Math.floor((target - Date.now()) / 1000));
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
  initialStatus = 'PENDING_VERIFICATION',
  initialEscalationReason = null,
  receiptUrl = null,
  returnUrl = null,
  cancelUrl = null,
  graceExpiresAt = null,
  submitAttempts = 1,
  maxSubmitAttempts = 3,
  onEditSubmission,
  onStatusChange,
  onVerified,
  onClose,
}: PollingStatusProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => computeGraceSeconds(graceExpiresAt));
  const [pollStatus, setPollStatus] = useState<CheckoutPollStatus>(
    initialVerified ? 'VERIFIED' : initialStatus,
  );
  const [verifiedAmount, setVerifiedAmount] = useState<number>(expectedAmount);
  const [matchType, setMatchType] = useState<string | null>(initialMatchType);
  const [escalationReason, setEscalationReason] = useState<string | null>(initialEscalationReason);
  const [activeReceiptUrl, setActiveReceiptUrl] = useState<string | null>(receiptUrl);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  const hasNotifiedVerifiedRef = useRef(initialVerified);

  useEffect(() => {
    if (initialVerified) {
      setPollStatus('VERIFIED');
      hasNotifiedVerifiedRef.current = true;
    } else {
      setPollStatus(initialStatus);
    }
  }, [initialVerified, initialStatus]);

  useEffect(() => {
    if (initialMatchType) setMatchType(initialMatchType);
  }, [initialMatchType]);

  useEffect(() => {
    if (initialEscalationReason !== undefined) setEscalationReason(initialEscalationReason);
  }, [initialEscalationReason]);

  useEffect(() => {
    if (receiptUrl) setActiveReceiptUrl(receiptUrl);
  }, [receiptUrl]);

  // Countdown timer while waiting
  useEffect(() => {
    if (pollStatus === 'VERIFIED' || pollStatus === 'REJECTED' || pollStatus === 'EXPIRED' || secondsLeft <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [pollStatus, secondsLeft]);

  // Genuine backend polling loop (every 2.5s)
  useEffect(() => {
    if (pollStatus === 'VERIFIED' || pollStatus === 'REJECTED' || pollStatus === 'EXPIRED') {
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/v1/checkout/status/${encodeURIComponent(orderId)}?merchantId=${encodeURIComponent(merchantId)}`,
        );
        if (!res.ok) return false;
        const json = await res.json();
        const data: CheckoutStatusResponse = json?.data ?? json;

        if (data?.receiptUrl) {
          setActiveReceiptUrl(data.receiptUrl);
        }

        if (data?.status === 'VERIFIED') {
          const finalAmount = Number(data.amount ?? expectedAmount);
          const resolvedMatchType = data.matchType ?? null;
          setVerifiedAmount(finalAmount);
          setMatchType(resolvedMatchType);
          setPollStatus('VERIFIED');
          if (!hasNotifiedVerifiedRef.current) {
            hasNotifiedVerifiedRef.current = true;
            onVerified(data.trxId || trxId, finalAmount, resolvedMatchType);
          }
          return true;
        }

        if (data?.status === 'MANUAL_REVIEW_REQUIRED') {
          setPollStatus('MANUAL_REVIEW_REQUIRED');
          setEscalationReason(data.escalationReason ?? null);
          onStatusChange?.({
            status: 'MANUAL_REVIEW_REQUIRED',
            escalationReason: data.escalationReason ?? null,
            trxId: data.trxId || trxId,
            amount: data.amount ?? expectedAmount,
          });
          return false;
        }

        if (data?.status === 'REJECTED' || data?.status === 'EXPIRED') {
          const terminalStatus = data.status as 'REJECTED' | 'EXPIRED';
          setPollStatus(terminalStatus);
          setEscalationReason(data.escalationReason ?? null);
          onStatusChange?.({
            status: terminalStatus,
            escalationReason: data.escalationReason ?? null,
            trxId: data.trxId || trxId,
          });
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
  }, [merchantId, orderId, trxId, expectedAmount, pollStatus, onVerified, onStatusChange]);

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

  const canEditTrx = Boolean(onEditSubmission) && submitAttempts < maxSubmitAttempts;

  const handleContinue = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (returnUrl) {
      window.location.href = returnUrl;
    }
  };

  if (pollStatus === 'VERIFIED') {
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
              <span className="text-text-tertiary">Reference ID</span>
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
            {trxId && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-tertiary">Transaction ID</span>
                <span className="font-mono text-caption-1-medium text-text-primary">{trxId}</span>
              </div>
            )}
            {senderNumber && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-tertiary">Sender number</span>
                <span className="font-mono text-text-secondary tabular-nums">{senderNumber}</span>
              </div>
            )}
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
        <div className="w-full flex flex-col sm:flex-row items-center gap-3">
          <Button
            variant="secondary"
            size="medium"
            onClick={() => {
              navigator.clipboard.writeText(
                `Ref ${orderId}: Paid ${formatBDT(verifiedAmount)} via ${meta.name} (TrxID: ${trxId})`,
              );
              setCopiedReceipt(true);
              toast.success('Receipt copied to clipboard');
              setTimeout(() => setCopiedReceipt(false), 2000);
            }}
            leadingIcon={copiedReceipt ? RiCheckLine : RiFileCopyLine}
            className="w-full sm:flex-1 min-h-11"
          >
            {copiedReceipt ? 'Copied' : 'Copy Receipt'}
          </Button>

          {(onClose || returnUrl) && (
            <Button
              variant="primary"
              size="medium"
              onClick={handleContinue}
              trailingIcon={RiArrowRightLine}
              className="w-full sm:flex-1 min-h-11"
            >
              Continue to Store
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (pollStatus === 'REJECTED' || pollStatus === 'EXPIRED') {
    const isRejected = pollStatus === 'REJECTED';
    return (
      <div className="py-5 flex flex-col items-center text-center space-y-5">
        <div className="size-16 rounded-full bg-notification-error-background text-notification-error-foreground flex items-center justify-center">
          <RiErrorWarningLine className="size-8" aria-hidden />
        </div>

        <div className="space-y-1.5 max-w-sm">
          <Chip variant="caption" color="rose">
            {isRejected ? 'Submission Rejected' : 'Session Expired'}
          </Chip>
          <h3 className="text-title-3-semibold text-text-primary">
            {isRejected ? 'Could not approve this TrxID' : 'Checkout session expired'}
          </h3>
          <p className="text-body-regular text-text-secondary">
            {isRejected
              ? escalationReason || 'The merchant rejected this submission. Check your TrxID or contact support.'
              : 'The 15-minute checkout window expired before confirmation.'}
          </p>
        </div>

        <div className="w-full flex flex-col sm:flex-row items-center gap-3">
          {isRejected && canEditTrx && (
            <Button
              variant="primary"
              size="medium"
              onClick={onEditSubmission}
              leadingIcon={RiEditLine}
              className="w-full sm:flex-1 min-h-11"
            >
              Edit TrxID &amp; Re-submit
            </Button>
          )}
          {(onClose || cancelUrl) && (
            <Button
              variant="secondary"
              size="medium"
              onClick={() => {
                if (onClose) onClose();
                else if (cancelUrl) window.location.href = cancelUrl;
              }}
              className="w-full sm:flex-1 min-h-11"
            >
              Close
            </Button>
          )}
        </div>
      </div>
    );
  }

  const isManualReview = pollStatus === 'MANUAL_REVIEW_REQUIRED';

  return (
    <div className="py-5 flex flex-col items-center text-center space-y-5">
      {isManualReview ? (
        <div className="size-16 rounded-full bg-status-yellow-background text-status-yellow-text flex items-center justify-center">
          <RiAdminLine className="size-8" aria-hidden />
        </div>
      ) : (
        <div className="size-16 rounded-full bg-background-secondary-default border border-border-button-default flex items-center justify-center">
          <Spinner size="lg" aria-label="Listening for payment confirmation" className="text-text-primary" />
        </div>
      )}

      <div className="space-y-2 max-w-md">
        <div className="flex items-center justify-center">
          <Chip variant="caption" color={isManualReview ? 'yellow' : 'blue'}>
            {isManualReview ? 'Queued for Admin Review' : 'Awaiting SMS Match'}
          </Chip>
        </div>
        <h3 className="text-title-3-semibold text-text-primary">
          {isManualReview
            ? 'Payment submitted — under admin review'
            : 'Listening for payment confirmation'}
        </h3>
        <p className="text-body-regular text-text-secondary">
          {isManualReview
            ? `${formatEscalationLabel(escalationReason)}. You do not need to pay again — this page updates automatically once approved.`
            : `Waiting for incoming SMS from your ${meta.name} transfer. Automated edge reconciler will verify as soon as the SMS arrives.`}
        </p>
      </div>

      <ProgressBar
        aria-label="Edge verification progress"
        isIndeterminate
        size="sm"
        className="max-w-xs"
      />

      {!isManualReview && (
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-background-secondary-default border border-border-button-default text-caption-1-medium">
          <RiTimeLine className="size-4 text-foreground-icon-secondary" aria-hidden />
          <span className="text-text-secondary">Auto-verification window</span>
          <span className="font-mono text-text-primary tabular-nums tnum">
            {formatTimer(secondsLeft)}
          </span>
        </div>
      )}

      {/* Submitted parameters confirmation strip */}
      <div className="w-full p-3.5 rounded-2xl bg-background-secondary-default border border-border-button-default grid grid-cols-3 gap-2 text-center">
        <div className="min-w-0">
          <span className="text-caption-2-medium text-text-tertiary block">TrxID</span>
          <span className="font-mono text-caption-1-semibold text-text-primary truncate block">
            {trxId || '—'}
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
            {senderNumber || '—'}
          </span>
        </div>
      </div>

      {activeReceiptUrl && (
        <div className="w-full px-3.5 py-2.5 rounded-xl bg-background-secondary-default border border-separator-border flex items-center justify-between text-caption-1-medium">
          <span className="text-text-secondary">Screenshot proof attached</span>
          <a
            href={activeReceiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-text-primary underline underline-offset-2"
          >
            <span>View proof</span>
            <RiExternalLinkLine className="size-3.5" aria-hidden />
          </a>
        </div>
      )}

      {/* Edit TrxID / Re-submit escape hatch (max 3 attempts) */}
      {canEditTrx && (
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
          <Button
            variant="secondary"
            size="medium"
            onClick={onEditSubmission}
            leadingIcon={RiEditLine}
            className="w-full sm:w-auto min-h-11"
          >
            Edit TrxID / Re-submit
          </Button>
          <span className="text-caption-2-medium text-text-tertiary tabular-nums">
            Mistyped TrxID? ({maxSubmitAttempts - submitAttempts} attempt{maxSubmitAttempts - submitAttempts === 1 ? '' : 's'} left)
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-caption-2-medium text-text-tertiary">
        <RiShieldCheckLine className="size-3.5 text-status-lime-text" aria-hidden />
        <span>Safe &amp; encrypted 256-bit edge reconciliation</span>
      </div>
    </div>
  );
}
