import type { Env } from '../shared/types';

export interface PushHubPayload {
  event?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  target?: 'android' | 'web' | 'all';
}

export type MerchantPushPayload = PushHubPayload;

export interface PushHubDispatchResult {
  delivered: number;
  activeSockets: number;
  configured: boolean;
}

export interface PushHubStatusResult {
  configured: boolean;
  activeSockets: number;
  androidSockets?: number;
  webSockets?: number;
}

export type MerchantPushHubStatus = PushHubStatusResult;

/**
 * Dispatches a real-time push frame to connected WebSocket clients
 * in the merchant's MerchantPushHub Durable Object (defaults to Android sockets).
 */
export async function pushToMerchantWebSockets(
  env: Env,
  merchantId: string,
  payload: PushHubPayload
): Promise<PushHubDispatchResult> {
  if (!env.PUSH_HUB) {
    return { delivered: 0, activeSockets: 0, configured: false };
  }

  try {
    const stub = env.PUSH_HUB.get(env.PUSH_HUB.idFromName(merchantId));
    const res = await stub.fetch('https://push-hub.internal/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        target: payload.target ?? 'android',
      }),
    });

    if (!res.ok) {
      return { delivered: 0, activeSockets: 0, configured: false };
    }

    const json = (await res.json()) as {
      delivered?: number;
      activeSockets?: number;
    };

    return {
      delivered: Number(json.delivered || 0),
      activeSockets: Number(json.activeSockets || 0),
      configured: true,
    };
  } catch {
    return { delivered: 0, activeSockets: 0, configured: false };
  }
}

/**
 * Broadcasts a merchant-scoped realtime event exclusively to connected Web Portal sockets
 * in the merchant's MerchantPushHub Durable Object without waking Android notifications.
 */
export async function broadcastRealtimeToMerchantWeb(
  env: Env | undefined,
  merchantId: string,
  event: string,
  data: unknown
): Promise<{ delivered: number; activeWebSockets: number }> {
  if (!env?.PUSH_HUB || !merchantId) {
    return { delivered: 0, activeWebSockets: 0 };
  }

  try {
    const stub = env.PUSH_HUB.get(env.PUSH_HUB.idFromName(merchantId));
    const res = await stub.fetch('https://push-hub.internal/realtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      console.warn(
        `[PushHub] Realtime broadcast returned HTTP ${res.status} for merchant ${merchantId}`
      );
      return { delivered: 0, activeWebSockets: 0 };
    }

    const json = (await res.json()) as {
      delivered?: number;
      activeWebSockets?: number;
    };

    return {
      delivered: Number(json.delivered || 0),
      activeWebSockets: Number(json.activeWebSockets || 0),
    };
  } catch (err) {
    console.warn('[PushHub] Realtime broadcast error:', err);
    return { delivered: 0, activeWebSockets: 0 };
  }
}

/**
 * Queries the active WebSocket connection count for a merchant's MerchantPushHub Durable Object.
 */
export async function getMerchantPushHubStatus(
  env: Env,
  merchantId: string
): Promise<PushHubStatusResult> {
  if (!env.PUSH_HUB) {
    return { configured: false, activeSockets: 0 };
  }

  try {
    const stub = env.PUSH_HUB.get(env.PUSH_HUB.idFromName(merchantId));
    const res = await stub.fetch('https://push-hub.internal/status');

    if (!res.ok) {
      return { configured: false, activeSockets: 0 };
    }

    const json = (await res.json()) as {
      activeSockets?: number;
      androidSockets?: number;
      webSockets?: number;
    };
    return {
      configured: true,
      activeSockets: Number(json.activeSockets || 0),
      androidSockets: Number(json.androidSockets || 0),
      webSockets: Number(json.webSockets || 0),
    };
  } catch {
    return { configured: false, activeSockets: 0 };
  }
}
