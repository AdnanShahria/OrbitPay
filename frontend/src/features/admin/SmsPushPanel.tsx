import { useState, type FormEvent } from 'react';
import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiErrorWarningLine,
  RiFlashlightLine,
  RiKey2Line,
  RiMailLine,
  RiMessage2Line,
  RiPulseLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiSmartphoneLine,
  RiStore2Line,
  RiTimeLine,
} from '@remixicon/react';
import { Badge } from '@/components/base/badges/badge';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { Button } from '@/components/base/buttons/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/base/card/card';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { toast } from '@/components/base/toast/toast';
import { formatDate } from '@/shared/utils/format';
import { cx } from '@/utils/cx';
import {
  type MessagingAttempt,
  type MessagingProviderCapability,
  type TestPushResponse,
  type TestSmsResponse,
  useAdminMessagingStatus,
  useAdminProjects,
  useSendTestPush,
  useSendTestSms,
} from './useAdmin';

interface ProviderMeta {
  label: string;
  channel: string;
  hint: string;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  bulksmsbd: {
    label: 'BulkSMSBD',
    channel: 'SMS gateway',
    hint: 'Primary BD local SMS route (BULKSMSBD_API_KEY + BULKSMSBD_SENDER_ID)',
  },
  ssl_wireless: {
    label: 'SSL Wireless',
    channel: 'SMS gateway',
    hint: 'Enterprise BD SMS failover (SSL_WIRELESS_API_TOKEN + SSL_WIRELESS_SID)',
  },
  twilio: {
    label: 'Twilio',
    channel: 'SMS gateway',
    hint: 'Global programmable SMS fallback (TWILIO_ACCOUNT_SID + AUTH_TOKEN + FROM)',
  },
  fcm: {
    label: 'Firebase Cloud Messaging',
    channel: 'Push (HTTP v1)',
    hint: 'Android companion push alerts (FCM_SERVICE_ACCOUNT_JSON)',
  },
  custom_webhook: {
    label: 'Custom SMS Webhook',
    channel: 'Webhook bridge',
    hint: 'Self-hosted SMS/push relay (CUSTOM_SMS_WEBHOOK_URL)',
  },
};

const DEFAULT_PROVIDER_IDS = [
  'bulksmsbd',
  'ssl_wireless',
  'twilio',
  'fcm',
  'custom_webhook',
] as const;

const EMAIL_PROVIDER_META: Record<string, ProviderMeta> = {
  resend: {
    label: 'Resend',
    channel: 'Email OTP',
    hint: 'Transactional email API (RESEND_API_KEY)',
  },
  brevo: {
    label: 'Brevo',
    channel: 'Email OTP',
    hint: 'Brevo SMTP API (BREVO_API_KEY)',
  },
  sendpulse: {
    label: 'SendPulse',
    channel: 'Email OTP',
    hint: 'SendPulse OAuth2 email relay (SENDPULSE_CLIENT_ID + SECRET)',
  },
  aws_ses: {
    label: 'Amazon SES',
    channel: 'Email OTP',
    hint: 'AWS SES v2 SigV4 (AWS_SES_ACCESS_KEY_ID + SECRET_ACCESS_KEY)',
  },
  sendgrid: {
    label: 'SendGrid',
    channel: 'Email OTP',
    hint: 'SendGrid v3 Mail Send (SENDGRID_API_KEY)',
  },
  cloudflare: {
    label: 'Cloudflare Email',
    channel: 'Email OTP',
    hint: 'Workers SEND_EMAIL binding / MailChannels API',
  },
  apps_script: {
    label: 'Google Apps Script',
    channel: 'Email OTP',
    hint: 'Free Gmail relay via Apps Script (APPS_SCRIPT_EMAIL_URL)',
  },
  custom_webhook: {
    label: 'Custom Email Webhook',
    channel: 'Email webhook',
    hint: 'Self-hosted email relay (CUSTOM_EMAIL_WEBHOOK_URL)',
  },
};

