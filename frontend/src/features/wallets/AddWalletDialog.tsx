import React, { useState } from 'react';
import { useAddWalletMutation, AccountType } from './useWallets';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/base/modal/modal';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { Switch } from '@/components/base/switch/switch';
import { toast } from '@/components/base/toast/toast';
import { MfsProvider, MFS_METADATA } from '@/shared/utils/format';
import { cx } from '@/utils/cx';
import {
  RiAddLine,
  RiSmartphoneLine,
  RiErrorWarningLine,
} from '@remixicon/react';

export interface AddWalletDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWalletDialog({ isOpen, onClose }: AddWalletDialogProps) {
  const [provider, setProvider] = useState<MfsProvider>('BKASH');
  const [walletNumber, setWalletNumber] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('PERSONAL');
  const [monthlyLimit, setMonthlyLimit] = useState('300000');
  const [isPrimary, setIsPrimary] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const addWalletMutation = useAddWalletMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const cleanNumber = walletNumber.trim().replace(/^\+88/, '');

    // Validate phone numbers
    if (provider === 'ROCKET') {
      if (!/^01[3-9]\d{8,9}$/.test(cleanNumber)) {
        setValidationError('Rocket numbers must be 11 or 12 digits starting with 01');
        return;
      }
    } else {
      if (!/^01[3-9]\d{8}$/.test(cleanNumber)) {
        setValidationError(`${MFS_METADATA[provider].name} numbers must be 11 digits starting with 01`);
        return;
      }
    }

    try {
      await addWalletMutation.mutateAsync({
        provider,
        accountType,
        walletNumber: cleanNumber,
        monthlyVolumeLimit: Number(monthlyLimit) || 300000,
        isPrimary,
      });

      toast.success('SIM registered', {
        description: `${MFS_METADATA[provider].name} (${cleanNumber}) added to rotation pool.`,
      });

      // Reset and close
      setWalletNumber('');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register SIM';
      setValidationError(message);
    }
  };

  const providers: MfsProvider[] = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CELLFIN'];

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="md"
    >
      <ModalHeader
        icon={RiSmartphoneLine}
        title="Add MFS SIM to pool"
        description="Register a secondary SIM to enable automatic quota rotation and eliminate downtime."
      />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <ModalBody className="space-y-5">
          {/* Provider Selection */}
          <div className="space-y-2">
            <span className="block text-body-medium text-text-primary">
              MFS provider
            </span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {providers.map((p) => {
                const meta = MFS_METADATA[p];
                const isSelected = provider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setProvider(p)}
                    className={cx(
                      'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                      isSelected
                        ? 'border-border-button-active bg-background-secondary-default text-text-primary shadow-xs'
                        : 'border-border-button-default bg-background-primary-default text-text-secondary hover:border-border-button-hover hover:bg-background-primary-hover'
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-3 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className={cx('text-caption-1-medium', isSelected && meta.textClass)}>
                      {meta.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wallet Number */}
          <Input
            label="Wallet mobile number"
            placeholder="e.g. 017XXXXXXXX"
            value={walletNumber}
            onChange={setWalletNumber}
            leadingIcon={RiSmartphoneLine}
            inputClassName="font-mono tabular-nums"
            hint={
              provider === 'ROCKET'
                ? 'Enter 11-digit or 12-digit (with check digit) Rocket account number.'
                : 'Enter 11-digit personal or PRA mobile number.'
            }
            isRequired
          />

          {/* Account Type and Monthly Limit */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Account type"
              selectedKey={accountType}
              onSelectionChange={(key) => {
                if (key != null) setAccountType(String(key) as AccountType);
              }}
              className="w-full"
            >
              <SelectItem key="PERSONAL" id="PERSONAL" textValue="Personal account">
                Personal account
              </SelectItem>
              <SelectItem key="PRA" id="PRA" textValue="Personal retail (PRA)">
                Personal retail (PRA)
              </SelectItem>
              <SelectItem key="MERCHANT" id="MERCHANT" textValue="Merchant account">
                Merchant account
              </SelectItem>
            </Select>

            <Input
              label="Monthly limit ceiling (৳)"
              type="number"
              value={monthlyLimit}
              onChange={setMonthlyLimit}
              inputClassName="font-mono tabular-nums"
              hint="Default ৳300,000 threshold."
            />
          </div>

          {/* Primary Priority Toggle */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-separator-border bg-background-secondary-default p-3.5">
            <div>
              <span className="block text-body-medium text-text-primary">
                Set as primary active SIM
              </span>
              <span className="text-caption-1-regular text-text-secondary">
                If enabled, newly created checkout sessions prioritize this SIM first.
              </span>
            </div>
            <Switch
              size="md"
              isSelected={isPrimary}
              onChange={setIsPrimary}
              aria-label="Set as primary active SIM"
            />
          </div>

          {validationError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-notification-error-background p-3 text-caption-1-medium text-notification-error-foreground"
            >
              <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
              <span>{validationError}</span>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={addWalletMutation.isPending}
            leadingIcon={RiAddLine}
          >
            Register SIM
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
