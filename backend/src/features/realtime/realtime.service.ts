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

/**
 * Fans out a merchant-scoped realtime event to both the local isolate SSE hub
 * and the merchant's multi-isolate MerchantPushHub Durable Object (`web` sockets only).
 */
export function emitMerchantRealtimeEvent(
  env: Env | undefined,
  type: RealtimeEventType,
  data: unknown,
  merchantId?: string,
  ctx?: { executionCtx?: { waitUntil(promise: Promise<unknown>): void } }
): void {
  realtimeHub.broadcast(type, data, merchantId);

  if (merchantId && env?.PUSH_HUB) {
    const promise = broadcastRealtimeToMerchantWeb(env, merchantId, type, data);
    if (ctx) {
      safeWaitUntil(ctx, promise);
    } else {
      promise.catch((err) => {
        console.warn('[Realtime DO Broadcast Error]:', err);
      });
    }
  }
}
