import { useDeviceStats } from '@/features/device/useDeviceStats';
import { StatCards, type Stat } from '@/components/application/dashboard/stat-cards';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { formatBDT } from '@/shared/utils/format';
import {
  RiLineChartLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiTimeLine,
} from '@remixicon/react';

export function AnalyticsOverview({ merchantId }: { merchantId?: string }) {
  const { data: stats, isLoading } = useDeviceStats(merchantId);

  if (isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading analytics overview"
        className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[156px] w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  const unclaimedCount = stats?.unclaimedCount ?? 0;
  const verifiedCount = stats?.verifiedCount ?? 0;
  const totalVolume = stats?.totalVerifiedVolume ?? 0;
  const pendingQueueCount = stats?.pendingQueueCount ?? 0;

  const metrics: Stat[] = [
    {
      icon: RiLineChartLine,
      label: 'Total verified volume',
      value: formatBDT(totalVolume),
      delta: totalVolume > 0 ? 'Live' : 'No volume yet',
      deltaColor: totalVolume > 0 ? 'lime' : 'neutral',
      tone: 'neutral',
      caption: 'This calendar month',
      hint: 'Gross verified BDT volume matched across all MFS SIMs this month.',
    },
    {
      icon: RiCheckboxCircleLine,
      label: 'Verified store orders',
      value: verifiedCount.toLocaleString(),
      delta: verifiedCount > 0 ? 'Auto-matched' : '0 matched',
      deltaColor: verifiedCount > 0 ? 'lime' : 'neutral',
      tone: 'neutral',
      caption: 'Instant and auto-reconciled',
      hint: 'Checkout orders reconciled automatically against incoming MFS SMS.',
    },
    {
      icon: RiErrorWarningLine,
      label: 'Unclaimed SMS',
      value: unclaimedCount.toString(),
      delta: unclaimedCount > 0 ? 'Action needed' : 'All clear',
      deltaColor: unclaimedCount > 0 ? 'rose' : 'neutral',
      tone: 'neutral',
      caption: 'Awaiting typo match',
      hint: 'Incoming payment SMS without an exact checkout TrxID match yet.',
    },
    {
      icon: RiTimeLine,
      label: 'Pending order queue',
      value: pendingQueueCount.toString(),
      delta: pendingQueueCount > 0 ? 'Listening' : 'Idle',
      deltaColor: 'neutral',
      tone: 'neutral',
      caption: 'Waiting for device SMS',
      hint: 'Active storefront checkouts waiting within your verification grace period.',
    },
  ];

  return <StatCards variant="footer" stats={metrics} />;
}
