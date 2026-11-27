import React, { useState, useEffect } from 'react';
import {
  useMerchant,
  useUpdateMerchantSettings,
  useRotateWebhookSecret,
  useTestWebhookPing,
  useMerchantWebhooks,
  useReplayMerchantWebhook,
  type MerchantReceiptPolicy,
  type WebhookDeliveryStatus,
} from './useMerchant';
import type { VerificationMode } from '@/features/checkout/useCheckout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Input, TextField, InputBase } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { Switch } from '@/components/base/switch/switch';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { PillTabList, PillTab } from '@/components/base/tabs/pill-tab';
import { Modal, ModalHeader, ModalFooter } from '@/components/base/modal/modal';
import { Skeleton, SkeletonText } from '@/components/base/skeleton/skeleton';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/base/table/table';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { formatDate } from '@/shared/utils/format';
import {
  RiWebhookLine,
  RiKey2Line,
  RiTimeLine,
  RiSendPlaneLine,
  RiFileCopyLine,
  RiCheckLine,
  RiEyeLine,
  RiEyeOffLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiCodeSSlashLine,
  RiFlashlightLine,
  RiAdminLine,
  RiAppsLine,
  RiSettings3Line,
  RiTelegramLine,
} from '@remixicon/react';

const RECEIPT_POLICY_OPTIONS: Array<{ value: MerchantReceiptPolicy; label: string }> = [
  { value: 'OFFLINE_OPTIONAL', label: 'Optional when phone offline (Recommended)' },
  { value: 'ALWAYS_OPTIONAL', label: 'Always optional for all checkouts' },
  { value: 'ALWAYS_REQUIRED', label: 'Always required (screenshot mandatory)' },
  { value: 'DISABLED', label: 'Disabled (no receipt upload)' },
];

function getDeliveryChip(status: WebhookDeliveryStatus): { label: string; color: ChipColor } {
  switch (status) {
    case 'DELIVERED':
      return { label: 'Delivered', color: 'lime' };
    case 'RETRYING':
      return { label: 'Retrying', color: 'yellow' };
    case 'FAILED':
      return { label: 'Failed', color: 'rose' };
    default:
      return { label: status, color: 'neutral' };
  }
}

