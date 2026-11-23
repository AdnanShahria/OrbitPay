import { Meter, type MeterTone } from '@/components/base/meter/meter';
import { formatBDT } from '@/shared/utils/format';

export interface VolumeProgressBarProps {
  currentVolume: number;
  limitVolume?: number;
  showLabels?: boolean;
}

export function VolumeProgressBar({
  currentVolume,
  limitVolume = 300000,
  showLabels = true,
}: VolumeProgressBarProps) {
  const safeLimit = limitVolume > 0 ? limitVolume : 300000;
  const percentage = Math.min(Math.round((currentVolume / safeLimit) * 100), 100);
  const isWarning = percentage >= 80 && percentage < 95;
  const isCritical = percentage >= 95;

  const tone: MeterTone = isCritical ? 'error' : isWarning ? 'warning' : 'success';

  const description = isCritical
    ? 'Limit reached. Auto-rotation is directing new checkout sessions to a backup SIM.'
    : isWarning
      ? 'At 80% personal limit. Next SIM activates automatically at ৳250k.'
      : 'Under normal inflow capacity. Primary SIM is serving checkouts.';

  return (
    <Meter
      aria-label="Monthly inflow quota"
      label={showLabels ? 'Monthly inflow quota' : undefined}
      showValueLabel={showLabels}
      value={Math.min(currentVolume, safeLimit)}
      maxValue={safeLimit}
      valueLabel={`${formatBDT(currentVolume)} / ${formatBDT(safeLimit)} (${percentage}%)`}
      tone={tone}
      description={description}
    />
  );
}
