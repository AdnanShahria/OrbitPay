import { Chip } from '@/components/base/badges/chip';
import { formatBDT } from '@/shared/utils/format';
import type { PaymentDisplayMetadata } from './useCheckout';
import { RiLock2Line } from '@remixicon/react';

export interface CheckoutDisplayHeaderProps {
  storeName: string;
  orderId: string;
  vertical?: string;
  display?: PaymentDisplayMetadata | null;
  baseAmount: number;
  uniqueAmount: number;
  offsetCents: number;
  isSessionLoading?: boolean;
}

export function CheckoutDisplayHeader({
  storeName,
  orderId,
  vertical,
  display,
  baseAmount: _baseAmount,
  uniqueAmount,
  offsetCents,
  isSessionLoading = false,
}: CheckoutDisplayHeaderProps) {
  const appTitle = display?.title || display?.appName || storeName || 'ORBIT Secure Checkout';
  const appSubtitle =
    display?.subtitle ||
    (display?.appName && display.title && display.appName !== display.title
      ? display.appName
      : undefined);
  const referenceLabel = display?.referenceLabel || 'Order';
  const categoryLabel =
    display?.category ||
    (vertical && vertical !== 'ecommerce' ? vertical.replace(/_/g, ' ') : undefined);
  const highlights = display?.highlights ?? [];
  const safeOrderId = orderId || '—';

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span className="size-9 rounded-2lg bg-background-secondary-default border border-border-button-default text-foreground-icon-primary flex items-center justify-center shrink-0 mt-0.5">
            <RiLock2Line className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-body-medium text-text-primary truncate">
                {appTitle}
              </span>
              {categoryLabel && (
                <Chip variant="caption" color="soft" className="capitalize shrink-0">
                  {categoryLabel}
                </Chip>
              )}
            </div>
            {appSubtitle && (
              <span className="text-caption-1-regular text-text-secondary block truncate">
                {appSubtitle}
              </span>
            )}
            <span
              title={orderId || undefined}
              className="text-caption-2-medium text-text-tertiary font-mono block truncate"
            >
              {referenceLabel} #{safeOrderId}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end text-end shrink-0">
          <span className="text-title-1-semibold text-text-primary font-mono tnum whitespace-nowrap leading-tight">
            {isSessionLoading ? '...' : formatBDT(uniqueAmount)}
          </span>
          {offsetCents > 0 && (
            <span className="text-caption-2-medium text-text-tertiary tnum whitespace-nowrap mt-0.5">
              Includes +{formatBDT(offsetCents / 100)} code
            </span>
          )}
        </div>
      </div>

      {highlights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
          {highlights.map((h, idx) => (
            <div
              key={`${h.label}-${idx}`}
              className="px-3 py-2 rounded-xl bg-background-secondary-default border border-separator-border flex items-center justify-between gap-3 text-caption-1-regular"
            >
              <span className="text-text-tertiary whitespace-nowrap shrink-0">{h.label}</span>
              <span className="text-text-primary font-medium truncate text-end min-w-0">
                {h.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
