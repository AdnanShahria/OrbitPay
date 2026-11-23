import { useState } from 'react';
import { Transaction, usePendingQueue, useManualMatchMutation } from './useTransactions';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/base/modal/modal';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Chip } from '@/components/base/badges/chip';
import { StatusDot } from '@/components/base/badges/status-dot';
import { toast } from '@/components/base/toast/toast';
import { formatBDT, formatDate, MFS_METADATA } from '@/shared/utils/format';
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiArrowRightLine,
  RiMessage2Line,
  RiSparklingLine,
} from '@remixicon/react';

export interface UnclaimedModalProps {
  transaction: Transaction;
  isOpen: boolean;
  onClose: () => void;
}

export function UnclaimedModal({
  transaction,
  isOpen,
  onClose,
}: UnclaimedModalProps) {
  const [manualOrderId, setManualOrderId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: queueItems } = usePendingQueue();
  const manualMatchMutation = useManualMatchMutation();

  // Find candidate orders in the waiting queue matching uniqueAmount, baseAmount, or expectedAmount
  const candidateOrders = (queueItems || []).filter(
    (item) =>
      item.status === 'WAITING_FOR_SMS' &&
      (Math.abs(item.expectedAmount - transaction.amount) < 0.01 ||
        (item.uniqueAmount != null && Math.abs(item.uniqueAmount - transaction.amount) < 0.01) ||
        (item.baseAmount != null && Math.abs(item.baseAmount - transaction.amount) < 0.01))
  );

  const handleMatch = async (orderId: string) => {
    const trimmedOrderId = orderId.trim();
    try {
      setErrorMsg(null);
      await manualMatchMutation.mutateAsync({
        smsId: transaction.id,
        externalOrderId: trimmedOrderId,
        notes: `Manual typo resolution from portal for TrxID ${transaction.trxId}`,
      });
      toast.success('Order matched', {
        description: `Bound TrxID ${transaction.trxId} to ${trimmedOrderId}.`,
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Match failed';
      setErrorMsg(message);
    }
  };

  const meta = MFS_METADATA[transaction.provider] || {
    name: transaction.provider,
    color: '#52525B',
    textClass: 'text-text-primary',
    borderClass: 'border-border-button-default',
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
    >
      <ModalHeader
        icon={RiErrorWarningLine}
        title="Typo rescue and manual order match"
        description="Resolve customer typing errors by binding this unclaimed incoming SMS to an awaiting store order."
      />

      <ModalBody className="space-y-5">
        {/* Unclaimed Transaction Summary Box */}
        <div className="space-y-3 rounded-2xl border border-separator-border bg-background-secondary-default p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-caption-1-medium bg-background-primary-default ${meta.borderClass} ${meta.textClass}`}
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span>{meta.name}</span>
              </span>
              <span className="font-mono text-body-medium text-text-primary tabular-nums">
                TrxID: {transaction.trxId}
              </span>
            </div>
            <Chip variant="bold" color="yellow" className="gap-1.5">
              <StatusDot color="yellow" />
              <span>Unclaimed SMS</span>
            </Chip>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-separator-border pt-3 sm:grid-cols-3">
            <div>
              <span className="block text-caption-2-medium text-text-tertiary">
                Received amount
              </span>
              <span className="text-title-3-semibold text-text-primary tabular-nums">
                {formatBDT(transaction.amount)}
              </span>
            </div>
            <div>
              <span className="block text-caption-2-medium text-text-tertiary">
                Sender number
              </span>
              <span className="font-mono text-body-medium text-text-primary tabular-nums">
                {transaction.senderNumber}
              </span>
            </div>
            <div>
              <span className="block text-caption-2-medium text-text-tertiary">
                Received at
              </span>
              <span className="text-caption-1-regular text-text-secondary tabular-nums">
                {formatDate(transaction.smsReceivedAt)}
              </span>
            </div>
          </div>

          {/* Raw SMS Snippet */}
          <div className="rounded-xl border border-separator-border bg-background-primary-default p-3">
            <div className="mb-1 flex items-center gap-1.5 text-caption-2-medium text-text-tertiary">
              <RiMessage2Line className="size-3.5 shrink-0" aria-hidden />
              <span>Captured raw SMS body</span>
            </div>
            <p className="break-words font-mono text-caption-1-regular text-text-secondary select-all">
              {transaction.rawSms}
            </p>
          </div>
        </div>

        {/* Auto-Discovered Pending Orders Candidates */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-body-medium text-text-primary">
              <RiSparklingLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
              <span>Smart candidates (exact {formatBDT(transaction.amount)} match)</span>
            </h4>
            <span className="text-caption-2-medium text-text-tertiary tabular-nums">
              {candidateOrders.length} pending order(s)
            </span>
          </div>

          {candidateOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-button-default p-4 text-center text-caption-1-regular text-text-secondary">
              No orders waiting in queue for exactly {formatBDT(transaction.amount)}. You can enter an order ID manually below.
            </div>
          ) : (
            <div className="space-y-2">
              {candidateOrders.map((cand) => (
                <div
                  key={cand.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border-button-default bg-background-primary-default p-3.5 transition-colors hover:border-border-button-hover sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-body-medium text-text-primary tabular-nums">
                        {cand.externalOrderId}
                      </span>
                      <span className="text-caption-2-medium text-text-tertiary">
                        {cand.customerEmail}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-caption-1-regular text-text-secondary">
                      <span>
                        Customer typed:{' '}
                        <code className="font-mono text-text-primary">{cand.submittedTrxId}</code>
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        From:{' '}
                        <code className="font-mono tabular-nums">{cand.submittedSender}</code>
                      </span>
                    </div>
                  </div>

                  <Button
                    size="small"
                    variant="primary"
                    isLoading={manualMatchMutation.isPending}
                    onClick={() => handleMatch(cand.externalOrderId)}
                    leadingIcon={RiCheckboxCircleLine}
                    className="shrink-0"
                  >
                    1-Click match
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual Order ID Entry */}
        <div className="space-y-2.5 border-t border-separator-border pt-4">
          <h4 className="text-body-medium text-text-primary">
            Manual order assignment
          </h4>
          <p className="text-caption-1-regular text-text-secondary">
            If the customer reported a typo via support, enter their store order number directly:
          </p>

          <div className="flex items-start gap-2">
            <Input
              aria-label="Manual order ID"
              placeholder="e.g. ORD-10492 or AURELIA-9921"
              value={manualOrderId}
              onChange={setManualOrderId}
              inputClassName="font-mono"
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="medium"
              disabled={!manualOrderId.trim()}
              isLoading={manualMatchMutation.isPending}
              onClick={() => handleMatch(manualOrderId)}
              trailingIcon={RiArrowRightLine}
              className="shrink-0"
            >
              Verify order
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-notification-error-background p-3 text-caption-1-medium text-notification-error-foreground"
          >
            <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
            <span>{errorMsg}</span>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <span className="text-caption-2-medium text-text-tertiary sm:me-auto">
          Triggers an HMAC webhook to your storefront callback immediately.
        </span>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
