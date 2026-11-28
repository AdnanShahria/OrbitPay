import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authFetch, getAuthToken, UNAUTHORIZED_EVENT } from '@/shared/utils/api';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, MFS_METADATA, type MfsProvider } from '@/shared/utils/format';
import {
  adminFetch,
  ADMIN_UNAUTHORIZED_EVENT,
  getStoredAdminKey,
  getStoredAdminToken,
} from '@/features/admin/useAdmin';

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected';
export type RealtimeTransport = 'websocket' | 'sse' | 'none';

export interface RealtimeMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

export interface UseRealtimeOptions {
  mode?: 'merchant' | 'admin';
  enabled?: boolean;
}

const BACKOFF_STEPS_MS = [3000, 6000, 12000, 30000] as const;
const WS_PING_INTERVAL_MS = 45_000;
const EDGE_SYNC_FALLBACK_INTERVAL_MS = 45_000;
const VISIBILITY_CATCHUP_THRESHOLD_MS = 60_000;

const SSE_EVENT_TYPES = [
  'TRANSACTION_NEW',
  'PAYMENT_VERIFIED',
  'DEVICE_HEARTBEAT',
  'QUEUE_UPDATED',
  'ORDER_CREATED',
  'ORDER_UPDATED',
  'SMS_FLAGGED',
  'WALLET_ROTATED',
  'WALLET_SYNCED',
  'PAYMENT_LINK_UPDATED',
] as const;

interface RecentIntentSnapshot {
  id: string;
  externalRefId: string;
  status: string;
  provider?: MfsProvider | null;
  trxId?: string | null;
  paidAmount?: number | null;
  uniqueAmount?: number | null;
  baseAmount?: number | null;
  verifiedAt?: string | number | null;
  metadata?: {
    paymentLinkTitle?: string;
    paymentLinkSlug?: string;
  } | null;
}