const DEFAULT_EMAIL_PROVIDER_IDS = [
  'resend',
  'brevo',
  'sendpulse',
  'aws_ses',
  'sendgrid',
  'cloudflare',
  'apps_script',
  'custom_webhook',
] as const;

function getProviderMeta(id: string): ProviderMeta {
  return (
    PROVIDER_META[id] ?? {
      label: id,
      channel: 'Messaging',
      hint: 'Configured messaging provider',
    }
  );
}

function getEmailProviderMeta(id: string): ProviderMeta {
  return (
    EMAIL_PROVIDER_META[id] ?? {
      label: id,
      channel: 'Email OTP',
      hint: 'Configured email fallback provider',
    }
  );
}

function getProviderState(
  cap: MessagingProviderCapability,
  activeProviderId: string | null,
): { label: string; color: ChipColor; dot: 'green' | 'yellow' | null } {
  if (!cap.configured) {
    return { label: 'Unconfigured', color: 'neutral', dot: null };
  }
  if (cap.inCooldown) {
    return { label: 'Cooldown', color: 'yellow', dot: 'yellow' };
  }
  if (cap.provider === activeProviderId) {
    return { label: 'Active primary', color: 'lime', dot: 'green' };
  }
  return { label: 'Ready', color: 'cyan', dot: 'green' };
}

