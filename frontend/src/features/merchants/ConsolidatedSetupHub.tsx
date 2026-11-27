import React, { useId, useState } from 'react';
import {
  useSetupLock,
  type RequestSetupOtpResponse,
} from './useSetupLock';
import { MerchantSettings } from './MerchantSettings';
import { IntegrationGuide } from './IntegrationGuide';
import { DevicePairingQR } from '@/features/device/DevicePairingQR';
import { TransactionTable } from '@/features/transactions/TransactionTable';
import { Card, CardContent } from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Chip, type ChipColor } from '@/components/base/badges/chip';
import { Input, InputBase, TextField } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/base/modal/modal';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { formatBDT } from '@/shared/utils/format';
import {
  RiArrowDownSLine,
  RiCheckLine,
  RiCheckboxCircleLine,
  RiCodeSSlashLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiFileList3Line,
  RiLock2Line,
  RiLockUnlockLine,
  RiMailLine,
  RiQrCodeLine,
  RiSettings3Line,
  RiShoppingBag3Line,
} from '@remixicon/react';

export interface DemoVerifiedResult {
  orderId: string;
  trxId: string;
  amount: number;
  matchType?: string | null;
}

export interface ConsolidatedSetupHubProps {
  merchantId: string;
  storeName: string;
  demoAmount: number;
  onChangeDemoAmount: (amount: number) => void;
  demoOrderId: string;
  onChangeDemoOrderId: (orderId: string) => void;
  demoCustomerEmail: string;
  onChangeDemoCustomerEmail: (email: string) => void;
  demoVerifiedResult: DemoVerifiedResult | null;
  onLaunchDemoModal: () => void;
}

type AccordionKey =
  | 'settings'
  | 'device'
  | 'transactions'
  | 'integration'
  | 'checkout_demo';

function formatUnlockExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'soon';
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return expiresAt;
  return new Date(parsed).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AccordionSectionProps {
  id: string;
  icon: React.ComponentType<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
  title: string;
  description: string;
  badgeLabel: string;
  badgeColor?: ChipColor;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionSection({
  id,
  icon: Icon,
  title,
  description,
  badgeLabel,
  badgeColor = 'neutral',
  isExpanded,
  onToggle,
  children,
}: AccordionSectionProps) {
  const panelId = useId();

  return (
    <Card id={id}>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={onToggle}
        className={cx(
          'flex w-full min-h-11 items-center justify-between gap-4 p-5 sm:p-6 text-start cursor-pointer transition-colors duration-150',
          'hover:bg-background-secondary-hover/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring',
          isExpanded && 'border-b border-separator-border',
        )}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
            <Icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-title-3-medium text-text-primary truncate">{title}</h2>
            <p className="text-body-regular text-text-secondary line-clamp-2">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Chip variant="caption" color={badgeColor} className="hidden sm:inline-flex">
            {badgeLabel}
          </Chip>
          <RiArrowDownSLine
            className={cx(
              'size-5 shrink-0 text-foreground-icon-secondary transition-transform duration-200',
              isExpanded && 'rotate-180',
            )}
            aria-hidden
          />
        </div>
      </button>

      {isExpanded && (
        <CardContent id={panelId} className="pt-5 sm:pt-6">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

export function ConsolidatedSetupHub({
  merchantId,
  storeName,
  demoAmount,
  onChangeDemoAmount,
  demoOrderId,
  onChangeDemoOrderId,
  demoCustomerEmail,
  onChangeDemoCustomerEmail,
  demoVerifiedResult,
  onLaunchDemoModal,
}: ConsolidatedSetupHubProps) {
  const {
    isLocked,
    emailHint,
    expiresAt,
    isRequestingOtp,
    isVerifyingOtp,
    requestOtp,
    verifyOtp,
    lockNow,
  } = useSetupLock();

  const [expanded, setExpanded] = useState<Record<AccordionKey, boolean>>({
    settings: true,
    device: false,
    transactions: false,
    integration: false,
    checkout_demo: false,
  });

  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [otpMeta, setOtpMeta] = useState<RequestSetupOtpResponse | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const toggleSection = (key: AccordionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleOpenOtpModal = () => {
    setOtpStep('request');
    setOtpMeta(null);
    setOtpCode('');
    setOtpError(null);
    setIsOtpModalOpen(true);
  };

  const handleRequestOtp = async () => {
    setOtpError(null);
    try {
      const res = await requestOtp();
      setOtpMeta(res);
      setOtpStep('verify');
      toast.success('Verification OTP sent', {
        description: `Sent to ${res.emailHint || emailHint}`,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send verification OTP';
      setOtpError(message);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedCode = otpCode.trim();
    if (!cleanedCode) {
      setOtpError('Enter the 6-digit verification code.');
      return;
    }

    setOtpError(null);
    try {
      await verifyOtp(cleanedCode, otpMeta?.otpId);
      setIsOtpModalOpen(false);
      setOtpCode('');
      toast.success('Setup & Controls unlocked', {
        description: 'Editing is temporarily enabled for this browser session.',
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Invalid or expired OTP code';
      setOtpError(message);
    }
  };

  const handleLockNow = () => {
    lockNow();
    toast.info('Setup & Controls locked', {
      description: 'Returned to View & Copy Only mode.',
    });
  };

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://payment.orbitsaas.cloud';

  const embedSnippet = `<!-- 1. Include ORBIT Widget Script -->
<script src="${origin}/widget.js"></script>

<!-- 2. Trigger Checkout with server-created sessionId & sessionToken -->
<script>
  function launchOrbitPay(session) {
    OrbitPay.open({
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      onSuccess: function(data) {
        window.location.href = "/order-confirmed?id=" + data.orderId + "&trxId=" + data.trxId;
      },
      onPending: function(data) {
        console.log("Submitted for verification:", data.status);
      }
    });
  }
</script>`;

  const handleCopyEmbedSnippet = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopiedSnippet(true);
    toast.success('Embed snippet copied to clipboard');
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="w-full space-y-5">
      {/* Sticky Lock Control Card */}
      <Card className="sticky top-20 z-10 bg-background-primary-default/95 backdrop-blur-md shadow-card">
        <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center sm:pt-6">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              {isLocked ? (
                <RiLock2Line className="size-5" aria-hidden />
              ) : (
                <RiLockUnlockLine className="size-5 text-status-lime-text" aria-hidden />
              )}
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-title-2-medium text-text-primary">
                  Setup &amp; Controls
                </h2>
                {isLocked ? (
                  <Chip variant="bold" color="yellow" className="gap-1.5">
                    <RiLock2Line className="size-3.5 shrink-0" aria-hidden />
                    <span>Locked — View &amp; Copy Only</span>
                  </Chip>
                ) : (
                  <Chip variant="bold" color="lime" className="gap-1.5">
                    <RiLockUnlockLine className="size-3.5 shrink-0" aria-hidden />
                    <span>
                      Unlocked for editing · expires {formatUnlockExpiry(expiresAt)}
                    </span>
                  </Chip>
                )}
              </div>

              <p className="text-body-regular text-text-secondary">
                {isLocked ? (
                  <>
                    You can freely inspect keys, QR payloads, ledger entries, and snippets.
                    Editing technical setup requires an OTP sent to{' '}
                    <span className="font-mono text-text-primary">
                      adnanshahria2019@gmail.com
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Editing is unlocked for this session (OTP verified via{' '}
                    <span className="font-mono text-text-primary">
                      adnanshahria2019@gmail.com
                    </span>
                    ). Lock immediately when you finish making changes.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {isLocked ? (
              <Button
                variant="primary"
                size="medium"
                leadingIcon={RiLockUnlockLine}
                onClick={handleOpenOtpModal}
                className="min-h-11 sm:min-h-10"
              >
                Unlock with OTP
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="medium"
                leadingIcon={RiLock2Line}
                onClick={handleLockNow}
                className="min-h-11 sm:min-h-10"
              >
                Lock Now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Consolidated Collapsible Dashboard Accordion Sections */}
      <div className="space-y-4">
        <AccordionSection
          id="setup-section-settings"
          icon={RiSettings3Line}
          title="Storefront & Webhook Settings"
          description="Verification engine, receipt rules, enabled modules, API keys, webhook endpoints, and delivery replay."
          badgeLabel={isLocked ? 'View & Copy' : 'Editable'}
          badgeColor={isLocked ? 'neutral' : 'lime'}
          isExpanded={expanded.settings}
          onToggle={() => toggleSection('settings')}
        >
          <MerchantSettings
            readOnlyLocked={isLocked}
            onRequestUnlock={handleOpenOtpModal}
          />
        </AccordionSection>

        <AccordionSection
          id="setup-section-device"
          icon={RiQrCodeLine}
          title="Device Pairing QR & Key"
          description="Pair your Android MFS companion app via QR code or copy your manual X-Device-Key."
          badgeLabel="Android Sync"
          badgeColor="cyan"
          isExpanded={expanded.device}
          onToggle={() => toggleSection('device')}
        >
          <DevicePairingQR merchantId={merchantId} readOnlyLocked={isLocked} />
        </AccordionSection>

        <AccordionSection
          id="setup-section-transactions"
          icon={RiFileList3Line}
          title="Transactions & Typo Ledger"
          description="Search incoming MFS SMS records, copy TrxIDs, and resolve unclaimed customer typos."
          badgeLabel="SMS Ledger"
          badgeColor="gray"
          isExpanded={expanded.transactions}
          onToggle={() => toggleSection('transactions')}
        >
          <TransactionTable readOnlyLocked={isLocked} />
        </AccordionSection>

        <AccordionSection
          id="setup-section-integration"
          icon={RiCodeSSlashLine}
          title="Developer Integration Guide"
          description="Copy-ready frontend widget, signed webhook receiver, and COD order notify snippets."
          badgeLabel="Always Copyable"
          badgeColor="blue"
          isExpanded={expanded.integration}
          onToggle={() => toggleSection('integration')}
        >
          <IntegrationGuide />
        </AccordionSection>

        <AccordionSection
          id="setup-section-checkout-demo"
          icon={RiShoppingBag3Line}
          title="Checkout Widget Demo"
          description={`Preview the minimal buyer checkout flow and widget embed script for ${storeName}.`}
          badgeLabel="Simulator"
          badgeColor="purple"
          isExpanded={expanded.checkout_demo}
          onToggle={() => toggleSection('checkout_demo')}
        >
          <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-separator-border bg-background-secondary-default p-4 sm:flex-row sm:items-center">
              <div className="space-y-0.5">
                <h3 className="text-body-medium text-text-primary">
                  Checkout Widget Playground
                </h3>
                <p className="text-caption-1-regular text-text-secondary">
                  Configure a simulated order and launch the live modal checkout flow for {storeName}.
                </p>
              </div>
              <Button
                variant="primary"
                size="medium"
                disabled={isLocked}
                onClick={onLaunchDemoModal}
                leadingIcon={RiShoppingBag3Line}
                className="min-h-11 sm:min-h-10 shrink-0"
              >
                Launch Modal Checkout
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Simulated Order Amount (BDT)"
                type="number"
                isDisabled={isLocked}
                value={String(demoAmount)}
                onChange={(val) => onChangeDemoAmount(Number(val) || 0)}
                inputClassName="font-mono tnum"
              />
              <Input
                label="Simulated Order ID"
                isDisabled={isLocked}
                value={demoOrderId}
                onChange={onChangeDemoOrderId}
                inputClassName="font-mono"
              />
              <Input
                label="Customer Email (OrbitMail Invoice)"
                type="email"
                isDisabled={isLocked}
                value={demoCustomerEmail}
                onChange={onChangeDemoCustomerEmail}
                placeholder="buyer@example.com"
              />
            </div>

            {demoVerifiedResult && (
              <div className="p-4 rounded-2xl bg-notification-success-background border border-separator-border text-notification-success-foreground space-y-1">
                <span className="text-body-medium block">Demo payment verified</span>
                <p className="text-caption-1-regular">
                  Order #{demoVerifiedResult.orderId} matched with TrxID{' '}
                  <span className="font-mono">{demoVerifiedResult.trxId}</span> for{' '}
                  <span className="font-mono tnum">
                    {formatBDT(demoVerifiedResult.amount)}
                  </span>
                  {demoVerifiedResult.matchType ? ` (${demoVerifiedResult.matchType})` : ''}. Webhook dispatched.
                </p>
              </div>
            )}

            <div className="space-y-2.5 pt-4 border-t border-separator-border">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-body-medium text-text-primary">
                  Storefront Script Embed Code
                </h3>
                <Button
                  variant="secondary"
                  size="xs"
                  leadingIcon={copiedSnippet ? RiCheckLine : RiFileCopyLine}
                  onClick={handleCopyEmbedSnippet}
                >
                  {copiedSnippet ? 'Copied' : 'Copy snippet'}
                </Button>
              </div>
              <pre className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-default text-text-primary font-mono text-caption-1-regular overflow-x-auto select-all leading-relaxed">
                {embedSnippet}
              </pre>
            </div>
          </div>
        </AccordionSection>
      </div>

      {/* OTP Unlock Modal */}
      <Modal
        isOpen={isOtpModalOpen}
        onOpenChange={(open) => {
          if (!open && !isRequestingOtp && !isVerifyingOtp) {
            setIsOtpModalOpen(false);
          }
        }}
        size="sm"
        isDismissable={!isRequestingOtp && !isVerifyingOtp}
      >
        <ModalHeader
          icon={otpStep === 'request' ? RiMailLine : RiLockUnlockLine}
          title={
            otpStep === 'request'
              ? 'Unlock Setup & Controls'
              : 'Enter 6-digit verification code'
          }
          description={
            otpStep === 'request'
              ? 'Send a one-time security code to adnanshahria2019@gmail.com to temporarily enable editing.'
              : `Enter the verification code sent to ${otpMeta?.emailHint || emailHint}.`
          }
        />

        {otpStep === 'request' ? (
          <>
            <ModalBody className="space-y-4">
              <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-4 space-y-2">
                <span className="text-caption-2-medium text-text-tertiary block">
                  Authorized security email
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-body-medium text-text-primary">
                    adnanshahria2019@gmail.com
                  </span>
                  <Chip variant="caption" color="gray">
                    {emailHint}
                  </Chip>
                </div>
                <p className="text-caption-1-regular text-text-secondary">
                  Viewing and copying keys or integration snippets remains available even while locked.
                </p>
              </div>

              {otpError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-xl bg-notification-error-background p-3 text-caption-1-medium text-notification-error-foreground"
                >
                  <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                  <span>{otpError}</span>
                </div>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                disabled={isRequestingOtp}
                onClick={() => setIsOtpModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={isRequestingOtp}
                leadingIcon={RiMailLine}
                onClick={handleRequestOtp}
              >
                Send OTP Code
              </Button>
            </ModalFooter>
          </>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex min-h-0 flex-1 flex-col gap-4">
            <ModalBody className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl bg-notification-success-background p-3 text-caption-1-medium text-notification-success-foreground">
                <RiCheckboxCircleLine className="size-4 shrink-0 mt-0.5" aria-hidden />
                <div className="space-y-0.5">
                  <span className="block">
                    OTP dispatched to {otpMeta?.emailHint || emailHint}
                  </span>
                  {otpMeta?.channel && (
                    <span className="text-caption-2-regular opacity-90 block">
                      Channel: {otpMeta.channel}
                      {otpMeta.provider ? ` · ${otpMeta.provider}` : ''}
                    </span>
                  )}
                </div>
              </div>

              {otpMeta?.devCode && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-separator-border bg-background-secondary-default px-3 py-2 text-caption-1-regular text-text-secondary">
                  <span>
                    Dev mode OTP:{' '}
                    <code className="font-mono font-semibold text-text-primary">
                      {otpMeta.devCode}
                    </code>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setOtpCode(otpMeta.devCode || '')}
                  >
                    Auto-fill
                  </Button>
                </div>
              )}

              <TextField
                value={otpCode}
                onChange={(val) => {
                  setOtpCode(val.replace(/\D/g, '').slice(0, 6));
                  if (otpError) setOtpError(null);
                }}
                isRequired
              >
                {({ isRequired }) => (
                  <>
                    <Label isRequired={isRequired}>6-digit OTP code</Label>
                    <InputBase
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      placeholder="000000"
                      className="font-mono tracking-[0.28em] text-center"
                    />
                  </>
                )}
              </TextField>

              {otpError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-xl bg-notification-error-background p-3 text-caption-1-medium text-notification-error-foreground"
                >
                  <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                  <span>{otpError}</span>
                </div>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={isRequestingOtp || isVerifyingOtp}
                onClick={handleRequestOtp}
                className="sm:me-auto"
              >
                Resend OTP
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isVerifyingOtp}
                onClick={() => setIsOtpModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={otpCode.trim().length < 6}
                isLoading={isVerifyingOtp}
                leadingIcon={RiLockUnlockLine}
              >
                Verify &amp; Unlock
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </div>
  );
}
