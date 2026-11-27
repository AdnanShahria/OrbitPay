import type { MfsProvider } from '../../db/schema';

export interface ParsedMfsResult {
  provider: MfsProvider;
  trxId: string;
  amount: number;
  senderNumber: string;
}

const AMOUNT = '([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';
const CURRENCY = '(?:Tk\\.?|BDT)';
const BKASH_CURRENCY = 'Tk\\.?';
const PHONE_CAPTURE = '((?:\\+?88)?01[3-9]\\d{8})';
const ROCKET_PHONE_CAPTURE = '((?:\\+?88)?01[3-9]\\d{8}[A-Za-z0-9]?)';
const TRX_ID = '(?:TrxID|TxnID|TxnId):?\\s*([A-Za-z0-9]+)';
const BKASH_TRX_ID = 'TrxID:?\\s*([A-Za-z0-9]+)';

export const PROVIDER_PARSERS = {
  // 1. bKash (Personal Send Money, PRA Payment, Cash In, Fallback)
  BKASH_PERSONAL: new RegExp(
    `You have received\\s+(?:payment\\s+)?${BKASH_CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${BKASH_TRX_ID}`,
    'i'
  ),
  BKASH_PRA: new RegExp(
    `Payment received\\s+${BKASH_CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${BKASH_TRX_ID}`,
    'i'
  ),
  BKASH_CASH_IN: new RegExp(
    `Cash\\s+In\\s+${BKASH_CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${BKASH_TRX_ID}`,
    'i'
  ),
  BKASH_FALLBACK: new RegExp(
    `(?:received|Payment)\\s+(?:${BKASH_CURRENCY}\\s*)?${AMOUNT}\\.?\\s+from\\s+${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${BKASH_TRX_ID}`,
    'i'
  ),

  // 2. Nagad (Standard, Key-Value Multiline, Alt)
  NAGAD_STANDARD: new RegExp(
    `(?:received|credited)\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
  NAGAD_KV: new RegExp(
    `Amount:\\s*(?:${CURRENCY}\\s*)?${AMOUNT}\\.?[\\s\\S]*?Sender:\\s*${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
  NAGAD_ALT: new RegExp(
    `${CURRENCY}\\s*${AMOUNT}\\.?[\\s\\S]*?from\\s+${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),

  // 3. DBBL Rocket (16216 A/C format with check char, legacy 12-digit format, merchant)
  ROCKET_AC: new RegExp(
    `${CURRENCY}\\s*${AMOUNT}\\.?\\s+received\\s+from\\s+(?:A\\/C:?\\s*)?${ROCKET_PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
  ROCKET_STANDARD: new RegExp(
    `(?:You have received|Payment(?:\\s+received)?|received)\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+(?:A\\/C:?\\s*)?${ROCKET_PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),

  // 4. Upay (UCB MFS)
  UPAY_STANDARD: new RegExp(
    `(?:You have received|Received)\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),

  // 5. Cellfin (Islami Bank Bangladesh PLC)
  CELLFIN_STANDARD: new RegExp(
    `(?:You have received|received|credited)\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+${PHONE_CAPTURE}(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
};

// Reject outgoing transfers and OTP verification messages (aligned with MfsParser.kt)
const REJECT_PATTERNS = [
  /\b(?:verification code|otp|one[- ]time password|security code|pin reset|login code|pin is|do not share this code)\b/i,
  /\b(?:you have sent|send money|cash out|mobile recharge|pay bill|bill pay)\b/i,
  /\bpaid\s+(?:Tk\.?|BDT)/i,
  /\bpayment\s+(?:of\s+)?(?:Tk\.?|BDT)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s+to\b/i,
  /^\s*(?:payment of|sent\s+(?:tk\.?|bdt)|transferred\s+(?:tk\.?|bdt))/i,
];

export function parseAmount(amountStr: string): number {
  return parseFloat(amountStr.replace(/,/g, '').trim());
}

/**
 * Normalizes Bangladeshi mobile numbers identically to Android MfsParser.sanitizePhoneNumber:
 * - Strips trailing check letters (e.g. Rocket A/C:01912345678X -> 01912345678).
 * - Strips +880 / 880 / +88 / 88 international dial code.
 * - Prepends leading 0 for 10-digit numbers.
 * - For ROCKET, normalizes 12-digit check-digit numbers to 11 digits.
 */
export function sanitizePhoneNumber(rawNumber: string, provider?: MfsProvider | null): string {
  const withoutTrailingLetters = rawNumber.trim().replace(/[A-Za-z]+$/, '');
  let cleaned = withoutTrailingLetters.replace(/[^0-9+]/g, '');

  if (cleaned.startsWith('+880')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('880')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('+88')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('88')) {
    cleaned = cleaned.slice(2);
  }

  cleaned = cleaned.replace(/\+/g, '');

  if (!cleaned.startsWith('0') && cleaned.length >= 10 && cleaned.length <= 11) {
    cleaned = `0${cleaned}`;
  }

  if (provider === 'ROCKET' && cleaned.length === 12 && cleaned.startsWith('01')) {
    cleaned = cleaned.slice(0, 11);
  }

  return cleaned;
}

function resolveProviderFromShortcode(senderShortcode?: string): MfsProvider | null {
  const sc = (senderShortcode || '').trim().toLowerCase();
  if (!sc) return null;
  if (sc === 'bkash' || sc === '16247' || sc.includes('bkash')) return 'BKASH';
  if (sc === 'nagad' || sc === '16167' || sc.includes('nagad')) return 'NAGAD';
  if (sc === 'rocket' || sc === '16216' || sc.includes('rocket') || sc.includes('dbbl')) return 'ROCKET';
  if (sc === 'upay' || sc === '16268' || sc.includes('upay')) return 'UPAY';
  if (sc === 'cellfin' || sc === 'ibbl' || sc === '16259' || sc.includes('cellfin')) return 'CELLFIN';
  return null;
}

function buildResult(provider: MfsProvider, match: RegExpMatchArray): ParsedMfsResult | null {
  const amount = parseAmount(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const senderNumber = sanitizePhoneNumber(match[2], provider);
  if (!/^01[3-9]\d{8}$/.test(senderNumber)) {
    return null;
  }
  const trxId = match[3].trim().toUpperCase();
  if (trxId.length < 5) return null;

  return {
    provider,
    amount,
    senderNumber,
    trxId,
  };
}

export function parseMfsSms(rawText: string, senderShortcode?: string): ParsedMfsResult | null {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const cleanText = rawText.trim();
  if (!cleanText) return null;

  for (const rejectPattern of REJECT_PATTERNS) {
    if (rejectPattern.test(cleanText)) {
      return null;
    }
  }

  const knownProvider = resolveProviderFromShortcode(senderShortcode);

  // If a known provider shortcode was explicitly supplied, enforce provider consistency
  if (knownProvider === 'BKASH') {
    const m =
      cleanText.match(PROVIDER_PARSERS.BKASH_PERSONAL) ||
      cleanText.match(PROVIDER_PARSERS.BKASH_PRA) ||
      cleanText.match(PROVIDER_PARSERS.BKASH_CASH_IN) ||
      cleanText.match(PROVIDER_PARSERS.BKASH_FALLBACK);
    return m ? buildResult('BKASH', m) : null;
  }
  if (knownProvider === 'NAGAD') {
    const m =
      cleanText.match(PROVIDER_PARSERS.NAGAD_STANDARD) ||
      cleanText.match(PROVIDER_PARSERS.NAGAD_KV) ||
      cleanText.match(PROVIDER_PARSERS.NAGAD_ALT);
    return m ? buildResult('NAGAD', m) : null;
  }
  if (knownProvider === 'ROCKET') {
    const m =
      cleanText.match(PROVIDER_PARSERS.ROCKET_AC) ||
      cleanText.match(PROVIDER_PARSERS.ROCKET_STANDARD);
    return m ? buildResult('ROCKET', m) : null;
  }
  if (knownProvider === 'UPAY') {
    const m = cleanText.match(PROVIDER_PARSERS.UPAY_STANDARD);
    return m ? buildResult('UPAY', m) : null;
  }
  if (knownProvider === 'CELLFIN') {
    const m = cleanText.match(PROVIDER_PARSERS.CELLFIN_STANDARD);
    return m ? buildResult('CELLFIN', m) : null;
  }

  // Un-gated scan across all provider formats
  const orderedParsers: Array<[MfsProvider, RegExp]> = [
    ['BKASH', PROVIDER_PARSERS.BKASH_PERSONAL],
    ['BKASH', PROVIDER_PARSERS.BKASH_PRA],
    ['BKASH', PROVIDER_PARSERS.BKASH_CASH_IN],
    ['NAGAD', PROVIDER_PARSERS.NAGAD_KV],
    ['NAGAD', PROVIDER_PARSERS.NAGAD_STANDARD],
    ['ROCKET', PROVIDER_PARSERS.ROCKET_AC],
    ['ROCKET', PROVIDER_PARSERS.ROCKET_STANDARD],
    ['UPAY', PROVIDER_PARSERS.UPAY_STANDARD],
    ['CELLFIN', PROVIDER_PARSERS.CELLFIN_STANDARD],
    ['BKASH', PROVIDER_PARSERS.BKASH_FALLBACK],
    ['NAGAD', PROVIDER_PARSERS.NAGAD_ALT],
  ];

  for (const [provider, regex] of orderedParsers) {
    const match = cleanText.match(regex);
    if (match) {
      const result = buildResult(provider, match);
      if (result) return result;
    }
  }

  return null;
}
