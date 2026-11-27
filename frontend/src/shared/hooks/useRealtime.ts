import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected';

export interface RealtimeMessage {
  type: string;
  data: unknown;
  timestamp: string;
}

export function useRealtime() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [lastEvent, setLastEvent] = useState<RealtimeMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      setStatus('connecting');
      const es = new EventSource('/api/v1/realtime/stream');
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus('connected');
      };

      es.addEventListener('CONNECTED', (e) => {
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
          // Invalidate React Query caches for immediate UI refresh
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['wallets'] });
          queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
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
          queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
        } catch {
          // ignore
        }
      });

      es.addEventListener('DEVICE_HEARTBEAT', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: 'DEVICE_HEARTBEAT', data, timestamp: new Date().toISOString() });
          queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
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
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        setStatus('disconnected');
        es.close();
        // Exponential backoff reconnect
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient]);

  // Helper to trigger a live simulation on demand
  const simulateTransaction = useCallback(
    async (payload?: { provider?: string; amount?: number; trxId?: string }) => {
      try {
        const res = await fetch('/api/v1/realtime/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {}),
        });
        return await res.json();
      } catch (err) {
        console.warn('Simulation request failed:', err);
        return null;
      }
    },
    []
  );

  return {
    status,
    lastEvent,
    simulateTransaction,
  };
}
