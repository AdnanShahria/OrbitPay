import type { MfsProvider } from '../../db/schema';

export interface ParsedMfsResult {
  provider: MfsProvider;
  trxId: string;
  amount: number;
  senderNumber: string;
}

export const PROVIDER_PARSERS = {
  // 1. bKash Personal (Send Money)
  // "You have received Tk 500.00 from 01711111111. Ref . Fee Tk 0.00. Balance Tk 1,250.00. TrxID 9GB7XQ21 at 18/11/2026 14:30"
  BKASH_PERSONAL: /You have received Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TrxID\s+([A-Za-z0-9]+)/i,

  // 2. bKash Personal Retail (PRA Payment)
  // "Payment received Tk 500.00 from 01711111111. TrxID 9GB7XQ21 at 18/11/2026 14:30. Balance Tk 5,200.00."
  BKASH_PRA: /Payment received Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TrxID\s+([A-Za-z0-9]+)/i,

  // 3. Nagad Personal & Merchant
  // "You have received BDT 500.00 from 01811111111. Fee: BDT 0.00. Balance: BDT 2,100.00. TxnID: 7XYZABC9 18/11/2026 14:35"
  NAGAD_STANDARD: /received BDT\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TxnID:\s*([A-Za-z0-9]+)/i,
  NAGAD_ALT: /Amount:\s*Tk\s*([0-9,.]+).*?Sender:\s*(01[3-9]\d{8}).*?TxnID:\s*([A-Za-z0-9]+)/i,

  // 4. DBBL Rocket (Supports 12-digit format with check digit)
  // "You have received Tk 500.00 from 019111111112. Fee Tk 0.00. Balance Tk 3,443.15. TrxID ADB3DB1GHF at 18/11/2026 19:17"
  ROCKET_STANDARD: /You have received Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8,9}).*?TrxID\s+([A-Za-z0-9]+)/i,
  ROCKET_MERCHANT: /Payment Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8,9}).*?TrxID:\s*([A-Za-z0-9]+)/i,

  // 5. Upay (UCB MFS)
  // "You have received Tk 500.00 from 01611111111. Fee Tk 0.00. Balance Tk 1,500.00. TrxID UP87912ABC at 18/11/2026 15:10"
  UPAY_STANDARD: /You have received Tk\s+([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TrxID\s+([A-Za-z0-9]+)/i,

  // 6. Cellfin (Islami Bank Bangladesh PLC)
  // "You have received Tk 1,200.00 from 01712345678. Balance Tk 4,500.00. TrxID CF9812481"
  CELLFIN_STANDARD: /(?:received|credited)\s+Tk\s*([0-9,.]+)\s+from\s+(01[3-9]\d{8}).*?TrxID\s+([A-Za-z0-9]+)/i,
};

export function parseAmount(amountStr: string): number {
  return parseFloat(amountStr.replace(/,/g, '').trim());
}

export function parseMfsSms(rawText: string, senderShortcode?: string): ParsedMfsResult | null {
  const shortcode = (senderShortcode || '').trim().toLowerCase();

  // Try bKash
  if (!shortcode || shortcode.includes('16247') || shortcode.includes('bkash')) {
    const match = rawText.match(PROVIDER_PARSERS.BKASH_PERSONAL) || rawText.match(PROVIDER_PARSERS.BKASH_PRA);
    if (match) {
      return {
        provider: 'BKASH',
        amount: parseAmount(match[1]),
        senderNumber: match[2].trim(),
        trxId: match[3].trim().toUpperCase(),
      };
    }
  }

  // Try Nagad
  if (!shortcode || shortcode.includes('16167') || shortcode.includes('nagad')) {
    const match = rawText.match(PROVIDER_PARSERS.NAGAD_STANDARD) || rawText.match(PROVIDER_PARSERS.NAGAD_ALT);
    if (match) {
      return {
        provider: 'NAGAD',
        amount: parseAmount(match[1]),
        senderNumber: match[2].trim(),
        trxId: match[3].trim().toUpperCase(),
      };
    }
  }

  // Try Rocket
  if (!shortcode || shortcode.includes('16216') || shortcode.includes('dbbl') || shortcode.includes('rocket')) {
    const match = rawText.match(PROVIDER_PARSERS.ROCKET_STANDARD) || rawText.match(PROVIDER_PARSERS.ROCKET_MERCHANT);
    if (match) {
      return {
        provider: 'ROCKET',
        amount: parseAmount(match[1]),
        senderNumber: match[2].trim(),
        trxId: match[3].trim().toUpperCase(),
      };
    }
  }

  // Try Upay
  if (!shortcode || shortcode.includes('16268') || shortcode.includes('upay')) {
    const match = rawText.match(PROVIDER_PARSERS.UPAY_STANDARD);
    if (match) {
      return {
        provider: 'UPAY',
        amount: parseAmount(match[1]),
        senderNumber: match[2].trim(),
        trxId: match[3].trim().toUpperCase(),
      };
    }
  }

  // Try Cellfin
  if (!shortcode || shortcode.includes('16259') || shortcode.includes('cellfin') || shortcode.includes('ibbl')) {
    const match = rawText.match(PROVIDER_PARSERS.CELLFIN_STANDARD);
    if (match) {
      return {
        provider: 'CELLFIN',
        amount: parseAmount(match[1]),
        senderNumber: match[2].trim(),
        trxId: match[3].trim().toUpperCase(),
      };
    }
  }

  // Fallback scan across all regexes if sender shortcode was generic
  for (const [key, regex] of Object.entries(PROVIDER_PARSERS)) {
    const match = rawText.match(regex);
    if (match) {
      let provider: MfsProvider = 'BKASH';
      if (key.startsWith('NAGAD')) provider = 'NAGAD';
      else if (key.startsWith('ROCKET')) provider = 'ROCKET';
      else if (key.startsWith('UPAY')) provider = 'UPAY';
      else if (key.startsWith('CELLFIN')) provider = 'CELLFIN';

      return {
        provider,
        amount: parseAmount(match[1]),
        senderNumber: match[2].trim(),
        trxId: match[3].trim().toUpperCase(),
      };
    }
  }

  return null;
}
