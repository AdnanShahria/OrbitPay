import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MfsProvider } from '@/shared/utils/format';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';

export type TransactionStatus = 'VERIFIED' | 'UNCLAIMED' | 'MANUAL_VERIFIED';

export interface Transaction {
  id: string;
  merchantId: string;
  provider: MfsProvider;
  trxId: string;
  amount: number;
  senderNumber: string;
  rawSms: string;
  status: TransactionStatus;
  matchType?: string | null;
  externalOrderId?: string | null;
  smsReceivedAt: string;
  verifiedAt?: string | null;
  smsSender?: string | null;
  source?: 'SMS' | 'NOTIFICATION' | 'INBOX_SCAN';
  trustFlag?: string | null;
}

export interface PendingQueueItem {
  id: string;
  merchantId: string;
  provider: MfsProvider;
  externalOrderId: string;
  customerEmail: string;
  expectedAmount: number;
  baseAmount?: number | null;
  uniqueAmount?: number | null;
  submittedTrxId: string;
  submittedSender: string;
  status: 'WAITING_FOR_SMS' | 'MATCHED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export interface TransactionFilters {
  status?: TransactionStatus | 'ALL';
  provider?: MfsProvider | 'ALL';
  search?: string;
}

interface TransactionsListResponse {
  items?: Transaction[];
  transactions?: Transaction[];
  total?: number;
}

export function useTransactions(filters?: TransactionFilters) {
  return useQuery<Transaction[]>({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (filters?.status && filters.status !== 'ALL') {
        queryParams.append('status', filters.status);
      }
      if (filters?.provider && filters.provider !== 'ALL') {
        queryParams.append('provider', filters.provider);
      }
      if (filters?.search?.trim()) {
        queryParams.append('search', filters.search.trim());
      }

      const qs = queryParams.toString();
      const res = await authFetch(`/api/v1/transactions${qs ? `?${qs}` : ''}`);
      const data = await unwrapApiResponse<TransactionsListResponse | Transaction[]>(
        res,
        'Failed to fetch transactions',
      );

      const items = Array.isArray(data)
        ? data
        : data?.items ?? data?.transactions ?? [];

      if (filters?.search?.trim()) {
        const s = filters.search.trim().toLowerCase();
        return items.filter(
          (t) =>
            t.trxId.toLowerCase().includes(s) ||
            t.senderNumber.toLowerCase().includes(s) ||
            (t.externalOrderId && t.externalOrderId.toLowerCase().includes(s)),
        );
      }

      return items;
    },
    enabled: Boolean(getAuthToken()),
    staleTime: 5000,
  });
}

export function usePendingQueue() {
  return useQuery<PendingQueueItem[]>({
    queryKey: ['verification-queue'],
    queryFn: async () => {
      try {
        const res = await authFetch('/api/v1/transactions/queue');
        if (!res.ok) return [];
        const data = await unwrapApiResponse<PendingQueueItem[] | { queue?: PendingQueueItem[]; items?: PendingQueueItem[] }>(
          res,
          'Failed to fetch queue',
        );
        if (Array.isArray(data)) return data;
        return data?.queue ?? data?.items ?? [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(getAuthToken()),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

export function useManualMatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { smsId: string; externalOrderId: string; notes?: string }) => {
      const res = await authFetch('/api/v1/transactions/manual-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smsLedgerId: payload.smsId,
          externalOrderId: payload.externalOrderId,
        }),
      });

      return unwrapApiResponse<Transaction>(res, 'Manual match request failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
