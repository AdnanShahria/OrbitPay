import { useState, type FormEvent } from 'react';
import {
  RiAddLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiKey2Line,
  RiMailLine,
  RiRefreshLine,
  RiShieldUserLine,
  RiSmartphoneLine,
  RiUserAddLine,
  RiUserLine,
  RiComputerLine,
} from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Chip } from '@/components/base/badges/chip';
import { Select, SelectItem } from '@/components/base/select/select';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@/components/base/modal/modal';
import { toast } from '@/components/base/toast/toast';
import { formatDate } from '@/shared/utils/format';
import {
  type AdminProjectSummary,
  useAdminProjectUsers,
  useCreateProjectUserMutation,
  useResetUserPasswordMutation,
  useRevokeSessionMutation,
} from './useAdmin';

interface ProjectUsersModalProps {
  project: AdminProjectSummary | null;
  onClose: () => void;
}

function generateStrongPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function ProjectUsersModal({ project, onClose }: ProjectUsersModalProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'MERCHANT_OWNER' | 'MERCHANT_STAFF'>('MERCHANT_OWNER');
  const [revealedCreds, setRevealedCreds] = useState<{
    email: string;
    password: string;
    label: string;
  } | null>(null);
  const [copiedCred, setCopiedCred] = useState(false);

  const { data, isLoading } = useAdminProjectUsers(project?.id ?? null);
  const createUserMutation = useCreateProjectUserMutation();
  const resetPasswordMutation = useResetUserPasswordMutation();
  const revokeSessionMutation = useRevokeSessionMutation();

  const handleCopyRevealed = () => {
    if (!revealedCreds) return;
    navigator.clipboard.writeText(
      `Email: ${revealedCreds.email}\nPassword: ${revealedCreds.password}`,
    );
    setCopiedCred(true);
    toast.success('Credentials copied to clipboard');
    setTimeout(() => setCopiedCred(false), 2000);
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!project || !email.trim()) return;

    try {
      const result = await createUserMutation.mutateAsync({
        projectId: project.id,
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        password: password.trim() || undefined,
        role,
      });

      const finalPassword = result.generatedPassword || password.trim();
      if (finalPassword) {
        setRevealedCreds({
          email: result.user.email,
          password: finalPassword,
          label: 'New User Provisioned',
        });
      }
      setEmail('');
      setFullName('');
      setPassword('');
      toast.success(`User ${result.user.email} created`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!project) return;
    try {
      const result = await resetPasswordMutation.mutateAsync({
        projectId: project.id,
        userId,
      });
      setRevealedCreds({
        email: result.email,
        password: result.newPassword,
        label: 'Password Reset',
      });
      toast.success(`Password reset for ${result.email}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Password reset failed');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!project) return;
    try {
      await revokeSessionMutation.mutateAsync({
        projectId: project.id,
        sessionId,
      });
      toast.success('Session revoked');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke session');
    }
  };

  const handleClose = () => {
    setRevealedCreds(null);
    setEmail('');
    setFullName('');
    setPassword('');
    onClose();
  };

  return (
    <Modal
      isOpen={project !== null}
      onOpenChange={(open) => !open && handleClose()}
      size="lg"
      className="max-h-[90vh]"
    >
      {project && (
        <>
          <ModalHeader
            icon={RiShieldUserLine}
            title={`Users & Auth: ${project.storeName}`}
            description={`Manage provisioned merchant accounts and active JWT sessions for ${project.id}.`}
          />

          <ModalBody className="space-y-6">
            {/* One-time revealed password banner */}
            {revealedCreds && (
              <div className="p-4 rounded-2xl bg-notification-success-background border border-separator-border text-notification-success-foreground space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-medium">{revealedCreds.label} — Save Now</span>
                  <Button
                    variant="secondary"
                    size="xs"
                    leadingIcon={copiedCred ? RiCheckLine : RiFileCopyLine}
                    onClick={handleCopyRevealed}
                  >
                    {copiedCred ? 'Copied' : 'Copy Email & Password'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-caption-1-regular">
                  <div>
                    <span className="opacity-75 block text-caption-2-medium">Email</span>
                    <span className="select-all">{revealedCreds.email}</span>
                  </div>
                  <div>
                    <span className="opacity-75 block text-caption-2-medium">Password</span>
                    <span className="select-all">{revealedCreds.password}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Provision Additional User Form */}
            <form
              onSubmit={handleCreateUser}
              className="p-4 rounded-2xl bg-background-secondary-default border border-separator-border space-y-3.5"
            >
              <div className="flex items-center gap-2 text-body-medium text-text-primary">
                <RiUserAddLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                <span>Provision Merchant User</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Email"
                  type="email"
                  placeholder="staff@store.com"
                  value={email}
                  onChange={setEmail}
                  leadingIcon={RiMailLine}
                  isRequired
                />
                <Input
                  label="Full Name"
                  placeholder="e.g. Operations Lead"
                  value={fullName}
                  onChange={setFullName}
                  leadingIcon={RiUserLine}
                />
                <Select
                  label="Role"
                  selectedKey={role}
                  onSelectionChange={(k) => {
                    if (k != null) setRole(String(k) as 'MERCHANT_OWNER' | 'MERCHANT_STAFF');
                  }}
                >
                  <SelectItem key="MERCHANT_OWNER" id="MERCHANT_OWNER" textValue="Owner">
                    Owner
                  </SelectItem>
                  <SelectItem key="MERCHANT_STAFF" id="MERCHANT_STAFF" textValue="Staff">
                    Staff
                  </SelectItem>
                </Select>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                <Input
                  label="Password (Optional)"
                  placeholder="Blank auto-generates strong password"
                  value={password}
                  onChange={setPassword}
                  leadingIcon={RiKey2Line}
                  className="flex-1"
                  inputClassName="font-mono"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="medium"
                  leadingIcon={RiRefreshLine}
                  onClick={() => setPassword(generateStrongPassword())}
                >
                  Generate
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="medium"
                  leadingIcon={RiAddLine}
                  isLoading={createUserMutation.isPending}
                >
                  Create User
                </Button>
              </div>
            </form>

            {/* Provisioned Users List */}
            <div className="space-y-2.5">
              <h4 className="text-body-medium text-text-primary">
                Provisioned Users ({data?.users?.length ?? 0})
              </h4>

              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : !data?.users?.length ? (
                <div className="p-4 rounded-xl border border-dashed border-border-button-default text-center text-caption-1-regular text-text-secondary">
                  No merchant user accounts provisioned yet. Create one above.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.users.map((u) => (
                    <div
                      key={u.id}
                      className="p-3.5 rounded-xl border border-border-button-default bg-background-primary-default flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-medium text-text-primary truncate">
                            {u.email}
                          </span>
                          <Chip variant="caption" color={u.role === 'MERCHANT_OWNER' ? 'lime' : 'neutral'}>
                            {u.role}
                          </Chip>
                          {!u.isActive && (
                            <Chip variant="caption" color="rose">Disabled</Chip>
                          )}
                        </div>
                        <div className="text-caption-2-regular text-text-tertiary">
                          {u.fullName || 'Unnamed user'} · Last login:{' '}
                          {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        size="xs"
                        leadingIcon={RiKey2Line}
                        isLoading={resetPasswordMutation.isPending}
                        onClick={() => handleResetPassword(u.id)}
                        className="shrink-0"
                      >
                        Reset Password
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active JWT Sessions */}
            <div className="space-y-2.5">
              <h4 className="text-body-medium text-text-primary">
                Active &amp; Recent Sessions ({data?.sessions?.length ?? 0})
              </h4>

              {isLoading ? (
                <Skeleton className="h-14 w-full rounded-xl" />
              ) : !data?.sessions?.length ? (
                <div className="p-4 rounded-xl border border-dashed border-border-button-default text-center text-caption-1-regular text-text-secondary">
                  No active or recorded sessions for this storefront.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.sessions.map((ses) => {
                    const isRevoked = Boolean(ses.revokedAt);
                    return (
                      <div
                        key={ses.id}
                        className="p-3 rounded-xl border border-border-button-default bg-background-secondary-default flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {ses.deviceType === 'ANDROID' ? (
                            <RiSmartphoneLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
                          ) : (
                            <RiComputerLine className="size-4 text-foreground-icon-secondary shrink-0" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-caption-1-semibold text-text-primary font-mono truncate">
                                {ses.id}
                              </span>
                              <Chip variant="caption" color={isRevoked ? 'rose' : 'lime'}>
                                {isRevoked ? 'Revoked' : ses.deviceType}
                              </Chip>
                            </div>
                            <div className="text-caption-2-regular text-text-tertiary truncate">
                              {ses.deviceName || ses.deviceType} · Expires {formatDate(ses.expiresAt)}
                            </div>
                          </div>
                        </div>

                        {!isRevoked && (
                          <Button
                            variant="ghost"
                            size="xs"
                            leadingIcon={RiDeleteBinLine}
                            isLoading={revokeSessionMutation.isPending}
                            onClick={() => handleRevokeSession(ses.id)}
                            className="text-text-destructive shrink-0"
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ModalBody>

          <ModalFooter>
            <Button variant="primary" size="medium" onClick={handleClose}>
              Done
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
