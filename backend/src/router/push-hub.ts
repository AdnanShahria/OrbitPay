import type { Env } from '../shared/types';

export interface PushHubPayload {
  event?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushHubDispatchResult {
  delivered: number;
  activeSockets: number;
  configured: boolean;
}

export interface PushHubStatusResult {
  configured: boolean;
  activeSockets: number;
}

/**
 * Dispatches a real-time push frame to all connected WebSocket clients
 * in the merchant's MerchantPushHub Durable Object.
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
      body: JSON.stringify(payload),
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

    const json = (await res.json()) as { activeSockets?: number };
    return {
      configured: true,
      activeSockets: Number(json.activeSockets || 0),
    };
  } catch {
    return { configured: false, activeSockets: 0 };
  }
}
