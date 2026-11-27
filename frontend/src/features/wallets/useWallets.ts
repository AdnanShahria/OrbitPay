import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MfsProvider } from '@/shared/utils/format';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';

export type AccountType = 'PERSONAL' | 'PRA' | 'MERCHANT';

export type WalletRotationState =
  | 'ACTIVE_PRIMARY'
  | 'HEALTHY_STANDBY'
  | 'SAFE_LIMIT_OVERFLOW'
  | 'HARD_LIMIT_REACHED'
  | 'DEVICE_OFFLINE'
  | 'DISABLED';

export interface DeviceSimSlotSummary {
  slotIndex: number;
  carrierName: string;
  phoneNumber: string;
  source: string;
}

export interface ConnectedDeviceSummary {
  id: string;
  deviceName: string;
  isOnline: boolean;
  isActive: boolean;
  lastSeenAt: string | null;
  batteryLevel: number | null;
  networkType: string | null;
  appVersion: string | null;
  smsPermission: boolean | null;
  listenerEnabled: boolean | null;
  simSlots: DeviceSimSlotSummary[];
}

export interface Wallet {
  id: string;
  merchantId: string;
  provider: MfsProvider;
  accountType: AccountType;
  walletNumber: string;
  label?: string | null;
  deviceId?: string | null;
  simSlotIndex?: number | null;
  safeVolumeLimit: number;
  monthlyVolumeLimit: number;
  currentMonthVolume: number;
  isPrimary: boolean;
  isActive: boolean;
  priorityOrder?: number;
  utilizationPct?: number;
  safeUtilizationPct?: number;
  rotationState?: WalletRotationState;
  deviceOnline?: boolean | null;
  deviceName?: string | null;
  isPlaceholder?: boolean;
}

export interface WalletsOverview {
  wallets: Wallet[];
  devices: ConnectedDeviceSummary[];
  summary: {
    totalWallets: number;
    activeWallets: number;
    onlineDeviceCount: number;
    totalDeviceCount: number;
    overflowWarningCount: number;
    hardLimitReachedCount: number;
  };
}

export interface AddWalletDTO {
  provider: MfsProvider;
  accountType: AccountType;
  walletNumber: string;
  label?: string | null;
  deviceId?: string | null;
  simSlotIndex?: number | null;
  safeVolumeLimit?: number;
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

export function useWalletsOverview(merchantId?: string) {
  return useQuery<WalletsOverview>({
    queryKey: ['wallets', 'overview', merchantId || 'me'],
    queryFn: async () => {
      const qs = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : '';
      const res = await authFetch(`/api/v1/wallets/overview${qs}`);
      return unwrapApiResponse<WalletsOverview>(
        res,
        'Failed to fetch wallet rotation overview',
      );
    },
    enabled: Boolean(getAuthToken()),
    staleTime: 10_000,
    refetchInterval: 15_000,
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
      queryClient.invalidateQueries({ queryKey: ['wallets', 'overview'] });
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
      queryClient.invalidateQueries({ queryKey: ['wallets', 'overview'] });
    },
  });
}

export function useSetPrimaryWalletMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/v1/wallets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      });

      return unwrapApiResponse<Wallet>(res, 'Failed to set primary wallet');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallets', 'overview'] });
    },
  });
}

export function useDeleteWalletMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/v1/wallets/${id}`, {
        method: 'DELETE',
      });

      return unwrapApiResponse<{ message?: string }>(res, 'Failed to remove wallet');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallets', 'overview'] });
    },
  });
}