export function MerchantSettings() {
  const { data: merchant, isLoading } = useMerchant();
  const updateSettingsMutation = useUpdateMerchantSettings();
  const rotateSecretMutation = useRotateWebhookSecret();
  const testPingMutation = useTestWebhookPing();
  const replayWebhookMutation = useReplayMerchantWebhook();

  const [webhookFilter, setWebhookFilter] = useState<WebhookDeliveryStatus | 'ALL'>('ALL');
  const {
    data: webhooksData,
    isLoading: webhooksLoading,
    refetch: refetchWebhooks,
    isFetching: webhooksFetching,
  } = useMerchantWebhooks(webhookFilter);

  const [storeName, setStoreName] = useState('');
  const [merchantSlug, setMerchantSlug] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [gracePeriod, setGracePeriod] = useState(60);
  const [verificationMode, setVerificationMode] = useState<VerificationMode>('AUTO');
  const [allowBaseAmountFallback, setAllowBaseAmountFallback] = useState(true);
  const [receiptPolicy, setReceiptPolicy] = useState<MerchantReceiptPolicy>('OFFLINE_OPTIONAL');
  const [lateSmsAutoApprove, setLateSmsAutoApprove] = useState(true);

  const [moduleEcommerce, setModuleEcommerce] = useState(true);
  const [modulePhoneOtp, setModulePhoneOtp] = useState(false);
  const [moduleTelegram, setModuleTelegram] = useState(false);

  const [allowedOriginsText, setAllowedOriginsText] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isRotateModalOpen, setIsRotateModalOpen] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  useEffect(() => {
    if (merchant) {
      setStoreName(merchant.storeName);
      setMerchantSlug(merchant.slug || '');
      setWebhookUrl(merchant.webhookUrl);
      setGracePeriod(merchant.gracePeriodMinutes);
      setVerificationMode(merchant.verificationMode ?? 'AUTO');
      setAllowBaseAmountFallback(merchant.allowBaseAmountFallback ?? true);
      setReceiptPolicy(merchant.receiptPolicy ?? 'OFFLINE_OPTIONAL');
      setLateSmsAutoApprove(merchant.lateSmsAutoApprove ?? true);
      setModuleEcommerce(merchant.enabledModules?.ecommerce_fulfillment !== false);
      setModulePhoneOtp(Boolean(merchant.enabledModules?.phone_otp));
      setModuleTelegram(Boolean(merchant.enabledModules?.telegram_alerts));
      setAllowedOriginsText((merchant.allowedCallbackOrigins ?? []).join('\n'));
      setTelegramChatId(merchant.telegramChatId ?? '');
      setTelegramBotToken('');
    }
  }, [merchant]);

  const handleCopySecret = () => {
    if (!merchant) return;
    navigator.clipboard.writeText(merchant.webhookSecret);
    setCopiedSecret(true);
    toast.success('Webhook secret copied');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const parseOriginsList = (raw: string): string[] => {
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedOrigins = parseOriginsList(allowedOriginsText);
      await updateSettingsMutation.mutateAsync({
        storeName,
        ...(merchantSlug.trim() ? { slug: merchantSlug.trim().toLowerCase() } : {}),
        webhookUrl,
        gracePeriodMinutes: Number(gracePeriod),
        verificationMode,
        allowBaseAmountFallback,
        receiptPolicy,
        lateSmsAutoApprove,
        enabledModules: {
          ecommerce_fulfillment: moduleEcommerce,
          phone_otp: modulePhoneOtp,
          telegram_alerts: moduleTelegram,
        },
        allowedCallbackOrigins: parsedOrigins,
        ...(telegramBotToken.trim() ? { telegramBotToken: telegramBotToken.trim() } : {}),
        telegramChatId: telegramChatId.trim() || null,
      });
      setTelegramBotToken('');
      setSavedSuccess(true);
      toast.success('Merchant configuration saved');
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: unknown) {
      console.error('Save failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save configuration');
    }
  };

  const handleTestPing = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Enter and save a webhook URL first to send a test ping');
      return;
    }
    setPingResult(null);
    const start = performance.now();
    try {
      if (merchant && webhookUrl.trim() !== merchant.webhookUrl.trim()) {
        await updateSettingsMutation.mutateAsync({ webhookUrl: webhookUrl.trim() });
      }
      const res = await testPingMutation.mutateAsync(webhookUrl);
      const latency = Math.round(performance.now() - start);
      const ok = res.delivered !== false && res.status !== 'FAILED';
      const message = ok
        ? `HTTP ${res.responseStatus ?? 200} OK — Endpoint verified test HMAC signature.`
        : `Delivery returned HTTP ${res.responseStatus ?? 'error'} (${res.status || 'FAILED'}).`;
      setPingResult({
        success: ok,
        message,
        latency,
      });
      if (ok) {
        toast.success('Webhook test ping succeeded', { description: `${latency}ms latency` });
      } else {
        toast.error('Webhook test ping failed', { description: message });
      }
    } catch (err: unknown) {
      const latency = Math.round(performance.now() - start);
      const message =
        err instanceof Error ? err.message : 'Target endpoint failed to acknowledge test ping.';
      setPingResult({
        success: false,
        message,
        latency,
      });
      toast.error('Webhook test ping failed', { description: message });
    }
  };

  const handleRotateSecret = async () => {
    try {
      await rotateSecretMutation.mutateAsync('WEBHOOK_SECRET');
      setIsRotateModalOpen(false);
      toast.success('Webhook secret rotated', {
        description: 'Update ORBIT_WEBHOOK_SECRET in your storefront environment.',
      });
    } catch (err) {
      console.error('Rotate failed:', err);
      toast.error('Failed to rotate webhook secret');
    }
  };

  const handleGenerateApiKey = async () => {
    try {
      const res = await rotateSecretMutation.mutateAsync('API_KEY');
      if (res.apiKey) {
        setRevealedApiKey(res.apiKey);
      }
      toast.success('Merchant API key generated', {
        description: 'Copy your sk_live_ key now — it will only be shown once.',
      });
    } catch (err) {
      console.error('API key rotation failed:', err);
      toast.error('Failed to generate Merchant API key');
    }
  };

  const handleCopyApiKey = () => {
    if (!revealedApiKey) return;
    navigator.clipboard.writeText(revealedApiKey);
    setCopiedApiKey(true);
    toast.success('Merchant API key copied');
    setTimeout(() => setCopiedApiKey(false), 2000);
  };

  const handleReplay = async (deliveryId: string) => {
    setReplayingId(deliveryId);
    try {
      const res = await replayWebhookMutation.mutateAsync(deliveryId);
      toast.success('Webhook replayed', {
        description: `Status: ${res.status || 'Dispatched'}${res.responseStatus ? ` (HTTP ${res.responseStatus})` : ''}`,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to replay webhook');
    } finally {
      setReplayingId(null);
    }
  };

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading merchant configuration" className="w-full space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-6 w-56 rounded-lg" />
            <SkeletonText lines={3} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-6 w-64 rounded-lg" />
            <SkeletonText lines={4} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const deliveries = webhooksData?.items ?? [];

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center sm:pt-6">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiSettings3Line className="size-5" aria-hidden />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-title-2-medium text-text-primary">
                Storefront &amp; Webhook Settings
              </h2>
              <p className="text-body-regular text-text-secondary">
                Verification engine, active modules, API credentials, and signed webhook delivery.
              </p>
            </div>
          </div>

          <Button
            type="submit"
            form="merchant-settings-form"
            variant="primary"
            size="small"
            isLoading={updateSettingsMutation.isPending}
            className="min-h-11 sm:min-h-10 shrink-0"
          >
            Save configuration
          </Button>
        </CardContent>
      </Card>

      <form id="merchant-settings-form" onSubmit={handleSaveSettings} className="space-y-6">
        {/* Core Store Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiShieldCheckLine className="size-5" aria-hidden />
              </div>
              <div>
                <CardTitle>Merchant Profile &amp; Verification Engine</CardTitle>
                <CardDescription>
                  Business identity, verification strategy, receipt proof rules, and active modules.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input
                label="Business / App display name"
                value={storeName}
                onChange={setStoreName}
                placeholder="e.g. Aurelia Lifestyle BD"
                isRequired
              />

              <Input
                label="Payment Link Handle (Slug)"
                value={merchantSlug}
                onChange={(val) => setMerchantSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="e.g. aurelia-bd"
                hint={`payment.orbitsaas.cloud/${merchantSlug || 'your-brand'}/slug`}
                inputClassName="font-mono"
              />

              <Input
                label="Merchant ID"
                isReadOnly
                value={merchant?.id || ''}
                inputClassName="font-mono text-text-secondary select-all"
              />
            </div>

            {/* Verification Mode Toggle Cards (AUTO vs PURE_MANUAL) */}
            <div className="space-y-2.5">
              <span className="text-body-medium text-text-primary block">
                Payment verification mode
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setVerificationMode('AUTO')}
                  className={cx(
                    'min-h-11 p-4 rounded-2xl border text-start transition-colors cursor-pointer space-y-1.5',
                    verificationMode === 'AUTO'
                      ? 'border-2 border-text-primary bg-background-secondary-default shadow-card'
                      : 'border-border-button-default bg-background-primary-default hover:border-border-button-hover',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-body-medium text-text-primary">
                      <RiFlashlightLine className="size-4 text-status-lime-text" aria-hidden />
                      <span>AUTO (6-Factor SMS + Offline Fallback)</span>
                    </span>
                    <Chip variant="caption" color={verificationMode === 'AUTO' ? 'lime' : 'neutral'}>
                      {verificationMode === 'AUTO' ? 'Selected' : 'Automatic'}
                    </Chip>
                  </div>
                  <p className="text-caption-1-regular text-text-secondary">
                    Instant Android SMS verification with automatic Admin Review fallback when offline.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVerificationMode('PURE_MANUAL')}
                  className={cx(
                    'min-h-11 p-4 rounded-2xl border text-start transition-colors cursor-pointer space-y-1.5',
                    verificationMode === 'PURE_MANUAL'
                      ? 'border-2 border-text-primary bg-background-secondary-default shadow-card'
                      : 'border-border-button-default bg-background-primary-default hover:border-border-button-hover',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-body-medium text-text-primary">
                      <RiAdminLine className="size-4 text-status-yellow-text" aria-hidden />
                      <span>PURE_MANUAL (Admin Review Only)</span>
                    </span>
                    <Chip variant="caption" color={verificationMode === 'PURE_MANUAL' ? 'yellow' : 'neutral'}>
                      {verificationMode === 'PURE_MANUAL' ? 'Selected' : 'Manual'}
                    </Chip>
                  </div>
                  <p className="text-caption-1-regular text-text-secondary">
                    No Android device needed — submissions enter Admin Review for 1-click approval.
                  </p>
                </button>
              </div>
            </div>

            {/* Receipt Policy + Fallback Switches */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Receipt screenshot proof policy"
                selectedKey={receiptPolicy}
                onSelectionChange={(key) => {
                  if (key != null) setReceiptPolicy(String(key) as MerchantReceiptPolicy);
                }}
              >
                {RECEIPT_POLICY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} id={opt.value} textValue={opt.label}>
                    {opt.label}
                  </SelectItem>
                ))}
              </Select>

              <div className="space-y-3 rounded-2xl border border-separator-border bg-background-secondary-default p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <RiTimeLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                    <span className="text-body-medium text-text-primary">
                      Verification grace period
                    </span>
                  </div>
                  <span className="font-mono text-body-medium text-text-primary tabular-nums">
                    {gracePeriod} mins
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Verification grace period in minutes"
                  min="15"
                  max="120"
                  step="5"
                  value={gracePeriod}
                  onChange={(e) => setGracePeriod(Number(e.target.value))}
                  style={{ accentColor: 'var(--color-text-primary)' }}
                  className="w-full cursor-pointer"
                />
                <div className="flex justify-between text-caption-2-medium text-text-tertiary tabular-nums">
                  <span>15m</span>
                  <span>60m</span>
                  <span>120m</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-separator-border bg-background-secondary-default flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-body-medium text-text-primary block">
                    Allow base amount fallback
                  </span>
                  <span className="text-caption-1-regular text-text-secondary">
                    Auto-match base amount when buyer omits poisha code (strict TrxID + sender check).
                  </span>
                </div>
                <Switch
                  aria-label="Allow base amount fallback"
                  isSelected={allowBaseAmountFallback}
                  onChange={setAllowBaseAmountFallback}
                />
              </div>

              <div className="p-4 rounded-2xl border border-separator-border bg-background-secondary-default flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-body-medium text-text-primary block">
                    Late SMS auto-approve
                  </span>
                  <span className="text-caption-1-regular text-text-secondary">
                    Auto-settle escalated payments if the companion SMS arrives after the grace window.
                  </span>
                </div>
                <Switch
                  aria-label="Late SMS auto-approve"
                  isSelected={lateSmsAutoApprove}
                  onChange={setLateSmsAutoApprove}
                />
              </div>
            </div>

            {/* Enabled Modules */}
            <div className="space-y-3 pt-2 border-t border-separator-border">
              <div className="flex items-center gap-2 text-body-medium text-text-primary">
                <RiAppsLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                <span>Enabled Hub Modules</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl border border-separator-border bg-background-secondary-default flex items-center justify-between gap-3">
                  <div>
                    <span className="text-caption-1-semibold text-text-primary block">
                      E-Commerce Orders
                    </span>
                    <span className="text-caption-2-regular text-text-tertiary">
                      COD &amp; shipping sync tab
                    </span>
                  </div>
                  <Switch
                    aria-label="Enable E-Commerce Orders module"
                    isSelected={moduleEcommerce}
                    onChange={setModuleEcommerce}
                  />
                </div>

                <div className="p-3.5 rounded-2xl border border-separator-border bg-background-secondary-default flex items-center justify-between gap-3">
                  <div>
                    <span className="text-caption-1-semibold text-text-primary block">
                      Phone OTP Gateway
                    </span>
                    <span className="text-caption-2-regular text-text-tertiary">
                      Android SIM OTP relay
                    </span>
                  </div>
                  <Switch
                    aria-label="Enable Phone OTP module"
                    isSelected={modulePhoneOtp}
                    onChange={setModulePhoneOtp}
                  />
                </div>

                <div className="p-3.5 rounded-2xl border border-separator-border bg-background-secondary-default flex items-center justify-between gap-3">
                  <div>
                    <span className="text-caption-1-semibold text-text-primary block">
                      Telegram Office Alerts
                    </span>
                    <span className="text-caption-2-regular text-text-tertiary">
                      Instant review alerts
                    </span>
                  </div>
                  <Switch
                    aria-label="Enable Telegram Alerts module"
                    isSelected={moduleTelegram}
                    onChange={setModuleTelegram}
                  />
                </div>
              </div>
            </div>

            {/* Telegram Alerts Config */}
            {moduleTelegram && (
              <div className="p-4 rounded-2xl border border-separator-border bg-background-secondary-default space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-body-medium text-text-primary">
                    <RiTelegramLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                    <span>Telegram Bot Configuration</span>
                  </span>
                  {merchant?.telegramConfigured && (
                    <Chip variant="caption" color="lime">
                      Bot token saved
                    </Chip>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Telegram Bot Token"
                    type="password"
                    value={telegramBotToken}
                    onChange={setTelegramBotToken}
                    placeholder={
                      merchant?.telegramConfigured
                        ? 'Leave blank to keep existing token'
                        : '123456789:ABCdef...'
                    }
                    inputClassName="font-mono"
                  />
                  <Input
                    label="Telegram Chat / Group ID"
                    value={telegramChatId}
                    onChange={setTelegramChatId}
                    placeholder="-1001234567890"
                    inputClassName="font-mono"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Third-Party Storefront Webhooks */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiWebhookLine className="size-5" aria-hidden />
              </div>
              <div>
                <CardTitle>Storefront Webhooks &amp; Callback Origins</CardTitle>
                <CardDescription>
                  When payment verifies or escalates, ORBIT dispatches a signed HTTP POST with{' '}
                  <code className="font-mono text-text-primary">X-Orbit-Signature</code> and{' '}
                  <code className="font-mono text-text-primary">X-Orbit-Signature-V2</code>.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Webhook URL Input */}
            <div className="space-y-2.5">
              <Input
                label="Default webhook callback URL"
                type="url"
                placeholder="https://yourstore.com/api/v1/webhooks/orbit-payment"
                value={webhookUrl}
                onChange={setWebhookUrl}
                hint="Must be publicly accessible HTTPS (SSRF-protected) and exempt from CSRF checks."
              />

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-caption-2-medium text-text-tertiary">Quick presets:</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    setWebhookUrl('https://ecom.orbitsaas.cloud/api/v1/webhooks/orbit-payment')
                  }
                >
                  ecom.orbitsaas.cloud/api/v1/webhooks/orbit-payment
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setWebhookUrl('https://aurelia.shop/payment/v1')}
                >
                  aurelia.shop/payment/v1
                </Button>
              </div>
            </div>

            {/* Allowed Callback Origins */}
            <div className="space-y-1.5">
              <label
                htmlFor="allowed-callback-origins"
                className="text-body-medium text-text-primary block"
              >
                Allowed Per-Intent Callback Origins (Optional)
              </label>
              <textarea
                id="allowed-callback-origins"
                rows={2}
                value={allowedOriginsText}
                onChange={(e) => setAllowedOriginsText(e.target.value)}
                placeholder={'https://ovijatrik.org\nhttps://app.orbitsaas.cloud'}
                className="w-full rounded-2lg border border-border-button-default bg-background-primary-default px-3 py-2 font-mono text-caption-1-regular text-text-primary placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-border-focus-ring"
              />
              <p className="text-caption-2-medium text-text-tertiary">
                Comma or newline separated HTTPS origins allowed to override <code className="font-mono">callbackUrl</code> per payment intent.
              </p>
            </div>

            {/* Live Webhook Ping Action */}
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-separator-border bg-background-secondary-default p-4 sm:flex-row sm:items-center">
              <div>
                <span className="block text-body-medium text-text-primary">
                  Verify endpoint reachability
                </span>
                <span className="text-caption-1-regular text-text-secondary">
                  Dispatches a signed <code className="font-mono">webhook.test</code> event to your saved webhook URL.
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                onClick={handleTestPing}
                isLoading={testPingMutation.isPending}
                leadingIcon={RiSendPlaneLine}
                className="min-h-11 shrink-0"
              >
                Test Webhook
              </Button>
            </div>

            {pingResult && (
              <div
                role="status"
                className={cx(
                  'flex items-center justify-between gap-3 rounded-xl p-3.5 text-body-medium',
                  pingResult.success
                    ? 'bg-notification-success-background text-notification-success-foreground'
                    : 'bg-notification-error-background text-notification-error-foreground',
                )}
              >
                <div className="flex items-center gap-2">
                  {pingResult.success ? (
                    <RiCheckboxCircleLine className="size-5 shrink-0" aria-hidden />
                  ) : (
                    <RiErrorWarningLine className="size-5 shrink-0" aria-hidden />
                  )}
                  <span>{pingResult.message}</span>
                </div>
                {pingResult.latency !== undefined && (
                  <span className="shrink-0 font-mono text-caption-1-medium tabular-nums">
                    {pingResult.latency}ms
                  </span>
                )}
              </div>
            )}

            {/* Server-to-Server Merchant API Key (sk_live_...) */}
            <div className="space-y-2.5 border-t border-separator-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="flex items-center gap-2 text-body-medium text-text-primary">
                    <RiKey2Line className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                    <span>Merchant API Key (Storefront Backend)</span>
                    {merchant?.apiKeyPrefix && (
                      <Chip variant="caption" color="lime" className="font-mono">
                        {merchant.apiKeyPrefix}••••
                      </Chip>
                    )}
                  </span>
                  <span className="text-caption-2-regular text-text-tertiary block mt-0.5">
                    Used by your e-commerce backend (<code className="font-mono">X-Merchant-Api-Key</code>). Distinct from the Android companion <code className="font-mono">dev_key_...</code>.
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={handleGenerateApiKey}
                  isLoading={rotateSecretMutation.isPending}
                  leadingIcon={RiRefreshLine}
                >
                  {merchant?.apiKeyPrefix ? 'Rotate API Key' : 'Generate API Key'}
                </Button>
              </div>

              {revealedApiKey && (
                <div className="rounded-2xl border border-separator-border bg-notification-success-background p-3.5 text-notification-success-foreground space-y-2">
                  <span className="text-caption-1-semibold block">
                    New Merchant API Key — Copy &amp; Save Now (Shown Once)
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      isReadOnly
                      aria-label="New Merchant API Key"
                      value={revealedApiKey}
                      className="flex-1"
                      inputClassName="font-mono text-caption-1-medium select-all"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="medium"
                      onClick={handleCopyApiKey}
                      leadingIcon={copiedApiKey ? RiCheckLine : RiFileCopyLine}
                      className="shrink-0"
                    >
                      {copiedApiKey ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Webhook Secret Key */}
            <div className="space-y-2.5 border-t border-separator-border pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-body-medium text-text-primary">
                  <RiKey2Line className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                  <span>HMAC-SHA256 webhook secret</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  onClick={() => setIsRotateModalOpen(true)}
                  isLoading={rotateSecretMutation.isPending}
                  leadingIcon={RiRefreshLine}
                  className="text-text-destructive"
                >
                  Rotate secret
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <TextField
                  isReadOnly
                  value={merchant?.webhookSecret || ''}
                  aria-label="HMAC-SHA256 webhook secret"
                  inputClassName="font-mono text-caption-1-medium select-all"
                  className="flex-1"
                >
                  <InputBase
                    type={showSecret ? 'text' : 'password'}
                    trailingAddon={
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        iconOnly
                        leadingIcon={showSecret ? RiEyeOffLine : RiEyeLine}
                        aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                        onClick={() => setShowSecret((prev) => !prev)}
                      />
                    }
                  />
                </TextField>

                <Button
                  type="button"
                  variant="secondary"
                  size="medium"
                  onClick={handleCopySecret}
                  leadingIcon={copiedSecret ? RiCheckLine : RiFileCopyLine}
                  className="shrink-0"
                >
                  {copiedSecret ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-caption-2-medium text-text-tertiary">
                Store this secret securely in your server environment as <code className="font-mono text-text-primary">ORBIT_WEBHOOK_SECRET</code>.
              </p>
            </div>
          </CardContent>

          <CardFooter>
            <div className="flex items-center gap-2">
              {savedSuccess && (
                <span className="flex items-center gap-1.5 text-caption-1-medium text-notification-success-foreground">
                  <RiCheckboxCircleLine className="size-4 shrink-0" aria-hidden />
                  <span>Settings saved successfully</span>
                </span>
              )}
            </div>
            <Button
              type="submit"
              variant="primary"
              isLoading={updateSettingsMutation.isPending}
              className="min-h-11"
            >
              Save configuration
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Webhook Deliveries & Replay Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Webhook Deliveries &amp; Replay</CardTitle>
              <CardDescription>
                Inspect outbound attempts and replay failed signed deliveries.
              </CardDescription>
            </div>
            <Button
              variant="secondary"
              size="small"
              leadingIcon={RiRefreshLine}
              isLoading={webhooksFetching}
              onClick={() => refetchWebhooks()}
              className="min-h-11 sm:min-h-10 shrink-0"
            >
              Refresh
            </Button>
          </div>

          <div className="pt-3">
            <PillTabList aria-label="Filter webhook deliveries" className="flex-wrap">
              {(['ALL', 'DELIVERED', 'FAILED', 'RETRYING'] as const).map((st) => (
                <PillTab
                  key={st}
                  variant="gray"
                  isSelected={webhookFilter === st}
                  onSelect={() => setWebhookFilter(st)}
                >
                  {st === 'ALL' ? 'All deliveries' : st.charAt(0) + st.slice(1).toLowerCase()}
                </PillTab>
              ))}
            </PillTabList>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-2">
          {webhooksLoading ? (
            <div className="space-y-2.5 px-6 pb-4">
              {Array.from({ length: 3 }, (_, idx) => (
                <Skeleton key={idx} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <div className="px-6 py-10 text-center text-caption-1-regular text-text-secondary">
              No webhook delivery attempts recorded yet. Use &quot;Test Webhook&quot; above to verify connectivity.
            </div>
          ) : (
            <Table aria-label="Webhook delivery attempts">
              <TableHeader>
                <TableColumn isRowHeader>Event &amp; Ref</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>HTTP</TableColumn>
                <TableColumn>Attempts</TableColumn>
                <TableColumn>Last Attempt</TableColumn>
                <TableColumn className="text-end">Replay</TableColumn>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => {
                  const chip = getDeliveryChip(d.status);
                  return (
                    <TableRow key={d.id} id={d.id}>
                      <TableCell>
                        <div className="space-y-0.5 min-w-0">
                          <span
                            title={d.eventType}
                            className="font-mono text-caption-1-semibold text-text-primary block truncate max-w-[200px]"
                          >
                            {d.eventType}
                          </span>
                          <span
                            title={d.externalOrderId}
                            className="font-mono text-caption-2-regular text-text-tertiary block truncate max-w-[200px]"
                          >
                            {d.externalOrderId}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip variant="caption" color={chip.color}>
                          {chip.label}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-caption-1-medium text-text-primary tabular-nums tnum whitespace-nowrap">
                          {d.responseStatus ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-caption-1-regular text-text-secondary tabular-nums tnum whitespace-nowrap">
                          {d.attemptCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-caption-2-regular text-text-secondary tabular-nums tnum whitespace-nowrap">
                          {formatDate(d.lastAttemptAt)}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="shrink-0 flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="xs"
                            leadingIcon={RiRefreshLine}
                            isLoading={replayingId === d.id}
                            onClick={() => handleReplay(d.id)}
                          >
                            Replay
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Integration Code Snippet Helper Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiCodeSSlashLine className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle>Client storefront verification code (Hono / Node.js)</CardTitle>
              <CardDescription>
                Paste this middleware into your backend webhook endpoint to verify ORBIT callbacks.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-2xl border border-separator-border bg-background-secondary-default p-4 font-mono text-caption-1-regular leading-relaxed text-text-primary select-all">
{`import { Context, Next } from 'hono';

export async function verifyOrbitSignature(c: Context, next: Next) {
  const signature = c.req.header('x-orbit-signature');
  const rawBody = await c.req.text();
  const secret = process.env.ORBIT_WEBHOOK_SECRET || '';

  if (!signature) return c.json({ error: 'Missing X-Orbit-Signature' }, 401);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );

  const match = signature.match(/.{1,2}/g) || [];
  const sigBytes = new Uint8Array(match.map(b => parseInt(b, 16)));
  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(rawBody));

  if (!isValid) return c.json({ error: 'Invalid HMAC signature' }, 401);

  c.set('webhookPayload', JSON.parse(rawBody));
  await next();
}`}
          </pre>
        </CardContent>
      </Card>

      {/* Rotate Webhook Secret Confirmation Dialog */}
      <Modal
        isOpen={isRotateModalOpen}
        onOpenChange={(open) => {
          if (!open && !rotateSecretMutation.isPending) {
            setIsRotateModalOpen(false);
          }
        }}
        size="sm"
        role="alertdialog"
        isDismissable={false}
      >
        <ModalHeader
          icon={RiErrorWarningLine}
          tone="danger"
          showCloseButton={false}
          title="Rotate webhook secret"
          description="Any storefront currently using the previous secret will fail HMAC signature verification until you update ORBIT_WEBHOOK_SECRET."
        />
        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={rotateSecretMutation.isPending}
            onClick={() => setIsRotateModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            isLoading={rotateSecretMutation.isPending}
            onClick={handleRotateSecret}
          >
            Rotate secret
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
