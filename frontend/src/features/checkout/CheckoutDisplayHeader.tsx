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
  display,
  baseAmount,
  uniqueAmount,
  isSessionLoading = false,
}: CheckoutDisplayHeaderProps) {
  const appTitle = display?.appName || storeName || 'ORBIT Pay';
  const referenceLabel = display?.referenceLabel || 'Order';
  const safeOrderId = orderId || '—';
  const displayAmount = baseAmount > 0 ? baseAmount : uniqueAmount;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="size-9 rounded-xl bg-background-secondary-default border border-border-button-default text-foreground-icon-primary flex items-center justify-center shrink-0">
          <RiLock2Line className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-body-medium text-text-primary truncate block">
            {appTitle}
          </span>
          <span
            title={orderId || undefined}
            className="text-caption-2-medium text-text-tertiary font-mono block truncate"
          >
            {referenceLabel} #{safeOrderId}
          </span>
        </div>
      </div>

      <span className="text-title-1-semibold text-text-primary font-mono tnum whitespace-nowrap shrink-0">
        {isSessionLoading ? '...' : formatBDT(displayAmount)}
      </span>
    </div>
  );
}
