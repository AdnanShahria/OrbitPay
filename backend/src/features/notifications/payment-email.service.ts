import { and, desc, eq } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import { checkoutSessions, merchantOrders, routerKvStore } from '../../db/schema';
import { routeEmail } from '../../router/email';
import type { Env } from '../../shared/types';

const PLACEHOLDER_EMAIL = 'buyer@orbitsaas.cloud';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVOICE_IDEMPOTENCY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface ParsedCustomerInfo {
  name?: string;
  email?: string;
  phone?: string;
}

export interface PaymentSubmittedEmailParams {
  merchantId: string;
  storeName?: string | null;
  externalRefId: string;
  customerEmail?: string | null;
  customerName?: string | null;
  amount: number;
  provider?: string | null;
  trxId?: string | null;
  senderNumber?: string | null;
  status: 'PENDING_VERIFICATION' | 'MANUAL_REVIEW_REQUIRED';
  submittedAt?: Date | string | number | null;
}

export interface PaymentVerifiedInvoiceEmailParams {
  merchantId: string;
  storeName?: string | null;
  externalRefId: string;
  paymentIntentId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  baseAmount: number;
  uniqueAmount?: number | null;
  paidAmount: number;
  offsetCents?: number | null;
  provider?: string | null;
  trxId?: string | null;
  senderNumber?: string | null;
  matchType?: string | null;
  resolutionSource?: string | null;
  verifiedAt?: Date | string | number | null;
}

export interface PaymentEmailResult {
  sent: boolean;
  skippedDuplicate?: boolean;
  invoiceNumber?: string;
  providerUsed?: string | null;
  error?: string;
}

/**
 * Returns the first valid non-placeholder customer email from the provided candidates.
 */
