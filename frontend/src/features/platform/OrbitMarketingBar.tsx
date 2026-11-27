import { RiArrowRightUpLine, RiShieldCheckLine } from '@remixicon/react';
import { cx } from '@/utils/cx';
import {
  buildWhatsappHref,
  DEFAULT_PLATFORM_CONFIG,
  usePlatformConfig,
  type PlatformPublicConfig,
} from './usePlatformConfig';

export function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.001 2C6.478 2 2 6.477 2 12c0 1.85.504 3.583 1.383 5.071L2 22l5.072-1.331A9.946 9.946 0 0 0 12.001 22c5.522 0 10-4.477 10-10S17.523 2 12.001 2Zm5.847 14.212c-.246.693-1.434 1.325-1.976 1.404-.503.074-1.139.105-1.839-.118-.425-.135-.97-.316-1.667-.618-2.933-1.266-4.849-4.234-4.996-4.43-.147-.195-1.192-1.586-1.192-3.025 0-1.439.754-2.146 1.022-2.439.268-.293.585-.366.78-.366.195 0 .39.002.56.01.18.009.421-.068.659.503.246.591.835 2.036.908 2.183.073.146.122.317.024.512-.098.195-.147.317-.293.488-.146.171-.308.382-.439.512-.147.146-.3.305-.129.598.171.293.76 1.253 1.632 2.031 1.122 1.001 2.068 1.311 2.361 1.457.293.146.464.122.635-.073.171-.195.732-.854.927-1.147.195-.293.39-.244.659-.146.268.098 1.707.805 2 .951.293.146.488.22.561.341.073.122.073.708-.173 1.401Z" />
    </svg>
  );
}

export interface OrbitMarketingBarProps {
  initialConfig?: PlatformPublicConfig | null;
  compact?: boolean;
  className?: string;
}

export function OrbitMarketingBar({
  initialConfig,
  compact = false,
  className,
}: OrbitMarketingBarProps) {
  const { data } = usePlatformConfig(initialConfig);
  const config = data ?? initialConfig ?? DEFAULT_PLATFORM_CONFIG;

  const siteUrl = config.marketingSiteUrl || 'https://orbitsaas.cloud';
  const siteHost = (() => {
    try {
      return new URL(siteUrl).hostname.replace(/^www\./, '');
    } catch {
      return 'orbitsaas.cloud';
    }
  })();

  const whatsappHref = buildWhatsappHref(
    config.whatsappNumber,
    config.whatsappPrefillMessage,
  );

  return (
    <div
      className={cx(
        'w-full rounded-2xl border border-separator-border bg-background-primary-default/80 backdrop-blur-md transition-colors',
        compact ? 'px-3.5 py-2.5' : 'px-4 py-3.5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2.5 min-w-0 flex-1"
        >
          <span
            aria-hidden
            className={cx(
              'rounded-lg bg-text-primary text-background-primary-default flex items-center justify-center shrink-0',
              compact ? 'size-6' : 'size-7',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className={compact ? 'size-3' : 'size-3.5'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            >
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-caption-1-semibold text-text-primary">
              <span className="truncate">{siteHost}</span>
              <RiArrowRightUpLine
                className="size-3.5 text-foreground-icon-tertiary group-hover:text-text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0"
                aria-hidden
              />
            </div>
            <p className="text-caption-2-regular text-text-tertiary truncate">
              {config.marketingHeadline || 'Automate bKash, Nagad & Rocket payments'}
            </p>
          </div>
        </a>

        <div className="shrink-0">
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border-button-default bg-background-secondary-default hover:bg-background-secondary-hover text-caption-1-medium text-text-primary whitespace-nowrap transition-colors"
            >
              <WhatsAppGlyph className="size-3.5 text-[#25D366] shrink-0" />
              <span>{config.marketingCtaLabel || 'Setup on WhatsApp'}</span>
            </a>
          ) : (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border-button-default bg-background-secondary-default hover:bg-background-secondary-hover text-caption-1-medium text-text-primary whitespace-nowrap transition-colors"
            >
              <RiShieldCheckLine className="size-3.5 text-status-lime-text shrink-0" aria-hidden />
              <span>{config.marketingCtaLabel || 'Get ORBIT'}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrbitFloatingWhatsapp({
  initialConfig,
}: {
  initialConfig?: PlatformPublicConfig | null;
}) {
  const { data } = usePlatformConfig(initialConfig);
  const config = data ?? initialConfig ?? DEFAULT_PLATFORM_CONFIG;
  const whatsappHref = buildWhatsappHref(
    config.whatsappNumber,
    config.whatsappPrefillMessage,
  );

  if (!whatsappHref) return null;

  return (
    <a
      href={whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp to set up automated payments for your business"
      title="Setup automated MFS payments for your business on WhatsApp"
      className="fixed bottom-4 end-4 sm:bottom-6 sm:end-6 z-40 inline-flex items-center gap-2 min-h-11 h-11 px-3.5 rounded-full border border-border-button-default bg-background-primary-default/90 backdrop-blur-xl shadow-dropdown hover:border-border-button-hover hover:shadow-md transition-all group"
    >
      <span className="size-7 rounded-full bg-[#25D366]/15 text-[#1CA650] flex items-center justify-center shrink-0">
        <WhatsAppGlyph className="size-4" />
      </span>
      <span className="text-caption-1-medium text-text-primary hidden sm:inline whitespace-nowrap">
        Setup your business
      </span>
    </a>
  );
}
