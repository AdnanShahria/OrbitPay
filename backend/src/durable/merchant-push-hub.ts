import type { Env } from '../shared/types';

interface PushRequestPayload {
  event?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  target?: 'android' | 'web' | 'all';
}

interface RealtimeRequestPayload {
  event?: string;
  data?: unknown;
  timestamp?: string;
}

/**
 * Self-hosted Cloudflare Durable Object WebSocket hub (1 instance per merchantId).
 * Uses the WebSocket Hibernation API + ping/pong auto-response so idle connections
 * consume zero duration charges on the Cloudflare Workers Free Plan.
 */
export class MerchantPushHub implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    _env: Env
  ) {
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/connect') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return Response.json(
          { success: false, error: 'WebSocket upgrade required' },
          { status: 426 }
        );
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const rawClientType = url.searchParams.get('clientType')?.trim().toLowerCase();
      const clientType = rawClientType === 'web' ? 'web' : 'android';

      this.state.acceptWebSocket(server, [clientType]);
      server.send(
        JSON.stringify({
          type: 'connected',
          serverTime: Date.now(),
          transport: 'cloudflare_do_ws',
          clientType,
        })
      );

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' && url.pathname === '/push') {
      let payload: PushRequestPayload;
      try {
        payload = (await request.json()) as PushRequestPayload;
      } catch {
        return Response.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
      }

      const stringifiedDataRecord: Record<string, string> = {};
      if (payload.data && typeof payload.data === 'object') {
        for (const [key, value] of Object.entries(payload.data)) {
          if (value !== undefined && value !== null) {
            stringifiedDataRecord[key] = typeof value === 'string' ? value : String(value);
          }
        }
      }

      const frame = JSON.stringify({
        type: 'push',
        id: crypto.randomUUID(),
        event: payload.event || 'notification',
        title: payload.title || 'ORBIT Payment Hub',
        body: payload.body || '',
        data: stringifiedDataRecord,
        timestamp: Date.now(),
      });

      const target = payload.target ?? 'android';
      const targetSockets =
        target === 'all'
          ? this.state.getWebSockets()
          : target === 'web'
            ? this.state.getWebSockets('web')
            : this.state.getWebSockets('android');

      let delivered = 0;
      for (const ws of targetSockets) {
        try {
          ws.send(frame);
          delivered++;
        } catch {
          try {
            ws.close(1011, 'Failed to deliver push frame');
          } catch {
            // Socket already closed
          }
        }
      }

      return Response.json({
        ok: true,
        delivered,
        activeSockets: targetSockets.length,
      });
    }

    if (request.method === 'POST' && url.pathname === '/realtime') {
      let payload: RealtimeRequestPayload;
      try {
        payload = (await request.json()) as RealtimeRequestPayload;
      } catch {
        return Response.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
      }

      const eventName = typeof payload.event === 'string' ? payload.event.trim() : '';
      if (!eventName) {
        return Response.json(
          { success: false, error: 'Field "event" must be a non-empty string' },
          { status: 400 }
        );
      }

      const frame = JSON.stringify({
        type: 'realtime',
        event: eventName,
        data: payload.data ?? {},
        timestamp: payload.timestamp || new Date().toISOString(),
      });

      const sockets = this.state.getWebSockets('web');
      let delivered = 0;
      for (const ws of sockets) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
          ws.send(frame);
          delivered++;
        } catch {
          try {
            ws.close(1011, 'Failed to deliver realtime frame');
          } catch {
            // Socket already closed
          }
        }
      }

      return Response.json({
        success: true,
        delivered,
        activeWebSockets: sockets.length,
      });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      const all = this.state.getWebSockets();
      const android = this.state.getWebSockets('android');
      const web = this.state.getWebSockets('web');
      return Response.json({
        activeSockets: all.length,
        androidSockets: android.length,
        webSockets: web.length,
        transport: 'cloudflare_do_ws',
      });
    }

    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string') return;
    if (message === 'ping') {
      try {
        ws.send('pong');
      } catch {
        // Ignore closed socket
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const closeCode = code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 ? code : 1000;
        ws.close(closeCode, reason || 'Closed');
      }
    } catch {
      // Ignore already-closed socket
    }
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // Ignore already-closed socket
    }
  }
}
