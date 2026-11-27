import { useQuery } from '@tanstack/react-query';
import { unwrapApiResponse } from '@/shared/utils/api';

export interface PlatformPublicConfig {
  whatsappNumber: string;
  whatsappPrefillMessage: string;
  marketingSiteUrl: string;
  marketingHeadline: string;
  marketingCtaLabel: string;
  supportEmail: string;
  updatedAt?: string;
}

export const DEFAULT_PLATFORM_CONFIG: PlatformPublicConfig = {
  whatsappNumber: '',
  whatsappPrefillMessage:
    'Hi ORBIT SaaS, I want to set up an automated bKash/Nagad/Rocket payment system for my business.',
  marketingSiteUrl: 'https://orbitsaas.cloud',
  marketingHeadline: 'Automate bKash, Nagad & Rocket payments for your business',
  marketingCtaLabel: 'Setup Automated Payments',
  supportEmail: '',
};

export function buildWhatsappHref(
  rawNumber?: string | null,
  prefillMessage?: string | null,
): string | null {
  const digits = (rawNumber || '').replace(/\D/g, '');
  if (!digits || digits.length < 6) return null;
  const text = (prefillMessage || DEFAULT_PLATFORM_CONFIG.whatsappPrefillMessage).trim();
  const qs = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${qs}`;
}

export function usePlatformConfig(initialData?: PlatformPublicConfig | null) {
  return useQuery<PlatformPublicConfig>({
    queryKey: ['public', 'platform-config'],
    queryFn: async () => {
      const res = await fetch('/api/v1/public/platform-config', { cache: 'no-store' });
      return unwrapApiResponse<PlatformPublicConfig>(
        res,
        'Failed to load platform configuration',
      );
    },
    initialData: initialData ?? undefined,
    staleTime: 30_000,
    retry: 1,
  });
}
