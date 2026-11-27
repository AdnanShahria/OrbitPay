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
  const isWhole = Math.abs(safe - Math.round(safe)) < 0.005;
  return `৳${safe.toLocaleString('en-US', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  })}`;
}

function formatTkCompact(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isWhole = Math.abs(safe - Math.round(safe)) < 0.005;
  return isWhole ? `${Math.round(safe)}tk` : `${safe.toFixed(2)}tk`;
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
      return provider ? provider : 'Mobile Wallet';
  }
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

function buildInvoiceNumber(params: {
  storeName?: string | null;
  customerName?: string | null;
  amount: number;
  statusText: string;
}): string {
  const name = params.storeName?.trim() || params.customerName?.trim() || 'ORBIT';
  const amountPart = formatTkCompact(params.amount);
  return `${name}||${amountPart}||${params.statusText}`;
}

function renderMinimalReceiptEmail(params: {
  storeName: string;
  invoiceId: string;
  statusBadge: string;
  isVerified: boolean;
  amountFormatted: string;
  timestamp: string;
  subtitle: string;
  rows: Array<[string, string]>;
  subject: string;
}): { subject: string; html: string; text: string } {
  const {
    storeName,
    invoiceId,
    statusBadge,
    isVerified,
    amountFormatted,
    timestamp,
    subtitle,
    rows,
    subject,
  } = params;

  const badgeBg = isVerified ? '#FFFFFF' : '#27272A';
  const badgeColor = isVerified ? '#09090B' : '#FAFAFA';
  const badgeBorder = isVerified ? 'none' : '1px solid #3F3F46';

  const htmlRows = rows
    .map(
      ([label, value], idx) => `
      <tr>
        <td style="padding:10px 0;border-bottom:${idx === rows.length - 1 ? '0' : '1px solid #E4E4E7'};font-size:13px;line-height:18px;color:#71717A;">${escapeHtml(label)}</td>
        <td align="right" style="padding:10px 0;border-bottom:${idx === rows.length - 1 ? '0' : '1px solid #E4E4E7'};font-size:13px;line-height:18px;color:#09090B;font-weight:600;font-variant-numeric:tabular-nums;">${escapeHtml(value)}</td>
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
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background-color:#09090B;color:#FFFFFF;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:15px;font-weight:600;color:#FFFFFF;">${escapeHtml(storeName)}</td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:${badgeBg};border:${badgeBorder};color:${badgeColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(statusBadge)}</span>
                  </td>
                </tr>
              </table>
              <div style="margin-top:16px;font-size:28px;line-height:34px;font-weight:700;color:#FFFFFF;font-variant-numeric:tabular-nums;">${escapeHtml(amountFormatted)}</div>
              <div style="margin-top:6px;font-size:12px;color:#A1A1AA;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(invoiceId)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 18px;font-size:13.5px;line-height:20px;color:#52525B;">${escapeHtml(subtitle)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFA;border:1px solid #E4E4E7;border-radius:10px;padding:4px 16px;">
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${htmlRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px;background-color:#FAFAFA;border-top:1px solid #E4E4E7;font-size:11px;line-height:16px;color:#71717A;">
              ${escapeHtml(storeName)} · ${escapeHtml(timestamp)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    invoiceId,
    '',
    subtitle,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    `Time: ${timestamp}`,
  ].join('\n');

  return { subject, html, text };
}

function buildSubmittedEmailContent(
  params: PaymentSubmittedEmailParams,
  _recipientEmail: string
): { subject: string; html: string; text: string } {
  const storeName = params.storeName?.trim() || 'ORBIT Pay';
  const statusText =
    params.status === 'MANUAL_REVIEW_REQUIRED' ? 'under review' : 'pending verification';
  const statusBadge =
    params.status === 'MANUAL_REVIEW_REQUIRED' ? 'Under Review' : 'Pending Verification';
  const subtitle =
    params.status === 'MANUAL_REVIEW_REQUIRED'
      ? 'Your payment has been received and is currently under review.'
      : 'Your payment details have been submitted and are being verified.';

  const invoiceId = buildInvoiceNumber({
    storeName,
    customerName: params.customerName,
    amount: params.amount,
    statusText,
  });

  const rows: Array<[string, string]> = [
    ...(params.customerName?.trim() ? [['Name', params.customerName.trim()] as [string, string]] : []),
    ['Amount', formatBdt(params.amount)],
    ['Method', formatProviderLabel(params.provider)],
    ['Transaction ID', params.trxId?.trim() || '—'],
    ['Mobile Number', params.senderNumber?.trim() || '—'],
    ['Status', statusBadge],
  ];

  return renderMinimalReceiptEmail({
    storeName,
    invoiceId,
    statusBadge,
    isVerified: false,
    amountFormatted: formatBdt(params.amount),
    timestamp: formatDisplayTimestamp(params.submittedAt),
    subtitle,
    rows,
    subject: invoiceId,
  });
}

function buildVerifiedInvoiceContent(
  params: PaymentVerifiedInvoiceEmailParams,
  _recipientEmail: string,
  invoiceId: string
): { subject: string; html: string; text: string } {
  const storeName = params.storeName?.trim() || 'ORBIT Pay';
  const paidAmount = Number.isFinite(params.paidAmount) ? params.paidAmount : params.baseAmount;
  const senderNumber = params.senderNumber?.trim() || params.customerPhone?.trim() || '—';

  const rows: Array<[string, string]> = [
    ...(params.customerName?.trim() ? [['Name', params.customerName.trim()] as [string, string]] : []),
    ['Amount Paid', formatBdt(paidAmount)],
    ['Method', formatProviderLabel(params.provider)],
    ['Transaction ID', params.trxId?.trim() || '—'],
    ['Mobile Number', senderNumber],
    ['Status', 'Verified'],
  ];

  return renderMinimalReceiptEmail({
    storeName,
    invoiceId,
    statusBadge: 'Verified',
    isVerified: true,
    amountFormatted: formatBdt(paidAmount),
    timestamp: formatDisplayTimestamp(params.verifiedAt),
    subtitle: `Thank you! Your payment to ${storeName} has been verified.`,
    rows,
    subject: invoiceId,
  });
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

    const paidAmount = Number.isFinite(params.paidAmount) ? params.paidAmount : params.baseAmount;
    const invoiceNumber = buildInvoiceNumber({
      storeName: params.storeName,
      customerName: params.customerName,
      amount: paidAmount,
      statusText: 'verified',
    });
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
