import type { MfsProvider } from '../../db/schema';

export interface ParsedMfsResult {
  provider: MfsProvider;
  trxId: string;
  amount: number;
  senderNumber: string;
}

const AMOUNT = '([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';
const CURRENCY = '(?:Tk\\.?|BDT)';
const TRX_ID = '(?:TrxID|TxnID):?\\s*([A-Za-z0-9]+)';

export const PROVIDER_PARSERS = {
  // 1. bKash (Personal Send Money, PRA Payment, Cash In)
  BKASH_RECEIVED: new RegExp(
    `(?:You have received(?:\\s+payment)?|Payment received)\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+(01[3-9]\\d{8})(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
  BKASH_CASH_IN: new RegExp(
    `Cash\\s+In\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+(01[3-9]\\d{8})(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),

  // 2. Nagad (Standard & Key-Value Multiline)
  NAGAD_STANDARD: new RegExp(
    `received\\s+BDT\\s*${AMOUNT}\\.?\\s+from\\s+(01[3-9]\\d{8})(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
  NAGAD_KV: new RegExp(
    `Amount:\\s*${CURRENCY}\\s*${AMOUNT}\\.?[\\s\\S]*?Sender:\\s*(01[3-9]\\d{8})(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),

  // 3. DBBL Rocket (16216 A/C format with check char, legacy 12-digit format, merchant)
  ROCKET_AC: new RegExp(
    `${CURRENCY}\\s*${AMOUNT}\\.?\\s+received\\s+from\\s+A\\/C[:\\s]+(01[3-9]\\d{8})[A-Za-z0-9]?[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
  ROCKET_RECEIVED_AC: new RegExp(
    `received\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+A\\/C[:\\s]+(01[3-9]\\d{8})[A-Za-z0-9]?[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
  ROCKET_LEGACY_12DIGIT: new RegExp(
    `received\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+(01[3-9]\\d{8})[A-Za-z0-9](?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
  ROCKET_STANDARD: new RegExp(
    `(?:You have received|Payment)\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+(?:A\\/C[:\\s]+)?(01[3-9]\\d{8})[A-Za-z0-9]?[\\s\\S]*?${TRX_ID}`,
    'i'
  ),

  // 4. Upay (UCB MFS)
  UPAY_STANDARD: new RegExp(
    `You have received\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+(01[3-9]\\d{8})(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),

  // 5. Cellfin (Islami Bank Bangladesh PLC)
  CELLFIN_STANDARD: new RegExp(
    `(?:received|credited)\\s+${CURRENCY}\\s*${AMOUNT}\\.?\\s+from\\s+(01[3-9]\\d{8})(?!\\d)[\\s\\S]*?${TRX_ID}`,
    'i'
  ),
};

// Reject outgoing transfers and OTP verification messages
const REJECT_PATTERNS = [
  /^\s*(?:send\s+money|cash\s+out|mobile\s+recharge|bill\s+pay|payment\s+of|you\s+have\s+sent|sent\s+(?:tk\.?|bdt)|transferred\s+(?:tk\.?|bdt))/i,
  /\b(?:send\s+money|cash\s+out)\s+(?:tk\.?|bdt)\s*[0-9]/i,
  /\b(?:verification\s+code|one[- ]time\s+password|otp\s+is|pin\s+is|do\s+not\s+share\s+this\s+code)\b/i,
];

export function parseAmount(amountStr: string): number {
  return parseFloat(amountStr.replace(/,/g, '').trim());
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
  const rawSender = match[2].trim();
  const senderNumber = provider === 'ROCKET' ? rawSender.slice(0, 11) : rawSender;
  const trxId = match[3].trim().toUpperCase();
  if (!trxId) return null;

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

  for (const rejectPattern of REJECT_PATTERNS) {
    if (rejectPattern.test(rawText)) {
      return null;
    }
  }

  const knownProvider = resolveProviderFromShortcode(senderShortcode);

  // If a known provider shortcode was explicitly supplied, enforce provider consistency
  if (knownProvider === 'BKASH') {
    const m = rawText.match(PROVIDER_PARSERS.BKASH_RECEIVED) || rawText.match(PROVIDER_PARSERS.BKASH_CASH_IN);
    return m ? buildResult('BKASH', m) : null;
  }
  if (knownProvider === 'NAGAD') {
    const m = rawText.match(PROVIDER_PARSERS.NAGAD_KV) || rawText.match(PROVIDER_PARSERS.NAGAD_STANDARD);
    return m ? buildResult('NAGAD', m) : null;
  }
  if (knownProvider === 'ROCKET') {
    const m =
      rawText.match(PROVIDER_PARSERS.ROCKET_AC) ||
      rawText.match(PROVIDER_PARSERS.ROCKET_RECEIVED_AC) ||
      rawText.match(PROVIDER_PARSERS.ROCKET_LEGACY_12DIGIT) ||
      rawText.match(PROVIDER_PARSERS.ROCKET_STANDARD);
    return m ? buildResult('ROCKET', m) : null;
  }
  if (knownProvider === 'UPAY') {
    const m = rawText.match(PROVIDER_PARSERS.UPAY_STANDARD);
    return m ? buildResult('UPAY', m) : null;
  }
  if (knownProvider === 'CELLFIN') {
    const m = rawText.match(PROVIDER_PARSERS.CELLFIN_STANDARD);
    return m ? buildResult('CELLFIN', m) : null;
  }

  // Un-gated scan across all provider formats (used by server re-parse and SIMULATOR)
  const orderedParsers: Array<[MfsProvider, RegExp]> = [
    ['BKASH', PROVIDER_PARSERS.BKASH_CASH_IN],
    ['NAGAD', PROVIDER_PARSERS.NAGAD_KV],
    ['NAGAD', PROVIDER_PARSERS.NAGAD_STANDARD],
    ['ROCKET', PROVIDER_PARSERS.ROCKET_AC],
    ['ROCKET', PROVIDER_PARSERS.ROCKET_RECEIVED_AC],
    ['ROCKET', PROVIDER_PARSERS.ROCKET_LEGACY_12DIGIT],
    ['BKASH', PROVIDER_PARSERS.BKASH_RECEIVED],
    ['UPAY', PROVIDER_PARSERS.UPAY_STANDARD],
    ['CELLFIN', PROVIDER_PARSERS.CELLFIN_STANDARD],
    ['ROCKET', PROVIDER_PARSERS.ROCKET_STANDARD],
  ];

  for (const [provider, regex] of orderedParsers) {
    const match = rawText.match(regex);
    if (match) {
      const result = buildResult(provider, match);
      if (result) return result;
    }
  }

  return null;
}
