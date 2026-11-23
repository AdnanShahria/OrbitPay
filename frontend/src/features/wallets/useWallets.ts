import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MfsProvider } from '@/shared/utils/format';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';

export type AccountType = 'PERSONAL' | 'PRA' | 'MERCHANT';

export interface Wallet {
  id: string;
  merchantId: string;
  provider: MfsProvider;
  accountType: AccountType;
  walletNumber: string;
  monthlyVolumeLimit: number;
  currentMonthVolume: number;
  isPrimary: boolean;
  isActive: boolean;
}

export interface AddWalletDTO {
  provider: MfsProvider;
  accountType: AccountType;
  walletNumber: string;
  monthlyVolumeLimit?: number;
  isPrimary?: boolean;
}

export function useWallets(merchantId?: string) {
  return useQuery<Wallet[]>({
    queryKey: ['wallets', merchantId || 'me'],
    queryFn: async () => {
      const qs = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : '';
      const res = await authFetch(`/api/v1/wallets${qs}`);
      const data = await unwrapApiResponse<Wallet[] | { wallets: Wallet[] }>(
        res,
        'Failed to fetch wallets',
      );
      if (Array.isArray(data)) return data;
      return data?.wallets ?? [];
    },
    enabled: Boolean(getAuthToken()),
    staleTime: 10_000,
  });
}

export function useAddWalletMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AddWalletDTO) => {
      const res = await authFetch('/api/v1/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return unwrapApiResponse<Wallet>(res, 'Failed to add wallet');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}

export function useToggleWalletStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await authFetch(`/api/v1/wallets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });

      return unwrapApiResponse<Wallet>(res, 'Failed to update wallet status');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
}
