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
  RiPrinterLine,
  RiMailCheckLine,
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

function isRealCustomerEmail(email?: string | null): email is string {
  if (!email) return false;
  const trimmed = email.trim();
  return Boolean(trimmed && trimmed.toLowerCase() !== 'buyer@orbitsaas.cloud');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function buildPrintableInvoiceHtml(params: {
  invoiceNumber: string;
  storeName: string;
  orderId: string;
  trxId: string;
  providerName: string;
  senderNumber: string;
  matchLabel: string;
  confirmedAtText: string;
  customerEmail: string | null;
  baseAmount: number;
  offsetBdt: number;
  totalPaid: number;
}): string {
  const {
    invoiceNumber,
    storeName,
    orderId,
    trxId,
    providerName,
    senderNumber,
    matchLabel,
    confirmedAtText,
    customerEmail,
    baseAmount,
    offsetBdt,
    totalPaid,
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Invoice ${escapeHtml(invoiceNumber)} — ${escapeHtml(storeName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      background: #fafafa;
      color: #09090b;
      padding: 32px 16px;
      -webkit-font-smoothing: antialiased;
    }
    .sheet {
      max-width: 640px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e4e4e7;
      border-radius: 16px;
      overflow: hidden;
    }
    .header {
      padding: 28px 32px;
      border-bottom: 1px solid #e4e4e7;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .brand { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
    .sub { font-size: 12px; color: #71717a; margin-top: 4px; font-family: ui-monospace, monospace; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: #ecfccb;
      color: #3f6212;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .hero {
      padding: 24px 32px;
      background: #f4f4f6;
      border-bottom: 1px solid #e4e4e7;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 16px;
    }
    .hero-label { font-size: 12px; color: #71717a; font-weight: 500; }
    .hero-amount {
      font-size: 28px;
      font-weight: 600;
      font-family: ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    .section { padding: 24px 32px; }
    .section + .section { border-top: 1px solid #e4e4e7; }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 8px 0;
      font-size: 13px;
    }
    .row-label { color: #71717a; white-space: nowrap; }
    .row-val {
      color: #09090b;
      font-weight: 500;
      text-align: right;
      word-break: break-all;
      font-variant-numeric: tabular-nums;
    }
    .mono { font-family: ui-monospace, monospace; }
    .total-row {
      border-top: 1px solid #e4e4e7;
      margin-top: 8px;
      padding-top: 14px;
      font-weight: 600;
      font-size: 14px;
    }
    .footer {
      padding: 20px 32px;
      border-top: 1px solid #e4e4e7;
      background: #fafafa;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #71717a;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .sheet { border: none; border-radius: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">${escapeHtml(storeName)}</div>
        <div class="sub">${escapeHtml(invoiceNumber)}</div>
      </div>
      <span class="badge">Paid &amp; Verified</span>
    </div>

    <div class="hero">
      <span class="hero-label">Total Paid</span>
      <span class="hero-amount">${escapeHtml(formatBDT(totalPaid))}</span>
    </div>

    <div class="section">
      <div class="row">
        <span class="row-label">Reference ID</span>
        <span class="row-val mono">${escapeHtml(orderId)}</span>
      </div>
      <div class="row">
        <span class="row-label">Payment Method</span>
        <span class="row-val">${escapeHtml(providerName)}</span>
      </div>
      ${trxId ? `<div class="row"><span class="row-label">Transaction ID (TrxID)</span><span class="row-val mono">${escapeHtml(trxId)}</span></div>` : ''}
      ${senderNumber ? `<div class="row"><span class="row-label">Sender Number</span><span class="row-val mono">${escapeHtml(senderNumber)}</span></div>` : ''}
      <div class="row">
        <span class="row-label">Verification Mode</span>
        <span class="row-val">${escapeHtml(matchLabel)}</span>
      </div>
      <div class="row">
        <span class="row-label">Confirmed At</span>
        <span class="row-val">${escapeHtml(confirmedAtText)}</span>
      </div>
      ${customerEmail ? `<div class="row"><span class="row-label">Receipt Email</span><span class="row-val">${escapeHtml(customerEmail)}</span></div>` : ''}
    </div>

    <div class="section">
      <div class="row">
        <span class="row-label">Order Base Amount</span>
        <span class="row-val mono">${escapeHtml(formatBDT(baseAmount))}</span>
      </div>
      ${offsetBdt > 0 ? `<div class="row"><span class="row-label">Unique Poisha Code</span><span class="row-val mono">+${escapeHtml(formatBDT(offsetBdt))}</span></div>` : ''}
      <div class="row">
        <span class="row-label">Gateway Fee</span>
        <span class="row-val mono">${escapeHtml(formatBDT(0))}</span>
      </div>
      <div class="row total-row">
        <span>Total Settled</span>
        <span class="mono">${escapeHtml(formatBDT(totalPaid))}</span>
      </div>
    </div>

    <div class="footer">
      <span>Verified by ORBIT Payment Hub</span>
      <span>0% Gateway Fee</span>
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
  customerEmail = null,
  storeName,
  baseAmount,
  offsetCents = 0,
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
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(
    isRealCustomerEmail(customerEmail) ? customerEmail.trim() : null,
  );
  const [confirmedAt, setConfirmedAt] = useState<Date>(() => new Date());
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  const hasNotifiedVerifiedRef = useRef(initialVerified);

  useEffect(() => {
    if (isRealCustomerEmail(customerEmail)) {
      setResolvedEmail(customerEmail.trim());
    }
  }, [customerEmail]);

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

  const meta = MFS_METADATA[provider] || {
    name: provider,
    color: 'currentColor',
    bgSoft: 'var(--color-background-secondary-default)',
    textClass: 'text-text-primary',
    borderClass: 'border-border-button-default',
  };

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
        if (isRealCustomerEmail(data?.customerEmail)) {
          setResolvedEmail(data.customerEmail.trim());
        }

        if (data?.status === 'VERIFIED') {
          const finalAmount = Number(data.amount ?? expectedAmount);
          const resolvedMatchType = data.matchType ?? null;
          setVerifiedAmount(finalAmount);
          setMatchType(resolvedMatchType);
          setConfirmedAt(data.verifiedAt ? new Date(data.verifiedAt) : new Date());
          setPollStatus('VERIFIED');
          if (!hasNotifiedVerifiedRef.current) {
            hasNotifiedVerifiedRef.current = true;
            toast.success('Payment received & verified!', {
              id: `buyer-verified-${orderId}`,
              description: `${formatBDT(finalAmount)} confirmed via ${meta.name}${data.trxId || trxId ? ` · TrxID ${data.trxId || trxId}` : ''}`,
              duration: 6000,
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
  }, [merchantId, orderId, trxId, expectedAmount, pollStatus, meta.name, onVerified, onStatusChange]);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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

  const handlePrintOrSaveInvoice = () => {
    const offsetBdt = offsetCents > 0 ? offsetCents / 100 : 0;
    const computedBase =
      typeof baseAmount === 'number' && baseAmount > 0
        ? baseAmount
        : Math.max(0, Number((verifiedAmount - offsetBdt).toFixed(2)));
    const cleanRef = (orderId || 'RECEIPT').replace(/[^a-zA-Z0-9_-]/g, '');
    const invoiceNumber = `ORB-INV-${cleanRef.slice(0, 12).toUpperCase()}`;

    const html = buildPrintableInvoiceHtml({
      invoiceNumber,
      storeName: storeName || 'ORBIT Pay Hub',
      orderId,
      trxId,
      providerName: meta.name,
      senderNumber,
      matchLabel: formatMatchTypeLabel(matchType),
      confirmedAtText: formatDate(confirmedAt),
      customerEmail: resolvedEmail,
      baseAmount: computedBase,
      offsetBdt,
      totalPaid: verifiedAmount,
    });

    const popup = window.open('', '_blank', 'width=820,height=920');
    if (popup && popup.document) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      setTimeout(() => {
        try {
          popup.print();
        } catch {
          // User can print manually from opened tab
        }
      }, 150);
      return;
    }

    // Popup blocked fallback: download standalone HTML invoice file
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `orbit-invoice-${cleanRef || 'receipt'}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('Invoice downloaded');
  };

  if (pollStatus === 'VERIFIED') {
    const hasPrimaryContinue = Boolean(onClose || returnUrl);

    return (
      <div className="orbit-step-enter py-3 flex flex-col items-center text-center space-y-5">
        <div className="size-14 rounded-full bg-notification-success-background text-notification-success-foreground flex items-center justify-center">
          <RiCheckboxCircleLine className="size-8" aria-hidden />
        </div>

        <div className="space-y-1.5">
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
            Confirmed by ORBIT Payment Hub.
          </p>
        </div>

        {/* Receipt Card */}
        <div className="w-full p-4 sm:p-5 rounded-2xl bg-background-secondary-default border border-border-button-default text-start space-y-3">
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-separator-border">
            <span className="text-caption-1-medium text-text-tertiary whitespace-nowrap shrink-0">
              Amount paid
            </span>
            <span className="text-title-2-medium text-text-primary font-mono tnum whitespace-nowrap">
              {formatBDT(verifiedAmount)}
            </span>
          </div>

          <div className="divide-y divide-separator-border/50 text-caption-1-regular">
            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-text-tertiary whitespace-nowrap shrink-0">
                Reference ID
              </span>
              <span
                title={orderId}
                className="font-mono text-caption-1-medium text-text-primary truncate max-w-[190px] sm:max-w-[260px] text-end min-w-0"
              >
                {orderId}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-text-tertiary whitespace-nowrap shrink-0">
                Payment method
              </span>
              <span className="text-end min-w-0">
                <Chip
                  variant="caption"
                  style={{ backgroundColor: meta.bgSoft, color: meta.color }}
                >
                  {meta.name}
                </Chip>
              </span>
            </div>

            {trxId && (
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-text-tertiary whitespace-nowrap shrink-0">
                  Transaction ID
                </span>
                <span className="font-mono text-caption-1-medium text-text-primary truncate text-end min-w-0">
                  {trxId}
                </span>
              </div>
            )}

            {senderNumber && (
              <div className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-text-tertiary whitespace-nowrap shrink-0">
                  Sender number
                </span>
                <span className="font-mono text-text-secondary tnum whitespace-nowrap text-end min-w-0">
                  {senderNumber}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-text-tertiary whitespace-nowrap shrink-0">
                Verification mode
              </span>
              <span className="text-text-primary font-medium truncate text-end min-w-0">
                {formatMatchTypeLabel(matchType)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-text-tertiary whitespace-nowrap shrink-0">
                Confirmed at
              </span>
              <span className="text-text-secondary tnum whitespace-nowrap text-end min-w-0">
                {formatDate(confirmedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* OrbitMail Confirmation Pill */}
        {resolvedEmail && (
          <div className="w-full px-3.5 py-2.5 rounded-xl bg-background-secondary-default border border-separator-border flex items-center gap-2 text-caption-1-medium text-text-secondary text-start">
            <RiMailCheckLine className="size-4 text-status-lime-text shrink-0" aria-hidden />
            <span className="truncate">
              OrbitMail receipt &amp; invoice sent to{' '}
              <span className="text-text-primary font-medium">{resolvedEmail}</span>
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full space-y-2.5">
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
              className="w-full min-h-11"
            >
              {copiedReceipt ? 'Copied' : 'Copy Receipt'}
            </Button>

            <Button
              variant="secondary"
              size="medium"
              onClick={handlePrintOrSaveInvoice}
              leadingIcon={RiPrinterLine}
              className="w-full min-h-11"
            >
              Save / Print Invoice
            </Button>
          </div>

          {hasPrimaryContinue && (
            <Button
              variant="primary"
              size="medium"
              onClick={handleContinue}
              trailingIcon={RiArrowRightLine}
              className="w-full min-h-11"
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
      <div className="orbit-step-enter py-5 flex flex-col items-center text-center space-y-5">
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
    <div className="orbit-step-enter py-4 flex flex-col items-center text-center space-y-5">
      {isManualReview ? (
        <div className="size-14 rounded-full bg-status-yellow-background text-status-yellow-text flex items-center justify-center">
          <RiAdminLine className="size-7" aria-hidden />
        </div>
      ) : (
        <div className="size-14 rounded-full bg-background-secondary-default border border-border-button-default flex items-center justify-center">
          <Spinner size="lg" aria-label="Listening for payment confirmation" className="text-text-primary" />
        </div>
      )}

      <div className="space-y-1.5 max-w-md">
        <div className="flex items-center justify-center">
          <Chip variant="caption" color={isManualReview ? 'yellow' : 'blue'}>
            {isManualReview ? 'Queued for Admin Review' : 'Awaiting SMS Match'}
          </Chip>
        </div>
        <h3 className="text-title-3-semibold text-text-primary">
          {isManualReview
            ? 'Payment submitted — under review'
            : 'Listening for confirmation'}
        </h3>
        <p className="text-body-regular text-text-secondary">
          {isManualReview
            ? `${formatEscalationLabel(escalationReason)}. This page updates automatically once approved.`
            : `Waiting for incoming ${meta.name} SMS confirmation.`}
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
          <RiTimeLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
          <span className="text-text-secondary whitespace-nowrap">Auto-verification window</span>
          <span className="font-mono text-text-primary tnum whitespace-nowrap">
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
          <span className="font-mono text-caption-1-semibold text-text-primary tnum whitespace-nowrap block">
            {formatBDT(expectedAmount)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-caption-2-medium text-text-tertiary block">Sender</span>
          <span className="font-mono text-caption-1-medium text-text-secondary tnum truncate block">
            {senderNumber || '—'}
          </span>
        </div>
      </div>

      {/* OrbitMail Pending Notification */}
      {resolvedEmail && (
        <div className="w-full px-3.5 py-2.5 rounded-xl bg-background-secondary-default border border-separator-border flex items-center gap-2 text-caption-1-medium text-text-secondary text-start">
          <RiMailCheckLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
          <span className="truncate">
            OrbitMail receipt &amp; invoice will be sent to{' '}
            <span className="text-text-primary font-medium">{resolvedEmail}</span> once confirmed
          </span>
        </div>
      )}

      {activeReceiptUrl && (
        <div className="w-full px-3.5 py-2.5 rounded-xl bg-background-secondary-default border border-separator-border flex items-center justify-between gap-2 text-caption-1-medium">
          <span className="text-text-secondary whitespace-nowrap">Screenshot proof attached</span>
          <a
            href={activeReceiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-text-primary underline underline-offset-2 shrink-0"
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
          <span className="text-caption-2-medium text-text-tertiary tnum whitespace-nowrap">
            Mistyped TrxID? ({maxSubmitAttempts - submitAttempts} attempt{maxSubmitAttempts - submitAttempts === 1 ? '' : 's'} left)
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-caption-2-medium text-text-tertiary">
        <RiShieldCheckLine className="size-3.5 text-status-lime-text shrink-0" aria-hidden />
        <span>Safe &amp; encrypted 256-bit edge reconciliation</span>
      </div>
    </div>
  );
}
