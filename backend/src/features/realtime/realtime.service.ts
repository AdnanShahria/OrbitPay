import { broadcastRealtimeToMerchantWeb } from '../../router/push-hub';
import { safeWaitUntil } from '../../shared/middleware';
import type { Env } from '../../shared/types';

export type RealtimeEventType =
  | 'CONNECTED'
  | 'PING'
  | 'TRANSACTION_NEW'
  | 'SMS_FLAGGED'
  | 'PAYMENT_VERIFIED'
  | 'QUEUE_UPDATED'
  | 'DEVICE_HEARTBEAT'
  | 'STATS_UPDATED'
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'WALLET_ROTATED'
  | 'WALLET_SYNCED'
  | 'PAYMENT_LINK_UPDATED';

export interface RealtimeEvent {
  type: RealtimeEventType;
  merchantId?: string;
  data: unknown;
  timestamp: string;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

class RealtimeHub {
  private listeners: Set<RealtimeListener> = new Set();

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(type: RealtimeEventType, data: unknown = {}, merchantId?: string) {
    const derivedMerchantId =
      merchantId ||
      (data && typeof data === 'object' && 'merchantId' in data && typeof (data as any).merchantId === 'string'
        ? (data as any).merchantId
        : undefined);

    const event: RealtimeEvent = {
      type,
      merchantId: derivedMerchantId,
      data,
      timestamp: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('Realtime listener error:', err);
      }
    }
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}

export const realtimeHub = new RealtimeHub();

export const ADMIN_PUSH_HUB_ROOM_ID = '__admin__';

const ADMIN_BUSINESS_EVENTS = new Set<RealtimeEventType>([
  'TRANSACTION_NEW',
  'SMS_FLAGGED',
  'PAYMENT_VERIFIED',
  'QUEUE_UPDATED',
  'ORDER_CREATED',
  'ORDER_UPDATED',
  'WALLET_ROTATED',
  'WALLET_SYNCED',
  'PAYMENT_LINK_UPDATED',
]);

/**
 * Fans out a merchant-scoped realtime event to the local isolate SSE hub,
 * the merchant's multi-isolate MerchantPushHub Durable Object (`web` sockets only),
 * and the Admin multi-isolate hub room (`__admin__`) for business events.
 */
export function emitMerchantRealtimeEvent(
  env: Env | undefined,
  type: RealtimeEventType,
  data: unknown,
  merchantId?: string,
  ctx?: { executionCtx?: { waitUntil(promise: Promise<unknown>): void } }
): void {
  realtimeHub.broadcast(type, data, merchantId);

  if (!env?.PUSH_HUB) {
    return;
  }

  const promises: Promise<unknown>[] = [];
  if (merchantId) {
    promises.push(broadcastRealtimeToMerchantWeb(env, merchantId, type, data));
  }
  if (ADMIN_BUSINESS_EVENTS.has(type)) {
    promises.push(broadcastRealtimeToMerchantWeb(env, ADMIN_PUSH_HUB_ROOM_ID, type, data));
  }

  if (promises.length > 0) {
    const fanout = Promise.allSettled(promises);
    if (ctx) {
      safeWaitUntil(ctx, fanout);
    } else {
      fanout.catch((err) => {
        console.warn('[Realtime DO Broadcast Error]:', err);
      });
    }
  }
}
