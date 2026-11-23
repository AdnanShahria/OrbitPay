import { useState, type FormEvent } from 'react';
import {
  RiArrowLeftLine,
  RiErrorWarningLine,
  RiEyeLine,
  RiEyeOffLine,
  RiKey2Line,
  RiLockLine,
} from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/base/card/card';
import { Input } from '@/components/base/input/input';

interface AdminAuthGateProps {
  onSuccess: (key: string) => void;
  onExit: () => void;
}

export function AdminAuthGate({ onSuccess, onExit }: AdminAuthGateProps) {
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = keyInput.trim();
    if (!cleanKey) {
      setErrorMessage('Master Admin Key cannot be empty');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/admin/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: cleanKey }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid Master Admin Key');
      }

      onSuccess(cleanKey);
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
    <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6">
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                label="Master Admin Security Key"
                type={showKey ? 'text' : 'password'}
                placeholder="Enter master admin key..."
                value={keyInput}
                onChange={(val) => {
                  setKeyInput(val);
                  if (errorMessage) setErrorMessage(null);
                }}
                isRequired
                leadingIcon={RiKey2Line}
                fieldClassName="pe-10"
                inputClassName="font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? 'Hide master admin key' : 'Show master admin key'}
                title={showKey ? 'Hide key' : 'Show key'}
                className="absolute right-2 bottom-1.5 inline-flex size-6 items-center justify-center rounded-md text-foreground-icon-secondary transition-colors hover:text-foreground-icon-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring cursor-pointer"
              >
                {showKey ? (
                  <RiEyeOffLine className="size-4" aria-hidden />
                ) : (
                  <RiEyeLine className="size-4" aria-hidden />
                )}
              </button>
            </div>

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

            <div className="pt-1 flex flex-col gap-2.5">
              <Button
                type="submit"
                variant="primary"
                size="medium"
                className="w-full"
                isLoading={isLoading}
              >
                Authenticate & Access Command Center
              </Button>

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
            </div>
          </form>

          <p className="text-center text-caption-2-regular text-text-tertiary font-mono">
            IP audited · Timing-safe verification · Edge encrypted
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
