import { useCheckout, CheckoutConfig } from './useCheckout';
import { CheckoutStepper } from './CheckoutStepper';
import { PollingStatus } from './PollingStatus';
import { Modal, ModalHeader, ModalBody } from '@/components/base/modal/modal';
import { formatBDT } from '@/shared/utils/format';
import { RiLock2Line, RiShieldCheckLine } from '@remixicon/react';

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CheckoutConfig;
}

export function CheckoutModal({ isOpen, onClose, config }: CheckoutModalProps) {
  const {
    currentStep,
    selectedProvider,
    setSelectedProvider,
    activeWallet,
    activeWallets,
    senderNumber,
    setSenderNumber,
    paidAmount,
    setPaidAmount,
    trxId,
    setTrxId,
    baseAmount,
    uniqueAmount,
    offsetCents,
    isSessionLoading,
    isSubmitting,
    errorMessage,
    verifiedData,
    submitPayment,
    markVerified,
  } = useCheckout(config);

  const handleClose = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ event: 'checkout.close', orderId: config.orderId }, '*');
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleClose()}
      size="lg"
      className="max-h-[92vh]"
    >
      <ModalHeader
        title={
          <span className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pe-2">
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="size-9 rounded-2lg bg-background-secondary-default border border-border-button-default text-foreground-icon-primary flex items-center justify-center shrink-0">
                <RiLock2Line className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="text-body-medium text-text-primary block truncate">
                  {config.storeName || 'ORBIT Secure Checkout'}
                </span>
                <span className="text-caption-2-medium text-text-tertiary font-mono block">
                  Order #{config.orderId}
                </span>
              </span>
            </span>

            <span className="flex flex-col sm:items-end self-start sm:self-center">
              <span className="text-title-2-medium text-text-primary font-mono tabular-nums tnum">
                {formatBDT(uniqueAmount)}
              </span>
              {offsetCents > 0 && (
                <span className="text-caption-2-medium text-text-tertiary tabular-nums">
                  Base {formatBDT(baseAmount)} + {formatBDT(offsetCents / 100)} code
                </span>
              )}
            </span>
          </span>
        }
      />

      <ModalBody>
        <div className="w-full">
          {currentStep === 'POLLING' || currentStep === 'SUCCESS' ? (
            <PollingStatus
              orderId={config.orderId}
              expectedAmount={verifiedData?.amount ?? (Number(paidAmount) || uniqueAmount)}
              provider={selectedProvider}
              trxId={verifiedData?.trxId || trxId}
              senderNumber={senderNumber}
              merchantId={config.merchantId}
              initialVerified={currentStep === 'SUCCESS'}
              initialMatchType={verifiedData?.matchType ?? null}
              onVerified={markVerified}
              onClose={handleClose}
            />
          ) : (
            <CheckoutStepper
              baseAmount={baseAmount}
              uniqueAmount={uniqueAmount}
              offsetCents={offsetCents}
              orderId={config.orderId}
              selectedProvider={selectedProvider}
              onSelectProvider={setSelectedProvider}
              activeWallet={activeWallet}
              activeWallets={activeWallets}
              senderNumber={senderNumber}
              onChangeSenderNumber={setSenderNumber}
              paidAmount={paidAmount}
              onChangePaidAmount={setPaidAmount}
              trxId={trxId}
              onChangeTrxId={setTrxId}
              onSubmit={submitPayment}
              isSubmitting={isSubmitting}
              isSessionLoading={isSessionLoading}
              errorMessage={errorMessage}
            />
          )}

          {/* Security watermark footer */}
          <div className="pt-5 mt-5 border-t border-separator-border flex items-center justify-between text-caption-2-medium text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <RiShieldCheckLine className="size-3.5 text-status-lime-text" aria-hidden />
              <span>256-bit encrypted MFS verification</span>
            </span>
            <span className="text-caption-2-semibold text-text-secondary">ORBIT Pay Hub</span>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
