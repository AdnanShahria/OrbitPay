import React, { useState, useEffect } from 'react';
import {
  useMerchant,
  useUpdateMerchantSettings,
  useRotateWebhookSecret,
  useTestWebhookPing,
} from './useMerchant';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Input, TextField, InputBase } from '@/components/base/input/input';
import { Modal, ModalHeader, ModalFooter } from '@/components/base/modal/modal';
import { Skeleton, SkeletonText } from '@/components/base/skeleton/skeleton';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
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
} from '@remixicon/react';

export function MerchantSettings() {
  const { data: merchant, isLoading } = useMerchant();
  const updateSettingsMutation = useUpdateMerchantSettings();
  const rotateSecretMutation = useRotateWebhookSecret();
  const testPingMutation = useTestWebhookPing();

  const [storeName, setStoreName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [gracePeriod, setGracePeriod] = useState(60);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isRotateModalOpen, setIsRotateModalOpen] = useState(false);

  useEffect(() => {
    if (merchant) {
      setStoreName(merchant.storeName);
      setWebhookUrl(merchant.webhookUrl);
      setGracePeriod(merchant.gracePeriodMinutes);
    }
  }, [merchant]);

  const handleCopySecret = () => {
    if (!merchant) return;
    navigator.clipboard.writeText(merchant.webhookSecret);
    setCopiedSecret(true);
    toast.success('Webhook secret copied');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettingsMutation.mutateAsync({
        storeName,
        webhookUrl,
        gracePeriodMinutes: Number(gracePeriod),
      });
      setSavedSuccess(true);
      toast.success('Merchant configuration saved');
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Failed to save configuration');
    }
  };

  const handleTestPing = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Enter a webhook URL first to send a test ping');
      return;
    }
    setPingResult(null);
    const start = performance.now();
    try {
      await testPingMutation.mutateAsync(webhookUrl);
      const latency = Math.round(performance.now() - start);
      const message = 'HTTP 200 OK — Endpoint verified test HMAC signature.';
      setPingResult({
        success: true,
        message,
        latency,
      });
      toast.success('Webhook test ping succeeded', { description: `${latency}ms latency` });
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

  return (
    <div className="w-full space-y-6">
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Core Store Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiShieldCheckLine className="size-5" aria-hidden />
              </div>
              <div>
                <CardTitle>E-commerce store profile</CardTitle>
                <CardDescription>
                  Configure your store identification and operational parameters.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Store business name"
                value={storeName}
                onChange={setStoreName}
                placeholder="e.g. Aurelia Lifestyle BD"
                isRequired
              />

              <Input
                label="Merchant ID"
                isReadOnly
                value={merchant?.id || ''}
                inputClassName="font-mono text-text-secondary select-all"
              />
            </div>

            {/* Grace Period Setting */}
            <div className="space-y-3 rounded-2xl border border-separator-border bg-background-secondary-default p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RiTimeLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                  <span className="text-body-medium text-text-primary">
                    Verification grace period
                  </span>
                </div>
                <span className="font-mono text-body-medium text-text-primary tabular-nums">
                  {gracePeriod} minutes
                </span>
              </div>
              <p className="text-caption-1-regular text-text-secondary">
                Duration ORBIT holds a customer checkout order in the verification queue waiting for matching SMS from your phone.
              </p>
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
                <span>15 mins (Strict)</span>
                <span>60 mins (Recommended)</span>
                <span>120 mins (Extended)</span>
              </div>
            </div>
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
                <CardTitle>Third-party storefront webhook</CardTitle>
                <CardDescription>
                  When payment verifies, ORBIT dispatches an authenticated HTTP POST with signature header <code className="font-mono text-text-primary">X-Orbit-Signature</code>.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Webhook URL Input */}
            <div className="space-y-2.5">
              <Input
                label="Custom callback endpoint URL (Optional)"
                type="url"
                placeholder="https://yourstore.com/payment/v1"
                value={webhookUrl}
                onChange={setWebhookUrl}
                hint="Optional while testing. When configured, must be publicly accessible HTTPS and exempt from CSRF checks."
              />

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-caption-2-medium text-text-tertiary">Quick presets:</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setWebhookUrl('https://aurelia.shop/payment/v1')}
                >
                  aurelia.shop/payment/v1
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setWebhookUrl('https://newznbd.shop/payment/v1')}
                >
                  newznbd.shop/payment/v1
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setWebhookUrl('https://ecom.orbitsaas.cloud/api/v1/webhooks/orbit-payment')}
                >
                  ecom.orbitsaas.cloud/...
                </Button>
              </div>
            </div>

            {/* Live Webhook Ping Action */}
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-separator-border bg-background-secondary-default p-4 sm:flex-row sm:items-center">
              <div>
                <span className="block text-body-medium text-text-primary">
                  Verify endpoint reachability
                </span>
                <span className="text-caption-1-regular text-text-secondary">
                  Sends an empty ping signed with your HMAC secret to ensure zero delivery failures.
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="medium"
                onClick={handleTestPing}
                isLoading={testPingMutation.isPending}
                leadingIcon={RiSendPlaneLine}
                className="shrink-0"
              >
                Send test ping
              </Button>
            </div>

            {pingResult && (
              <div
                role="status"
                className={cx(
                  'flex items-center justify-between gap-3 rounded-xl p-3.5 text-body-medium',
                  pingResult.success
                    ? 'bg-notification-success-background text-notification-success-foreground'
                    : 'bg-notification-error-background text-notification-error-foreground'
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
            >
              Save configuration
            </Button>
          </CardFooter>
        </Card>
      </form>

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
                Paste this middleware into your e-commerce backend (e.g. at <code className="font-mono text-text-primary">/payment/v1</code>) to verify ORBIT callbacks.
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
  const secret = process.env.ORBIT_WEBHOOK_SECRET;

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
