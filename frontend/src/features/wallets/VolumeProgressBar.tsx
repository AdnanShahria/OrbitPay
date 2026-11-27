import { Meter, type MeterTone } from '@/components/base/meter/meter';
import { formatBDT } from '@/shared/utils/format';

export interface VolumeProgressBarProps {
  currentVolume: number;
  safeLimit?: number;
  limitVolume?: number;
  showLabels?: boolean;
}

export function VolumeProgressBar({
  currentVolume,
  safeLimit = 250000,
  limitVolume = 300000,
  showLabels = true,
}: VolumeProgressBarProps) {
  const hardLimit = limitVolume > 0 ? limitVolume : 300000;
  const safeThreshold = Math.min(safeLimit > 0 ? safeLimit : 250000, hardLimit);
  const percentage = Math.min(Math.round((currentVolume / hardLimit) * 100), 100);

  const isHardLimitReached = currentVolume >= hardLimit;
  const isOverflowZone = !isHardLimitReached && currentVolume >= safeThreshold;

  const tone: MeterTone = isHardLimitReached
    ? 'error'
    : isOverflowZone
      ? 'warning'
      : 'success';

  const remainingSafe = Math.max(0, safeThreshold - currentVolume);
  const remainingHard = Math.max(0, hardLimit - currentVolume);

  const description = isHardLimitReached
    ? `${formatBDT(hardLimit)} hard limit reached — excluded from checkout until next month or limit reset.`
    : isOverflowZone
      ? `${formatBDT(safeThreshold)} safe limit reached — overflow zone (${formatBDT(remainingHard)} left before ${formatBDT(hardLimit)} hard cap).`
      : `${formatBDT(remainingSafe)} safe capacity left before ${formatBDT(safeThreshold)} auto-rotation.`;

  return (
    <div className="space-y-2">
      <Meter
        aria-label="Monthly inflow quota"
        label={showLabels ? 'Monthly inflow quota' : undefined}
        showValueLabel={showLabels}
        value={Math.min(currentVolume, hardLimit)}
        maxValue={hardLimit}
        valueLabel={`${formatBDT(currentVolume)} / ${formatBDT(hardLimit)} (${percentage}%)`}
        tone={tone}
        description={description}
      />

      {showLabels && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-caption-2-medium text-text-tertiary tabular-nums">
          <span>Safe rotation: {formatBDT(safeThreshold)}</span>
          <span>Hard ceiling: {formatBDT(hardLimit)}</span>
        </div>
      )}
    </div>
  );
}
