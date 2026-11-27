import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';
import type { MfsProvider } from '@/shared/utils/format';
import type {
  ActiveWallet,
  DeviceStatusSnapshot,
  PaymentActionDef,
  PaymentDisplayMetadata,
  ReceiptPolicy,
  VerificationMode,
} from '@/features/checkout/useCheckout';
import type { VerticalProfile } from '@/features/payments/usePaymentIntents';

export type PaymentLinkAmountType = 'FIXED' | 'OPEN';

export interface PaymentLinkView {
  id: string;
  merchantId: string;
  slug: string;
  title: string;
  description: string | null;
  vertical: VerticalProfile | string;
  amountType: PaymentLinkAmountType;
  fixedAmount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string;
  verificationMode: VerificationMode | null;
  display: PaymentDisplayMetadata;
  actions: PaymentActionDef[];
  metadata: Record<string, unknown> | null;
  returnUrl: string | null;
  cancelUrl: string | null;
  isActive: boolean;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | number | null;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface PublicPaymentLinkView extends PaymentLinkView {
  storeName: string;
  effectiveVerificationMode: VerificationMode;
  receiptPolicy: ReceiptPolicy;
  deviceStatus: DeviceStatusSnapshot;
  activeWallets: ActiveWallet[];
}

export interface CreatePaymentLinkDTO {
  slug?: string;
  title: string;
  description?: string;
  vertical: VerticalProfile;
  amountType: PaymentLinkAmountType;
  fixedAmount?: number;
  minAmount?: number;
  maxAmount?: number;
  verificationMode?: VerificationMode;
  returnUrl?: string;
  maxUses?: number;
}

export function usePaymentLinks() {
  return useQuery<PaymentLinkView[]>({
    queryKey: ['payment-links'],
    queryFn: async () => {
      const res = await authFetch('/api/v1/payment-links');
      const data = await unwrapApiResponse<PaymentLinkView[]>(
        res,
        'Failed to fetch payment links',
      );
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(getAuthToken()),
    staleTime: 10_000,
  });
}

export function useCreatePaymentLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreatePaymentLinkDTO) => {
      const res = await authFetch('/api/v1/payment-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return unwrapApiResponse<PaymentLinkView>(res, 'Failed to create payment link');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
    },
  });
}

export function useUpdatePaymentLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<CreatePaymentLinkDTO> & { isActive?: boolean };
    }) => {
      const res = await authFetch(`/api/v1/payment-links/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return unwrapApiResponse<PaymentLinkView>(res, 'Failed to update payment link');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
    },
  });
}

export function useDeletePaymentLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/v1/payment-links/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return unwrapApiResponse<{ deleted: boolean; id: string }>(
        res,
        'Failed to delete payment link',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
    },
  });
}

export function usePublicPaymentLink(slug: string) {
  return useQuery<PublicPaymentLinkView>({
    queryKey: ['public-payment-link', slug],
    queryFn: async () => {
      const res = await fetch(`/api/v1/payment-links/public/${encodeURIComponent(slug)}`);
      return unwrapApiResponse<PublicPaymentLinkView>(res, 'Payment link not found');
    },
    enabled: Boolean(slug),
    retry: false,
  });
}

export function usePayPublicLink(slug: string) {
  return useMutation({
    mutationFn: async (payload: {
      amount?: number;
      provider?: MfsProvider;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      referenceNote?: string;
    }) => {
      const res = await fetch(`/api/v1/payment-links/public/${encodeURIComponent(slug)}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return unwrapApiResponse<{
        paymentIntentId: string;
        sessionId: string;
        sessionToken: string;
        checkoutUrl: string;
        uniqueAmount: number;
      }>(res, 'Failed to start checkout for this link');
    },
  });
}
