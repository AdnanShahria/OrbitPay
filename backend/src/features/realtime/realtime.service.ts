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
  | 'ORDER_UPDATED';

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
