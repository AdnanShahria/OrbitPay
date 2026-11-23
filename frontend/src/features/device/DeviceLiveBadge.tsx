import { useDeviceStats } from './useDeviceStats';
import { formatRelativeTime } from '@/shared/utils/format';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Spinner } from '@/components/base/spinner/spinner';
import { RiSmartphoneLine, RiWifiLine, RiWifiOffLine } from '@remixicon/react';

export interface DeviceLiveBadgeProps {
  merchantId?: string;
  showDetails?: boolean;
}

export function DeviceLiveBadge({
  merchantId,
  showDetails = false,
}: DeviceLiveBadgeProps) {
  const { data: stats, isLoading, isFetching } = useDeviceStats(merchantId);

  const isOnline = stats?.isOnline ?? false;
  const lastSeen = stats?.lastSeenAt;

  return (
    <div className="inline-flex flex-wrap items-center gap-2.5">
      <Chip
        variant="bold"
        color={isOnline ? 'lime' : 'yellow'}
        className="gap-2 rounded-full px-3 py-1"
      >
        <StatusDot color={isOnline ? 'green' : 'yellow'} />

        <span className="inline-flex items-center gap-1.5 text-caption-1-semibold sm:text-body-medium">
          {isOnline ? (
            <>
              <RiWifiLine className="size-3.5 shrink-0" aria-hidden />
              <span>Companion online and syncing</span>
            </>
          ) : (
            <>
              <RiWifiOffLine className="size-3.5 shrink-0" aria-hidden />
              <span>Companion offline or delayed</span>
            </>
          )}
        </span>

        <span className="hidden border-l border-current/20 pl-2 text-caption-2-medium opacity-80 tabular-nums md:inline">
          {isLoading ? 'Connecting...' : `Seen ${formatRelativeTime(lastSeen)}`}
        </span>

        {isFetching && <Spinner size="xs" aria-hidden className="text-current" />}
      </Chip>

      {showDetails && stats && (
        <div className="hidden items-center gap-2 text-caption-1-regular text-text-tertiary lg:flex">
          <RiSmartphoneLine className="size-3.5 shrink-0" aria-hidden />
          <span className="tabular-nums">Battery: {stats.batteryLevel ?? 95}%</span>
          <span aria-hidden>·</span>
          <span>{stats.syncMethod === 'BACKGROUND_WORKER' ? 'Background worker' : 'FCM push'}</span>
        </div>
      )}
    </div>
  );
}
