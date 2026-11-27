import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthToken, UNAUTHORIZED_EVENT } from '@/shared/utils/api';
import {
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

export function useRealtime(options?: UseRealtimeOptions) {
  const mode = options?.mode ?? 'merchant';
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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

      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        attempt = 0;
        setStatus('connected');
      };

      es.addEventListener('CONNECTED', (e) => {
        if (cancelled) return;
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
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'TRANSACTION_NEW', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['wallets'] });
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          invalidateAdminIfApplicable();
        } catch {
          // ignore
        }
      });

      es.addEventListener('PAYMENT_VERIFIED', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'PAYMENT_VERIFIED', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          invalidateAdminIfApplicable();
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
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'QUEUE_UPDATED', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          invalidateAdminIfApplicable();
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
        // Stop immediately if credentials were cleared or stream disabled
        if (!resolveStreamUrl()) {
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
  }, [queryClient, mode, enabled]);

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
          for (const [k, v] of Object.entries(headers)) {
            requestHeaders.set(k, v);
          }
        }

        const res = await fetch('/api/v1/realtime/simulate', {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(payload || {}),
        });
        if (!res.ok) {
          return null;
        }
        return await res.json();
      } catch (err) {
        console.warn('Simulation request failed:', err);
        return null;
      }
    },
    [mode],
  );

  return {
    status,
    lastEvent,
    simulateTransaction,
  };
}
