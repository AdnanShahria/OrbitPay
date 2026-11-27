import { signHmacSha256, generateSecureToken } from '../../shared/crypto';

export interface WebhookEventPayload<T = Record<string, unknown>> {
  event: string;
  eventId: string;
  timestamp: number;
  data: T;
}

/**
 * Builds standard ORBIT Webhook Event payload.
 * Preserves existing eventId and timestamp when replaying or retrying deliveries.
 */
export function buildWebhookPayload<T extends Record<string, unknown>>(
  event: string,
  data: T,
  existingEventId?: string,
  existingTimestamp?: number
): WebhookEventPayload<T> {
  return {
    event,
    eventId: existingEventId || `evt_${generateSecureToken(12)}`,
    timestamp: existingTimestamp ?? Date.now(),
    data,
  };
}

/**
 * Generates X-Orbit-Signature HMAC-SHA256 hex signature string over rawBody.
 */
export async function generateHmacSignature(rawBody: string, secret: string): Promise<string> {
  return signHmacSha256(rawBody, secret);
}

/**
 * Generates X-Orbit-Signature-V2 HMAC-SHA256 hex signature string over "${timestamp}.${rawBody}".
 */
export async function generateHmacSignatureV2(
  timestamp: number | string,
  rawBody: string,
  secret: string
): Promise<string> {
  return signHmacSha256(`${timestamp}.${rawBody}`, secret);
}
