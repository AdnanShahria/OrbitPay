import React, { useState } from 'react';
import { useAddWalletMutation, useWalletsOverview, AccountType } from './useWallets';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/base/modal/modal';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { StatusDot } from '@/components/base/badges/status-dot';
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

const AUTO_DEVICE_KEY = 'AUTO';

export function AddWalletDialog({ isOpen, onClose }: AddWalletDialogProps) {
  const [provider, setProvider] = useState<MfsProvider>('BKASH');
  const [walletNumber, setWalletNumber] = useState('');
  const [label, setLabel] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('PERSONAL');
  const [deviceId, setDeviceId] = useState<string>(AUTO_DEVICE_KEY);
  const [safeVolumeLimit, setSafeVolumeLimit] = useState('250000');
  const [monthlyLimit, setMonthlyLimit] = useState('300000');
  const [isPrimary, setIsPrimary] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const addWalletMutation = useAddWalletMutation();
  const { data: overview } = useWalletsOverview();
  const devices = overview?.devices ?? [];

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

    const parsedSafeLimit = Number(safeVolumeLimit) || 250000;
    const parsedMonthlyLimit = Number(monthlyLimit) || 300000;

    if (parsedSafeLimit <= 0 || parsedMonthlyLimit <= 0) {
      setValidationError('Volume limits must be positive amounts.');
      return;
    }

    if (parsedSafeLimit > parsedMonthlyLimit) {
      setValidationError('Safe rotation threshold cannot exceed the monthly hard ceiling.');
      return;
    }

    try {
      await addWalletMutation.mutateAsync({
        provider,
        accountType,
        walletNumber: cleanNumber,
        label: label.trim() || undefined,
        deviceId: deviceId !== AUTO_DEVICE_KEY ? deviceId : undefined,
        safeVolumeLimit: parsedSafeLimit,
        monthlyVolumeLimit: parsedMonthlyLimit,
        isPrimary,
      });

      toast.success('SIM registered', {
        description: `${MFS_METADATA[provider].name} (${cleanNumber}) added to rotation pool.`,
      });

      // Reset and close
      setWalletNumber('');
      setLabel('');
      setDeviceId(AUTO_DEVICE_KEY);
      setSafeVolumeLimit('250000');
      setMonthlyLimit('300000');
      setIsPrimary(false);
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

          {/* Wallet Number & Optional Label */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Wallet mobile number"
              placeholder="e.g. 017XXXXXXXX"
              value={walletNumber}
              onChange={setWalletNumber}
              leadingIcon={RiSmartphoneLine}
              inputClassName="font-mono tabular-nums"
              hint={
                provider === 'ROCKET'
                  ? '11 or 12-digit Rocket number.'
                  : '11-digit personal or PRA number.'
              }
              isRequired
            />

            <Input
              label="SIM label (optional)"
              placeholder="e.g. SIM A - Primary"
              value={label}
              onChange={setLabel}
              maxLength={60}
              hint="Friendly name for device or slot tracking."
            />
          </div>

          {/* Account Type and Linked Verifier Device */}
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

            <Select
              label="Verifier device"
              selectedKey={deviceId}
              onSelectionChange={(key) => {
                if (key != null) setDeviceId(String(key));
              }}
              className="w-full"
            >
              <SelectItem
                key={AUTO_DEVICE_KEY}
                id={AUTO_DEVICE_KEY}
                textValue="Auto (Any online device)"
              >
                Auto (Any online device)
              </SelectItem>
              {devices.map((device) => (
                <SelectItem
                  key={device.id}
                  id={device.id}
                  textValue={device.deviceName}
                >
                  <span className="flex items-center gap-2">
                    <StatusDot color={device.isOnline ? 'green' : 'yellow'} />
                    <span className="truncate">{device.deviceName}</span>
                    <span className="text-caption-2-medium text-text-tertiary">
                      {device.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </Select>
          </div>

          {/* Safe Threshold and Hard Monthly Ceiling */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Safe rotation threshold (৳)"
              type="number"
              value={safeVolumeLimit}
              onChange={setSafeVolumeLimit}
              inputClassName="font-mono tabular-nums"
              hint="Default ৳250,000 auto-rotation trigger."
            />

            <Input
              label="Monthly hard ceiling (৳)"
              type="number"
              value={monthlyLimit}
              onChange={setMonthlyLimit}
              inputClassName="font-mono tabular-nums"
              hint="Default ৳300,000 hard exclusion cap."
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
