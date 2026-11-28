import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';

export type OrderStatus =
  | 'NEW'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'CANCELLED';

export type OrderPaymentMethod = 'ORBIT_MFS' | 'COD' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';

export type OrderPaymentStatus =
  | 'UNPAID'
  | 'PENDING_VERIFICATION'
  | 'PAID'
  | 'COD_COLLECTIBLE'
  | 'FAILED';

export type OrderAction = 'CONFIRM' | 'READY_TO_SHIP' | 'SHIP' | 'MARK_PAID' | 'CANCEL';

export interface MerchantOrder {
  id: string;
  merchantId: string;
  externalOrderId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  shippingAddress: string | null;
  itemsSummary: string | null;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  orderStatus: OrderStatus;
  baseAmount: number;
  uniqueAmount: number | null;
  paidAmount: number | null;
  trxId: string | null;
  matchType: string | null;
  storeCallbackUrl: string | null;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface OrdersResponseData {
  items: MerchantOrder[];
  total: number;
  pendingConfirmationCount: number;
}

export interface OrderFilters {
  orderStatus?: OrderStatus | 'ALL';
  paymentMethod?: OrderPaymentMethod | 'ALL';
  search?: string;
}

export function useOrders(filters?: OrderFilters) {
  return useQuery<OrdersResponseData>({
    queryKey: ['orders', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.orderStatus && filters.orderStatus !== 'ALL') {
        params.append('orderStatus', filters.orderStatus);
      }
      if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
        params.append('paymentMethod', filters.paymentMethod);
      }
      if (filters?.search?.trim()) {
        params.append('search', filters.search.trim());
      }

      const qs = params.toString();
      const res = await authFetch(`/api/v1/orders${qs ? `?${qs}` : ''}`);
      const data = await unwrapApiResponse<OrdersResponseData>(
        res,
        'Failed to fetch orders',
      );

      return {
        items: data.items ?? [],
        total: Number(data.total ?? data.items?.length ?? 0),
        pendingConfirmationCount: Number(data.pendingConfirmationCount ?? 0),
      };
    },
    enabled: Boolean(getAuthToken()),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

export function useOrderActionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      externalOrderId,
      action,
      note,
    }: {
      externalOrderId: string;
      action: OrderAction;
      note?: string;
    }) => {
      const res = await authFetch(
        `/api/v1/orders/${encodeURIComponent(externalOrderId)}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, note }),
        },
      );

      return unwrapApiResponse<{ order: MerchantOrder; webhookDispatched: boolean }>(
        res,
        'Order action failed',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
    },
  });
}
