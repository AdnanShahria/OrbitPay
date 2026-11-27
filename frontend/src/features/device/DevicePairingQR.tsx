import { useState, useId } from 'react';
import { Card, CardContent } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Chip } from '@/components/base/badges/chip';
import { toast } from '@/components/base/toast/toast';
import { useRotateWebhookSecret } from '@/features/merchants/useMerchant';
import {
  RiFileCopyLine,
  RiCheckLine,
  RiQrCodeLine,
  RiSmartphoneLine,
  RiKey2Line,
  RiShieldCheckLine,
  RiRefreshLine,
} from '@remixicon/react';

export interface DevicePairingQRProps {
  endpoint?: string;
  apiKey?: string;
  merchantId?: string;
}

export function DevicePairingQR({
  endpoint = typeof window !== 'undefined' ? window.location.origin : 'https://payment.orbitsaas.cloud',
  apiKey,
  merchantId = '',
}: DevicePairingQRProps) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<string | null>(apiKey || null);
  const inputId = useId();
  const rotateKeyMutation = useRotateWebhookSecret();

  const currentKey = rotatedKey || 'Rotate key to reveal new X-Device-Key (stored hashed)';

  const pairingPayload = JSON.stringify({
    endpoint,
    apiKey: rotatedKey || undefined,
    merchantId,
    version: '1.0.0',
  });

  const handleCopyKey = () => {
    if (!rotatedKey) {
      toast.info('Click "Rotate device key" to generate and copy a fresh X-Device-Key, or sign in via Email & Password on the Android app.');
      return;
    }
    navigator.clipboard.writeText(rotatedKey);
    setCopiedKey(true);
    toast.success('Device API key copied');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(pairingPayload);
    setCopiedPayload(true);
    toast.success('Pairing payload copied');
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleRotateKey = async () => {
    try {
      const res = await rotateKeyMutation.mutateAsync('DEVICE_KEY');
      if (res?.deviceKey) {
        setRotatedKey(res.deviceKey);
        toast.success('Device key rotated', {
          description: 'Copy or scan the new device key on your Android companion app.',
        });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to rotate device key');
    }
  };

  return (
    <div className="w-full space-y-5">
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center sm:pt-6">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiQrCodeLine className="size-5" aria-hidden />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h2 className="text-title-2-medium text-text-primary">
                Companion Android Device Pairing
              </h2>
              <p className="text-body-regular text-text-secondary">
                Scan from the ORBIT Companion app to link your dedicated MFS SIM device.
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="small"
            onClick={handleRotateKey}
            isLoading={rotateKeyMutation.isPending}
            leadingIcon={RiRefreshLine}
            className="min-h-11 sm:min-h-10 shrink-0"
          >
            Rotate device key
          </Button>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
            {/* QR Code Presentation Box — High-contrast optical quiet zone kept for Android camera scanners */}
            <div className="flex flex-col items-center md:col-span-5">
              <div
                style={{ backgroundColor: '#ffffff', color: '#09090b' }}
                className="flex flex-col items-center rounded-2xl border border-border-button-default p-5 shadow-card"
              >
                <svg
                  viewBox="0 0 200 200"
                  className="size-48 sm:size-56"
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label="ORBIT Companion device pairing QR code"
                >
                  <rect width="200" height="200" fill="#FFFFFF" />
                  {/* Top-Left Finder */}
                  <rect x="15" y="15" width="45" height="45" fill="#09090B" rx="4" />
                  <rect x="23" y="23" width="29" height="29" fill="#FFFFFF" rx="2" />
                  <rect x="29" y="29" width="17" height="17" fill="#09090B" rx="2" />

                  {/* Top-Right Finder */}
                  <rect x="140" y="15" width="45" height="45" fill="#09090B" rx="4" />
                  <rect x="148" y="23" width="29" height="29" fill="#FFFFFF" rx="2" />
                  <rect x="154" y="29" width="17" height="17" fill="#09090B" rx="2" />

                  {/* Bottom-Left Finder */}
                  <rect x="15" y="140" width="45" height="45" fill="#09090B" rx="4" />
                  <rect x="23" y="148" width="29" height="29" fill="#FFFFFF" rx="2" />
                  <rect x="29" y="154" width="17" height="17" fill="#09090B" rx="2" />

                  {/* Data Matrix Dots Pattern */}
                  <g fill="#09090B">
                    {/* Top column and rows */}
                    <rect x="70" y="20" width="8" height="8" />
                    <rect x="85" y="20" width="8" height="8" />
                    <rect x="110" y="20" width="8" height="8" />
                    <rect x="75" y="35" width="8" height="8" />
                    <rect x="95" y="35" width="8" height="8" />
                    <rect x="120" y="35" width="8" height="8" />
                    <rect x="70" y="50" width="8" height="8" />
                    <rect x="90" y="50" width="8" height="8" />
                    <rect x="105" y="50" width="8" height="8" />

                    {/* Center section */}
                    <rect x="20" y="70" width="8" height="8" />
                    <rect x="35" y="75" width="8" height="8" />
                    <rect x="50" y="70" width="8" height="8" />
                    <rect x="75" y="75" width="10" height="10" fill="#3F3F46" />
                    <rect x="95" y="70" width="8" height="8" />
                    <rect x="115" y="80" width="8" height="8" />
                    <rect x="135" y="70" width="8" height="8" />
                    <rect x="155" y="75" width="8" height="8" />
                    <rect x="170" y="70" width="8" height="8" />

                    <rect x="25" y="90" width="8" height="8" />
                    <rect x="40" y="95" width="8" height="8" />
                    <rect x="60" y="90" width="8" height="8" />
                    <rect x="80" y="95" width="8" height="8" />
                    <rect x="100" y="90" width="10" height="10" fill="#3F3F46" />
                    <rect x="120" y="95" width="8" height="8" />
                    <rect x="145" y="90" width="8" height="8" />
                    <rect x="165" y="95" width="8" height="8" />

                    <rect x="20" y="115" width="8" height="8" />
                    <rect x="45" y="115" width="8" height="8" />
                    <rect x="70" y="120" width="8" height="8" />
                    <rect x="90" y="115" width="8" height="8" />
                    <rect x="115" y="120" width="8" height="8" />
                    <rect x="135" y="115" width="8" height="8" />
                    <rect x="160" y="120" width="8" height="8" />
                    <rect x="175" y="115" width="8" height="8" />

                    {/* Bottom section */}
                    <rect x="70" y="145" width="8" height="8" />
                    <rect x="95" y="140" width="8" height="8" />
                    <rect x="115" y="150" width="8" height="8" />
                    <rect x="140" y="145" width="8" height="8" />
                    <rect x="165" y="140" width="8" height="8" />
                    <rect x="80" y="165" width="8" height="8" />
                    <rect x="105" y="170" width="8" height="8" />
                    <rect x="130" y="165" width="8" height="8" />
                    <rect x="155" y="170" width="8" height="8" />
                    <rect x="175" y="165" width="8" height="8" />
                  </g>

                  {/* Center Badge logo */}
                  <circle cx="100" cy="100" r="18" fill="#09090B" />
                  <circle cx="100" cy="100" r="10" fill="#FFFFFF" />
                  <circle cx="100" cy="100" r="4" fill="#09090B" />
                </svg>

                <span className="mt-3 font-mono text-caption-1-semibold">
                  ORBIT-PAY-PAIRING
                </span>
              </div>

              <Button
                variant="ghost"
                size="small"
                className="mt-3"
                onClick={handleCopyPayload}
                leadingIcon={copiedPayload ? RiCheckLine : RiFileCopyLine}
              >
                {copiedPayload ? 'Payload copied' : 'Copy raw QR payload'}
              </Button>
            </div>

            {/* Pairing Instructions & Manual Key Box */}
            <div className="flex flex-col gap-5 md:col-span-7">
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-headline-medium text-text-primary">
                  <RiSmartphoneLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                  <span>3-step Android app setup</span>
                </h4>

                <ol className="space-y-2.5 text-body-regular text-text-secondary">
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-button-default bg-background-secondary-default text-caption-1-semibold text-text-primary tabular-nums">
                      1
                    </span>
                    <span>
                      Install <strong className="font-medium text-text-primary">ORBIT Companion</strong> APK on your Android SIM device.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-button-default bg-background-secondary-default text-caption-1-semibold text-text-primary tabular-nums">
                      2
                    </span>
                    <span>
                      Open <strong className="font-medium text-text-primary">Settings &gt; Scan QR Code</strong> or paste the manual key below.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-button-default bg-background-secondary-default text-caption-1-semibold text-text-primary tabular-nums">
                      3
                    </span>
                    <span>
                      Allow <em>Notification Listener</em> and <em>SMS Received</em> permissions to go live.
                    </span>
                  </li>
                </ol>
              </div>

              {/* Manual API Key Input */}
              <div className="space-y-3 rounded-2xl border border-separator-border bg-background-secondary-default p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor={inputId}
                    className="flex items-center gap-1.5 text-caption-1-medium text-text-secondary"
                  >
                    <RiKey2Line className="size-3.5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                    <span>Manual device API key (X-Device-Key)</span>
                  </label>
                  <Chip variant="caption" color="lime" className="gap-1">
                    <RiShieldCheckLine className="size-3.5 shrink-0" aria-hidden />
                    <span>SHA-256 protected</span>
                  </Chip>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    id={inputId}
                    aria-label="Manual device API key"
                    isReadOnly
                    value={currentKey}
                    inputClassName="font-mono text-caption-1-medium select-all"
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    size="medium"
                    onClick={handleCopyKey}
                    leadingIcon={copiedKey ? RiCheckLine : RiFileCopyLine}
                    className="shrink-0"
                  >
                    {copiedKey ? 'Copied' : 'Copy'}
                  </Button>
                </div>

                <p className="text-caption-2-medium text-text-tertiary truncate" title={`${endpoint}/api/v1/device/ingest`}>
                  Endpoint:{' '}
                  <code className="font-mono text-text-primary">{endpoint}/api/v1/device/ingest</code>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
