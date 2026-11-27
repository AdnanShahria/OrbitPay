import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';
import type { MfsProvider } from '@/shared/utils/format';
import type {
  PaymentActionDef,
  PaymentDisplayMetadata,
  VerificationMode,
} from '@/features/checkout/useCheckout';

export type PaymentIntentStatus =
  | 'OPEN'
  | 'WAITING_FOR_SMS'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REFUNDED';

export type VerticalProfile =
  | 'ecommerce'
  | 'saas_subscription'
  | 'lms_course'
  | 'booking_appointment'
  | 'invoice_b2b'
  | 'donation'
  | 'digital_topup'
  | 'custom';

export interface PaymentIntentView {
  id: string;
  merchantId: string;
  vertical: VerticalProfile | string;
  externalRefId: string;
  verificationMode: VerificationMode;
  status: PaymentIntentStatus;
  baseAmount: number;
  uniqueAmount: number;
  paidAmount: number | null;
  provider: MfsProvider | null;
  trxId: string | null;
  senderNumber: string | null;
  receiptAssetId: string | null;
  receiptUrl: string | null;
  matchType: string | null;
  trustFlag: string | null;
  deviceOnlineAtSubmit: boolean | null;
  smsLedgerId: string | null;
  smsReconciliationState: string | null;
  escalationReason: string | null;
  resolutionSource: string | null;
  resolvedBy: Record<string, unknown> | null;
  rejectionReason: string | null;
  callbackUrl: string | null;
  returnUrl: string | null;
  cancelUrl: string | null;
  customer: { name?: string; email?: string; phone?: string } | null;
  display: PaymentDisplayMetadata;
  actions: PaymentActionDef[];
  metadata: Record<string, unknown> | null;
  stateVersion: number;
  submitAttempts: number;
  graceExpiresAt: string | number | null;
  expiresAt: string | number;
  verifiedAt: string | number | null;
  resolvedAt: string | number | null;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface PaymentIntentsResponse {
  items: PaymentIntentView[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaymentIntentFilters {
  status?: PaymentIntentStatus | 'ALL';
  vertical?: VerticalProfile | 'ALL';
  search?: string;
}

export function usePaymentIntents(filters?: PaymentIntentFilters) {
  return useQuery<PaymentIntentsResponse>({
    queryKey: ['payment-intents', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'ALL') {
        params.append('status', filters.status);
      }
      if (filters?.vertical && filters.vertical !== 'ALL') {
        params.append('vertical', filters.vertical);
      }
      if (filters?.search?.trim()) {
        params.append('search', filters.search.trim());
      }
      params.append('limit', '50');

      const qs = params.toString();
      const res = await authFetch(`/api/v1/payment-intents?${qs}`);
      const data = await unwrapApiResponse<PaymentIntentsResponse>(
        res,
        'Failed to fetch payment intents',
      );
      return {
        items: data.items ?? [],
        total: Number(data.total ?? data.items?.length ?? 0),
        limit: Number(data.limit ?? 50),
        offset: Number(data.offset ?? 0),
      };
    },
    enabled: Boolean(getAuthToken()),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useResolvePaymentIntent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      paymentIntentId: string;
      decision: 'APPROVE' | 'REJECT';
      expectedStateVersion?: number;
      reason?: string;
      trxId?: string;
    }) => {
      const res = await authFetch(
        `/api/v1/payments/${encodeURIComponent(payload.paymentIntentId)}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: payload.decision,
            expectedStateVersion: payload.expectedStateVersion,
            reason: payload.reason,
            trxId: payload.trxId,
          }),
        },
      );
      return unwrapApiResponse<{
        paymentIntentId: string;
        status: PaymentIntentStatus;
        stateVersion: number;
      }>(res, 'Failed to resolve payment intent');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      queryClient.invalidateQueries({ queryKey: ['device', 'stats'] });
    },
  });
}

export function useTriggerPaymentAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      paymentIntentId: string;
      actionId: string;
      note?: string;
      data?: Record<string, unknown>;
    }) => {
      const res = await authFetch(
        `/api/v1/payments/${encodeURIComponent(payload.paymentIntentId)}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionId: payload.actionId,
            note: payload.note,
            payload: payload.data,
          }),
        },
      );
      return unwrapApiResponse<{ dispatched?: boolean; actionId: string }>(
        res,
        'Failed to trigger custom action',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
    },
  });
}

export function useCreatePaymentIntent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      externalRefId: string;
      vertical: VerticalProfile;
      amount: number;
      verificationMode?: VerificationMode;
      customer?: { name?: string; email?: string; phone?: string };
      display?: {
        title?: string;
        subtitle?: string;
        referenceLabel?: string;
        category?: string;
      };
    }) => {
      const res = await authFetch('/api/v1/payment-intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return unwrapApiResponse<{
        created: boolean;
        paymentIntentId: string;
        sessionId: string;
        sessionToken: string;
        checkoutUrl: string;
        uniqueAmount: number;
      }>(res, 'Failed to create payment intent');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-intents'] });
    },
  });
}