export function useRealtime(options?: UseRealtimeOptions) {
  const mode = options?.mode ?? 'merchant';
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const [transport, setTransport] = useState<RealtimeTransport>('none');
  const [lastEvent, setLastEvent] = useState<RealtimeMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hasConnectedOnceRef = useRef(false);

  const notifiedVerifiedRef = useRef<Set<string>>(new Set());
  const notifiedPendingRef = useRef<Set<string>>(new Set());
  const baselineSeededRef = useRef(false);
  const statusRef = useRef<RealtimeStatus>('disconnected');
  const transportRef = useRef<RealtimeTransport>('none');
  const isSyncingIntentsRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);

  const updateStatus = useCallback((next: RealtimeStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const updateTransport = useCallback((next: RealtimeTransport) => {
    transportRef.current = next;
    setTransport(next);
  }, []);

  const notifyPaymentVerified = useCallback(
    (payload: {
      paymentIntentId?: string | null;
      orderId?: string | null;
      trxId?: string | null;
      amount?: number | null;
      provider?: string | null;
      linkTitle?: string | null;
    }) => {
      const dedupeKey =
        payload.paymentIntentId ||
        payload.trxId ||
        payload.orderId ||
        `${payload.amount || 0}`;

      if (!dedupeKey || notifiedVerifiedRef.current.has(dedupeKey)) {
        return;
      }
      notifiedVerifiedRef.current.add(dedupeKey);

      const amountNum = Number(payload.amount ?? 0);
      const provKey = payload.provider as MfsProvider | undefined;
      const providerName = (provKey && MFS_METADATA[provKey]?.name) || payload.provider || 'MFS';
      const parts = [
        providerName,
        payload.trxId ? `TrxID ${payload.trxId}` : '',
        payload.linkTitle || payload.orderId || '',
      ].filter(Boolean);

      toast.success(
        amountNum > 0
          ? `Payment received · ${formatBDT(amountNum)}`
          : 'Payment received & verified',
        {
          id: `orbit-pay-rx-${dedupeKey}`,
          description: parts.join(' · ') || 'Confirmed by ORBIT Payment Hub.',
          duration: 7500,
        },
      );
    },
    [],
  );

  const notifyPaymentSubmitted = useCallback(
    (payload: {
      paymentIntentId?: string | null;
      orderId?: string | null;
      trxId?: string | null;
      amount?: number | null;
      provider?: string | null;
      status?: string | null;
    }) => {
      const key = `${payload.paymentIntentId || payload.orderId || payload.trxId}:${payload.status || 'PENDING'}`;
      if (notifiedPendingRef.current.has(key)) {
        return;
      }
      notifiedPendingRef.current.add(key);

      const amountNum = Number(payload.amount ?? 0);
      const provKey = payload.provider as MfsProvider | undefined;
      const providerName = (provKey && MFS_METADATA[provKey]?.name) || payload.provider || 'MFS';
      const isManual = payload.status === 'MANUAL_REVIEW_REQUIRED';

      toast.info(
        amountNum > 0
          ? `Payment proof submitted · ${formatBDT(amountNum)}`
          : 'New payment proof submitted',
        {
          id: `orbit-pay-sub-${key}`,
          description: `${providerName}${payload.trxId ? ` · TrxID ${payload.trxId}` : ''} — ${
            isManual ? 'ready for manual review' : 'awaiting SMS verification'
          }`,
          duration: 5500,
        },
      );
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    let pingInterval: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;
    hasConnectedOnceRef.current = false;

    function clearPingInterval() {
      if (pingInterval !== undefined) {
        clearInterval(pingInterval);
        pingInterval = undefined;
      }
    }

    function resolveStreamUrl(): string | null {
      if (!enabled) return null;

      if (mode === 'admin') {
        const adminToken = getStoredAdminToken()?.trim();
        if (!adminToken) return null;
        return `/api/v1/realtime/stream?adminToken=${encodeURIComponent(adminToken)}`;
      }

      const merchantToken = getAuthToken()?.trim();
      if (!merchantToken) return null;
      return `/api/v1/realtime/stream?token=${encodeURIComponent(merchantToken)}`;
    }

    function resolveWsUrl(): string | null {
      if (!enabled || typeof window === 'undefined') {
        return null;
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

      if (mode === 'admin') {
        const adminToken = getStoredAdminToken()?.trim();
        if (!adminToken) return null;
        return `${protocol}//${window.location.host}/api/v1/realtime/ws?adminToken=${encodeURIComponent(adminToken)}`;
      }

      const merchantToken = getAuthToken()?.trim();
      if (!merchantToken) return null;
      return `${protocol}//${window.location.host}/api/v1/realtime/ws?token=${encodeURIComponent(merchantToken)}`;
    }

    function cleanupCurrentSource() {
      clearPingInterval();
      if (wsRef.current) {
        const activeWs = wsRef.current;
        wsRef.current = null;
        activeWs.onopen = null;
        activeWs.onmessage = null;
        activeWs.onerror = null;
        activeWs.onclose = null;
        if (
          activeWs.readyState === WebSocket.OPEN ||
          activeWs.readyState === WebSocket.CONNECTING
        ) {
          activeWs.close();
        }
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }

    function invalidateAdminAllForReconnect() {
      if (mode === 'admin') {
        queryClient.invalidateQueries({ queryKey: ['admin'] });
      }
    }

    function invalidateAdminForEvent(eventType: string) {
      if (mode !== 'admin') return;

      switch (eventType) {
        case 'TRANSACTION_NEW':
          queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'queue'] });
          break;
        case 'PAYMENT_VERIFIED':
          queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'queue'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
          break;
        case 'QUEUE_UPDATED':
        case 'SMS_FLAGGED':
          queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'queue'] });
          break;
        case 'ORDER_CREATED':
        case 'ORDER_UPDATED':
          queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
          break;
        case 'WALLET_ROTATED':
        case 'WALLET_SYNCED':
          queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
          break;
        case 'DEVICE_HEARTBEAT':
        case 'PAYMENT_LINK_UPDATED':
          queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
          break;
        default:
          break;
      }
    }

    function invalidateMerchantQueries() {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }

    function handleRealtimeEvent(eventType: string, data: unknown) {
      setLastEvent({ type: eventType, data, timestamp: new Date().toISOString() });

      switch (eventType) {
        case 'TRANSACTION_NEW': {
          invalidateMerchantQueries();
          invalidateAdminForEvent(eventType);
          break;
        }
        case 'PAYMENT_VERIFIED': {
          const payload = (data && typeof data === 'object' ? data : {}) as {
            paymentIntentId?: string;
            orderId?: string;
            trxId?: string;
            amount?: number;
            paidAmount?: number;
            provider?: string;
            linkTitle?: string;
          };
          invalidateMerchantQueries();
          invalidateAdminForEvent(eventType);

          if (mode === 'merchant') {
            notifyPaymentVerified({
              paymentIntentId: payload.paymentIntentId,
              orderId: payload.orderId,
              trxId: payload.trxId,
              amount: payload.paidAmount ?? payload.amount,
              provider: payload.provider,
              linkTitle: payload.linkTitle,
            });
          }
          break;
        }
        case 'DEVICE_HEARTBEAT': {
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['wallets', 'overview'] });
          invalidateAdminForEvent(eventType);
          break;
        }
        case 'QUEUE_UPDATED': {
          const payload = (data && typeof data === 'object' ? data : null) as {
            paymentIntentId?: string;
            orderId?: string;
            trxId?: string;
            expectedAmount?: number;
            provider?: string;
            status?: string;
          } | null;
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          queryClient.invalidateQueries({ queryKey: ['payment-links'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          invalidateAdminForEvent(eventType);

          if (mode === 'merchant' && payload?.trxId) {
            notifyPaymentSubmitted({
              paymentIntentId: payload.paymentIntentId,
              orderId: payload.orderId,
              trxId: payload.trxId,
              amount: payload.expectedAmount,
              provider: payload.provider,
              status: payload.status,
            });
          }
          break;
        }
        case 'ORDER_CREATED':
        case 'ORDER_UPDATED': {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          invalidateAdminForEvent(eventType);
          break;
        }
        case 'SMS_FLAGGED': {
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          invalidateAdminForEvent(eventType);
          break;
        }
        case 'WALLET_ROTATED':
        case 'WALLET_SYNCED': {
          queryClient.invalidateQueries({ queryKey: ['wallets'] });
          queryClient.invalidateQueries({ queryKey: ['wallets', 'overview'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          invalidateAdminForEvent(eventType);
          break;
        }
        case 'PAYMENT_LINK_UPDATED': {
          queryClient.invalidateQueries({ queryKey: ['payment-links'] });
          invalidateAdminForEvent(eventType);
          break;
        }
        default:
          break;
      }
    }

    function scheduleReconnect(targetFn: () => void, checkUrl: () => string | null) {
      const delayMs = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
      attempt += 1;
      clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => {
        if (!cancelled && checkUrl()) {
          targetFn();
        }
      }, delayMs);
    }

    function connectSse() {
      if (cancelled) return;

      const streamUrl = resolveStreamUrl();
      if (!streamUrl) {
        cleanupCurrentSource();
        updateStatus('disconnected');
        updateTransport('none');
        return;
      }

      cleanupCurrentSource();
      updateStatus('connecting');
      updateTransport('sse');

      let hasOpened = false;
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (cancelled || eventSourceRef.current !== es) return;
        hasOpened = true;
        attempt = 0;
        updateStatus('connected');
        updateTransport('sse');
      };

      es.addEventListener('CONNECTED', (e) => {
        if (cancelled || eventSourceRef.current !== es) return;
        hasOpened = true;
        attempt = 0;
        updateStatus('connected');
        updateTransport('sse');
        try {
          const data = JSON.parse((e as MessageEvent<string>).data);
          setLastEvent({ type: 'CONNECTED', data, timestamp: new Date().toISOString() });
        } catch {
          // ignore parse errors
        }
        if (hasConnectedOnceRef.current) {
          if (mode === 'merchant') {
            invalidateMerchantQueries();
          } else {
            invalidateAdminAllForReconnect();
          }
        } else {
          hasConnectedOnceRef.current = true;
        }
      });

      for (const eventType of SSE_EVENT_TYPES) {
        es.addEventListener(eventType, (e) => {
          try {
            const data = JSON.parse((e as MessageEvent<string>).data);
            handleRealtimeEvent(eventType, data);
          } catch {
            // ignore parse errors
          }
        });
      }

      es.onerror = () => {
        es.close();
        if (eventSourceRef.current === es) {
          eventSourceRef.current = null;
        }
        updateStatus('disconnected');

        if (cancelled) return;
        if (!resolveStreamUrl()) {
          updateTransport('none');
          return;
        }

        if (!hasOpened) {
          const checkRes =
            mode === 'admin'
              ? adminFetch('/api/v1/admin/auth/me')
              : authFetch('/api/v1/auth/me');
          void checkRes
            .then((res) => {
              if (cancelled || res.status === 401 || !resolveStreamUrl()) {
                if (res.status === 401) {
                  updateTransport('none');
                }
                return;
              }
              scheduleReconnect(connectSse, resolveStreamUrl);
            })
            .catch(() => {
              if (cancelled || !resolveStreamUrl()) return;
              scheduleReconnect(connectSse, resolveStreamUrl);
            });
          return;
        }

        scheduleReconnect(connectSse, resolveStreamUrl);
      };
    }

    function connectWs() {
      if (cancelled) return;

      const wsUrl = resolveWsUrl();
      if (!wsUrl) {
        cleanupCurrentSource();
        updateStatus('disconnected');
        updateTransport('none');
        return;
      }

      cleanupCurrentSource();
      updateStatus('connecting');

      let hasOpened = false;
      let handledDisconnect = false;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const handleWsDisconnect = () => {
        if (handledDisconnect) return;
        handledDisconnect = true;
        clearPingInterval();

        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }

        updateStatus('disconnected');

        if (cancelled) return;
        if (!resolveWsUrl()) {
          updateTransport('none');
          return;
        }

        if (!hasOpened) {
          const checkRes =
            mode === 'admin'
              ? adminFetch('/api/v1/admin/auth/me')
              : authFetch('/api/v1/auth/me');
          void checkRes
            .then((res) => {
              if (cancelled || res.status === 401 || !resolveWsUrl()) {
                if (res.status === 401) {
                  updateTransport('none');
                }
                return;
              }
              connectSse();
            })
            .catch(() => {
              if (cancelled || !resolveWsUrl()) return;
              connectSse();
            });
          return;
        }

        scheduleReconnect(connectWs, resolveWsUrl);
      };

      ws.onopen = () => {
        if (cancelled || wsRef.current !== ws) {
          ws.close();
          return;
        }
        clearPingInterval();
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, WS_PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (cancelled || wsRef.current !== ws) return;
        if (event.data === 'pong') return;
        if (typeof event.data !== 'string') return;

        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            event?: string;
            data?: unknown;
          };

          if (msg.type === 'connected') {
            hasOpened = true;
            attempt = 0;
            updateStatus('connected');
            updateTransport('websocket');
            setLastEvent({
              type: 'CONNECTED',
              data: msg,
              timestamp: new Date().toISOString(),
            });

            if (hasConnectedOnceRef.current) {
              if (mode === 'merchant') {
                invalidateMerchantQueries();
              } else {
                invalidateAdminAllForReconnect();
              }
            } else {
              hasConnectedOnceRef.current = true;
            }
            return;
          }

          if (msg.type === 'realtime' && typeof msg.event === 'string') {
            handleRealtimeEvent(msg.event, msg.data);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = handleWsDisconnect;
      ws.onclose = handleWsDisconnect;
    }

    function connect() {
      if (cancelled) return;
      connectWs();
    }

    const handleUnauthorized = () => {
      clearTimeout(reconnectTimeout);
      cleanupCurrentSource();
      updateStatus('disconnected');
      updateTransport('none');
    };

    const handleOnline = () => {
      if (cancelled) return;
      if (statusRef.current !== 'connected') {
        clearTimeout(reconnectTimeout);
        attempt = 0;
        connect();
      }
    };

    const unauthorizedEventName =
      mode === 'admin' ? ADMIN_UNAUTHORIZED_EVENT : UNAUTHORIZED_EVENT;
    window.addEventListener(unauthorizedEventName, handleUnauthorized);
    window.addEventListener('online', handleOnline);

    connect();

    return () => {
      cancelled = true;
      window.removeEventListener(unauthorizedEventName, handleUnauthorized);
      window.removeEventListener('online', handleOnline);
      clearTimeout(reconnectTimeout);
      cleanupCurrentSource();
      updateStatus('disconnected');
      updateTransport('none');
    };
  }, [
    queryClient,
    mode,
    enabled,
    notifyPaymentVerified,
    notifyPaymentSubmitted,
    updateStatus,
    updateTransport,
  ]);

  // Zero-Idle-Polling Edge Sync: seed baseline once on mount and only run
  // fallback sync when WebSocket push is not actively connected.
  useEffect(() => {
    if (mode !== 'merchant' || !enabled || !getAuthToken()) {
      return;
    }

    let cancelled = false;
    let hiddenAt: number | null =
      typeof document !== 'undefined' && document.hidden ? Date.now() : null;
    baselineSeededRef.current = false;

    const seedBaselineFromItems = (items: RecentIntentSnapshot[]) => {
      for (const item of items) {
        if (item.status === 'VERIFIED') {
          notifiedVerifiedRef.current.add(item.id);
          if (item.trxId) notifiedVerifiedRef.current.add(item.trxId);
          if (item.externalRefId) notifiedVerifiedRef.current.add(item.externalRefId);
        } else if (
          item.status === 'WAITING_FOR_SMS' ||
          item.status === 'MANUAL_REVIEW_REQUIRED'
        ) {
          notifiedPendingRef.current.add(`${item.id}:${item.status}`);
        }
      }
      baselineSeededRef.current = true;
    };

    const syncRecentIntents = async (isInitial = false) => {
      if (cancelled || !getAuthToken()) return;
      if (!isInitial && typeof document !== 'undefined' && document.hidden) return;
      if (
        !isInitial &&
        transportRef.current === 'websocket' &&
        statusRef.current === 'connected'
      ) {
        return;
      }
      if (isSyncingIntentsRef.current) return;

      if (isInitial && !baselineSeededRef.current) {
        const cachedQueries = queryClient.getQueriesData<{
          items?: RecentIntentSnapshot[];
        }>({
          queryKey: ['payment-intents'],
        });
        const cachedItems = cachedQueries.flatMap(([, data]) =>
          Array.isArray(data?.items) ? data.items : [],
        );
        if (cachedItems.length > 0) {
          seedBaselineFromItems(cachedItems);
          return;
        }
      }

      isSyncingIntentsRef.current = true;
      try {
        const res = await authFetch('/api/v1/payment-intents?limit=12&offset=0');
        if (!res.ok) return;
        const json = await res.json();
        const items: RecentIntentSnapshot[] = json?.data?.items ?? [];

        if (!baselineSeededRef.current) {
          seedBaselineFromItems(items);
          return;
        }

        let detectedNewChange = false;
        for (const item of items) {
          if (item.status === 'VERIFIED') {
            const alreadySeen =
              notifiedVerifiedRef.current.has(item.id) ||
              (item.trxId && notifiedVerifiedRef.current.has(item.trxId)) ||
              (item.externalRefId && notifiedVerifiedRef.current.has(item.externalRefId));

            if (!alreadySeen) {
              detectedNewChange = true;
              notifyPaymentVerified({
                paymentIntentId: item.id,
                orderId: item.externalRefId,
                trxId: item.trxId,
                amount: item.paidAmount ?? item.uniqueAmount ?? item.baseAmount,
                provider: item.provider,
                linkTitle: item.metadata?.paymentLinkTitle ?? null,
              });
            }
          } else if (
            item.status === 'WAITING_FOR_SMS' ||
            item.status === 'MANUAL_REVIEW_REQUIRED'
          ) {
            const key = `${item.id}:${item.status}`;
            if (!notifiedPendingRef.current.has(key)) {
              detectedNewChange = true;
              notifyPaymentSubmitted({
                paymentIntentId: item.id,
                orderId: item.externalRefId,
                trxId: item.trxId,
                amount: item.paidAmount ?? item.uniqueAmount ?? item.baseAmount,
                provider: item.provider,
                status: item.status,
              });
            }
          }
        }

        if (detectedNewChange) {
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['wallets'] });
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          queryClient.invalidateQueries({ queryKey: ['payment-links'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      } catch {
        // Silent background retry
      } finally {
        isSyncingIntentsRef.current = false;
      }
    };

    void syncRecentIntents(true);

    const timer = setInterval(() => {
      if (transportRef.current === 'websocket' && statusRef.current === 'connected') {
        return;
      }
      void syncRecentIntents(false);
    }, EDGE_SYNC_FALLBACK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (cancelled || typeof document === 'undefined') return;
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const hiddenDuration = hiddenAt !== null ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      if (
        hiddenDuration > VISIBILITY_CATCHUP_THRESHOLD_MS &&
        statusRef.current !== 'connected'
      ) {
        void syncRecentIntents(false);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [mode, enabled, queryClient, notifyPaymentVerified, notifyPaymentSubmitted]);

  // Helper to trigger a live simulation on demand
  const simulateTransaction = useCallback(
    async (
      payload?: { provider?: string; amount?: number; trxId?: string },
      headers?: Record<string, string>,
    ) => {
      try {
        const requestHeaders = new Headers({ 'Content-Type': 'application/json' });

        if (mode === 'admin') {
          const adminToken = getStoredAdminToken()?.trim();
          const adminKey = getStoredAdminKey()?.trim();
          if (adminToken) {
            requestHeaders.set('Authorization', `Bearer ${adminToken}`);
          }
          if (adminKey) {
            requestHeaders.set('x-admin-key', adminKey);
          }
        } else {
          const merchantToken = getAuthToken()?.trim();
          if (merchantToken) {
            requestHeaders.set('Authorization', `Bearer ${merchantToken}`);
          }
        }

        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            requestHeaders.set(key, value);
          }
        }

        const res = await fetch('/api/v1/realtime/simulate', {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(payload || {}),
        });
        if (res.ok) {
          const json = await res.json();
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          queryClient.invalidateQueries({ queryKey: ['payment-links'] });
          if (mode === 'admin') {
            queryClient.invalidateQueries({ queryKey: ['admin'] });
          }
          return json;
        }
      } catch (err) {
        console.error('Simulate SMS failed:', err);
      }
      return null;
    },
    [queryClient, mode],
  );

  return {
    status,
    transport,
    lastEvent,
    simulateTransaction,
  };
}