export function SmsPushPanel() {
  const {
    data: status,
    isLoading,
    isFetching,
    refetch,
  } = useAdminMessagingStatus(true);
  const { data: projects = [], isLoading: projectsLoading } = useAdminProjects(true);

  const testSmsMutation = useSendTestSms();
  const testPushMutation = useSendTestPush();

  // Test SMS state
  const [smsTo, setSmsTo] = useState('');
  const [smsMessage, setSmsMessage] = useState(
    'ORBIT Payment Hub test SMS: messaging router check.',
  );
  const [smsResult, setSmsResult] = useState<TestSmsResponse | null>(null);
  const [smsFormError, setSmsFormError] = useState<string | null>(null);

  // Test Push state
  const [pushMerchantId, setPushMerchantId] = useState('');
  const [pushTitle, setPushTitle] = useState('ORBIT Test Alert');
  const [pushBody, setPushBody] = useState(
    'Instant push delivery check (Self-Hosted WS + FCM) from Root Admin Hub.',
  );
  const [pushResult, setPushResult] = useState<TestPushResponse | null>(null);
  const [pushFormError, setPushFormError] = useState<string | null>(null);

  const providers: MessagingProviderCapability[] = status?.sms?.length
    ? status.sms
    : DEFAULT_PROVIDER_IDS.map((provider, index) => ({
        provider,
        configured: false,
        priority: index + 1,
        inCooldown: false,
      }));

  const emailProviders: MessagingProviderCapability[] = status?.email?.length
    ? status.email
    : DEFAULT_EMAIL_PROVIDER_IDS.map((provider, index) => ({
        provider,
        configured: false,
        priority: index + 1,
        inCooldown: false,
      }));

  const activeSmsProvider =
    providers.find((p) => p.provider !== 'fcm' && p.configured && !p.inCooldown)
      ?.provider ?? null;

  const configuredEmailCount = emailProviders.filter((p) => p.configured).length;
  const activeEmailProvider =
    emailProviders.find((p) => p.configured && !p.inCooldown)?.provider ?? null;

  const selfHostedWsConfigured = Boolean(status?.push?.selfHostedWsConfigured);
  const fcmV1Configured = Boolean(status?.push?.fcmV1Configured);
  const fallbackPollingSec = status?.push?.fallbackPollingIntervalSec ?? 60;

  const pushChipColor: ChipColor = selfHostedWsConfigured
    ? 'lime'
    : fcmV1Configured
      ? 'cyan'
      : 'yellow';
  const pushDotColor: 'green' | 'yellow' =
    selfHostedWsConfigured || fcmV1Configured ? 'green' : 'yellow';
  const pushChipLabel = selfHostedWsConfigured
    ? '$0 Free · <1s'
    : fcmV1Configured
      ? 'FCM v1 active'
      : 'Polling fallback';

  const sentLast24h = status?.otp?.sentLast24h ?? 0;
  const verifiedLast24h = status?.otp?.verifiedLast24h ?? 0;
  const verifyRate =
    sentLast24h > 0 ? Math.round((verifiedLast24h / sentLast24h) * 100) : 0;

  const handleSendTestSms = async (e: FormEvent) => {
    e.preventDefault();
    if (testSmsMutation.isPending) return;

    const to = smsTo.trim();
    const message = smsMessage.trim();
    if (to.length < 6) {
      setSmsFormError('Enter a valid recipient phone number (e.g. 01712345678).');
      return;
    }
    if (!message) {
      setSmsFormError('Message text cannot be empty.');
      return;
    }

    setSmsFormError(null);
    setSmsResult(null);

    try {
      const res = await testSmsMutation.mutateAsync({ to, message });
      setSmsResult(res);
      if (res.dispatched) {
        toast.success(`Test SMS dispatched via ${res.provider || 'router'}`);
      } else {
        toast.error('Test SMS failed across all configured providers');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test SMS dispatch failed';
      setSmsFormError(msg);
      toast.error(msg);
    }
  };

  const handleSendTestPush = async (e: FormEvent) => {
    e.preventDefault();
    if (testPushMutation.isPending) return;

    const merchantId = pushMerchantId.trim();
    const title = pushTitle.trim();
    const body = pushBody.trim();

    if (!merchantId) {
      setPushFormError('Select a connected storefront to target its registered Android devices.');
      return;
    }
    if (!title || !body) {
      setPushFormError('Both notification title and body are required.');
      return;
    }

    setPushFormError(null);
    setPushResult(null);

    try {
      const res = await testPushMutation.mutateAsync({ merchantId, title, body });
      setPushResult(res);
      const sentCount = res.sentCount ?? 0;
      const wsDelivered = res.wsDelivered ?? 0;
      const fcmDelivered = res.fcmDelivered ?? 0;
      if (sentCount > 0) {
        toast.success(
          `Push delivered to ${sentCount} target(s) (WS: ${wsDelivered}, FCM: ${fcmDelivered})`,
        );
      } else {
        toast.error('No active WebSocket sockets or FCM tokens reached');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test push dispatch failed';
      setPushFormError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-title-3-semibold text-text-primary">
            SMS Failover, Email OTP Fallback &amp; 3-Tier Push
          </h3>
          <p className="text-caption-1-regular text-text-secondary mt-0.5">
            Inspect gateway readiness, 3-tier instant push delivery, 24-hour OTP throughput, and dispatch live tests.
          </p>
        </div>

        <Button
          variant="secondary"
          size="small"
          onClick={() => refetch()}
          isLoading={isFetching && !isLoading}
          leadingIcon={RiRefreshLine}
        >
          Refresh Status
        </Button>
      </div>

      {/* Top Status & OTP Telemetry Row */}
      {isLoading ? (
        <div aria-busy="true" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((idx) => (
            <Card key={idx} className="p-5 space-y-3">
              <Skeleton shape="text" className="h-4 w-32" />
              <Skeleton shape="text" className="h-7 w-24" />
              <Skeleton shape="text" className="h-3.5 w-44" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 3-Tier Instant Push Status */}
          <section className="flex min-w-0 flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-2 shadow-card">
            <div className="flex items-start justify-between gap-2.5 p-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2lg border border-border-button-default bg-background-primary-default text-foreground-icon-primary shadow-card">
                <RiSmartphoneLine className="size-4 shrink-0" aria-hidden />
              </span>
              <Chip
                variant="caption"
                color={pushChipColor}
                className="gap-1.5"
              >
                <StatusDot color={pushDotColor} />
                <span>{pushChipLabel}</span>
              </Chip>
            </div>
            <div className="flex flex-col gap-1 px-2.5 pt-1 pb-3">
              <p className="text-body-medium text-text-secondary">
                Instant Push (3-Tier Chain)
              </p>
              <p className="truncate text-title-2-medium text-text-primary">
                {selfHostedWsConfigured
                  ? 'Self-Hosted WebSocket'
                  : fcmV1Configured
                    ? 'FCM HTTP v1'
                    : 'HTTP Sync Polling'}
              </p>
              <div className="mt-1 space-y-1 text-caption-2-regular text-text-secondary">
                <div className="flex items-center justify-between gap-2">
                  <span>1. Self-Hosted WebSocket</span>
                  <span className="font-mono text-text-primary">
                    {selfHostedWsConfigured ? 'Active ($0 Free · <1s)' : 'Unconfigured'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>2. Optional FCM v1</span>
                  <span className="font-mono text-text-primary truncate max-w-36">
                    {fcmV1Configured
                      ? `Enabled (${status?.push?.projectId || 'configured'})`
                      : 'Disabled (Optional)'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>3. /sync HTTP Polling</span>
                  <span className="font-mono text-text-primary tabular-nums">
                    {fallbackPollingSec}s fallback
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-auto rounded-2xl border border-separator-border bg-background-secondary-default px-2.5 py-1.5">
              <p className="truncate text-caption-1-regular text-text-secondary">
                {selfHostedWsConfigured
                  ? `DO WebSocket primary · ${fallbackPollingSec}s /sync fallback`
                  : fcmV1Configured
                    ? 'Web Crypto RS256 OAuth2 active'
                    : `Devices poll /sync every ${fallbackPollingSec}s`}
              </p>
            </div>
          </section>

          {/* 24h OTP Sent */}
          <section className="flex min-w-0 flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-2 shadow-card">
            <div className="flex items-start justify-between gap-2.5 p-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2lg border border-border-button-default bg-background-primary-default text-foreground-icon-primary shadow-card">
                <RiKey2Line className="size-4 shrink-0" aria-hidden />
              </span>
              <Chip variant="caption" color="neutral">
                Last 24h
              </Chip>
            </div>
            <div className="flex flex-col gap-0.5 px-2.5 pt-1 pb-3.5">
              <p className="text-body-medium text-text-secondary">
                OTP Codes Sent
              </p>
              <p className="text-title-2-medium text-text-primary tabular-nums">
                {sentLast24h.toLocaleString()}
              </p>
            </div>
            <div className="mt-auto rounded-2xl border border-separator-border bg-background-secondary-default px-2.5 py-1.5">
              <p className="truncate text-caption-1-regular text-text-secondary">
                {activeSmsProvider
                  ? `Primary SMS route: ${getProviderMeta(activeSmsProvider).label}`
                  : activeEmailProvider
                    ? `Free Email OTP fallback ready (${getEmailProviderMeta(activeEmailProvider).label})`
                    : 'No live SMS or Email OTP provider configured'}
              </p>
            </div>
          </section>

          {/* 24h OTP Verified */}
          <section className="flex min-w-0 flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-2 shadow-card">
            <div className="flex items-start justify-between gap-2.5 p-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2lg border border-border-button-default bg-background-primary-default text-foreground-icon-primary shadow-card">
                <RiShieldCheckLine className="size-4 shrink-0" aria-hidden />
              </span>
              <Chip
                variant="caption"
                color={verifyRate >= 70 || sentLast24h === 0 ? 'lime' : 'yellow'}
              >
                {sentLast24h > 0 ? `${verifyRate}% verified` : 'Idle'}
              </Chip>
            </div>
            <div className="flex flex-col gap-0.5 px-2.5 pt-1 pb-3.5">
              <p className="text-body-medium text-text-secondary">
                OTP Codes Verified
              </p>
              <p className="text-title-2-medium text-text-primary tabular-nums">
                {verifiedLast24h.toLocaleString()}
              </p>
            </div>
            <div className="mt-auto rounded-2xl border border-separator-border bg-background-secondary-default px-2.5 py-1.5">
              <p className="truncate text-caption-1-regular text-text-secondary">
                HMAC-SHA256 · 5-attempt lockout
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Provider Capability Matrix */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>SMS &amp; Push Provider Capabilities</CardTitle>
              <CardDescription>
                Automatic priority order and per-isolate cooldown status across configured adapters.
              </CardDescription>
            </div>
            <Chip variant="caption" color="neutral">
              {providers.filter((p) => p.configured).length} / {providers.length} configured
            </Chip>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-separator-border rounded-2xl border border-separator-border bg-background-secondary-default/40">
              {providers.map((cap) => {
                const meta = getProviderMeta(cap.provider);
                const state = getProviderState(cap, activeSmsProvider);

                return (
                  <div
                    key={cap.provider}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Badge color={cap.configured && !cap.inCooldown ? 'primary' : 'neutral'} className="mt-0.5 tabular-nums">
                        #{cap.priority}
                      </Badge>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-medium text-text-primary">
                            {meta.label}
                          </span>
                          <span className="font-mono text-caption-2-regular text-text-tertiary">
                            {cap.provider}
                          </span>
                          <Chip variant="caption" color="soft">
                            {meta.channel}
                          </Chip>
                        </div>
                        <p className="text-caption-1-regular text-text-secondary mt-0.5">
                          {meta.hint}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {cap.inCooldown && cap.cooldownUntil && (
                        <span className="inline-flex items-center gap-1 text-caption-2-regular text-text-tertiary tabular-nums">
                          <RiTimeLine className="size-3.5" aria-hidden />
                          <span>Until {formatDate(cap.cooldownUntil)}</span>
                        </span>
                      )}
                      <Chip variant="bold" color={state.color} className="gap-1.5">
                        {state.dot && <StatusDot color={state.dot} />}
                        <span>{state.label}</span>
                      </Chip>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email OTP Fallback Capability Summary */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiMailLine className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Email OTP Fallback Providers</CardTitle>
                <CardDescription>
                  Free Email OTP backup via routeEmail when SMS credits are unavailable or SMS delivery fails.
                </CardDescription>
              </div>
            </div>
            <Chip
              variant="caption"
              color={activeEmailProvider ? 'lime' : configuredEmailCount > 0 ? 'yellow' : 'neutral'}
              className="gap-1.5"
            >
              {activeEmailProvider && <StatusDot color="green" />}
              <span>
                {activeEmailProvider
                  ? `Ready · ${configuredEmailCount} / ${emailProviders.length} configured`
                  : `${configuredEmailCount} / ${emailProviders.length} configured`}
              </span>
            </Chip>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-separator-border rounded-2xl border border-separator-border bg-background-secondary-default/40">
              {emailProviders.map((cap) => {
                const meta = getEmailProviderMeta(cap.provider);
                const state = getProviderState(cap, activeEmailProvider);

                return (
                  <div
                    key={cap.provider}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Badge
                        color={cap.configured && !cap.inCooldown ? 'primary' : 'neutral'}
                        className="mt-0.5 tabular-nums"
                      >
                        #{cap.priority}
                      </Badge>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-medium text-text-primary">
                            {meta.label}
                          </span>
                          <span className="font-mono text-caption-2-regular text-text-tertiary">
                            {cap.provider}
                          </span>
                          <Chip variant="caption" color="soft">
                            {meta.channel}
                          </Chip>
                        </div>
                        <p className="text-caption-1-regular text-text-secondary mt-0.5">
                          {meta.hint}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {cap.inCooldown && cap.cooldownUntil && (
                        <span className="inline-flex items-center gap-1 text-caption-2-regular text-text-tertiary tabular-nums">
                          <RiTimeLine className="size-3.5" aria-hidden />
                          <span>Until {formatDate(cap.cooldownUntil)}</span>
                        </span>
                      )}
                      <Chip variant="bold" color={state.color} className="gap-1.5">
                        {state.dot && <StatusDot color={state.dot} />}
                        <span>{state.label}</span>
                      </Chip>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnostic Forms: Test SMS & Test Push */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test SMS Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiMessage2Line className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Test SMS Dispatch</CardTitle>
                <CardDescription>
                  Exercises the SMS router fallback chain with live attempt latency.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSendTestSms} className="space-y-4">
              <Input
                label="Recipient Phone Number"
                type="tel"
                placeholder="01712345678 or +8801712345678"
                value={smsTo}
                onChange={setSmsTo}
                isRequired
                leadingIcon={RiSmartphoneLine}
                inputClassName="font-mono tabular-nums"
                hint="Normalized automatically for BulkSMSBD, SSL Wireless, and Twilio."
              />

              <Input
                label="SMS Message Body"
                placeholder="Enter test SMS message..."
                value={smsMessage}
                onChange={setSmsMessage}
                isRequired
                leadingIcon={RiMessage2Line}
              />

              {smsFormError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-xl bg-notification-error-background border border-border-error-default/20 p-3 text-caption-1-medium text-notification-error-foreground"
                >
                  <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                  <span>{smsFormError}</span>
                </div>
              )}

              <div className="flex items-center justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="medium"
                  isLoading={testSmsMutation.isPending}
                  leadingIcon={RiFlashlightLine}
                >
                  Send Test SMS
                </Button>
              </div>
            </form>

            {smsResult && (
              <div className="mt-5 space-y-3 border-t border-separator-border pt-4">
                <div
                  className={cx(
                    'flex items-center justify-between gap-2 rounded-xl p-3 text-caption-1-medium',
                    smsResult.dispatched
                      ? 'bg-notification-success-background text-notification-success-foreground'
                      : 'bg-notification-error-background text-notification-error-foreground',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {smsResult.dispatched ? (
                      <RiCheckboxCircleLine className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <RiCloseCircleLine className="size-4 shrink-0" aria-hidden />
                    )}
                    <span>
                      {smsResult.dispatched
                        ? `Dispatched via ${smsResult.provider || 'SMS router'}`
                        : 'All configured SMS providers failed'}
                    </span>
                  </div>
                  <span className="font-mono text-caption-2-medium tabular-nums">
                    {smsResult.attempts.length} attempt(s)
                  </span>
                </div>

                {smsResult.attempts.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-caption-1-medium text-text-secondary">
                      Provider Attempt Breakdown
                    </p>
                    <div className="divide-y divide-separator-border rounded-xl border border-separator-border bg-background-secondary-default">
                      {smsResult.attempts.map((attempt: MessagingAttempt, idx: number) => (
                        <div
                          key={`${attempt.provider}-${idx}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-caption-1-regular"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-text-primary">
                                {attempt.provider}
                              </span>
                              {attempt.skippedDueToCooldown && (
                                <Chip variant="caption" color="yellow">
                                  Cooldown skipped
                                </Chip>
                              )}
                              {attempt.quotaExhausted && !attempt.skippedDueToCooldown && (
                                <Chip variant="caption" color="orange">
                                  Quota exhausted
                                </Chip>
                              )}
                            </div>
                            {attempt.error && (
                              <p className="text-caption-2-regular text-status-rose-text truncate mt-0.5">
                                {attempt.error}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 tabular-nums">
                            {attempt.statusCode != null && (
                              <span className="font-mono text-caption-2-regular text-text-tertiary">
                                HTTP {attempt.statusCode}
                              </span>
                            )}
                            <span className="font-mono text-caption-2-regular text-text-secondary">
                              {attempt.latencyMs}ms
                            </span>
                            <Chip
                              variant="caption"
                              color={attempt.ok ? 'lime' : 'rose'}
                            >
                              {attempt.ok ? 'OK' : 'Fail'}
                            </Chip>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Push Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiPulseLine className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Test Instant Push (Self-Hosted WS + FCM)</CardTitle>
                <CardDescription>
                  Dispatches a high-priority push via Tier-1 Self-Hosted WebSocket and Tier-2 optional FCM v1.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSendTestPush} className="space-y-4">
              <Select
                label="Target Storefront"
                placeholder={
                  projectsLoading ? 'Loading storefronts...' : 'Select a storefront'
                }
                selectedKey={pushMerchantId || null}
                onSelectionChange={(k) => {
                  if (k != null) setPushMerchantId(String(k));
                }}
                isDisabled={projectsLoading || projects.length === 0}
              >
                {projects.map((p) => (
                  <SelectItem key={p.id} id={p.id} textValue={p.storeName}>
                    <div className="flex items-center gap-2 min-w-0">
                      <RiStore2Line className="size-3.5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                      <span className="truncate">{p.storeName}</span>
                      <span className="font-mono text-caption-2-regular text-text-tertiary">
                        {p.id}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </Select>

              <Input
                label="Notification Title"
                placeholder="e.g. ORBIT Test Alert"
                value={pushTitle}
                onChange={setPushTitle}
                isRequired
              />

              <Input
                label="Notification Body"
                placeholder="Enter test push payload message..."
                value={pushBody}
                onChange={setPushBody}
                isRequired
              />

              {pushFormError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-xl bg-notification-error-background border border-border-error-default/20 p-3 text-caption-1-medium text-notification-error-foreground"
                >
                  <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                  <span>{pushFormError}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-caption-2-regular text-text-tertiary">
                  {selfHostedWsConfigured && fcmV1Configured
                    ? 'Targets active WebSocket sockets + FCM tokens'
                    : selfHostedWsConfigured
                      ? 'Targets active Self-Hosted WebSocket sockets (FCM optional)'
                      : fcmV1Configured
                        ? 'Targets active merchant_devices FCM tokens'
                        : 'No WS hub or FCM configured on Worker'}
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  size="medium"
                  disabled={!pushMerchantId || projects.length === 0}
                  isLoading={testPushMutation.isPending}
                  leadingIcon={RiFlashlightLine}
                >
                  Send Test Push
                </Button>
              </div>
            </form>

            {pushResult && (() => {
              const sentCount = pushResult.sentCount ?? 0;
              const wsDelivered = pushResult.wsDelivered ?? 0;
              const fcmDelivered = pushResult.fcmDelivered ?? 0;
              const activeSockets = pushResult.activeSockets ?? 0;

              return (
                <div
                  className={cx(
                    'mt-5 flex flex-col gap-2.5 rounded-xl p-3 text-caption-1-medium',
                    sentCount > 0
                      ? 'bg-notification-success-background text-notification-success-foreground'
                      : 'bg-status-yellow-background text-status-yellow-text',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {sentCount > 0 ? (
                        <RiCheckboxCircleLine className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                      )}
                      <span>
                        {sentCount > 0
                          ? 'Instant push delivered across active channels'
                          : 'Zero devices reached (no active WS sockets or FCM tokens)'}
                      </span>
                    </div>
                    <span className="font-mono text-caption-1-semibold tabular-nums">
                      sentCount: {sentCount}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-separator-border pt-2 font-mono text-caption-2-medium tabular-nums">
                    <span>wsDelivered: {wsDelivered}</span>
                    <span>·</span>
                    <span>fcmDelivered: {fcmDelivered}</span>
                    <span>·</span>
                    <span>activeSockets: {activeSockets}</span>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
