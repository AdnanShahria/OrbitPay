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
const EDGE_SYNC_INTERVAL_MS = 8000;

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
  const [lastEvent, setLastEvent] = useState<RealtimeMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const notifiedVerifiedRef = useRef<Set<string>>(new Set());
  const notifiedPendingRef = useRef<Set<string>>(new Set());
  const baselineSeededRef = useRef(false);

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
    let attempt = 0;

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

    function cleanupCurrentSource() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }

    function invalidateAdminIfApplicable() {
      if (mode === 'admin') {
        queryClient.invalidateQueries({ queryKey: ['admin'] });
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

    function connect() {
      if (cancelled) return;

      const streamUrl = resolveStreamUrl();
      if (!streamUrl) {
        cleanupCurrentSource();
        setStatus('disconnected');
        return;
      }

      cleanupCurrentSource();
      setStatus('connecting');

      let hasOpened = false;
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        hasOpened = true;
        attempt = 0;
        setStatus('connected');
      };

      es.addEventListener('CONNECTED', (e) => {
        if (cancelled) return;
        hasOpened = true;
        attempt = 0;
        setStatus('connected');
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'CONNECTED', data, timestamp: new Date().toISOString() });
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener('TRANSACTION_NEW', (e) => {
        try {
          const data = JSON.parse(e.data) as {
            provider?: string;
            trxId?: string;
            amount?: number;
          };
          setLastEvent({ type: 'TRANSACTION_NEW', data, timestamp: new Date().toISOString() });
          invalidateMerchantQueries();
          invalidateAdminIfApplicable();
        } catch {
          // ignore
        }
      });

      es.addEventListener('PAYMENT_VERIFIED', (e) => {
        try {
          const data = JSON.parse(e.data) as {
            paymentIntentId?: string;
            orderId?: string;
            trxId?: string;
            amount?: number;
            paidAmount?: number;
            provider?: string;
          };
          setLastEvent({ type: 'PAYMENT_VERIFIED', data, timestamp: new Date().toISOString() });
          invalidateMerchantQueries();
          invalidateAdminIfApplicable();

          if (mode === 'merchant') {
            notifyPaymentVerified({
              paymentIntentId: data.paymentIntentId,
              orderId: data.orderId,
              trxId: data.trxId,
              amount: data.paidAmount ?? data.amount,
              provider: data.provider,
            });
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener('DEVICE_HEARTBEAT', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'DEVICE_HEARTBEAT', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          invalidateAdminIfApplicable();
        } catch {
          // ignore
        }
      });

      es.addEventListener('QUEUE_UPDATED', (e) => {
        try {
          const data = JSON.parse(e.data) as {
            paymentIntentId?: string;
            orderId?: string;
            trxId?: string;
            expectedAmount?: number;
            provider?: string;
            status?: string;
          };
          setLastEvent({ type: 'QUEUE_UPDATED', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          queryClient.invalidateQueries({ queryKey: ['payment-links'] });
          invalidateAdminIfApplicable();

          if (mode === 'merchant' && data?.trxId) {
            notifyPaymentSubmitted({
              paymentIntentId: data.paymentIntentId,
              orderId: data.orderId,
              trxId: data.trxId,
              amount: data.expectedAmount,
              provider: data.provider,
              status: data.status,
            });
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener('ORDER_CREATED', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'ORDER_CREATED', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          invalidateAdminIfApplicable();
        } catch {
          // ignore
        }
      });

      es.addEventListener('ORDER_UPDATED', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'ORDER_UPDATED', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          invalidateAdminIfApplicable();
        } catch {
          // ignore
        }
      });

      es.addEventListener('SMS_FLAGGED', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'SMS_FLAGGED', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          invalidateAdminIfApplicable();
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es.close();
        if (eventSourceRef.current === es) {
          eventSourceRef.current = null;
        }
        setStatus('disconnected');

        if (cancelled) return;
        if (!resolveStreamUrl()) {
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
                return;
              }
              const delayMs =
                BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
              attempt += 1;
              clearTimeout(reconnectTimeout);
              reconnectTimeout = setTimeout(() => {
                if (!cancelled && resolveStreamUrl()) {
                  connect();
                }
              }, delayMs);
            })
            .catch(() => {
              if (cancelled || !resolveStreamUrl()) return;
              const delayMs =
                BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
              attempt += 1;
              clearTimeout(reconnectTimeout);
              reconnectTimeout = setTimeout(() => {
                if (!cancelled && resolveStreamUrl()) {
                  connect();
                }
              }, delayMs);
            });
          return;
        }

        const delayMs =
          BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
        attempt += 1;

        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          if (!cancelled && resolveStreamUrl()) {
            connect();
          }
        }, delayMs);
      };
    }

    const handleUnauthorized = () => {
      clearTimeout(reconnectTimeout);
      cleanupCurrentSource();
      setStatus('disconnected');
    };

    const unauthorizedEventName =
      mode === 'admin' ? ADMIN_UNAUTHORIZED_EVENT : UNAUTHORIZED_EVENT;
    window.addEventListener(unauthorizedEventName, handleUnauthorized);

    connect();

    return () => {
      cancelled = true;
      window.removeEventListener(unauthorizedEventName, handleUnauthorized);
      clearTimeout(reconnectTimeout);
      cleanupCurrentSource();
      setStatus('disconnected');
    };
  }, [queryClient, mode, enabled, notifyPaymentVerified, notifyPaymentSubmitted]);

  // Distributed Cloudflare Workers edge sync: ensures Payment Received toasts
  // still fire reliably even if checkout/SMS hit a different Worker isolate.
  useEffect(() => {
    if (mode !== 'merchant' || !enabled || !getAuthToken()) {
      return;
    }

    let cancelled = false;
    baselineSeededRef.current = false;

    const syncRecentIntents = async () => {
      if (cancelled || !getAuthToken()) return;
      try {
        const res = await authFetch('/api/v1/payment-intents?limit=12&offset=0');
        if (!res.ok) return;
        const json = await res.json();
        const items: RecentIntentSnapshot[] = json?.data?.items ?? [];

        if (!baselineSeededRef.current) {
          for (const item of items) {
            if (item.status === 'VERIFIED') {
              notifiedVerifiedRef.current.add(item.id);
              if (item.trxId) notifiedVerifiedRef.current.add(item.trxId);
              if (item.externalRefId) notifiedVerifiedRef.current.add(item.externalRefId);
            } else if (
              item.status === 'WAITING_FOR_SMS' ||
              item.status === 'MANUAL_REVIEW_REQUIRED'
            ) {
              notifiedPendingRef.current.add(
                `${item.id}:${item.status}`,
              );
            }
          }
          baselineSeededRef.current = true;
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
      }
    };

    void syncRecentIntents();
    const timer = setInterval(() => {
      void syncRecentIntents();
    }, EDGE_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
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
    lastEvent,
    simulateTransaction,
  };
}
