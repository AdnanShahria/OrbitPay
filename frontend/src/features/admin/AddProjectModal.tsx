import { useState, type FormEvent } from 'react';
import {
  RiArrowDownSLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiHashtag,
  RiKey2Line,
  RiLinksLine,
  RiMailLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiSmartphoneLine,
  RiStore2Line,
  RiTimeLine,
  RiUserLine,
} from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@/components/base/modal/modal';
import { Chip } from '@/components/base/badges/chip';
import { Select, SelectItem } from '@/components/base/select/select';
import { Switch } from '@/components/base/switch/switch';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { formatBDT, MFS_METADATA } from '@/shared/utils/format';
import {
  useCreateProjectMutation,
  type AdminAccountMode,
  type AdminInitialWalletPayload,
  type AdminVerificationMode,
  type CreateProjectResponseData,
} from './useAdmin';

interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function generateStrongPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function cleanBdNumber(raw: string): string {
  return raw.trim().replace(/^\+88/, '').replace(/\s+/g, '');
}

export function AddProjectModal({ isOpen, onClose }: AddProjectModalProps) {
  const [accountMode, setAccountMode] = useState<AdminAccountMode>('STANDALONE');
  const [verificationMode, setVerificationMode] = useState<AdminVerificationMode>('AUTO');

  const [storeName, setStoreName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showOptionalWebhook, setShowOptionalWebhook] = useState(false);
  const [gracePeriod, setGracePeriod] = useState('60');

  // Optional initial MFS wallets
  const [showInitialWallets, setShowInitialWallets] = useState(false);
  const [bkashNumber, setBkashNumber] = useState('');
  const [nagadNumber, setNagadNumber] = useState('');

  // Optional starter Payment Link
  const [createStarterPaymentLink, setCreateStarterPaymentLink] = useState(true);
  const [starterLinkTitle, setStarterLinkTitle] = useState('');
  const [starterLinkAmountType, setStarterLinkAmountType] = useState<'FIXED' | 'OPEN'>('OPEN');
  const [starterLinkAmount, setStarterLinkAmount] = useState('');

  // Client owner login
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [createdResult, setCreatedResult] = useState<CreateProjectResponseData | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const createMutation = useCreateProjectMutation();

  const handleSelectAccountMode = (mode: AdminAccountMode) => {
    setAccountMode(mode);
    setCreateStarterPaymentLink(mode === 'STANDALONE');
    if (mode === 'WEBHOOK_CONNECTED') {
      setShowOptionalWebhook(true);
    }
  };

  const handleCopy = (text: string, keyId: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleClose = () => {
    setCreatedResult(null);
    setAccountMode('STANDALONE');
    setVerificationMode('AUTO');
    setStoreName('');
    setProjectId('');
    setWebhookUrl('');
    setShowOptionalWebhook(false);
    setGracePeriod('60');
    setShowInitialWallets(false);
    setBkashNumber('');
    setNagadNumber('');
    setCreateStarterPaymentLink(true);
    setStarterLinkTitle('');
    setStarterLinkAmountType('OPEN');
    setStarterLinkAmount('');
    setOwnerEmail('');
    setOwnerName('');
    setOwnerPassword('');
    setValidationError(null);
    createMutation.reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (createMutation.isPending) return;

    const trimmedStore = storeName.trim();
    const trimmedId = projectId.trim();
    const trimmedWebhook = webhookUrl.trim();
    const trimmedEmail = ownerEmail.trim();
    const trimmedOwnerName = ownerName.trim();
    const trimmedPassword = ownerPassword.trim();
    const parsedGrace = gracePeriod.trim() === '' ? 60 : Number(gracePeriod);

    if (trimmedStore.length < 2) {
      setValidationError('Account / storefront name must be at least 2 characters.');
      return;
    }
    if (trimmedId && (trimmedId.length < 3 || !/^[a-z0-9_-]+$/i.test(trimmedId))) {
      setValidationError('Project ID must be at least 3 characters using only letters, numbers, "-" or "_".');
      return;
    }
    if (!Number.isInteger(parsedGrace) || parsedGrace < 5 || parsedGrace > 1440) {
      setValidationError('Grace period must be a whole number between 5 and 1440 minutes.');
      return;
    }

    const initialWallets: AdminInitialWalletPayload[] = [];
    const cleanBkash = cleanBdNumber(bkashNumber);
    const cleanNagad = cleanBdNumber(nagadNumber);

    if (cleanBkash) {
      if (!/^01[3-9]\d{8}$/.test(cleanBkash)) {
        setValidationError('bKash number must be 11 digits starting with 01.');
        return;
      }
      initialWallets.push({
        provider: 'BKASH',
        walletNumber: cleanBkash,
        accountType: 'PERSONAL',
        isPrimary: true,
      });
    }
    if (cleanNagad) {
      if (!/^01[3-9]\d{8}$/.test(cleanNagad)) {
        setValidationError('Nagad number must be 11 digits starting with 01.');
        return;
      }
      initialWallets.push({
        provider: 'NAGAD',
        walletNumber: cleanNagad,
        accountType: 'PERSONAL',
        isPrimary: initialWallets.length === 0,
      });
    }

    let parsedStarterAmount: number | undefined;
    if (createStarterPaymentLink && starterLinkAmountType === 'FIXED') {
      parsedStarterAmount = Number(starterLinkAmount);
      if (!Number.isFinite(parsedStarterAmount) || parsedStarterAmount <= 0) {
        setValidationError('Enter a positive fixed amount for the starter Payment Link.');
        return;
      }
    }

    if ((trimmedOwnerName || trimmedPassword) && !trimmedEmail) {
      setValidationError('Client Owner Email is required when providing an owner name or password.');
      return;
    }
    if (trimmedPassword && trimmedPassword.length < 6) {
      setValidationError('Owner password must be at least 6 characters.');
      return;
    }

    setValidationError(null);

    try {
      const res = await createMutation.mutateAsync({
        id: trimmedId || undefined,
        storeName: trimmedStore,
        webhookUrl: trimmedWebhook || undefined,
        gracePeriodMinutes: parsedGrace,
        accountMode,
        verificationMode,
        ignoreStorefrontSync: accountMode === 'STANDALONE',
        initialWallets: initialWallets.length > 0 ? initialWallets : undefined,
        createStarterPaymentLink,
        starterLinkTitle: createStarterPaymentLink && starterLinkTitle.trim() ? starterLinkTitle.trim() : undefined,
        starterLinkAmountType: createStarterPaymentLink ? starterLinkAmountType : undefined,
        starterLinkAmount: parsedStarterAmount,
        ownerEmail: trimmedEmail || undefined,
        ownerName: trimmedOwnerName || undefined,
        ownerPassword: trimmedPassword || undefined,
      });
      setCreatedResult(res.data);
      toast.success(`${res.data.storeName} onboarded`);
    } catch {
      // Error surfaced via createMutation.isError banner
    }
  };

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://payment.orbitsaas.cloud';
  const starterLinkUrl = createdResult?.starterPaymentLink
    ? createdResult.starterPaymentLink.shareUrl ||
      `${origin}${createdResult.starterPaymentLink.sharePath}`
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      size="lg"
    >
      <ModalHeader
        title={
          createdResult
            ? 'Client Account & Credentials Created'
            : 'Connect New Client Account'
        }
        description={
          createdResult
            ? 'Deliver these credentials securely to the client. Passwords and secrets are shown once.'
            : 'Onboard a Standalone Payment Link account or a Webhook-Connected e-commerce storefront.'
        }
        icon={createdResult ? RiShieldCheckLine : RiStore2Line}
      />

      {createdResult ? (
        <>
          <ModalBody className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-notification-success-background text-notification-success-foreground text-caption-1-medium flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <RiShieldCheckLine className="size-5 shrink-0" aria-hidden />
                <span>
                  Account <strong>{createdResult.storeName}</strong> registered and ready for sign-in.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Chip variant="caption" color={createdResult.accountMode === 'STANDALONE' ? 'cyan' : 'neutral'}>
                  {createdResult.accountMode === 'STANDALONE' ? 'Standalone' : 'Webhook'}
                </Chip>
                {createdResult.verificationMode === 'PURE_MANUAL' && (
                  <Chip variant="caption" color="yellow">Manual</Chip>
                )}
              </div>
            </div>

            {createdResult.starterPaymentLink && starterLinkUrl && (
              <div className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-active/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <RiLinksLine className="size-4 text-foreground-icon-primary shrink-0" aria-hidden />
                    <span className="text-body-medium text-text-primary truncate">
                      Starter Payment Link: {createdResult.starterPaymentLink.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Chip variant="caption" color="lime">Live URL</Chip>
                    {createdResult.starterPaymentLink.amountType === 'FIXED' &&
                      createdResult.starterPaymentLink.fixedAmount != null && (
                        <Chip variant="caption" color="soft" className="font-mono tabular-nums">
                          {formatBDT(createdResult.starterPaymentLink.fixedAmount)}
                        </Chip>
                      )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <Input
                    label="Shareable Payment Link"
                    isReadOnly
                    value={starterLinkUrl}
                    className="flex-1"
                    inputClassName="font-mono text-caption-1-regular"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="medium"
                      onClick={() => handleCopy(starterLinkUrl, 'starterLink', 'Payment link')}
                      leadingIcon={copiedKey === 'starterLink' ? RiCheckLine : RiFileCopyLine}
                    >
                      {copiedKey === 'starterLink' ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                      variant="primary"
                      size="medium"
                      onClick={() => window.open(starterLinkUrl, '_blank', 'noopener,noreferrer')}
                      leadingIcon={RiExternalLinkLine}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {createdResult.ownerAccount && (
              <div className="p-4 rounded-2xl bg-background-secondary-default border border-border-button-default space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-medium text-text-primary">
                    Provisioned Client Login (Web &amp; Android)
                  </span>
                  <Chip variant="caption" color="lime">
                    {createdResult.ownerAccount.role}
                  </Chip>
                </div>

                <div className="flex items-end gap-2">
                  <Input
                    label="Client Login Email"
                    isReadOnly
                    value={createdResult.ownerAccount.email}
                    className="flex-1"
                    inputClassName="font-mono text-caption-1-regular"
                  />
                  <Button
                    variant="secondary"
                    size="medium"
                    onClick={() =>
                      handleCopy(createdResult.ownerAccount!.email, 'ownerEmail', 'Client email')
                    }
                    leadingIcon={copiedKey === 'ownerEmail' ? RiCheckLine : RiFileCopyLine}
                  >
                    {copiedKey === 'ownerEmail' ? 'Copied' : 'Copy'}
                  </Button>
                </div>

                <div className="flex items-end gap-2">
                  <Input
                    label="Client Login Password"
                    isReadOnly
                    value={createdResult.ownerAccount.password}
                    className="flex-1"
                    inputClassName="font-mono text-caption-1-regular"
                  />
                  <Button
                    variant="secondary"
                    size="medium"
                    onClick={() =>
                      handleCopy(
                        createdResult.ownerAccount!.password,
                        'ownerPassword',
                        'Client password',
                      )
                    }
                    leadingIcon={copiedKey === 'ownerPassword' ? RiCheckLine : RiFileCopyLine}
                  >
                    {copiedKey === 'ownerPassword' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3.5">
              <div className="flex items-end gap-2">
                <Input
                  label="Project / Merchant ID"
                  isReadOnly
                  value={createdResult.id}
                  className="flex-1"
                  inputClassName="font-mono"
                />
                <Button
                  variant="secondary"
                  size="medium"
                  onClick={() =>
                    handleCopy(createdResult.id, 'id', 'Project ID')
                  }
                  leadingIcon={
                    copiedKey === 'id' ? RiCheckLine : RiFileCopyLine
                  }
                >
                  {copiedKey === 'id' ? 'Copied' : 'Copy'}
                </Button>
              </div>

              {createdResult.apiKey && (
                <div className="space-y-1">
                  <div className="flex items-end gap-2">
                    <Input
                      label="Merchant API Key (Storefront Backend)"
                      isReadOnly
                      value={createdResult.apiKey}
                      className="flex-1"
                      inputClassName="font-mono text-caption-1-regular"
                    />
                    <Button
                      variant="secondary"
                      size="medium"
                      onClick={() =>
                        handleCopy(
                          createdResult.apiKey!,
                          'apikey',
                          'Merchant API key',
                        )
                      }
                      leadingIcon={
                        copiedKey === 'apikey' ? RiCheckLine : RiFileCopyLine
                      }
                    >
                      {copiedKey === 'apikey' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p className="text-caption-1-medium text-text-secondary">
                    Paste this sk_live_ key into your e-commerce storefront ORBIT Pay settings (X-Merchant-Api-Key). Shown once.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-end gap-2">
                  <Input
                    label="HMAC Webhook Secret"
                    isReadOnly
                    value={createdResult.webhookSecret}
                    className="flex-1"
                    inputClassName="font-mono text-caption-1-regular"
                  />
                  <Button
                    variant="secondary"
                    size="medium"
                    onClick={() =>
                      handleCopy(
                        createdResult.webhookSecret,
                        'whsec',
                        'HMAC webhook secret',
                      )
                    }
                    leadingIcon={
                      copiedKey === 'whsec' ? RiCheckLine : RiFileCopyLine
                    }
                  >
                    {copiedKey === 'whsec' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-caption-1-medium text-text-secondary">
                  Storefront uses this secret to verify X-Orbit-Signature on
                  payment.verified and order.* webhooks.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-end gap-2">
                  <Input
                    label="Android Device API Key"
                    isReadOnly
                    value={createdResult.deviceKey}
                    className="flex-1"
                    inputClassName="font-mono text-caption-1-regular"
                  />
                  <Button
                    variant="secondary"
                    size="medium"
                    onClick={() =>
                      handleCopy(
                        createdResult.deviceKey,
                        'devkey',
                        'Device API key',
                      )
                    }
                    leadingIcon={
                      copiedKey === 'devkey' ? RiCheckLine : RiFileCopyLine
                    }
                  >
                    {copiedKey === 'devkey' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-caption-1-medium text-text-secondary">
                  Companion app receives this automatically upon email/password sign-in, or via QR pairing.
                </p>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <Button variant="primary" size="medium" onClick={handleClose}>
              Done &amp; View Projects
            </Button>
          </ModalFooter>
        </>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <ModalBody className="space-y-4">
            {/* Account Mode 2-Card Selector */}
            <div className="space-y-2">
              <span className="text-body-medium text-text-primary block">
                Account Mode
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={accountMode === 'STANDALONE'}
                  onClick={() => handleSelectAccountMode('STANDALONE')}
                  className={cx(
                    'min-h-11 p-3.5 rounded-2xl border text-start transition-colors cursor-pointer space-y-1 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                    accountMode === 'STANDALONE'
                      ? 'border-2 border-text-primary bg-background-secondary-default shadow-card'
                      : 'border-border-button-default bg-background-primary-default hover:border-border-button-hover',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-body-medium text-text-primary">
                      <RiLinksLine className="size-4 text-status-cyan-text shrink-0" aria-hidden />
                      <span>Standalone / Payment Link</span>
                    </span>
                    <Chip variant="caption" color={accountMode === 'STANDALONE' ? 'cyan' : 'neutral'}>
                      {accountMode === 'STANDALONE' ? 'Selected' : 'No site'}
                    </Chip>
                  </div>
                  <p className="text-caption-2-regular text-text-secondary">
                    Personal, SaaS, Event, or non-ecommerce accounts. No website webhook required; auto-creates a starter Payment Link.
                  </p>
                </button>

                <button
                  type="button"
                  aria-pressed={accountMode === 'WEBHOOK_CONNECTED'}
                  onClick={() => handleSelectAccountMode('WEBHOOK_CONNECTED')}
                  className={cx(
                    'min-h-11 p-3.5 rounded-2xl border text-start transition-colors cursor-pointer space-y-1 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                    accountMode === 'WEBHOOK_CONNECTED'
                      ? 'border-2 border-text-primary bg-background-secondary-default shadow-card'
                      : 'border-border-button-default bg-background-primary-default hover:border-border-button-hover',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-body-medium text-text-primary">
                      <RiGlobalLine className="size-4 text-status-lime-text shrink-0" aria-hidden />
                      <span>Webhook-Connected Website</span>
                    </span>
                    <Chip variant="caption" color={accountMode === 'WEBHOOK_CONNECTED' ? 'lime' : 'neutral'}>
                      {accountMode === 'WEBHOOK_CONNECTED' ? 'Selected' : 'E-Comm'}
                    </Chip>
                  </div>
                  <p className="text-caption-2-regular text-text-secondary">
                    E-Commerce storefront with webhook callbacks &amp; storefront wallet sync.
                  </p>
                </button>
              </div>
            </div>

            <Input
              label={accountMode === 'STANDALONE' ? 'Account / Brand Name' : 'Storefront / Client Name'}
              placeholder="e.g. Aurelia Lifestyle, Summit Events, Personal Hub"
              value={storeName}
              onChange={setStoreName}
              isRequired
              leadingIcon={RiStore2Line}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Project ID (Slug - Optional)"
                placeholder="Leave blank to auto-generate"
                value={projectId}
                onChange={setProjectId}
                hint="3+ chars: letters, numbers, - or _."
                leadingIcon={RiHashtag}
                inputClassName="font-mono"
              />

              <Input
                label="Grace Period (Minutes)"
                type="number"
                value={gracePeriod}
                onChange={setGracePeriod}
                leadingIcon={RiTimeLine}
                hint="Accepted range: 5 to 1440 mins."
                inputClassName="tabular-nums"
              />
            </div>

            {/* Verification Mode Toggle */}
            <div className="p-3.5 rounded-2xl border border-separator-border bg-background-secondary-default flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-body-medium text-text-primary">
                    Manual Dashboard Verification (No Android App)
                  </span>
                  <Chip variant="caption" color={verificationMode === 'PURE_MANUAL' ? 'yellow' : 'lime'}>
                    {verificationMode === 'PURE_MANUAL' ? 'PURE_MANUAL' : 'AUTO'}
                  </Chip>
                </div>
                <span className="text-caption-2-regular text-text-secondary block">
                  Enable for clients who won&apos;t install the Android app — payments route straight to Admin Review.
                </span>
              </div>
              <Switch
                size="md"
                isSelected={verificationMode === 'PURE_MANUAL'}
                onChange={(selected) => setVerificationMode(selected ? 'PURE_MANUAL' : 'AUTO')}
                aria-label="Enable pure manual verification mode"
              />
            </div>

            {/* Webhook Callback URL: Prominent in WEBHOOK_CONNECTED, collapsed in STANDALONE */}
            {accountMode === 'WEBHOOK_CONNECTED' ? (
              <Input
                label="Store Webhook Callback URL"
                placeholder="https://client-store.com/api/v1/webhooks/orbit-payment"
                value={webhookUrl}
                onChange={setWebhookUrl}
                type="url"
                hint="Receives signed payment.verified, order.*, and wallet.synced webhooks."
                leadingIcon={RiGlobalLine}
                inputClassName="font-mono"
              />
            ) : (
              <div className="rounded-2xl border border-separator-border bg-background-secondary-default/40 overflow-hidden">
                <button
                  type="button"
                  aria-expanded={showOptionalWebhook}
                  onClick={() => setShowOptionalWebhook((prev) => !prev)}
                  className="w-full min-h-10 px-4 py-2 flex items-center justify-between gap-2 text-caption-1-medium text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  <span>Optional Webhook Callback URL (Not required for Standalone)</span>
                  <RiArrowDownSLine
                    className={cx(
                      'size-4 transition-transform duration-200',
                      showOptionalWebhook && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>
                {showOptionalWebhook && (
                  <div className="px-4 pb-3.5 pt-2 border-t border-separator-border">
                    <Input
                      label="Webhook Callback URL (Optional)"
                      placeholder="https://app.example.com/webhooks/orbit"
                      value={webhookUrl}
                      onChange={setWebhookUrl}
                      type="url"
                      leadingIcon={RiGlobalLine}
                      inputClassName="font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Optional Initial MFS Wallets */}
            <div className="rounded-2xl border border-separator-border bg-background-secondary-default/40 overflow-hidden">
              <button
                type="button"
                aria-expanded={showInitialWallets}
                onClick={() => setShowInitialWallets((prev) => !prev)}
                className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-2 text-start cursor-pointer hover:bg-background-secondary-hover/40"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <RiSmartphoneLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
                  <span className="text-body-medium text-text-primary truncate">
                    Initial MFS Wallets (Optional)
                  </span>
                  <Chip variant="caption" color="soft">Skip or add now</Chip>
                </div>
                <RiArrowDownSLine
                  className={cx(
                    'size-4 text-foreground-icon-secondary shrink-0 transition-transform duration-200',
                    showInitialWallets && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>

              {showInitialWallets && (
                <div className="px-4 pb-4 pt-3 space-y-3 border-t border-separator-border">
                  <p className="text-caption-2-regular text-text-tertiary">
                    Leave blank to let the client add or change their own MFS numbers later in the portal or Android app.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label={`${MFS_METADATA.BKASH.name} Number (Optional)`}
                      placeholder="017XXXXXXXX"
                      value={bkashNumber}
                      onChange={setBkashNumber}
                      inputClassName="font-mono tabular-nums"
                    />
                    <Input
                      label={`${MFS_METADATA.NAGAD.name} Number (Optional)`}
                      placeholder="018XXXXXXXX"
                      value={nagadNumber}
                      onChange={setNagadNumber}
                      inputClassName="font-mono tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Starter Payment Link Switch */}
            <div className="p-4 rounded-2xl border border-separator-border bg-background-secondary-default space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-body-medium text-text-primary block">
                    Create Starter Payment Link
                  </span>
                  <span className="text-caption-2-regular text-text-secondary block">
                    Generates a ready-to-share payment URL immediately on onboarding.
                  </span>
                </div>
                <Switch
                  size="md"
                  isSelected={createStarterPaymentLink}
                  onChange={setCreateStarterPaymentLink}
                  aria-label="Create Starter Payment Link"
                />
              </div>

              {createStarterPaymentLink && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-separator-border">
                  <Input
                    label="Link Title (Optional)"
                    placeholder="Quick Pay"
                    value={starterLinkTitle}
                    onChange={setStarterLinkTitle}
                  />
                  <Select
                    label="Amount Mode"
                    selectedKey={starterLinkAmountType}
                    onSelectionChange={(key) => {
                      if (key != null) setStarterLinkAmountType(String(key) as 'FIXED' | 'OPEN');
                    }}
                  >
                    <SelectItem id="OPEN" textValue="Open (Buyer Enters)">
                      Open (Buyer Enters)
                    </SelectItem>
                    <SelectItem id="FIXED" textValue="Fixed Amount">
                      Fixed Amount
                    </SelectItem>
                  </Select>
                  {starterLinkAmountType === 'FIXED' && (
                    <Input
                      label="Fixed Amount (BDT)"
                      type="number"
                      placeholder="500"
                      value={starterLinkAmount}
                      onChange={setStarterLinkAmount}
                      inputClassName="font-mono tabular-nums"
                      isRequired
                    />
                  )}
                </div>
              )}
            </div>

            {/* Client Owner Account Provisioning */}
            <div className="p-4 rounded-2xl bg-background-secondary-default border border-separator-border space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-body-medium text-text-primary block">
                    Client Owner Account (Recommended)
                  </span>
                  <span className="text-caption-2-medium text-text-tertiary">
                    Provision Web Portal &amp; Android App credentials for this merchant.
                  </span>
                </div>
                <Chip variant="caption" color="neutral">No public signup</Chip>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Client Owner Email"
                  type="email"
                  placeholder="owner@clientstore.com"
                  value={ownerEmail}
                  onChange={setOwnerEmail}
                  leadingIcon={RiMailLine}
                />
                <Input
                  label="Owner Full Name"
                  placeholder="e.g. Tanvir Ahmed"
                  value={ownerName}
                  onChange={setOwnerName}
                  leadingIcon={RiUserLine}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-end gap-2">
                  <Input
                    label="Owner Password (Optional)"
                    placeholder="Leave blank to auto-generate strong password"
                    value={ownerPassword}
                    onChange={setOwnerPassword}
                    leadingIcon={RiKey2Line}
                    className="flex-1"
                    inputClassName="font-mono"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="medium"
                    leadingIcon={RiRefreshLine}
                    onClick={() => setOwnerPassword(generateStrongPassword())}
                    className="shrink-0"
                  >
                    Generate Strong Password
                  </Button>
                </div>
                <p className="text-caption-2-medium text-text-tertiary">
                  Minimum 6 characters if provided.
                </p>
              </div>
            </div>

            {(validationError || createMutation.isError) && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-notification-error-background border border-border-error-default/20 text-notification-error-foreground text-caption-1-medium flex items-center gap-2"
              >
                <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                <span>
                  {validationError ||
                    (createMutation.error as Error).message ||
                    'Failed to create project'}
                </span>
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              size="medium"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="medium"
              isLoading={createMutation.isPending}
            >
              Onboard &amp; Generate Credentials
            </Button>
          </ModalFooter>
        </form>
      )}
    </Modal>
  );
}
