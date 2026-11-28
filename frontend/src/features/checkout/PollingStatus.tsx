import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { Spinner } from '@/components/base/spinner/spinner';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, formatDate, MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import type { CheckoutPollStatus } from './useCheckout';
import {
  RiCheckboxCircleLine,
  RiArrowRightLine,
  RiEditLine,
  RiErrorWarningLine,
  RiAdminLine,
  RiPrinterLine,
} from '@remixicon/react';

export interface PollingStatusProps {
  orderId: string;
  expectedAmount: number;
  provider: MfsProvider;
  trxId: string;
  senderNumber: string;
  merchantId: string;
  customerEmail?: string | null;
  storeName?: string;
  baseAmount?: number;
  offsetCents?: number;
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
  customerEmail?: string | null;
  verifiedAt?: string | number | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEscalationLabel(reason?: string | null): string {
  switch (reason) {
    case 'DEVICE_OFFLINE_IMMEDIATE':
      return 'Submitted for quick store confirmation.';
    case 'PURE_MANUAL_MODE':
      return 'Submitted for store confirmation.';
    case 'GRACE_PERIOD_EXCEEDED':
      return 'Waiting for store confirmation.';
    case 'TRUST_FLAG_ANOMALY':
      return 'Could not verify SMS origin automatically — queued for review.';
    case 'UNDERPAID_AMOUNT':
      return 'Payment amount appears lower than order total — queued for review.';
    case 'OVERPAID_AMOUNT_MISMATCH':
      return 'Payment amount differs from order total — queued for review.';
    case 'SENDER_MISMATCH':
      return 'Mobile number does not match SMS sender — queued for review.';
    case 'STALE_SMS_TIMESTAMP':
      return 'Queued for store confirmation.';
    default:
      return 'Submitted for store confirmation.';
  }
}

function buildPrintableInvoiceHtml(params: {
  invoiceNumber: string;
  storeName: string;
  trxId: string;
  providerName: string;
  senderNumber: string;
  confirmedAtText: string;
  totalPaid: number;
}): string {
  const {
    invoiceNumber,
    storeName,
    trxId,
    providerName,
    senderNumber,
    confirmedAtText,
    totalPaid,
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      background: #fafafa;
      color: #09090b;
      padding: 32px 16px;
    }
    .sheet {
      max-width: 500px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e4e4e7;
      border-radius: 16px;
      overflow: hidden;
    }
    .header {
      padding: 22px 24px;
      border-bottom: 1px solid #e4e4e7;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .brand { font-size: 16px; font-weight: 600; }
    .sub { font-size: 12px; color: #71717a; margin-top: 2px; font-family: ui-monospace, monospace; }
    .badge {
      padding: 4px 10px;
      border-radius: 999px;
      background: #ecfccb;
      color: #3f6212;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .hero {
      padding: 20px 24px;
      background: #f4f4f6;
      border-bottom: 1px solid #e4e4e7;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .hero-label { font-size: 12px; color: #71717a; font-weight: 500; }
    .hero-amount { font-size: 26px; font-weight: 600; font-family: ui-monospace, monospace; }
    .section { padding: 18px 24px; }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 0;
      font-size: 13px;
    }
    .row-label { color: #71717a; }
    .row-val { color: #09090b; font-weight: 500; text-align: right; }
    .mono { font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">${escapeHtml(storeName)}</div>
        <div class="sub">${escapeHtml(invoiceNumber)}</div>
      </div>
      <span class="badge">Verified</span>
    </div>
    <div class="hero">
      <span class="hero-label">Amount Paid</span>
      <span class="hero-amount">${escapeHtml(formatBDT(totalPaid))}</span>
    </div>
    <div class="section">
      <div class="row"><span class="row-label">Method</span><span class="row-val">${escapeHtml(providerName)}</span></div>
      ${trxId ? `<div class="row"><span class="row-label">Transaction ID</span><span class="row-val mono">${escapeHtml(trxId)}</span></div>` : ''}
      ${senderNumber ? `<div class="row"><span class="row-label">Mobile Number</span><span class="row-val mono">${escapeHtml(senderNumber)}</span></div>` : ''}
      <div class="row"><span class="row-label">Time</span><span class="row-val">${escapeHtml(confirmedAtText)}</span></div>
    </div>
  </div>
</body>
</html>`;
}

export function PollingStatus({
  orderId,
  expectedAmount,
  provider,
  trxId,
  senderNumber,
  merchantId,
  storeName,
  initialVerified = false,
  initialStatus = 'PENDING_VERIFICATION',
  initialEscalationReason = null,
  returnUrl = null,
  cancelUrl = null,
  submitAttempts = 1,
  maxSubmitAttempts = 3,
  onEditSubmission,
  onStatusChange,
  onVerified,
  onClose,
}: PollingStatusProps) {
  const [pollStatus, setPollStatus] = useState<CheckoutPollStatus>(
    initialVerified ? 'VERIFIED' : initialStatus,
  );
  const [verifiedAmount, setVerifiedAmount] = useState<number>(expectedAmount);
  const [escalationReason, setEscalationReason] = useState<string | null>(initialEscalationReason);
  const [confirmedAt, setConfirmedAt] = useState<Date>(() => new Date());

  const hasNotifiedVerifiedRef = useRef(initialVerified);
  const isCheckingStatusRef = useRef(false);

  useEffect(() => {
    if (initialVerified) {
      setPollStatus('VERIFIED');
      hasNotifiedVerifiedRef.current = true;
    } else {
      setPollStatus(initialStatus);
    }
  }, [initialVerified, initialStatus]);

  useEffect(() => {
    if (initialEscalationReason !== undefined) setEscalationReason(initialEscalationReason);
  }, [initialEscalationReason]);

  const meta = MFS_METADATA[provider] || {
    name: provider,
    color: 'currentColor',
    bgSoft: 'var(--color-background-secondary-default)',
    textClass: 'text-text-primary',
    borderClass: 'border-border-button-default',
  };

  // Adaptive polling until terminal state (3.5s active verification, 12s manual review)
  useEffect(() => {
    if (pollStatus === 'VERIFIED' || pollStatus === 'REJECTED' || pollStatus === 'EXPIRED') {
      return;
    }

    const checkStatus = async () => {
      if (isCheckingStatusRef.current) return false;
      if (typeof document !== 'undefined' && document.hidden) return false;
      isCheckingStatusRef.current = true;
      try {
        const res = await fetch(
          `/api/v1/checkout/status/${encodeURIComponent(orderId)}?merchantId=${encodeURIComponent(merchantId)}`,
        );
        if (!res.ok) return false;
        const json = await res.json();
        const data: CheckoutStatusResponse = json?.data ?? json;

        if (data?.status === 'VERIFIED') {
          const finalAmount = Number(data.amount ?? expectedAmount);
          const resolvedMatchType = data.matchType ?? null;
          setVerifiedAmount(finalAmount);
          setConfirmedAt(data.verifiedAt ? new Date(data.verifiedAt) : new Date());
          setPollStatus('VERIFIED');
          if (!hasNotifiedVerifiedRef.current) {
            hasNotifiedVerifiedRef.current = true;
            toast.success('Payment verified!', {
              id: `buyer-verified-${orderId}`,
              description: `${formatBDT(finalAmount)} confirmed via ${meta.name}${data.trxId || trxId ? ` · TrxID ${data.trxId || trxId}` : ''}`,
              duration: 5000,
            });
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
      } finally {
        isCheckingStatusRef.current = false;
      }
      return false;
    };

    const intervalMs = pollStatus === 'MANUAL_REVIEW_REQUIRED' ? 12_000 : 3_500;
    const interval = setInterval(async () => {
      const done = await checkStatus();
      if (done) {
        clearInterval(interval);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [merchantId, orderId, trxId, expectedAmount, pollStatus, meta.name, onVerified, onStatusChange]);

  const canEditTrx = Boolean(onEditSubmission) && submitAttempts < maxSubmitAttempts;

  const isSafeRedirectUrl = (raw?: string | null): raw is string => {
    if (!raw) return false;
    try {
      const parsed = new URL(raw, window.location.origin);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const handleContinue = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (isSafeRedirectUrl(returnUrl)) {
      window.location.assign(returnUrl);
    }
  };

  const handleSaveReceipt = () => {
    const resolvedStore = storeName?.trim() || 'ORBIT Pay';
    const isWhole = Math.abs(verifiedAmount - Math.round(verifiedAmount)) < 0.005;
    const tkText = isWhole ? `${Math.round(verifiedAmount)}tk` : `${verifiedAmount.toFixed(2)}tk`;
    const invoiceNumber = `${resolvedStore}||${tkText}||verified`;

    const html = buildPrintableInvoiceHtml({
      invoiceNumber,
      storeName: resolvedStore,
      trxId,
      providerName: meta.name,
      senderNumber,
      confirmedAtText: formatDate(confirmedAt),
      totalPaid: verifiedAmount,
    });

    const popup = window.open('', '_blank', 'width=720,height=840');
    if (popup && popup.document) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      setTimeout(() => {
        try {
          popup.print();
        } catch {
          // User can print manually
        }
      }, 150);
      return;
    }

    const safeFileSlug = (trxId || orderId || 'payment').replace(/[^a-zA-Z0-9_-]/g, '');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `receipt-${safeFileSlug || 'payment'}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('Receipt downloaded');
  };

  if (pollStatus === 'VERIFIED') {
    const hasPrimaryContinue = Boolean(onClose || returnUrl);

    return (
      <div className="orbit-step-enter py-3 flex flex-col items-center text-center space-y-5">
        <div className="size-14 rounded-full bg-notification-success-background text-notification-success-foreground flex items-center justify-center">
          <RiCheckboxCircleLine className="size-8" aria-hidden />
        </div>

        <div className="space-y-1">
          <h3 className="text-title-2-medium text-text-primary">Payment verified</h3>
          <p className="text-body-regular text-text-secondary">
            Your {meta.name} payment has been confirmed.
          </p>
        </div>

        <div className="w-full p-4 rounded-2xl bg-background-secondary-default border border-border-button-default text-start space-y-2.5">
          <div className="flex items-center justify-between gap-4 pb-2.5 border-b border-separator-border">
            <span className="text-caption-1-medium text-text-tertiary">Amount paid</span>
            <span className="text-title-2-medium text-text-primary font-mono tnum">
              {formatBDT(verifiedAmount)}
            </span>
          </div>

          <div className="divide-y divide-separator-border/50 text-caption-1-regular">
            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-text-tertiary">Method</span>
              <span className="text-text-primary font-medium">{meta.name}</span>
            </div>
            {trxId && (
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-text-tertiary">Transaction ID</span>
                <span className="font-mono text-caption-1-medium text-text-primary">{trxId}</span>
              </div>
            )}
            {senderNumber && (
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-text-tertiary">Mobile number</span>
                <span className="font-mono text-text-secondary tnum">{senderNumber}</span>
              </div>
            )}
          </div>
        </div>

        <div className="w-full flex flex-col sm:flex-row items-center gap-2.5">
          <Button
            variant="secondary"
            size="medium"
            onClick={handleSaveReceipt}
            leadingIcon={RiPrinterLine}
            className="w-full sm:w-auto min-h-11"
          >
            Save Receipt
          </Button>
          {hasPrimaryContinue && (
            <Button
              variant="primary"
              size="medium"
              onClick={handleContinue}
              trailingIcon={RiArrowRightLine}
              className="w-full sm:flex-1 min-h-11"
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (pollStatus === 'REJECTED' || pollStatus === 'EXPIRED') {
    const isRejected = pollStatus === 'REJECTED';
    return (
      <div className="orbit-step-enter py-4 flex flex-col items-center text-center space-y-5">
        <div className="size-14 rounded-full bg-notification-error-background text-notification-error-foreground flex items-center justify-center">
          <RiErrorWarningLine className="size-7" aria-hidden />
        </div>

        <div className="space-y-1.5 max-w-sm">
          <Chip variant="caption" color="rose">
            {isRejected ? 'Rejected' : 'Expired'}
          </Chip>
          <h3 className="text-title-3-semibold text-text-primary">
            {isRejected ? 'Could not verify this TrxID' : 'Session expired'}
          </h3>
          <p className="text-body-regular text-text-secondary">
            {isRejected
              ? escalationReason || 'Please check your mobile number and TrxID and try again.'
              : 'This payment session expired before confirmation.'}
          </p>
        </div>

        <div className="w-full flex flex-col sm:flex-row items-center gap-2.5">
          {isRejected && canEditTrx && (
            <Button
              variant="primary"
              size="medium"
              onClick={onEditSubmission}
              leadingIcon={RiEditLine}
              className="w-full sm:flex-1 min-h-11"
            >
              Edit Details &amp; Retry
            </Button>
          )}
          {(onClose || isSafeRedirectUrl(cancelUrl)) && (
            <Button
              variant="secondary"
              size="medium"
              onClick={() => {
                if (onClose) onClose();
                else if (isSafeRedirectUrl(cancelUrl)) window.location.assign(cancelUrl);
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
    <div className="orbit-step-enter py-4 flex flex-col items-center text-center space-y-5">
      {isManualReview ? (
        <div className="size-14 rounded-full bg-status-yellow-background text-status-yellow-text flex items-center justify-center">
          <RiAdminLine className="size-7" aria-hidden />
        </div>
      ) : (
        <div className="size-14 rounded-full bg-background-secondary-default border border-border-button-default flex items-center justify-center">
          <Spinner size="lg" aria-label="Verifying payment" className="text-text-primary" />
        </div>
      )}

      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-title-3-semibold text-text-primary">
          {isManualReview ? 'Payment submitted' : 'Verifying payment...'}
        </h3>
        <p className="text-body-regular text-text-secondary">
          {isManualReview
            ? formatEscalationLabel(escalationReason)
            : `Checking your ${meta.name} Transaction ID. This updates automatically.`}
        </p>
      </div>

      <div className="w-full p-3.5 rounded-2xl bg-background-secondary-default border border-border-button-default grid grid-cols-3 gap-2 text-center">
        <div className="min-w-0">
          <span className="text-caption-2-medium text-text-tertiary block">TrxID</span>
          <span className="font-mono text-caption-1-semibold text-text-primary truncate block">
            {trxId || '—'}
          </span>
        </div>
        <div className="min-w-0 border-x border-separator-border px-2">
          <span className="text-caption-2-medium text-text-tertiary block">Amount</span>
          <span className="font-mono text-caption-1-semibold text-text-primary tnum whitespace-nowrap block">
            {formatBDT(expectedAmount)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-caption-2-medium text-text-tertiary block">Mobile</span>
          <span className="font-mono text-caption-1-medium text-text-secondary tnum truncate block">
            {senderNumber || '—'}
          </span>
        </div>
      </div>

      {canEditTrx && (
        <Button
          variant="secondary"
          size="small"
          onClick={onEditSubmission}
          leadingIcon={RiEditLine}
        >
          Edit Details
        </Button>
      )}
    </div>
  );
}
