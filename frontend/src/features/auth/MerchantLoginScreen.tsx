import { useState, type FormEvent } from 'react';
import {
  RiErrorWarningLine,
  RiEyeLine,
  RiEyeOffLine,
  RiLock2Line,
  RiMailLine,
  RiShieldCheckLine,
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
import { OrbitMarketingBar, OrbitFloatingWhatsapp } from '@/features/platform/OrbitMarketingBar';
import { useAuth } from './useAuth';

interface MerchantLoginScreenProps {
  onEnterAdmin: () => void;
}

export function MerchantLoginScreen({ onEnterAdmin }: MerchantLoginScreenProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to sign in. Check your credentials.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-full flex flex-col items-center justify-center p-4 sm:p-6 antialiased relative">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle appearance="segmented" size="small" />
      </div>

      <Card variant="default" className="w-full max-w-md">
        <CardHeader className="items-center text-center pt-8 pb-2">
          <div
            aria-hidden
            className="size-12 rounded-2xl bg-text-primary text-background-primary-default flex items-center justify-center mb-3 shadow-card"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <CardTitle className="text-title-2-medium text-text-primary">
            ORBIT Pay Hub
          </CardTitle>
          <CardDescription>
            Sign in to your merchant payment &amp; order command portal
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-4 pb-8">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl bg-notification-error-background border border-border-error-default/25 px-3.5 py-2.5 text-caption-1-medium text-notification-error-foreground flex items-center gap-2.5"
            >
              <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Merchant Email"
              type="email"
              autoComplete="email"
              placeholder="owner@yourstore.com"
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
                    placeholder="Enter your password"
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

            <Button
              type="submit"
              variant="primary"
              size="medium"
              className="w-full mt-2"
              isLoading={isSubmitting}
            >
              Sign In to Merchant Portal
            </Button>
          </form>

          {/* Provisioning notice (no public self-signup) */}
          <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-3.5 flex items-start gap-2.5">
            <RiShieldCheckLine
              className="size-4 text-foreground-icon-secondary shrink-0 mt-0.5"
              aria-hidden
            />
            <div className="space-y-0.5 text-caption-1-regular text-text-secondary">
              <p className="text-caption-1-medium text-text-primary">
                Invite-only merchant access
              </p>
              <p>
                Accounts are provisioned by ORBIT SaaS Administrators. Contact your hub administrator if you need credentials or a password reset.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-separator-border flex items-center justify-between text-caption-2-medium text-text-tertiary">
            <span>Zero-fee edge reconciliation</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              leadingIcon={RiLock2Line}
              onClick={onEnterAdmin}
              title="Open Root Admin Hub (Ctrl+Alt+A)"
            >
              Admin Portal
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="w-full max-w-md mt-4">
        <OrbitMarketingBar compact />
      </div>
      <OrbitFloatingWhatsapp />
    </div>
  );
}
