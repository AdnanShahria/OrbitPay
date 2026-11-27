import { useCheckout, CheckoutConfig } from './useCheckout';
import { CheckoutStepper } from './CheckoutStepper';
import { PollingStatus } from './PollingStatus';
import { CheckoutDisplayHeader } from './CheckoutDisplayHeader';
import { Modal, ModalHeader, ModalBody } from '@/components/base/modal/modal';
import { RiShieldCheckLine } from '@remixicon/react';

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CheckoutConfig;
}

export function CheckoutModal({ isOpen, onClose, config }: CheckoutModalProps) {
  const {
    currentStep,
    preferredStepperStep,
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
    customerEmail,
    setCustomerEmail,
    sessionToken,
    merchantId,
    orderId,
    storeName,
    vertical,
    baseAmount,
    uniqueAmount,
    offsetCents,
    expiresAt,
    graceExpiresAt,
    returnUrl,
    cancelUrl,
    verificationMode,
    receiptPolicy,
    deviceStatus,
    display,
    pollingStatus,
    escalationReason,
    submitAttempts,
    maxSubmitAttempts,
    receiptUrl,
    receiptUploadCount,
    receiptMaxUploads,
    isUploadingReceipt,
    receiptError,
    isSessionLoading,
    isSubmitting,
    errorMessage,
    verifiedData,
    uploadReceipt,
    submitPayment,
    editSubmission,
    markVerified,
    handlePollStateChange,
    emitClose,
  } = useCheckout(config);

  const handleClose = () => {
    emitClose();
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
          <div className="pe-2">
            <CheckoutDisplayHeader
              storeName={storeName}
              orderId={orderId || config.orderId || ''}
              vertical={vertical}
              display={display}
              baseAmount={baseAmount}
              uniqueAmount={uniqueAmount}
              offsetCents={offsetCents}
              isSessionLoading={isSessionLoading}
            />
          </div>
        }
      />

      <ModalBody>
        <div className="w-full">
          {currentStep === 'POLLING' || currentStep === 'SUCCESS' ? (
            <PollingStatus
              orderId={orderId || config.orderId || ''}
              expectedAmount={verifiedData?.amount ?? (Number(paidAmount) || uniqueAmount)}
              provider={selectedProvider}
              trxId={verifiedData?.trxId || trxId}
              senderNumber={senderNumber}
              merchantId={merchantId}
              customerEmail={customerEmail}
              storeName={storeName}
              baseAmount={baseAmount}
              offsetCents={offsetCents}
              initialVerified={currentStep === 'SUCCESS'}
              initialMatchType={verifiedData?.matchType ?? null}
              initialStatus={pollingStatus}
              initialEscalationReason={escalationReason}
              receiptUrl={receiptUrl}
              returnUrl={returnUrl}
              cancelUrl={cancelUrl}
              graceExpiresAt={graceExpiresAt}
              submitAttempts={submitAttempts}
              maxSubmitAttempts={maxSubmitAttempts}
              onEditSubmission={editSubmission}
              onStatusChange={handlePollStateChange}
              onVerified={markVerified}
              onClose={handleClose}
            />
          ) : (
            <CheckoutStepper
              initialStep={preferredStepperStep}
              baseAmount={baseAmount}
              uniqueAmount={uniqueAmount}
              offsetCents={offsetCents}
              orderId={orderId || config.orderId || ''}
              expiresAt={expiresAt}
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
              customerEmail={customerEmail}
              onChangeCustomerEmail={setCustomerEmail}
              verificationMode={verificationMode}
              receiptPolicy={receiptPolicy}
              deviceStatus={deviceStatus}
              sessionToken={sessionToken}
              receiptUrl={receiptUrl}
              receiptUploadCount={receiptUploadCount}
              receiptMaxUploads={receiptMaxUploads}
              isUploadingReceipt={isUploadingReceipt}
              receiptError={receiptError}
              onUploadReceipt={uploadReceipt}
              submitAttempts={submitAttempts}
              maxSubmitAttempts={maxSubmitAttempts}
              onSubmit={submitPayment}
              isSubmitting={isSubmitting}
              isSessionLoading={isSessionLoading}
              errorMessage={errorMessage}
            />
          )}

          {/* Security watermark footer */}
          <div className="pt-4 mt-5 border-t border-separator-border flex items-center justify-between gap-2 text-caption-2-medium text-text-tertiary">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <RiShieldCheckLine className="size-3.5 text-status-lime-text shrink-0" aria-hidden />
              <span>256-bit encrypted verification</span>
            </span>
            <span className="text-caption-2-semibold text-text-secondary whitespace-nowrap">ORBIT Pay Hub</span>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
