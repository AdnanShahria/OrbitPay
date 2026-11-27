import { useState, type FormEvent } from 'react';
import {
  RiArrowLeftLine,
  RiErrorWarningLine,
  RiEyeLine,
  RiEyeOffLine,
  RiKey2Line,
  RiLock2Line,
  RiLockLine,
  RiMailLine,
  RiShieldUserLine,
} from '@remixicon/react';
import { ThemeToggle } from '@/components/application/theme/theme-toggle';
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
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs';

type AuthMode = 'account' | 'master_key';

interface AdminAuthGateProps {
  onLoginPassword: (email: string, password: string) => Promise<unknown>;
  onLoginMasterKey: (key: string) => Promise<unknown>;
  onExit: () => void;
}

export function AdminAuthGate({
  onLoginPassword,
  onLoginMasterKey,
  onExit,
}: AdminAuthGateProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('account');

  // Admin Account state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Master Security Key state
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV));

  const handleTabChange = (nextKey: unknown) => {
    setAuthMode(nextKey === 'master_key' ? 'master_key' : 'account');
    setErrorMessage(null);
  };

  const handleAccountSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage('Enter both your admin email address and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await onLoginPassword(cleanEmail, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Admin authentication failed';
      setErrorMessage(message || 'Admin authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMasterKeySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const cleanKey = keyInput.trim();
    if (!cleanKey) {
      setErrorMessage('Master Admin Key cannot be empty.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await onLoginMasterKey(cleanKey);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setErrorMessage(message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevQuickFill = () => {
    setKeyInput('orbit_master_admin_2026');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6 relative antialiased">
      <div className="absolute top-4 end-4 sm:top-6 sm:end-6">
        <ThemeToggle appearance="segmented" size="small" />
      </div>

      <Card variant="default" className="w-full max-w-md">
        <CardHeader className="items-center text-center pt-8 pb-2">
          <div className="size-12 rounded-2xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary flex items-center justify-center mb-2 shadow-card">
            <RiLockLine className="size-6" aria-hidden />
          </div>
          <CardTitle className="text-title-2-medium text-text-primary">
            ORBIT Central Hub
          </CardTitle>
          <CardDescription>
            Restricted multi-tenant administrative command center
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-4 pb-8">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl bg-notification-error-background border border-border-error-default/20 px-3.5 py-2.5 text-caption-1-medium text-notification-error-foreground flex items-center gap-2.5"
            >
              <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
              <span>{errorMessage}</span>
            </div>
          )}

          <Tabs selectedKey={authMode} onSelectionChange={handleTabChange}>
            <TabList aria-label="Admin authentication method">
              <Tab id="account" icon={RiShieldUserLine}>
                Admin Account
              </Tab>
              <Tab id="master_key" icon={RiKey2Line}>
                Master Security Key
              </Tab>
            </TabList>

            <TabPanel id="account">
              <form onSubmit={handleAccountSubmit} className="space-y-4">
                <Input
                  label="Admin Email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@orbitsaas.cloud"
                  value={email}
                  onChange={(val) => {
                    setEmail(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  leadingIcon={RiMailLine}
                  isRequired
                />

                <TextField
                  value={password}
                  onChange={(val) => {
                    setPassword(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  isRequired
                >
                  {({ isRequired }) => (
                    <>
                      <Label isRequired={isRequired}>Password</Label>
                      <InputBase
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter admin password"
                        leadingIcon={RiLock2Line}
                        trailingAddon={
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            iconOnly
                            leadingIcon={showPassword ? RiEyeOffLine : RiEyeLine}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            onClick={() => setShowPassword((prev) => !prev)}
                          />
                        }
                      />
                    </>
                  )}
                </TextField>

                <div className="pt-1 flex flex-col gap-2.5">
                  <Button
                    type="submit"
                    variant="primary"
                    size="medium"
                    className="w-full"
                    isLoading={isLoading}
                  >
                    Sign In to Central Hub
                  </Button>
                </div>
              </form>
            </TabPanel>

            <TabPanel id="master_key">
              <form onSubmit={handleMasterKeySubmit} className="space-y-4">
                <TextField
                  value={keyInput}
                  onChange={(val) => {
                    setKeyInput(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  isRequired
                >
                  {({ isRequired }) => (
                    <>
                      <Label isRequired={isRequired}>Master Admin Security Key</Label>
                      <InputBase
                        type={showKey ? 'text' : 'password'}
                        autoComplete="off"
                        placeholder="Enter master admin key..."
                        leadingIcon={RiKey2Line}
                        className="font-mono"
                        trailingAddon={
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            iconOnly
                            leadingIcon={showKey ? RiEyeOffLine : RiEyeLine}
                            aria-label={showKey ? 'Hide master admin key' : 'Show master admin key'}
                            onClick={() => setShowKey((prev) => !prev)}
                          />
                        }
                      />
                    </>
                  )}
                </TextField>

                {isLocalDev && (
                  <div className="flex items-center justify-between text-caption-1-regular">
                    <span className="text-text-tertiary">Local dev default</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleDevQuickFill}
                    >
                      Fill dev key
                    </Button>
                  </div>
                )}

                <div className="pt-1 flex flex-col gap-2.5">
                  <Button
                    type="submit"
                    variant="primary"
                    size="medium"
                    className="w-full"
                    isLoading={isLoading}
                  >
                    Authenticate &amp; Access Command Center
                  </Button>
                </div>
              </form>
            </TabPanel>
          </Tabs>

          <Button
            type="button"
            variant="ghost"
            size="medium"
            onClick={onExit}
            className="w-full"
            leadingIcon={RiArrowLeftLine}
          >
            Return to Storefront Portal
          </Button>

          <p className="text-center text-caption-2-regular text-text-tertiary font-mono">
            IP audited · Timing-safe verification · Edge encrypted
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
