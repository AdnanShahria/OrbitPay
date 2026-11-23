import { useQuery } from '@tanstack/react-query';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';

export interface DeviceStats {
  merchantId?: string;
  storeName?: string;
  totalVerifiedVolume: number;
  verifiedCount: number;
  unclaimedCount: number;
  pendingQueueCount: number;
  lastSeenAt: string | null;
  isOnline: boolean;
  batteryLevel?: number;
  syncMethod?: 'FCM_PUSH' | 'BACKGROUND_WORKER';
}

export function useDeviceStats(merchantId?: string) {
  return useQuery<DeviceStats>({
    queryKey: ['device', 'stats', merchantId || 'me'],
    queryFn: async () => {
      const qs = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : '';
      const res = await authFetch(`/api/v1/device/stats${qs}`);
      const data = await unwrapApiResponse<DeviceStats>(res, 'Failed to fetch device stats');

      const computedOnline = data.lastSeenAt
        ? Date.now() - new Date(data.lastSeenAt).getTime() < 5 * 60 * 1000
        : Boolean(data.isOnline);

      return {
        totalVerifiedVolume: Number(data.totalVerifiedVolume || 0),
        verifiedCount: Number(data.verifiedCount || 0),
        unclaimedCount: Number(data.unclaimedCount || 0),
        pendingQueueCount: Number(data.pendingQueueCount || 0),
        lastSeenAt: data.lastSeenAt ?? null,
        isOnline: data.isOnline ?? computedOnline,
        batteryLevel: data.batteryLevel,
        syncMethod: data.syncMethod ?? 'FCM_PUSH',
        merchantId: data.merchantId,
        storeName: data.storeName,
      };
    },
    enabled: Boolean(getAuthToken()),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