export function extractRealCustomerEmail(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === PLACEHOLDER_EMAIL) continue;
    if (EMAIL_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Safely parses `payment_intents.customer_json` into normalized customer fields.
 */
export function extractCustomerFromJson(customerJson?: string | null): ParsedCustomerInfo {
  if (!customerJson || typeof customerJson !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(customerJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined,
      email:
        typeof parsed.email === 'string' && parsed.email.trim() ? parsed.email.trim() : undefined,
      phone:
        typeof parsed.phone === 'string' && parsed.phone.trim() ? parsed.phone.trim() : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Resolves a real buyer email & profile across direct candidates, `customerJson`,
 * `checkout_sessions`, and `merchant_orders` fallbacks.
 */
export async function resolveCustomerEmailForOrder(
  db: AppDb,
  opts: {
    merchantId: string;
    externalRefId: string;
    paymentIntentId?: string | null;
    candidates?: Array<string | null | undefined>;
    customerJson?: string | null;
  }
): Promise<{ email: string | null; name?: string; phone?: string }> {
  const parsed = extractCustomerFromJson(opts.customerJson);
  const direct = extractRealCustomerEmail(...(opts.candidates ?? []), parsed.email);
  if (direct) {
    return { email: direct, name: parsed.name, phone: parsed.phone };
  }

  try {
    const sessionRows = opts.paymentIntentId
      ? await db
          .select({ customerEmail: checkoutSessions.customerEmail })
          .from(checkoutSessions)
          .where(
            and(
              eq(checkoutSessions.merchantId, opts.merchantId),
              eq(checkoutSessions.paymentIntentId, opts.paymentIntentId)
            )
          )
          .orderBy(desc(checkoutSessions.createdAt))
          .limit(5)
      : await db
          .select({ customerEmail: checkoutSessions.customerEmail })
          .from(checkoutSessions)
          .where(
            and(
              eq(checkoutSessions.merchantId, opts.merchantId),
              eq(checkoutSessions.externalOrderId, opts.externalRefId)
            )
          )
          .orderBy(desc(checkoutSessions.createdAt))
          .limit(5);

    const sessionEmail = extractRealCustomerEmail(...sessionRows.map((r) => r.customerEmail));
    if (sessionEmail) {
      return { email: sessionEmail, name: parsed.name, phone: parsed.phone };
    }

    const orderRows = await db
      .select({
        customerEmail: merchantOrders.customerEmail,
        customerName: merchantOrders.customerName,
        customerPhone: merchantOrders.customerPhone,
      })
      .from(merchantOrders)
      .where(
        and(
          eq(merchantOrders.merchantId, opts.merchantId),
          eq(merchantOrders.externalOrderId, opts.externalRefId)
        )
      )
      .limit(1);

    const orderEmail = extractRealCustomerEmail(orderRows[0]?.customerEmail);
    return {
      email: orderEmail,
      name: parsed.name || orderRows[0]?.customerName || undefined,
      phone: parsed.phone || orderRows[0]?.customerPhone || undefined,
    };
  } catch {
    return { email: null, name: parsed.name, phone: parsed.phone };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBdt(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `৳${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatProviderLabel(provider?: string | null): string {
  switch ((provider || '').toUpperCase()) {
    case 'BKASH':
      return 'bKash';
    case 'NAGAD':
      return 'Nagad';
    case 'ROCKET':
      return 'Rocket';
    case 'UPAY':
      return 'Upay';
    case 'CELLFIN':
      return 'CellFin';
    default:
      return provider ? provider : 'MFS Transfer';
  }
}

function formatVerificationModeLabel(
  matchType?: string | null,
  resolutionSource?: string | null
): string {
  if (matchType === 'EXACT_UNIQUE') return 'Automated 6-Factor Match (Exact Poisha)';
  if (matchType === 'BASE_AMOUNT_FALLBACK') return 'Automated 6-Factor Match (Base Amount)';
  if (matchType === 'OVERPAID') return 'Automated Match (Overpaid)';
  if (resolutionSource === 'LATE_SMS_AUTO') return 'Late SMS Auto-Reconciliation';
  if (resolutionSource === 'ORBIT_ANDROID') return 'Merchant Companion Approval';
  if (resolutionSource === 'CLIENT_ADMIN') return 'Store Admin Approval';
  if (matchType === 'MANUAL_VERIFIED' || resolutionSource === 'ORBIT_DASHBOARD') {
    return 'Store Manual Verification';
  }
  return 'Verified Settlement';
}

function formatDisplayTimestamp(value?: Date | string | number | null): string {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safeDate.toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })} BST`;
}

function buildInvoiceNumber(externalRefId: string): string {
  const cleaned = externalRefId.replace(/[^A-Z0-9-]/gi, '').slice(0, 18).toUpperCase();
  return `INV-${cleaned || 'ORBIT'}`;
}

function buildSubmittedEmailContent(
  params: PaymentSubmittedEmailParams,
  recipientEmail: string
): { subject: string; html: string; text: string } {
  const storeName = params.storeName?.trim() || 'ORBIT Merchant';
  const statusLabel =
    params.status === 'MANUAL_REVIEW_REQUIRED' ? 'Under Store Review' : 'Awaiting SMS Match';
  const statusDetail =
    params.status === 'MANUAL_REVIEW_REQUIRED'
      ? 'Your payment proof has been logged and forwarded to the store team for manual confirmation.'
      : 'Your transfer details are queued and will be confirmed automatically as soon as the settlement SMS arrives.';
  const providerLabel = formatProviderLabel(params.provider);
  const amountFormatted = formatBdt(params.amount);
  const trxId = params.trxId?.trim() || '—';
  const senderNumber = params.senderNumber?.trim() || '—';
  const timestamp = formatDisplayTimestamp(params.submittedAt);
  const greetingName = params.customerName?.trim() || recipientEmail;

  const subject = `Payment Proof Received (${statusLabel}) · ${params.externalRefId} · ${storeName}`;

  const rows: Array<[string, string]> = [
    ['Store', storeName],
    ['Reference ID', params.externalRefId],
    ['Amount Submitted', amountFormatted],
    ['MFS Provider', providerLabel],
    ['Transaction ID (TrxID)', trxId],
    ['Sender Number', senderNumber],
    ['Submitted At', timestamp],
  ];

  const htmlRows = rows
    .map(
      ([label, value], idx) => `
      <tr>
        <td style="padding:11px 0;border-bottom:${idx === rows.length - 1 ? '0' : '1px solid #E4E4E7'};font-size:13px;line-height:18px;color:#71717A;font-weight:500;">${escapeHtml(label)}</td>
        <td align="right" style="padding:11px 0;border-bottom:${idx === rows.length - 1 ? '0' : '1px solid #E4E4E7'};font-size:13px;line-height:18px;color:#09090B;font-weight:600;font-variant-numeric:tabular-nums;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#09090B;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;background-color:#09090B;color:#FFFFFF;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#A1A1AA;font-weight:600;">ORBIT PAYMENT HUB</td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:#27272A;border:1px solid #3F3F46;color:#FAFAFA;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(statusLabel)}</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:14px 0 6px;font-size:22px;line-height:28px;font-weight:700;color:#FFFFFF;letter-spacing:-0.02em;">Payment Proof Received</h1>
              <p style="margin:0;font-size:14px;line-height:20px;color:#D4D4D8;">${escapeHtml(statusDetail)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 20px;font-size:14px;line-height:21px;color:#3F3F46;">Hi ${escapeHtml(greetingName)}, we have logged your ${escapeHtml(providerLabel)} payment submission for <strong style="color:#09090B;">${escapeHtml(storeName)}</strong>. You will receive your official invoice once confirmation completes.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFA;border:1px solid #E4E4E7;border-radius:10px;padding:6px 18px;">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${htmlRows}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:12px;line-height:18px;color:#71717A;">Need to update your Transaction ID or contact the store? Reply to ${escapeHtml(storeName)} with reference <strong style="color:#18181B;">${escapeHtml(params.externalRefId)}</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background-color:#FAFAFA;border-top:1px solid #E4E4E7;font-size:11px;line-height:16px;color:#71717A;">
              Powered by ORBIT Payment Hub · Automated MFS Settlement Ledger
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${storeName} via ORBIT Payment Hub`,
    `Payment Proof Received (${statusLabel})`,
    '',
    statusDetail,
    '',
    `Store: ${storeName}`,
    `Reference ID: ${params.externalRefId}`,
    `Amount Submitted: ${amountFormatted}`,
    `MFS Provider: ${providerLabel}`,
    `TrxID: ${trxId}`,
    `Sender Number: ${senderNumber}`,
    `Submitted At: ${timestamp}`,
    '',
    'You will receive your official paid invoice by email once verification completes.',
  ].join('\n');

  return { subject, html, text };
}

function buildVerifiedInvoiceContent(
  params: PaymentVerifiedInvoiceEmailParams,
  recipientEmail: string,
  invoiceNumber: string
): { subject: string; html: string; text: string } {
  const storeName = params.storeName?.trim() || 'ORBIT Merchant';
  const baseAmount = Number.isFinite(params.baseAmount) ? params.baseAmount : params.paidAmount;
  const paidAmount = Number.isFinite(params.paidAmount) ? params.paidAmount : baseAmount;
  const rawOffsetCents =
    typeof params.offsetCents === 'number'
      ? params.offsetCents
      : params.uniqueAmount != null
        ? Math.round((params.uniqueAmount - baseAmount) * 100)
        : Math.round((paidAmount - baseAmount) * 100);
  const actualDeltaCents = Math.round((paidAmount - baseAmount) * 100);
  const effectiveOffsetCents =
    actualDeltaCents > 0 && rawOffsetCents > 0
      ? Math.min(rawOffsetCents, actualDeltaCents)
      : actualDeltaCents > 0
        ? actualDeltaCents
        : 0;
  const adjustmentAmount = effectiveOffsetCents / 100;

  const providerLabel = formatProviderLabel(params.provider);
  const trxId = params.trxId?.trim() || '—';
  const senderNumber = params.senderNumber?.trim() || params.customerPhone?.trim() || '—';
  const verificationModeLabel = formatVerificationModeLabel(
    params.matchType,
    params.resolutionSource
  );
  const confirmedAt = formatDisplayTimestamp(params.verifiedAt);
  const billedToName = params.customerName?.trim() || recipientEmail;

  const subject = `Invoice ${invoiceNumber} (PAID) · ${formatBdt(paidAmount)} · ${storeName}`;

  const itemRows: Array<{ label: string; amount: string }> = [
    { label: `Order Payment (${params.externalRefId})`, amount: formatBdt(baseAmount) },
  ];
  if (effectiveOffsetCents > 0) {
    itemRows.push({
      label: 'Unique Verification Adjustment',
      amount: formatBdt(adjustmentAmount),
    });
  }
  itemRows.push({ label: 'Gateway Fee (0%)', amount: '৳0.00' });

  const itemRowsHtml = itemRows
    .map(
      (item) => `
      <tr>
        <td style="padding:11px 0;border-bottom:1px solid #E4E4E7;font-size:13px;line-height:19px;color:#27272A;">${escapeHtml(item.label)}</td>
        <td align="right" style="padding:11px 0;border-bottom:1px solid #E4E4E7;font-size:13px;line-height:19px;color:#09090B;font-weight:500;font-variant-numeric:tabular-nums;">${escapeHtml(item.amount)}</td>
      </tr>`
    )
    .join('');

  const settlementRows: Array<[string, string]> = [
    ['Provider', providerLabel],
    ['Transaction ID (TrxID)', trxId],
    ['Sender Number', senderNumber],
    ['Verification Mode', verificationModeLabel],
    ['Reference ID', params.externalRefId],
    ['Confirmed Timestamp', confirmedAt],
  ];

  const settlementRowsHtml = settlementRows
    .map(
      ([label, value], idx) => `
      <tr>
        <td style="padding:9px 0;border-bottom:${idx === settlementRows.length - 1 ? '0' : '1px solid #E4E4E7'};font-size:12px;line-height:18px;color:#71717A;">${escapeHtml(label)}</td>
        <td align="right" style="padding:9px 0;border-bottom:${idx === settlementRows.length - 1 ? '0' : '1px solid #E4E4E7'};font-size:12px;line-height:18px;color:#18181B;font-weight:600;font-variant-numeric:tabular-nums;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#09090B;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;background-color:#09090B;color:#FFFFFF;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#A1A1AA;font-weight:600;">OFFICIAL PAYMENT INVOICE</div>
                    <div style="margin-top:6px;font-size:20px;line-height:26px;font-weight:700;color:#FFFFFF;letter-spacing:-0.02em;">${escapeHtml(invoiceNumber)}</div>
                  </td>
                  <td align="right" valign="top">
                    <span style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:#FFFFFF;color:#09090B;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">PAID</span>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid #27272A;padding-top:16px;">
                <tr>
                  <td>
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#A1A1AA;">Total Settled</div>
                    <div style="margin-top:4px;font-size:28px;line-height:34px;font-weight:700;color:#FFFFFF;font-variant-numeric:tabular-nums;">${escapeHtml(formatBdt(paidAmount))}</div>
                  </td>
                  <td align="right" valign="bottom" style="font-size:12px;line-height:18px;color:#D4D4D8;">
                    ${escapeHtml(confirmedAt)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td width="50%" valign="top" style="padding-right:12px;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#71717A;font-weight:600;">Merchant</div>
                    <div style="margin-top:5px;font-size:14px;line-height:20px;color:#09090B;font-weight:600;">${escapeHtml(storeName)}</div>
                    <div style="font-size:12px;line-height:18px;color:#71717A;">Merchant ID: ${escapeHtml(params.merchantId)}</div>
                  </td>
                  <td width="50%" valign="top" style="padding-left:12px;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#71717A;font-weight:600;">Billed To</div>
                    <div style="margin-top:5px;font-size:14px;line-height:20px;color:#09090B;font-weight:600;">${escapeHtml(billedToName)}</div>
                    <div style="font-size:12px;line-height:18px;color:#71717A;">${escapeHtml(recipientEmail)}</div>
                  </td>
                </tr>
              </table>

              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#71717A;font-weight:600;margin-bottom:6px;">Itemized Breakdown</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #E4E4E7;">
                ${itemRowsHtml}
                <tr>
                  <td style="padding:14px 0 4px;font-size:14px;line-height:20px;color:#09090B;font-weight:700;">Total Paid</td>
                  <td align="right" style="padding:14px 0 4px;font-size:15px;line-height:20px;color:#09090B;font-weight:700;font-variant-numeric:tabular-nums;">${escapeHtml(formatBdt(paidAmount))}</td>
                </tr>
              </table>

              <div style="margin-top:24px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#71717A;font-weight:600;margin-bottom:8px;">Settlement Details</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFA;border:1px solid #E4E4E7;border-radius:10px;padding:6px 18px;">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${settlementRowsHtml}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background-color:#FAFAFA;border-top:1px solid #E4E4E7;font-size:11px;line-height:17px;color:#71717A;">
              This is an automated payment receipt &amp; invoice issued via ORBIT Payment Hub on behalf of ${escapeHtml(storeName)}. Keep this email for your records.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    `${storeName} via ORBIT Payment Hub`,
    `OFFICIAL INVOICE: ${invoiceNumber} [PAID]`,
    '',
    `Merchant: ${storeName} (${params.merchantId})`,
    `Billed To: ${billedToName} <${recipientEmail}>`,
    '',
    'Itemized Breakdown:',
    `- Base Amount (${params.externalRefId}): ${formatBdt(baseAmount)}`,
    ...(effectiveOffsetCents > 0
      ? [`- Unique Verification Adjustment: ${formatBdt(adjustmentAmount)}`]
      : []),
    '- Gateway Fee: ৳0.00 (0%)',
    `Total Paid: ${formatBdt(paidAmount)}`,
    '',
    'Settlement Details:',
    `- Provider: ${providerLabel}`,
    `- TrxID: ${trxId}`,
    `- Sender: ${senderNumber}`,
    `- Verification Mode: ${verificationModeLabel}`,
    `- Reference ID: ${params.externalRefId}`,
    `- Confirmed At: ${confirmedAt}`,
  ];

  return { subject, html, text: textLines.join('\n') };
}

/**
 * Sends a non-blocking OrbitMail acknowledgment when a buyer submits payment proof
 * into PENDING_VERIFICATION or MANUAL_REVIEW_REQUIRED. Never throws.
 */
export async function notifyPaymentSubmittedEmail(
  db: AppDb,
  env: Env | undefined,
  params: PaymentSubmittedEmailParams
): Promise<PaymentEmailResult> {
  try {
    const email = extractRealCustomerEmail(params.customerEmail);
    if (!email || !env) {
      return { sent: false };
    }

    const { subject, html, text } = buildSubmittedEmailContent(params, email);
    const dispatch = await routeEmail(
      env,
      {
        to: email,
        subject,
        html,
        text,
        fromName: params.storeName?.trim()
          ? `${params.storeName.trim()} via ORBIT`
          : 'ORBIT Payment Hub',
        preferredProvider: 'orbitmail',
      },
      {
        db,
        callerId: `payment-submit:${params.merchantId}:${params.externalRefId}`,
      }
    );

    return {
      sent: dispatch.success,
      providerUsed: dispatch.providerUsed,
      error: dispatch.error,
    };
  } catch (err) {
    console.warn('[OrbitMail Submitted Email Error]:', err);
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Failed to send submission email',
    };
  }
}

/**
 * Sends an idempotent OrbitMail HTML invoice once a payment transitions to VERIFIED.
 * Guarded by `routerKvStore` key `orbit_invoice_sent:{merchantId}:{externalRefId}` (90-day TTL).
 * Never throws.
 */
export async function notifyPaymentVerifiedInvoiceEmail(
  db: AppDb,
  env: Env | undefined,
  params: PaymentVerifiedInvoiceEmailParams
): Promise<PaymentEmailResult> {
  try {
    const email = extractRealCustomerEmail(params.customerEmail);
    if (!email || !env) {
      return { sent: false };
    }

    const idempotencyKey = `orbit_invoice_sent:${params.merchantId}:${params.externalRefId}`;
    const existingRows = await db
      .select()
      .from(routerKvStore)
      .where(eq(routerKvStore.key, idempotencyKey))
      .limit(1);

    const existing = existingRows[0];
    if (existing && (!existing.expiresAt || existing.expiresAt.getTime() > Date.now())) {
      return { sent: false, skippedDuplicate: true };
    }

    const invoiceNumber = buildInvoiceNumber(params.externalRefId);
    const { subject, html, text } = buildVerifiedInvoiceContent(params, email, invoiceNumber);

    const dispatch = await routeEmail(
      env,
      {
        to: email,
        subject,
        html,
        text,
        fromName: params.storeName?.trim()
          ? `${params.storeName.trim()} via ORBIT`
          : 'ORBIT Payment Hub',
        preferredProvider: 'orbitmail',
      },
      {
        db,
        callerId: `payment-invoice:${params.merchantId}:${params.externalRefId}`,
      }
    );

    if (dispatch.success) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + INVOICE_IDEMPOTENCY_TTL_MS);
      const valueJson = JSON.stringify({
        sentAt: now.toISOString(),
        email,
        invoiceNumber,
      });

      await db
        .insert(routerKvStore)
        .values({
          key: idempotencyKey,
          valueJson,
          expiresAt,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: routerKvStore.key,
          set: {
            valueJson,
            expiresAt,
            updatedAt: now,
          },
        });
    }

    return {
      sent: dispatch.success,
      invoiceNumber,
      providerUsed: dispatch.providerUsed,
      error: dispatch.error,
    };
  } catch (err) {
    console.warn('[OrbitMail Invoice Email Error]:', err);
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Failed to send invoice email',
    };
  }
}
