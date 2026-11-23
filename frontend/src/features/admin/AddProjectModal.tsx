import { useState, type FormEvent } from 'react';
import {
  RiCheckLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiHashtag,
  RiKey2Line,
  RiMailLine,
  RiRefreshLine,
  RiShieldCheckLine,
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
import { toast } from '@/components/base/toast/toast';
import {
  useCreateProjectMutation,
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

export function AddProjectModal({ isOpen, onClose }: AddProjectModalProps) {
  const [storeName, setStoreName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [gracePeriod, setGracePeriod] = useState('60');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [createdResult, setCreatedResult] = useState<CreateProjectResponseData | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const createMutation = useCreateProjectMutation();

  const handleCopy = (text: string, keyId: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleClose = () => {
    setCreatedResult(null);
    setStoreName('');
    setProjectId('');
    setWebhookUrl('');
    setGracePeriod('60');
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
      setValidationError('Storefront name must be at least 2 characters.');
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
        ownerEmail: trimmedEmail || undefined,
        ownerName: trimmedOwnerName || undefined,
        ownerPassword: trimmedPassword || undefined,
      });
      setCreatedResult(res.data);
      toast.success(`Storefront ${res.data.storeName} onboarded`);
    } catch {
      // Error surfaced via createMutation.isError banner
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      size="lg"
    >
      <ModalHeader
        title={
          createdResult
            ? 'Storefront & Client Credentials Created'
            : 'Connect New Client Project'
        }
        description={
          createdResult
            ? 'Deliver these credentials securely to the merchant. Passwords and secrets are shown once.'
            : 'Onboard a new client e-commerce storefront and provision its merchant owner login.'
        }
        icon={createdResult ? RiShieldCheckLine : RiStore2Line}
      />

      {createdResult ? (
        <>
          <ModalBody className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-notification-success-background text-notification-success-foreground text-caption-1-medium flex items-center gap-2.5">
              <RiShieldCheckLine className="size-5 shrink-0" aria-hidden />
              <span>
                Storefront <strong>{createdResult.storeName}</strong> registered
                and ready for merchant sign-in.
              </span>
            </div>

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
            <Input
              label="Storefront / Client Name"
              placeholder="e.g. Aurelia Lifestyle, NewznBD, Gadget Hub"
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

            <Input
              label="Store Webhook Callback URL (Optional)"
              placeholder="https://client-store.com/payment/v1"
              value={webhookUrl}
              onChange={setWebhookUrl}
              type="url"
              hint="Optional while testing. Leave blank if you only want to verify payments in the portal."
              leadingIcon={RiGlobalLine}
              inputClassName="font-mono"
            />

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
