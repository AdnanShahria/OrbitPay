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
import type { PlatformPublicConfig } from '@/features/platform/usePlatformConfig';

export type PaymentLinkAmountType = 'FIXED' | 'OPEN';

export interface PaymentLinkView {
  id: string;
  merchantId: string;
  projectId?: string | null;
  projectName?: string | null;
  projectSlug?: string | null;
  merchantSlug: string;
  slug: string;
  sharePath: string;
  shareUrl: string;
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
  merchantSlug: string;
  accountMode?: 'STANDALONE' | 'WEBHOOK_CONNECTED';
  hasActiveWallets?: boolean;
  effectiveVerificationMode: VerificationMode;
  receiptPolicy: ReceiptPolicy;
  deviceStatus: DeviceStatusSnapshot;
  platformConfig?: PlatformPublicConfig;
  activeWallets: ActiveWallet[];
}

export type PublicPaymentLinkData = PublicPaymentLinkView;

export interface CreatePaymentLinkDTO {
  projectId?: string | null;
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

export function usePaymentLinks(projectId?: string) {
  return useQuery<PaymentLinkView[]>({
    queryKey: ['payment-links', projectId || 'ALL'],
    queryFn: async () => {
      const qs = projectId && projectId !== 'ALL' ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const res = await authFetch(`/api/v1/payment-links${qs}`);
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

export function usePublicPaymentLink(slug: string, merchantSlug?: string) {
  return useQuery<PublicPaymentLinkView>({
    queryKey: ['public-payment-link', merchantSlug || 'legacy', slug],
    queryFn: async () => {
      const endpoint = merchantSlug
        ? `/api/v1/payment-links/public/m/${encodeURIComponent(merchantSlug)}/${encodeURIComponent(slug)}`
        : `/api/v1/payment-links/public/${encodeURIComponent(slug)}`;
      const res = await fetch(endpoint);
      return unwrapApiResponse<PublicPaymentLinkView>(res, 'Payment link not found');
    },
    enabled: Boolean(slug),
    retry: false,
  });
}

export function usePayPublicLink(slug: string, merchantSlug?: string) {
  return useMutation({
    mutationFn: async (payload: {
      amount?: number;
      provider?: MfsProvider;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      referenceNote?: string;
    }) => {
      const endpoint = merchantSlug
        ? `/api/v1/payment-links/public/m/${encodeURIComponent(merchantSlug)}/${encodeURIComponent(slug)}/pay`
        : `/api/v1/payment-links/public/${encodeURIComponent(slug)}/pay`;
      const res = await fetch(endpoint, {
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
