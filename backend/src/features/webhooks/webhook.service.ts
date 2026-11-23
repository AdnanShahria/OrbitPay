import { signHmacSha256, generateSecureToken } from '../../shared/crypto';

export interface WebhookEventPayload<T = Record<string, unknown>> {
  event: string;
  eventId: string;
  timestamp: number;
  data: T;
}

/**
 * Builds standard ORBIT Webhook Event payload.
 */
export function buildWebhookPayload<T extends Record<string, unknown>>(
  event: string,
  data: T
): WebhookEventPayload<T> {
  return {
    event,
    eventId: `evt_${generateSecureToken(12)}`,
    timestamp: Date.now(),
    data,
  };
}

/**
 * Generates X-Orbit-Signature HMAC-SHA256 hex signature string.
 */
export async function generateHmacSignature(rawBody: string, secret: string): Promise<string> {
  return signHmacSha256(rawBody, secret);
}
