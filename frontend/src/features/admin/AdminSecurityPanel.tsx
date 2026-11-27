import { useState, type FormEvent } from 'react';
import {
  RiAddLine,
  RiCheckLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiComputerLine,
  RiDatabase2Line,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiEyeLine,
  RiEyeOffLine,
  RiFileCopyLine,
  RiHistoryLine,
  RiKey2Line,
  RiLock2Line,
  RiLogoutBoxRLine,
  RiMailLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiShieldKeyholeLine,
  RiShieldUserLine,
  RiUserAddLine,
  RiUserLine,
} from '@remixicon/react';
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
import { Input, InputBase, TextField } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import {
  AlertDialog,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@/components/base/modal/modal';
import { Select, SelectItem } from '@/components/base/select/select';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/base/table/table';
import { toast } from '@/components/base/toast/toast';
import { formatDate } from '@/shared/utils/format';
import {
  type AdminAuthSessionInfo,
  type AdminSystemHealth,
  type AdminUserProfile,
  useAdminSecurityState,
  useBootstrapAdminMutation,
  useCreateAdminUserMutation,
  useEnsureAdminSchemaMutation,
  useRevokeAdminSessionMutation,
  useUpdateAdminUserMutation,
} from './useAdmin';

interface AdminSecurityPanelProps {
  admin: AdminUserProfile | null;
  session: AdminAuthSessionInfo | null;
  hasAdminUsersProp: boolean | null;
  systemHealth?: AdminSystemHealth;
  isHealthLoading: boolean;
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
  onLogoutAll: () => Promise<void>;
  onRefreshAuth: () => Promise<boolean>;
}

function generateStrongPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function getSessionStatus(ses: AdminAuthSessionInfo): {
  label: 'Active' | 'Revoked' | 'Expired';
  color: ChipColor;
} {
  if (ses.revokedAt) {
    return { label: 'Revoked', color: 'rose' };
  }
  if (ses.expiresAt && new Date(ses.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', color: 'neutral' };
  }
  return { label: 'Active', color: 'lime' };
}

export function AdminSecurityPanel({
  admin,
  session,
  hasAdminUsersProp,
  systemHealth,
  isHealthLoading,
  isLoggingOut,
  onLogout,
  onLogoutAll,
  onRefreshAuth,
}: AdminSecurityPanelProps) {
  const {
    data: security,
    isLoading: isSecurityLoading,
    isFetching: isSecurityFetching,
    refetch: refetchSecurity,
  } = useAdminSecurityState(true);

  const ensureSchemaMutation = useEnsureAdminSchemaMutation();
  const bootstrapMutation = useBootstrapAdminMutation();
  const revokeSessionMutation = useRevokeAdminSessionMutation();
  const createUserMutation = useCreateAdminUserMutation();
  const updateUserMutation = useUpdateAdminUserMutation();

  // Logout All confirmation
  const [isLogoutAllOpen, setIsLogoutAllOpen] = useState(false);

  // Bootstrap first admin state
  const [bootEmail, setBootEmail] = useState('');
  const [bootFullName, setBootFullName] = useState('');
  const [bootPassword, setBootPassword] = useState('');
  const [showBootPassword, setShowBootPassword] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // Create Admin Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'SUPER_ADMIN' | 'ADMIN_OPERATOR'>('ADMIN_OPERATOR');
  const [newPassword, setNewPassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Revealed one-time password banner
  const [revealedSecret, setRevealedSecret] = useState<{
    email: string;
    password: string;
    title: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Reset Password Modal state
  const [resetTarget, setResetTarget] = useState<AdminUserProfile | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');

  const currentAdmin = security?.currentAdmin ?? admin;
  const currentSession = security?.currentSession ?? session;
  const hasAdminUsers = security?.hasAdminUsers ?? hasAdminUsersProp ?? false;
  const adminUsers = security?.adminUsers ?? [];
  const sessions = security?.sessions ?? [];
  const auditLogs = security?.auditLogs ?? [];

  const handleRepairSchema = async () => {
    try {
      await ensureSchemaMutation.mutateAsync();
      toast.success('D1 schema verified and repaired');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Schema repair failed');
    }
  };

  const handleBootstrap = async (e: FormEvent) => {
    e.preventDefault();
    if (bootstrapMutation.isPending) return;

    const cleanEmail = bootEmail.trim();
    const cleanName = bootFullName.trim() || 'Super Admin';
    if (!cleanEmail || bootPassword.length < 8) {
      setBootError('Enter a valid email and a password with at least 8 characters.');
      return;
    }

    setBootError(null);
    try {
      await bootstrapMutation.mutateAsync({
        email: cleanEmail,
        fullName: cleanName,
        password: bootPassword,
      });
      toast.success(`Super Admin account ${cleanEmail} bootstrapped`);
      setBootEmail('');
      setBootFullName('');
      setBootPassword('');
      await onRefreshAuth();
      await refetchSecurity();
    } catch (err: unknown) {
      setBootError(err instanceof Error ? err.message : 'Bootstrap failed');
    }
  };

  const handleCreateAdminUser = async (e: FormEvent) => {
    e.preventDefault();
    if (createUserMutation.isPending) return;

    const cleanEmail = newEmail.trim();
    const cleanName = newFullName.trim() || cleanEmail.split('@')[0] || 'Hub Admin';
    if (!cleanEmail || cleanName.length < 2) {
      setCreateError('Admin email address and name (min 2 chars) are required.');
      return;
    }

    setCreateError(null);
    try {
      const res = await createUserMutation.mutateAsync({
        email: cleanEmail,
        fullName: cleanName,
        role: newRole,
        password: newPassword.trim() || undefined,
      });
      const generated =
        res.temporaryPassword || res.generatedPassword || res.password || newPassword.trim();
      if (generated) {
        setRevealedSecret({
          email: res.user.email,
          password: generated,
          title: 'Admin Account Created',
        });
      }
      toast.success(`Created admin account ${res.user.email}`);
      setIsCreateModalOpen(false);
      setNewEmail('');
      setNewFullName('');
      setNewPassword('');
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create admin account');
    }
  };

  const handleToggleUserActive = async (user: AdminUserProfile) => {
    try {
      await updateUserMutation.mutateAsync({
        id: user.id,
        updates: { isActive: !user.isActive },
      });
      toast.success(
        user.isActive ? `Disabled ${user.email}` : `Re-enabled ${user.email}`,
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update admin user');
    }
  };

  const handleConfirmResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget || updateUserMutation.isPending) return;

    const nextPwd = resetPasswordInput.trim() || generateStrongPassword();
    if (nextPwd.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    try {
      const res = await updateUserMutation.mutateAsync({
        id: resetTarget.id,
        updates: { resetPassword: nextPwd },
      });
      const finalPwd =
        res.temporaryPassword || res.generatedPassword || res.password || nextPwd;
      setRevealedSecret({
        email: resetTarget.email,
        password: finalPwd,
        title: 'Admin Password Reset',
      });
      toast.success(`Password updated for ${resetTarget.email}`);
      setResetTarget(null);
      setResetPasswordInput('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Password reset failed');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSessionMutation.mutateAsync(sessionId);
      toast.success('Admin session revoked');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke session');
    }
  };

  const handleCopyRevealed = () => {
    if (!revealedSecret) return;
    navigator.clipboard.writeText(
      `Email: ${revealedSecret.email}\nPassword: ${revealedSecret.password}`,
    );
    setCopiedSecret(true);
    toast.success('Admin credentials copied to clipboard');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* One-time revealed password banner */}
      {revealedSecret && (
        <div className="rounded-2xl border border-separator-border bg-notification-success-background p-4 text-notification-success-foreground space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body-medium">
              {revealedSecret.title} — Save Credentials Now
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                leadingIcon={copiedSecret ? RiCheckLine : RiFileCopyLine}
                onClick={handleCopyRevealed}
              >
                {copiedSecret ? 'Copied' : 'Copy Email & Password'}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setRevealedSecret(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-caption-1-regular">
            <div>
              <span className="opacity-75 block text-caption-2-medium">Email</span>
              <span className="select-all">{revealedSecret.email}</span>
            </div>
            <div>
              <span className="opacity-75 block text-caption-2-medium">Password</span>
              <span className="select-all">{revealedSecret.password}</span>
            </div>
          </div>
        </div>
      )}

      {/* 1. Current Session & Quick Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiShieldKeyholeLine className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Current Admin Session</CardTitle>
                <CardDescription>
                  Active Root Hub authentication identity, token lifecycle, and emergency session controls.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="small"
                onClick={() => refetchSecurity()}
                isLoading={isSecurityFetching && !isSecurityLoading}
                leadingIcon={RiRefreshLine}
              >
                Refresh
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={onLogout}
                isLoading={isLoggingOut}
                leadingIcon={RiLogoutBoxRLine}
              >
                Logout Current Session
              </Button>
              <Button
                variant="danger"
                size="small"
                onClick={() => setIsLogoutAllOpen(true)}
                leadingIcon={RiDeleteBinLine}
              >
                Logout Everywhere
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3.5 space-y-1">
              <span className="text-caption-2-medium text-text-tertiary block">
                Signed-In Identity
              </span>
              <span className="text-body-medium text-text-primary block truncate">
                {currentAdmin?.email || 'Master Security Key'}
              </span>
              <div className="flex items-center gap-1.5 pt-0.5">
                <Chip variant="caption" color="rose">
                  {currentAdmin?.role || 'MASTER_ADMIN'}
                </Chip>
              </div>
            </div>

            <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3.5 space-y-1">
              <span className="text-caption-2-medium text-text-tertiary block">
                Authentication Method
              </span>
              <span className="text-body-medium text-text-primary block">
                {currentSession?.authMethod === 'PASSWORD'
                  ? 'Password JWT'
                  : currentSession?.authMethod === 'MASTER_KEY'
                    ? 'Master Key JWT'
                    : currentAdmin?.id && currentAdmin.id !== 'master_admin'
                      ? 'Password JWT'
                      : 'Master Key'}
              </span>
              <span className="text-caption-2-regular text-text-tertiary block">
                HMAC-SHA256 D1 Session
              </span>
            </div>

            <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3.5 space-y-1">
              <span className="text-caption-2-medium text-text-tertiary block">
                Session ID
              </span>
              <span className="font-mono text-caption-1-medium text-text-primary block truncate">
                {currentSession?.id || 'Stateless Master Key'}
              </span>
              <span className="text-caption-2-regular text-text-tertiary block truncate">
                IP: {currentSession?.ipAddress || 'Edge verified'}
              </span>
            </div>

            <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3.5 space-y-1">
              <span className="text-caption-2-medium text-text-tertiary block">
                Session Expiry
              </span>
              <span className="text-caption-1-medium text-text-primary tabular-nums block">
                {currentSession?.expiresAt
                  ? formatDate(currentSession.expiresAt)
                  : '24h rolling'}
              </span>
              <span className="text-caption-2-regular text-text-tertiary block">
                Auto-revoked on logout
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. System Health & D1 Schema Diagnostics */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiDatabase2Line className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>System Health &amp; D1 Schema Diagnostics</CardTitle>
                <CardDescription>
                  Runtime environment bindings, Durable Objects, R2 storage, and Cloudflare D1 table integrity.
                </CardDescription>
              </div>
            </div>

            <Button
              variant="secondary"
              size="small"
              onClick={handleRepairSchema}
              isLoading={ensureSchemaMutation.isPending}
              leadingIcon={RiShieldCheckLine}
            >
              Verify &amp; Repair Schema
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isHealthLoading ? (
            <div aria-busy="true" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((idx) => (
                <Skeleton key={idx} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3 space-y-1">
                  <span className="text-caption-2-medium text-text-tertiary block">Environment</span>
                  <Chip
                    variant="caption"
                    color={systemHealth?.environment === 'production' ? 'cyan' : 'yellow'}
                  >
                    {systemHealth?.environment || 'unknown'}
                  </Chip>
                </div>

                <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3 space-y-1">
                  <span className="text-caption-2-medium text-text-tertiary block">R2 Bucket</span>
                  <Chip
                    variant="caption"
                    color={systemHealth?.r2Configured ? 'lime' : 'yellow'}
                    className="gap-1.5"
                  >
                    <StatusDot color={systemHealth?.r2Configured ? 'green' : 'yellow'} />
                    <span>{systemHealth?.r2Configured ? 'Bound' : 'Missing'}</span>
                  </Chip>
                </div>

                <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3 space-y-1">
                  <span className="text-caption-2-medium text-text-tertiary block">
                    Durable Object PUSH_HUB
                  </span>
                  <Chip
                    variant="caption"
                    color={systemHealth?.pushHubConfigured ? 'lime' : 'neutral'}
                    className="gap-1.5"
                  >
                    {systemHealth?.pushHubConfigured && <StatusDot color="green" />}
                    <span>{systemHealth?.pushHubConfigured ? 'Active' : 'Unbound'}</span>
                  </Chip>
                </div>

                <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3 space-y-1">
                  <span className="text-caption-2-medium text-text-tertiary block">FCM HTTP v1</span>
                  <Chip
                    variant="caption"
                    color={systemHealth?.fcmConfigured ? 'lime' : 'neutral'}
                  >
                    {systemHealth?.fcmConfigured ? 'Configured' : 'Optional / Off'}
                  </Chip>
                </div>

                <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3 space-y-1">
                  <span className="text-caption-2-medium text-text-tertiary block">SMS Simulator</span>
                  <Chip
                    variant="caption"
                    color={systemHealth?.simulatorEnabled ? 'yellow' : 'neutral'}
                  >
                    {systemHealth?.simulatorEnabled ? 'Dev Enabled' : 'Prod Locked'}
                  </Chip>
                </div>
              </div>

              {systemHealth?.tables && systemHealth.tables.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {systemHealth.tables.map((t) => (
                    <div
                      key={t.name}
                      className="rounded-xl border border-separator-border bg-background-primary-default px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <span className="font-mono text-caption-2-medium text-text-primary truncate">
                        {t.name}
                      </span>
                      {t.exists ? (
                        <RiCheckboxCircleLine
                          className="size-4 text-status-lime-text shrink-0"
                          aria-label="Table present"
                        />
                      ) : (
                        <RiCloseCircleLine
                          className="size-4 text-status-rose-text shrink-0"
                          aria-label="Table missing"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Bootstrap First Admin OR Admin Accounts Management */}
      {!hasAdminUsers ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiUserAddLine className="size-4" aria-hidden />
              </span>
              <div>
                <CardTitle>Bootstrap First Super Admin Account</CardTitle>
                <CardDescription>
                  No password-based admin accounts exist yet. Create the first SUPER_ADMIN so you can sign in without exposing the Master Security Key.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Super Admin Email"
                  type="email"
                  placeholder="founder@orbitsaas.cloud"
                  value={bootEmail}
                  onChange={setBootEmail}
                  leadingIcon={RiMailLine}
                  isRequired
                />
                <Input
                  label="Full Name"
                  placeholder="e.g. Adnan Rahman"
                  value={bootFullName}
                  onChange={setBootFullName}
                  leadingIcon={RiUserLine}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <TextField
                  value={bootPassword}
                  onChange={setBootPassword}
                  isRequired
                  className="flex-1"
                >
                  {({ isRequired }) => (
                    <>
                      <Label isRequired={isRequired}>Password (min 8 chars)</Label>
                      <InputBase
                        type={showBootPassword ? 'text' : 'password'}
                        placeholder="Enter a strong password..."
                        leadingIcon={RiLock2Line}
                        className="font-mono"
                        trailingAddon={
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            iconOnly
                            leadingIcon={showBootPassword ? RiEyeOffLine : RiEyeLine}
                            aria-label={showBootPassword ? 'Hide password' : 'Show password'}
                            onClick={() => setShowBootPassword((p) => !p)}
                          />
                        }
                      />
                    </>
                  )}
                </TextField>

                <Button
                  type="button"
                  variant="secondary"
                  size="medium"
                  leadingIcon={RiRefreshLine}
                  onClick={() => {
                    setBootPassword(generateStrongPassword());
                    setShowBootPassword(true);
                  }}
                >
                  Generate
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="medium"
                  isLoading={bootstrapMutation.isPending}
                  leadingIcon={RiShieldCheckLine}
                >
                  Create Super Admin
                </Button>
              </div>

              {bootError && (
                <div
                  role="alert"
                  className="rounded-xl border border-border-error-default/20 bg-notification-error-background px-3 py-2 text-caption-1-medium text-notification-error-foreground flex items-center gap-2"
                >
                  <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                  <span>{bootError}</span>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                  <RiShieldUserLine className="size-4" aria-hidden />
                </span>
                <div>
                  <CardTitle>Admin Accounts ({adminUsers.length})</CardTitle>
                  <CardDescription>
                    Manage SUPER_ADMIN and ADMIN_OPERATOR credentials for the ORBIT Central Hub.
                  </CardDescription>
                </div>
              </div>

              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  setCreateError(null);
                  setIsCreateModalOpen(true);
                }}
                leadingIcon={RiAddLine}
              >
                Create Admin Account
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isSecurityLoading ? (
              <div aria-busy="true" className="p-5 space-y-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : adminUsers.length === 0 ? (
              <div className="p-6 text-center text-caption-1-regular text-text-secondary">
                No admin accounts found.
              </div>
            ) : (
              <Table aria-label="Admin accounts" size="sm">
                <TableHeader>
                  <TableColumn isRowHeader>Admin user</TableColumn>
                  <TableColumn>Role</TableColumn>
                  <TableColumn>Status</TableColumn>
                  <TableColumn>Last login</TableColumn>
                  <TableColumn className="text-end">Actions</TableColumn>
                </TableHeader>
                <TableBody>
                  {adminUsers.map((u) => (
                    <TableRow key={u.id} id={u.id}>
                      <TableCell>
                        <div className="flex flex-col min-w-0">
                          <span className="text-body-medium text-text-primary truncate">
                            {u.email}
                          </span>
                          <span className="text-caption-2-regular text-text-tertiary truncate">
                            {u.fullName || 'Administrator'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip
                          variant="caption"
                          color={u.role === 'SUPER_ADMIN' ? 'rose' : 'cyan'}
                        >
                          {u.role}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <Chip
                          variant="bold"
                          color={u.isActive !== false ? 'lime' : 'neutral'}
                        >
                          {u.isActive !== false ? 'Active' : 'Disabled'}
                        </Chip>
                      </TableCell>
                      <TableCell className="text-caption-1-regular text-text-secondary tabular-nums">
                        {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleToggleUserActive(u)}
                            isLoading={updateUserMutation.isPending}
                          >
                            {u.isActive !== false ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            leadingIcon={RiKey2Line}
                            onClick={() => {
                              setResetTarget(u);
                              setResetPasswordInput('');
                            }}
                          >
                            Reset Password
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* 4. Active & Recent Admin Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiComputerLine className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle>Active &amp; Recent Admin Sessions ({sessions.length})</CardTitle>
              <CardDescription>
                Every admin JWT session is persisted in D1 and can be revoked instantaneously.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isSecurityLoading ? (
            <div aria-busy="true" className="p-5 space-y-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-center text-caption-1-regular text-text-secondary">
              No admin sessions recorded yet.
            </div>
          ) : (
            <Table aria-label="Admin sessions" size="sm">
              <TableHeader>
                <TableColumn isRowHeader>Session ID</TableColumn>
                <TableColumn>Identity &amp; method</TableColumn>
                <TableColumn>Role</TableColumn>
                <TableColumn>IP address</TableColumn>
                <TableColumn>User agent</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn className="text-end">Action</TableColumn>
              </TableHeader>
              <TableBody>
                {sessions.map((ses) => {
                  const statusMeta = getSessionStatus(ses);
                  const isCurrent = currentSession?.id === ses.id;
                  return (
                    <TableRow key={ses.id} id={ses.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-caption-1-medium text-text-primary truncate max-w-36">
                            {ses.id}
                          </span>
                          {isCurrent && (
                            <Chip variant="caption" color="cyan">
                              Current
                            </Chip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col min-w-0">
                          <span className="text-caption-1-medium text-text-primary truncate">
                            {ses.email || 'Master Key Session'}
                          </span>
                          <span className="text-caption-2-regular text-text-tertiary">
                            {ses.authMethod || 'JWT'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip variant="caption" color="soft">
                          {ses.role || 'ADMIN'}
                        </Chip>
                      </TableCell>
                      <TableCell className="font-mono text-caption-1-regular text-text-secondary tabular-nums">
                        {ses.ipAddress || '—'}
                      </TableCell>
                      <TableCell>
                        <span
                          title={ses.userAgent || ''}
                          className="text-caption-2-regular text-text-tertiary block max-w-44 truncate"
                        >
                          {ses.userAgent || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Chip variant="bold" color={statusMeta.color}>
                          {statusMeta.label}
                        </Chip>
                      </TableCell>
                      <TableCell className="text-end">
                        {statusMeta.label === 'Active' ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            leadingIcon={RiDeleteBinLine}
                            className="text-text-destructive"
                            isLoading={revokeSessionMutation.isPending}
                            onClick={() => handleRevokeSession(ses.id)}
                          >
                            Revoke
                          </Button>
                        ) : (
                          <span className="text-caption-2-regular text-text-tertiary">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 5. Admin Security Audit Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
              <RiHistoryLine className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle>Admin Security Audit Log ({auditLogs.length})</CardTitle>
              <CardDescription>
                Immutable trail of admin sign-ins, logouts, account mutations, and destructive actions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isSecurityLoading ? (
            <div aria-busy="true" className="p-5 space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="p-6 text-center text-caption-1-regular text-text-secondary">
              No security audit events logged yet.
            </div>
          ) : (
            <Table aria-label="Admin security audit log" size="sm">
              <TableHeader>
                <TableColumn isRowHeader>Timestamp</TableColumn>
                <TableColumn>Action</TableColumn>
                <TableColumn>Actor</TableColumn>
                <TableColumn>Target</TableColumn>
                <TableColumn>IP address</TableColumn>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id} id={log.id}>
                    <TableCell className="text-caption-1-regular text-text-secondary tabular-nums">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        variant="caption"
                        color={
                          log.action.includes('FAILED') || log.action.includes('DELETE') || log.action.includes('REVOKE')
                            ? 'rose'
                            : log.action.includes('LOGIN') || log.action.includes('CREATE')
                              ? 'lime'
                              : 'neutral'
                        }
                      >
                        {log.action}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-caption-1-medium text-text-primary">
                      {log.actorEmail || log.actorId || 'System'}
                    </TableCell>
                    <TableCell className="font-mono text-caption-2-regular text-text-secondary">
                      {log.targetId
                        ? `${log.targetType ? `${log.targetType}: ` : ''}${log.targetId}`
                        : log.targetType || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-caption-1-regular text-text-tertiary tabular-nums">
                      {log.ipAddress || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Logout Everywhere Confirmation */}
      <AlertDialog
        isOpen={isLogoutAllOpen}
        onOpenChange={setIsLogoutAllOpen}
        variant="danger"
        title="Logout all admin sessions?"
        description="This immediately revokes every active Root Admin session across all browsers and devices, including your current session."
        confirmLabel="Revoke All & Logout"
        pendingLabel="Revoking..."
        onConfirm={onLogoutAll}
      />

      {/* Create Admin Account Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onOpenChange={(open) => !open && setIsCreateModalOpen(false)}
        size="md"
      >
        <form onSubmit={handleCreateAdminUser} className="flex min-h-0 flex-1 flex-col gap-4">
          <ModalHeader
            icon={RiUserAddLine}
            title="Create Admin Account"
            description="Provision a new administrator account for the ORBIT Central Hub."
          />
          <ModalBody className="space-y-4">
            <Input
              label="Admin Email"
              type="email"
              placeholder="operator@orbitsaas.cloud"
              value={newEmail}
              onChange={setNewEmail}
              leadingIcon={RiMailLine}
              isRequired
            />
            <Input
              label="Full Name"
              placeholder="e.g. Ops Lead"
              value={newFullName}
              onChange={setNewFullName}
              leadingIcon={RiUserLine}
            />
            <Select
              label="Admin Role"
              selectedKey={newRole}
              onSelectionChange={(k) => {
                if (k != null) setNewRole(String(k) as 'SUPER_ADMIN' | 'ADMIN_OPERATOR');
              }}
            >
              <SelectItem key="ADMIN_OPERATOR" id="ADMIN_OPERATOR" textValue="Admin Operator">
                ADMIN_OPERATOR
              </SelectItem>
              <SelectItem key="SUPER_ADMIN" id="SUPER_ADMIN" textValue="Super Admin">
                SUPER_ADMIN
              </SelectItem>
            </Select>
            <div className="flex items-end gap-2">
              <Input
                label="Password (Optional)"
                placeholder="Blank auto-generates strong password"
                value={newPassword}
                onChange={setNewPassword}
                leadingIcon={RiKey2Line}
                className="flex-1"
                inputClassName="font-mono"
              />
              <Button
                type="button"
                variant="secondary"
                size="medium"
                leadingIcon={RiRefreshLine}
                onClick={() => setNewPassword(generateStrongPassword())}
              >
                Generate
              </Button>
            </div>
            {createError && (
              <div
                role="alert"
                className="rounded-xl border border-border-error-default/20 bg-notification-error-background px-3 py-2 text-caption-1-medium text-notification-error-foreground flex items-center gap-2"
              >
                <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
                <span>{createError}</span>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              size="medium"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="medium"
              isLoading={createUserMutation.isPending}
            >
              Create Account
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Reset Admin Password Modal */}
      <Modal
        isOpen={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
        size="sm"
      >
        {resetTarget && (
          <form onSubmit={handleConfirmResetPassword} className="flex min-h-0 flex-1 flex-col gap-4">
            <ModalHeader
              icon={RiKey2Line}
              title="Reset Admin Password"
              description={`Set a new password for ${resetTarget.email}.`}
            />
            <ModalBody className="space-y-3">
              <div className="flex items-end gap-2">
                <Input
                  label="New Password (Optional)"
                  placeholder="Blank auto-generates strong password"
                  value={resetPasswordInput}
                  onChange={setResetPasswordInput}
                  leadingIcon={RiLock2Line}
                  className="flex-1"
                  inputClassName="font-mono"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="medium"
                  leadingIcon={RiRefreshLine}
                  onClick={() => setResetPasswordInput(generateStrongPassword())}
                >
                  Generate
                </Button>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="ghost"
                size="medium"
                onClick={() => setResetTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="medium"
                isLoading={updateUserMutation.isPending}
              >
                Update Password
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </div>
  );
}
