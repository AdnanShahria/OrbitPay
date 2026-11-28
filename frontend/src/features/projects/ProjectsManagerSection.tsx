import { useState, type FormEvent } from 'react';
import {
  useMerchantProjects,
  useRotateMerchantProjectKeysMutation,
  useUpdateMerchantProjectMutation,
  type MerchantSubProject,
  type ProjectAccountMode,
  type ProjectVerificationMode,
  type ProjectWalletSelectionMode,
  type RotateProjectKeysResponse,
} from './useProjects';
import { useWallets } from '@/features/wallets/useWallets';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { toast } from '@/components/base/toast/toast';
import { cx } from '@/utils/cx';
import { MFS_METADATA, type MfsProvider } from '@/shared/utils/format';
import {
  RiCheckLine,
  RiEditLine,
  RiFileCopyLine,
  RiFolder3Line,
  RiGlobalLine,
  RiKey2Line,
  RiLock2Line,
  RiRefreshLine,
  RiSmartphoneLine,
} from '@remixicon/react';

export interface ProjectsManagerSectionProps {
  merchantId: string;
  readOnlyLocked: boolean;
  onRequestUnlock: () => void;
}

export function ProjectsManagerSection({
  merchantId,
  readOnlyLocked,
  onRequestUnlock,
}: ProjectsManagerSectionProps) {
  const { data: projects = [], isLoading } = useMerchantProjects();
  const { data: wallets = [] } = useWallets();
  const updateMutation = useUpdateMerchantProjectMutation();
  const rotateKeysMutation = useRotateMerchantProjectKeysMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAccountMode, setEditAccountMode] =
    useState<ProjectAccountMode>('WEBHOOK_CONNECTED');
  const [editVerificationMode, setEditVerificationMode] =
    useState<ProjectVerificationMode>('AUTO');
  const [editWalletMode, setEditWalletMode] =
    useState<ProjectWalletSelectionMode>('COMMON');
  const [editWalletIds, setEditWalletIds] = useState<string[]>([]);
  const [editWebhookUrl, setEditWebhookUrl] = useState('');
  const [editOriginsText, setEditOriginsText] = useState('');

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [rotatedSecrets, setRotatedSecrets] = useState<RotateProjectKeysResponse | null>(null);

  const activeWallets = wallets.filter((w) => w.isActive);
  const walletLookup = new Map(wallets.map((w) => [w.id, w]));

  const startEditing = (proj: MerchantSubProject) => {
    if (readOnlyLocked) {
      onRequestUnlock();
      return;
    }
    setEditingId(proj.id);
    setEditName(proj.name);
    setEditAccountMode(proj.accountMode);
    setEditVerificationMode(proj.verificationMode);
    setEditWalletMode(proj.walletSelectionMode);
    setEditWalletIds(proj.walletIds || []);
    setEditWebhookUrl(proj.webhookUrl || '');
    setEditOriginsText((proj.allowedCallbackOrigins || []).join(', '));
  };

  const handleCopy = (value: string, id: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(id);
    toast.success(`${label} copied`);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const toggleWalletId = (walletId: string) => {
    setEditWalletIds((prev) =>
      prev.includes(walletId) ? prev.filter((id) => id !== walletId) : [...prev, walletId],
    );
  };

  const handleSave = async (e: FormEvent, projId: string) => {
    e.preventDefault();
    if (readOnlyLocked) {
      onRequestUnlock();
      return;
    }
    if (editWalletMode === 'SPECIFIC' && editWalletIds.length === 0) {
      toast.error('Select at least one SIM number or switch to Common Pool');
      return;
    }

    const origins = editOriginsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await updateMutation.mutateAsync({
        projectId: projId,
        patch: {
          name: editName.trim() || undefined,
          accountMode: editAccountMode,
          verificationMode: editVerificationMode,
          walletSelectionMode: editWalletMode,
          walletIds: editWalletMode === 'SPECIFIC' ? editWalletIds : [],
          webhookUrl: editWebhookUrl.trim(),
          allowedCallbackOrigins: origins,
        },
      });
      toast.success('Project settings updated');
      setEditingId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update project');
    }
  };

  const handleRotateKeys = async (proj: MerchantSubProject) => {
    if (readOnlyLocked) {
      onRequestUnlock();
      return;
    }
    try {
      const res = await rotateKeysMutation.mutateAsync({
        projectId: proj.id,
        target: 'all',
      });
      setRotatedSecrets(res);
      toast.success(`New API & webhook keys generated for ${proj.name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to rotate keys');
    }
  };

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://payment.orbitsaas.cloud';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-separator-border bg-background-secondary-default px-4 py-3">
        <div className="space-y-0.5 min-w-0">
          <p className="text-body-medium text-text-primary">
            Admin-Provisioned Sub-Projects ({projects.length})
          </p>
          <p className="text-caption-1-regular text-text-secondary">
            Every sub-project shares your merchant verification engine ({merchantId}) while keeping its own API key, webhook endpoint, and Common or Specific SIM numbers.
          </p>
        </div>
      </div>

      {rotatedSecrets && (
        <div className="rounded-2xl border border-separator-border bg-notification-success-background p-4 space-y-2.5 text-notification-success-foreground">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-medium">
              Rotated credentials for {rotatedSecrets.projectId} (copy now — shown once)
            </span>
            <Button variant="ghost" size="xs" onClick={() => setRotatedSecrets(null)}>
              Dismiss
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-caption-1-regular">
            {rotatedSecrets.apiKey && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-separator-border bg-background-primary-default px-3 py-2 text-text-primary">
                <span className="font-mono truncate">{rotatedSecrets.apiKey}</span>
                <Button
                  variant="secondary"
                  size="xs"
                  iconOnly
                  leadingIcon={copiedKey === 'rot-api' ? RiCheckLine : RiFileCopyLine}
                  aria-label="Copy rotated API key"
                  onClick={() => handleCopy(rotatedSecrets.apiKey!, 'rot-api', 'Project API key')}
                />
              </div>
            )}
            {rotatedSecrets.webhookSecret && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-separator-border bg-background-primary-default px-3 py-2 text-text-primary">
                <span className="font-mono truncate">{rotatedSecrets.webhookSecret}</span>
                <Button
                  variant="secondary"
                  size="xs"
                  iconOnly
                  leadingIcon={copiedKey === 'rot-wh' ? RiCheckLine : RiFileCopyLine}
                  aria-label="Copy rotated webhook secret"
                  onClick={() =>
                    handleCopy(rotatedSecrets.webhookSecret!, 'rot-wh', 'Project webhook secret')
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div aria-busy="true" className="space-y-2.5">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-button-default px-5 py-10 text-center space-y-1.5">
          <RiFolder3Line className="size-7 mx-auto text-foreground-icon-tertiary" aria-hidden />
          <p className="text-body-medium text-text-primary">No sub-projects provisioned yet</p>
          <p className="text-caption-1-regular text-text-secondary max-w-md mx-auto">
            Your Hub Administrator can add multiple projects under your merchant ID so you can connect separate websites, payment links, and SIM assignments.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((proj) => {
            const isEditing = editingId === proj.id;
            const assignedWallets = proj.walletIds
              .map((wid) => walletLookup.get(wid))
              .filter((w): w is NonNullable<typeof w> => Boolean(w));

            const apiHeaderSnippet = `X-Merchant-Api-Key: <YOUR_PROJECT_API_KEY>\nX-Project-Id: ${proj.id}\nPOST ${origin}/api/v1/payment-intents`;

            return (
              <div
                key={proj.id}
                className="rounded-2xl border border-border-button-default bg-background-primary-default p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body-medium text-text-primary">{proj.name}</span>
                      <Chip
                        variant="caption"
                        color={proj.accountMode === 'STANDALONE' ? 'cyan' : 'soft'}
                      >
                        {proj.accountMode === 'STANDALONE' ? 'Standalone' : 'Webhook-Connected'}
                      </Chip>
                      <Chip
                        variant="caption"
                        color={proj.verificationMode === 'PURE_MANUAL' ? 'yellow' : 'lime'}
                      >
                        {proj.verificationMode}
                      </Chip>
                      <Chip
                        variant="caption"
                        color={proj.walletSelectionMode === 'SPECIFIC' ? 'purple' : 'neutral'}
                      >
                        {proj.walletSelectionMode === 'SPECIFIC'
                          ? `Specific SIMs (${assignedWallets.length})`
                          : 'Common SIM Pool'}
                      </Chip>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-caption-2-regular text-text-tertiary">
                      <span className="font-mono text-text-secondary">{proj.id}</span>
                      <span aria-hidden>·</span>
                      <span className="font-mono">slug: {proj.slug}</span>
                      {proj.apiKeyPrefix && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="font-mono">{proj.apiKeyPrefix}•••</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <Button
                      variant="secondary"
                      size="xs"
                      leadingIcon={copiedKey === `id-${proj.id}` ? RiCheckLine : RiFileCopyLine}
                      onClick={() => handleCopy(proj.id, `id-${proj.id}`, 'Project ID')}
                    >
                      {copiedKey === `id-${proj.id}` ? 'Copied' : 'Copy ID'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="xs"
                      leadingIcon={copiedKey === `snip-${proj.id}` ? RiCheckLine : RiFileCopyLine}
                      onClick={() =>
                        handleCopy(apiHeaderSnippet, `snip-${proj.id}`, 'Project API snippet')
                      }
                    >
                      Snippet
                    </Button>
                    <Button
                      variant="secondary"
                      size="xs"
                      leadingIcon={readOnlyLocked ? RiLock2Line : RiEditLine}
                      onClick={() => (isEditing ? setEditingId(null) : startEditing(proj))}
                    >
                      {isEditing ? 'Close' : 'Configure'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      leadingIcon={readOnlyLocked ? RiLock2Line : RiRefreshLine}
                      isLoading={rotateKeysMutation.isPending}
                      onClick={() => handleRotateKeys(proj)}
                    >
                      Rotate Keys
                    </Button>
                  </div>
                </div>

                {/* Webhook & SIM summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-separator-border text-caption-1-regular">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <RiGlobalLine
                      className="size-3.5 text-foreground-icon-tertiary shrink-0"
                      aria-hidden
                    />
                    <span className="font-mono text-text-secondary truncate">
                      {proj.webhookUrl || 'No webhook URL configured'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RiSmartphoneLine
                      className="size-3.5 text-foreground-icon-tertiary shrink-0"
                      aria-hidden
                    />
                    {proj.walletSelectionMode === 'COMMON' ? (
                      <span className="text-text-secondary">
                        Uses all active merchant SIM numbers ({activeWallets.length})
                      </span>
                    ) : assignedWallets.length === 0 ? (
                      <span className="text-text-error-primary">
                        No SIM numbers assigned yet
                      </span>
                    ) : (
                      assignedWallets.map((w) => (
                        <Chip key={w.id} variant="caption" color="soft" className="font-mono">
                          {MFS_METADATA[w.provider as MfsProvider]?.name || w.provider}{' '}
                          {w.walletNumber}
                        </Chip>
                      ))
                    )}
                  </div>
                </div>

                {/* Inline Configuration Form */}
                {isEditing && (
                  <form
                    onSubmit={(e) => handleSave(e, proj.id)}
                    className="rounded-xl border border-separator-border bg-background-secondary-default p-4 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Input
                        label="Project Name"
                        value={editName}
                        onChange={setEditName}
                        isRequired
                      />
                      <Select
                        label="Connection Mode"
                        selectedKey={editAccountMode}
                        onSelectionChange={(key) => {
                          if (key != null) setEditAccountMode(String(key) as ProjectAccountMode);
                        }}
                      >
                        <SelectItem id="WEBHOOK_CONNECTED" textValue="Website / Webhook">
                          Website / Webhook
                        </SelectItem>
                        <SelectItem id="STANDALONE" textValue="Standalone / Links Only">
                          Standalone / Links Only
                        </SelectItem>
                      </Select>
                      <Select
                        label="Verification Mode"
                        selectedKey={editVerificationMode}
                        onSelectionChange={(key) => {
                          if (key != null) {
                            setEditVerificationMode(String(key) as ProjectVerificationMode);
                          }
                        }}
                      >
                        <SelectItem id="AUTO" textValue="AUTO (SMS Match)">
                          AUTO (SMS Match)
                        </SelectItem>
                        <SelectItem id="PURE_MANUAL" textValue="PURE_MANUAL (Manual Review)">
                          PURE_MANUAL (Manual Review)
                        </SelectItem>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="Webhook URL (Website Callback)"
                        type="url"
                        value={editWebhookUrl}
                        onChange={setEditWebhookUrl}
                        placeholder="https://yoursite.com/api/webhooks/orbit"
                      />
                      <Input
                        label="Allowed Callback Origins (Comma-separated)"
                        value={editOriginsText}
                        onChange={setEditOriginsText}
                        placeholder="https://yoursite.com, https://app.yoursite.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Select
                        label="Receiving SIM Numbers"
                        selectedKey={editWalletMode}
                        onSelectionChange={(key) => {
                          if (key != null) {
                            setEditWalletMode(String(key) as ProjectWalletSelectionMode);
                          }
                        }}
                      >
                        <SelectItem id="COMMON" textValue="Common Pool (All Active Merchant SIMs)">
                          Common Pool (All Active Merchant SIMs)
                        </SelectItem>
                        <SelectItem id="SPECIFIC" textValue="Specific Selected SIM Numbers">
                          Specific Selected SIM Numbers
                        </SelectItem>
                      </Select>

                      {editWalletMode === 'SPECIFIC' && (
                        <div className="rounded-xl border border-border-button-default bg-background-primary-default p-3 space-y-2">
                          <span className="text-caption-1-medium text-text-secondary block">
                            Select SIM numbers allowed for {proj.name}
                          </span>
                          {activeWallets.length === 0 ? (
                            <p className="text-caption-1-regular text-text-tertiary">
                              Add SIM numbers in SIM Pool first.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {activeWallets.map((w) => {
                                const selected = editWalletIds.includes(w.id);
                                return (
                                  <button
                                    key={w.id}
                                    type="button"
                                    onClick={() => toggleWalletId(w.id)}
                                    className={cx(
                                      'min-h-9 px-3 py-1.5 rounded-xl border text-caption-1-medium font-mono inline-flex items-center gap-1.5 transition-colors cursor-pointer',
                                      selected
                                        ? 'border-border-focus-ring bg-background-secondary-default text-text-primary'
                                        : 'border-border-button-default bg-background-primary-default text-text-secondary hover:bg-background-secondary-hover',
                                    )}
                                  >
                                    {selected && <RiCheckLine className="size-3.5" aria-hidden />}
                                    <span>
                                      {MFS_METADATA[w.provider as MfsProvider]?.name || w.provider}:{' '}
                                      {w.walletNumber}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="xs"
                        leadingIcon={RiKey2Line}
                        isLoading={updateMutation.isPending}
                      >
                        Save Project Setup
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
