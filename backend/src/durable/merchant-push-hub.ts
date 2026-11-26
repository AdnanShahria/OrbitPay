import type { Env } from '../shared/types';

interface PushRequestPayload {
  event?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
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
      const clientType = url.searchParams.get('clientType')?.trim() || 'android';

      this.state.acceptWebSocket(server, [clientType]);
      server.send(
        JSON.stringify({
          type: 'connected',
          serverTime: Date.now(),
          transport: 'cloudflare_do_ws',
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

      let delivered = 0;
      for (const ws of this.state.getWebSockets()) {
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
        activeSockets: this.state.getWebSockets().length,
      });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json({
        activeSockets: this.state.getWebSockets().length,
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
