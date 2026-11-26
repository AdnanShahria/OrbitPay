import type { MfsProvider, SmsSource } from '../db/schema';
import { parseMfsSms } from './parsers/mfs';

export type TrustFlag = 'LEGACY_UNVERIFIED_SENDER' | 'UNTRUSTED_SENDER' | 'PARSE_MISMATCH';

export const TRUSTED_SMS_SENDERS: Record<MfsProvider, readonly string[]> = {
  BKASH: ['bkash'],
  NAGAD: ['nagad'],
  ROCKET: ['16216', 'rocket'],
  UPAY: ['upay'],
  CELLFIN: ['cellfin', 'ibbl'],
};

export const TRUSTED_NOTIFICATION_PACKAGES: Record<MfsProvider, readonly string[]> = {
  BKASH: ['com.bkash.customerapp', 'com.bkash.merchantapp'],
  NAGAD: ['com.konasl.nagad', 'com.konasl.nagad.merchant'],
  ROCKET: ['com.dbbl.mbb.rocket'],
  UPAY: ['bd.com.upay.customer'],
  CELLFIN: ['com.ibbl.cellfin'],
};

const PERSONAL_PHONE_REGEX = /^\+?(88)?01\d{9}$/;

export interface EvaluableSmsMessage {
  provider: MfsProvider;
  trxId: string;
  amount: number;
  rawSms: string;
  smsSender?: string | null;
  source?: SmsSource | null;
}

/**
 * Evaluates server-side anti-spoofing trust for an ingested SMS or notification.
 * Checked strictly in contract order:
 * 1. smsSender missing or blank -> 'LEGACY_UNVERIFIED_SENDER'
 * 2. smsSender matches personal-phone regex ^\+?(88)?01\d{9}$ -> 'UNTRUSTED_SENDER'
 * 3. source === 'NOTIFICATION' and smsSender not in trusted-package list -> 'UNTRUSTED_SENDER'
 * 4. Server re-parse of rawSms fails, trxId mismatch, or amount delta > 0.009 -> 'PARSE_MISMATCH'
 * 5. Otherwise null (trusted)
 */
export function evaluateSmsTrust(msg: EvaluableSmsMessage): TrustFlag | null {
  const sender = msg.smsSender?.trim();
  if (!sender) {
    return 'LEGACY_UNVERIFIED_SENDER';
  }

  if (PERSONAL_PHONE_REGEX.test(sender)) {
    return 'UNTRUSTED_SENDER';
  }

  if (msg.source === 'NOTIFICATION') {
    const trustedPackages = TRUSTED_NOTIFICATION_PACKAGES[msg.provider] || [];
    if (!trustedPackages.includes(sender.toLowerCase())) {
      return 'UNTRUSTED_SENDER';
    }
  }

  const normalizedTrxId = msg.trxId.trim().toUpperCase();
  const parsed = parseMfsSms(msg.rawSms);
  if (
    !parsed ||
    parsed.trxId !== normalizedTrxId ||
    Math.abs(parsed.amount - msg.amount) > 0.009
  ) {
    return 'PARSE_MISMATCH';
  }

  return null;
}
