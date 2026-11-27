import { useEffect, useState, type FormEvent } from 'react';
import {
  RiCheckLine,
  RiCheckboxCircleLine,
  RiExternalLinkLine,
  RiGlobalLine,
  RiMailLine,
  RiSparklingLine,
} from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/base/card/card';
import { Input } from '@/components/base/input/input';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { toast } from '@/components/base/toast/toast';
import { OrbitMarketingBar, WhatsAppGlyph } from '@/features/platform/OrbitMarketingBar';
import {
  buildWhatsappHref,
  DEFAULT_PLATFORM_CONFIG,
  type PlatformPublicConfig,
} from '@/features/platform/usePlatformConfig';
import {
  useAdminPlatformSettings,
  useUpdateAdminPlatformSettings,
} from './useAdmin';

export function AdminPlatformSettingsPanel() {
  const { data: settings, isLoading } = useAdminPlatformSettings(true);
  const updateMutation = useUpdateAdminPlatformSettings();

  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappPrefillMessage, setWhatsappPrefillMessage] = useState(
    DEFAULT_PLATFORM_CONFIG.whatsappPrefillMessage,
  );
  const [marketingSiteUrl, setMarketingSiteUrl] = useState(
    DEFAULT_PLATFORM_CONFIG.marketingSiteUrl,
  );
  const [marketingHeadline, setMarketingHeadline] = useState(
    DEFAULT_PLATFORM_CONFIG.marketingHeadline,
  );
  const [marketingCtaLabel, setMarketingCtaLabel] = useState(
    DEFAULT_PLATFORM_CONFIG.marketingCtaLabel,
  );
  const [supportEmail, setSupportEmail] = useState('');
  const [savedJustNow, setSavedJustNow] = useState(false);

  useEffect(() => {
    if (settings) {
      setWhatsappNumber(settings.whatsappNumber || '');
      setWhatsappPrefillMessage(
        settings.whatsappPrefillMessage || DEFAULT_PLATFORM_CONFIG.whatsappPrefillMessage,
      );
      setMarketingSiteUrl(
        settings.marketingSiteUrl || DEFAULT_PLATFORM_CONFIG.marketingSiteUrl,
      );
      setMarketingHeadline(
        settings.marketingHeadline || DEFAULT_PLATFORM_CONFIG.marketingHeadline,
      );
      setMarketingCtaLabel(
        settings.marketingCtaLabel || DEFAULT_PLATFORM_CONFIG.marketingCtaLabel,
      );
      setSupportEmail(settings.supportEmail || '');
    }
  }, [settings]);

  const previewConfig: PlatformPublicConfig = {
    whatsappNumber: whatsappNumber.trim(),
    whatsappPrefillMessage:
      whatsappPrefillMessage.trim() || DEFAULT_PLATFORM_CONFIG.whatsappPrefillMessage,
    marketingSiteUrl:
      marketingSiteUrl.trim() || DEFAULT_PLATFORM_CONFIG.marketingSiteUrl,
    marketingHeadline:
      marketingHeadline.trim() || DEFAULT_PLATFORM_CONFIG.marketingHeadline,
    marketingCtaLabel:
      marketingCtaLabel.trim() || DEFAULT_PLATFORM_CONFIG.marketingCtaLabel,
    supportEmail: supportEmail.trim(),
  };

  const previewWhatsappHref = buildWhatsappHref(
    previewConfig.whatsappNumber,
    previewConfig.whatsappPrefillMessage,
  );

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateMutation.mutateAsync({
        whatsappNumber: whatsappNumber.trim(),
        whatsappPrefillMessage: whatsappPrefillMessage.trim(),
        marketingSiteUrl: marketingSiteUrl.trim(),
        marketingHeadline: marketingHeadline.trim(),
        marketingCtaLabel: marketingCtaLabel.trim(),
        supportEmail: supportEmail.trim(),
      });
      setSavedJustNow(true);
      toast.success('WhatsApp & marketing CTA settings saved', {
        description: 'Live across all payment links, hosted checkouts, and login screens.',
      });
      setTimeout(() => setSavedJustNow(false), 2500);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save platform settings',
      );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-6 w-56 rounded-lg" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary flex items-center justify-center shrink-0">
                <WhatsAppGlyph className="size-5" />
              </div>
              <div>
                <CardTitle>Growth, WhatsApp &amp; orbitsaas.cloud CTA</CardTitle>
                <CardDescription>
                  Global WhatsApp onboarding and promotional strip across public checkout surfaces.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="WhatsApp Business Number (with country code)"
                value={whatsappNumber}
                onChange={setWhatsappNumber}
                placeholder="e.g. +8801712345678"
                hint={
                  previewWhatsappHref
                    ? `Live link: ${previewWhatsappHref.split('?')[0]}`
                    : 'Leave blank to hide the WhatsApp floating pill and route CTAs to orbitsaas.cloud'
                }
                inputClassName="font-mono tabular-nums"
              />

              <Input
                label="Marketing Website URL"
                type="url"
                value={marketingSiteUrl}
                onChange={setMarketingSiteUrl}
                leadingIcon={RiGlobalLine}
                placeholder="https://orbitsaas.cloud"
                inputClassName="font-mono"
              />
            </div>

            <Input
              label="Pre-filled WhatsApp Message"
              value={whatsappPrefillMessage}
              onChange={setWhatsappPrefillMessage}
              placeholder="Hi ORBIT SaaS, I want to set up an automated MFS payment system for my business."
              hint="Automatically pre-filled when a visitor taps the WhatsApp icon on a payment link."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Promotional Headline"
                value={marketingHeadline}
                onChange={setMarketingHeadline}
                leadingIcon={RiSparklingLine}
                placeholder="Automate bKash, Nagad & Rocket payments for your business"
                className="md:col-span-2"
              />

              <Input
                label="CTA Button Label"
                value={marketingCtaLabel}
                onChange={setMarketingCtaLabel}
                placeholder="Setup Automated Payments"
              />
            </div>

            <Input
              label="Support Email (Optional)"
              type="email"
              value={supportEmail}
              onChange={setSupportEmail}
              leadingIcon={RiMailLine}
              placeholder="hello@orbitsaas.cloud"
            />

            {/* Live Preview */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-caption-1-semibold text-text-secondary">
                  Live Payment Page Footer Preview
                </span>
                {previewWhatsappHref && (
                  <a
                    href={previewWhatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-caption-1-medium text-text-primary hover:underline"
                  >
                    <span>Test WhatsApp link</span>
                    <RiExternalLinkLine className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>
              <div className="p-4 rounded-2xl bg-background-secondary-default/70 border border-dashed border-separator-border">
                <OrbitMarketingBar initialConfig={previewConfig} compact />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-caption-2-medium text-text-tertiary">
              Updates propagate immediately across all public checkout pages.
            </span>
            <Button
              type="submit"
              variant="primary"
              size="medium"
              isLoading={updateMutation.isPending}
              leadingIcon={savedJustNow ? RiCheckLine : RiCheckboxCircleLine}
              className="min-h-11 sm:min-h-10 shrink-0"
            >
              {savedJustNow ? 'Saved' : 'Save Growth Settings'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
