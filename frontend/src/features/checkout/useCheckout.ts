import { useState, useEffect, useCallback, useRef } from 'react';
import { MfsProvider, MFS_METADATA, formatBDT } from '@/shared/utils/format';
import { unwrapApiResponse } from '@/shared/utils/api';
import { toast } from '@/components/base/toast/toast';

export type VerificationMode = 'AUTO' | 'PURE_MANUAL';
export type ReceiptPolicy =
  | 'OFFLINE_OPTIONAL'
  | 'ALWAYS_OPTIONAL'
  | 'ALWAYS_REQUIRED'
  | 'DISABLED'
  | 'OPTIONAL_ON_OFFLINE'
  | 'REQUIRED_ON_MANUAL';

export type CheckoutPollStatus =
  | 'PENDING_VERIFICATION'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export interface DeviceStatusSnapshot {
  online: boolean;
  lastSeenAt?: string | null;
  minutesAgo?: number | null;
  activeSockets?: number;
}

export interface DisplayHighlight {
  label: string;
  value: string;
}

export interface PaymentDisplayMetadata {
  appName?: string;
  appDomain?: string;
  category?: string;
  referenceLabel?: string;
  title?: string;
  subtitle?: string;
  highlights?: DisplayHighlight[];
  adminDeepLink?: string;
}

export interface PaymentActionDef {
  id: string;
  label: string;
  style?: 'primary' | 'secondary' | 'danger';
  webhookEvent?: string;
}

export interface CheckoutVerifiedEvent {
  orderId: string;
  externalRefId?: string;
  paymentIntentId?: string | null;
  sessionId?: string | null;
  trxId: string;
  amount: number;
  matchType?: string | null;
}

export interface CheckoutPendingEvent {
  orderId: string;
  externalRefId?: string;
  paymentIntentId?: string | null;
  sessionId?: string | null;
  status: 'PENDING_VERIFICATION' | 'MANUAL_REVIEW_REQUIRED';
  trxId?: string;
  amount?: number;
  escalationReason?: string | null;
}

export interface CheckoutConfig {
  sessionId?: string;
  sessionToken?: string;
  merchantId?: string;
  orderId?: string;
  amount?: number;
  customerEmail?: string;
  storeName?: string;
  parentOrigin?: string;
  initialStep?: 1 | 2 | 3;
  onSuccess?: (data: CheckoutVerifiedEvent) => void;
  onPending?: (data: CheckoutPendingEvent) => void;
  onError?: (err: unknown) => void;
  onClose?: () => void;
}

export interface ActiveWallet {
  provider: MfsProvider;
  walletNumber: string;
  accountType: 'PERSONAL' | 'PRA' | 'MERCHANT';
  isPrimary?: boolean;
}

export interface CheckoutSessionData {
  sessionId?: string;
  paymentIntentId?: string | null;
  sessionToken?: string;
  merchantId: string;
  orderId?: string;
  externalOrderId?: string;
  externalRefId?: string;
  storeName?: string;
  vertical?: string;
  status?: string;
  sessionStatus?: string;
  baseAmount: number;
  uniqueAmount: number;
  expectedAmount?: number;
  offsetCents: number;
  provider?: MfsProvider | null;
  verificationMode?: VerificationMode;
  receiptPolicy?: ReceiptPolicy;
  customerEmail?: string | null;
  deviceStatus?: DeviceStatusSnapshot;
  activeWallets: ActiveWallet[];
  display?: PaymentDisplayMetadata;
  actions?: PaymentActionDef[];
  trxId?: string | null;
  paidAmount?: number | null;
  matchType?: string | null;
  receiptUrl?: string | null;
  escalationReason?: string | null;
  returnUrl?: string | null;
  cancelUrl?: string | null;
  graceExpiresAt?: string | null;
  expiresAt?: string;
  createdAt?: string;
}

export interface VerifyCheckoutResponse {
  status: 'VERIFIED' | 'PENDING_VERIFICATION' | 'MANUAL_REVIEW_REQUIRED';
  paymentIntentId?: string;
  trxId: string;
  amount: number;
  baseAmount?: number;
  uniqueAmount?: number;
  paidAmount?: number;
  matchType?: string | null;
  escalationReason?: string | null;
  provider: MfsProvider;
  customerEmail?: string | null;
  deviceOnline?: boolean;
  receiptPolicy?: ReceiptPolicy;
  stateVersion?: number;
  message?: string;
  expiresAt?: string;
}

export interface ReceiptUploadResponse {
  receiptAssetId: string;
  receiptUrl: string;
  uploadCount: number;
  maxUploads: number;
}

export const DEFAULT_MERCHANT_ID = 'mer_live_fb8eb757cceb7c35';
export const MAX_SUBMIT_ATTEMPTS = 3;

export type CheckoutStep = 'SELECT_PROVIDER' | 'INSTRUCTIONS' | 'SUBMIT_TRX' | 'POLLING' | 'SUCCESS';

function resolveTargetOrigin(rawOrigin?: string): string {
  if (!rawOrigin) return '*';
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    // Ignore malformed origin query param
  }
  return '*';
}

function postParentMessage(payload: Record<string, unknown>, targetOrigin: string) {
  if (typeof window === 'undefined') return;
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, targetOrigin);
    }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, targetOrigin);
    }
  } catch {
    // Ignore cross-origin postMessage frame errors
  }
}

export function useCheckout(config: CheckoutConfig) {
  const initialAmount = Number(config.amount) > 0 ? Number(config.amount) : 0;
  const targetOrigin = resolveTargetOrigin(config.parentOrigin);

  const [currentStep, setCurrentStep] = useState<CheckoutStep>('SELECT_PROVIDER');
  const [preferredStepperStep, setPreferredStepperStep] = useState<1 | 2 | 3>(
    config.initialStep ?? 1,
  );
  const [selectedProvider, setSelectedProvider] = useState<MfsProvider>('BKASH');
  const [senderNumber, setSenderNumber] = useState('');
  const [paidAmount, setPaidAmount] = useState(() =>
    initialAmount > 0 ? initialAmount.toFixed(2) : '',
  );
  const [trxId, setTrxId] = useState('');
  const [customerEmail, setCustomerEmail] = useState<string>(() =>
    config.customerEmail?.trim() &&
    config.customerEmail.trim().toLowerCase() !== 'buyer@orbitsaas.cloud'
      ? config.customerEmail.trim()
      : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | undefined>(config.sessionId);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | undefined>(config.sessionToken);
  const [merchantId, setMerchantId] = useState<string>(
    config.merchantId?.trim() || DEFAULT_MERCHANT_ID,
  );
  const [orderId, setOrderId] = useState<string>(config.orderId?.trim() || '');
  const [storeName, setStoreName] = useState<string>(
    config.storeName?.trim() || 'ORBIT Secure Checkout',
  );
  const [vertical, setVertical] = useState<string>('ecommerce');

  const [baseAmount, setBaseAmount] = useState<number>(initialAmount);
  const [uniqueAmount, setUniqueAmount] = useState<number>(initialAmount);
  const [offsetCents, setOffsetCents] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);
  const [graceExpiresAt, setGraceExpiresAt] = useState<string | undefined>(undefined);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [cancelUrl, setCancelUrl] = useState<string | null>(null);

  const [verificationMode, setVerificationMode] = useState<VerificationMode>('AUTO');
  const [receiptPolicy, setReceiptPolicy] = useState<ReceiptPolicy>('OFFLINE_OPTIONAL');
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusSnapshot>({ online: true });
  const [display, setDisplay] = useState<PaymentDisplayMetadata | null>(null);
  const [actions, setActions] = useState<PaymentActionDef[]>([]);

  const [pollingStatus, setPollingStatus] = useState<CheckoutPollStatus>('PENDING_VERIFICATION');
  const [escalationReason, setEscalationReason] = useState<string | null>(null);
  const [submitAttempts, setSubmitAttempts] = useState<number>(0);

  const [receiptAssetId, setReceiptAssetId] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptUploadCount, setReceiptUploadCount] = useState<number>(0);
  const [receiptMaxUploads, setReceiptMaxUploads] = useState<number>(3);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const [verifiedData, setVerifiedData] = useState<{
    trxId: string;
    amount: number;
    matchType?: string | null;
    verifiedAt: string;
  } | null>(null);

  const [activeWallets, setActiveWallets] = useState<ActiveWallet[]>([]);

  // Strict provider matching — never fall back to another provider's wallet when user picks a standby tile
  const matchingWallets = activeWallets.filter((w) => w.provider === selectedProvider);
  const activeWallet: ActiveWallet | null =
    matchingWallets.find((w) => w.isPrimary) || matchingWallets[0] || null;

  const onSuccessRef = useRef(config.onSuccess);
  const onPendingRef = useRef(config.onPending);
  const onErrorRef = useRef(config.onError);
  const hasEmittedVerifiedRef = useRef(false);
  const lastPendingKeyRef = useRef<string | null>(null);
  const hasEmittedFailedRef = useRef(false);

  useEffect(() => {
    onSuccessRef.current = config.onSuccess;
  }, [config.onSuccess]);

  useEffect(() => {
    onPendingRef.current = config.onPending;
  }, [config.onPending]);

  useEffect(() => {
    onErrorRef.current = config.onError;
  }, [config.onError]);

  const emitVerifiedOnce = useCallback(
    (payload: {
      orderId: string;
      paymentIntentId?: string | null;
      sessionId?: string | null;
      trxId: string;
      amount: number;
      matchType?: string | null;
    }) => {
      if (hasEmittedVerifiedRef.current) return;
      hasEmittedVerifiedRef.current = true;

      const eventData: CheckoutVerifiedEvent = {
        orderId: payload.orderId,
        externalRefId: payload.orderId,
        paymentIntentId: payload.paymentIntentId ?? null,
        sessionId: payload.sessionId ?? null,
        trxId: payload.trxId,
        amount: payload.amount,
        matchType: payload.matchType ?? null,
      };

      onSuccessRef.current?.(eventData);
      postParentMessage(
        {
          type: 'ORBIT_PAYMENT_VERIFIED',
          event: 'payment.verified',
          status: 'VERIFIED',
          ...eventData,
        },
        targetOrigin,
      );
    },
    [targetOrigin],
  );

  const emitPending = useCallback(
    (payload: {
      orderId: string;
      paymentIntentId?: string | null;
      sessionId?: string | null;
      status: 'PENDING_VERIFICATION' | 'MANUAL_REVIEW_REQUIRED';
      trxId?: string;
      amount?: number;
      escalationReason?: string | null;
    }) => {
      const dedupeKey = `${payload.status}:${payload.trxId || ''}`;
      if (lastPendingKeyRef.current === dedupeKey) return;
      lastPendingKeyRef.current = dedupeKey;

      const eventData: CheckoutPendingEvent = {
        orderId: payload.orderId,
        externalRefId: payload.orderId,
        paymentIntentId: payload.paymentIntentId ?? null,
        sessionId: payload.sessionId ?? null,
        status: payload.status,
        trxId: payload.trxId,
        amount: payload.amount,
        escalationReason: payload.escalationReason ?? null,
      };

      onPendingRef.current?.(eventData);
      postParentMessage(
        {
          type: 'ORBIT_PAYMENT_PENDING',
          event: 'payment.pending',
          ...eventData,
        },
        targetOrigin,
      );
    },
    [targetOrigin],
  );

  const emitFailedOnce = useCallback(
    (payload: {
      orderId: string;
      paymentIntentId?: string | null;
      sessionId?: string | null;
      status: 'REJECTED' | 'EXPIRED';
      trxId?: string;
      error: string;
    }) => {
      if (hasEmittedFailedRef.current) return;
      hasEmittedFailedRef.current = true;

      onErrorRef.current?.(payload.error);
      postParentMessage(
        {
          type: 'ORBIT_PAYMENT_FAILED',
          event: 'payment.failed',
          ...payload,
          externalRefId: payload.orderId,
        },
        targetOrigin,
      );
    },
    [targetOrigin],
  );

  const emitClose = useCallback(() => {
    postParentMessage(
      {
        type: 'ORBIT_CHECKOUT_CLOSE',
        event: 'checkout.close',
        orderId,
        externalRefId: orderId,
        sessionId,
      },
      targetOrigin,
    );
  }, [orderId, sessionId, targetOrigin]);

  // Hydrate by sessionId (first-class) OR initialize legacy session via POST /checkout/session
  useEffect(() => {
    let isMounted = true;
    hasEmittedVerifiedRef.current = false;
    lastPendingKeyRef.current = null;
    hasEmittedFailedRef.current = false;

    setIsSessionLoading(true);
    setErrorMessage(null);

    const effectiveMerchant = config.merchantId?.trim() || DEFAULT_MERCHANT_ID;
    const effectiveOrder = config.orderId?.trim() || '';

    async function hydrateOrCreate() {
      try {
        let data: CheckoutSessionData;

        if (config.sessionId) {
          const res = await fetch(
            `/api/v1/checkout/sessions/${encodeURIComponent(config.sessionId)}`,
          );
          data = await unwrapApiResponse<CheckoutSessionData>(
            res,
            'Failed to load checkout session',
          );
        } else {
          if (!effectiveOrder || initialAmount <= 0) {
            throw new Error('Checkout requires either a valid sessionId or orderId & amount.');
          }

          const body: Record<string, unknown> = {
            merchantId: effectiveMerchant,
            orderId: effectiveOrder,
            amount: initialAmount,
          };
          if (config.customerEmail?.trim()) {
            body.customerEmail = config.customerEmail.trim();
          }

          const res = await fetch('/api/v1/checkout/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          data = await unwrapApiResponse<CheckoutSessionData>(
            res,
            'Failed to initialize checkout session',
          );
        }

        if (!isMounted) return;

        const resolvedOrderId =
          data.externalRefId || data.externalOrderId || data.orderId || effectiveOrder;
        const resolvedBase = Number(data.baseAmount ?? initialAmount);
        const resolvedUnique = Number(
          data.uniqueAmount ?? data.expectedAmount ?? resolvedBase,
        );
        const resolvedOffset =
          typeof data.offsetCents === 'number'
            ? data.offsetCents
            : Math.round((resolvedUnique - resolvedBase) * 100);

        setSessionId(data.sessionId || config.sessionId);
        setPaymentIntentId(data.paymentIntentId ?? null);
        if (data.sessionToken) {
          setSessionToken(data.sessionToken);
        } else if (config.sessionToken) {
          setSessionToken(config.sessionToken);
        }
        setMerchantId(data.merchantId || effectiveMerchant);
        setOrderId(resolvedOrderId);
        setStoreName(data.storeName || config.storeName || 'ORBIT Secure Checkout');
        if (data.vertical) setVertical(data.vertical);

        setBaseAmount(resolvedBase);
        setUniqueAmount(resolvedUnique);
        setOffsetCents(resolvedOffset);
        setExpiresAt(data.expiresAt);
        setGraceExpiresAt(data.graceExpiresAt ?? undefined);
        setReturnUrl(data.returnUrl ?? null);
        setCancelUrl(data.cancelUrl ?? null);

        if (data.verificationMode) setVerificationMode(data.verificationMode);
        if (data.receiptPolicy) setReceiptPolicy(data.receiptPolicy);
        if (data.deviceStatus) setDeviceStatus(data.deviceStatus);
        if (data.display) setDisplay(data.display);
        if (data.actions) setActions(data.actions);
        if (data.receiptUrl) setReceiptUrl(data.receiptUrl);
        if (data.trxId) setTrxId(data.trxId);
        if (
          data.customerEmail?.trim() &&
          data.customerEmail.trim().toLowerCase() !== 'buyer@orbitsaas.cloud'
        ) {
          setCustomerEmail(data.customerEmail.trim());
        }

        setPaidAmount(
          data.paidAmount != null
            ? Number(data.paidAmount).toFixed(2)
            : resolvedUnique.toFixed(2),
        );

        if (data.activeWallets?.length) {
          setActiveWallets(data.activeWallets);
          if (data.provider && data.activeWallets.some((w) => w.provider === data.provider)) {
            setSelectedProvider(data.provider);
          } else {
            const primaryWallet =
              data.activeWallets.find((w) => w.isPrimary) || data.activeWallets[0];
            setSelectedProvider(primaryWallet.provider);
          }
        } else {
          setActiveWallets([]);
        }

        // Hydrate terminal / in-flight states seamlessly on page refresh
        if (data.status === 'VERIFIED' || data.sessionStatus === 'VERIFIED') {
          const finalAmt = Number(data.paidAmount ?? resolvedUnique);
          const finalTrx = data.trxId || '';
          setVerifiedData({
            trxId: finalTrx,
            amount: finalAmt,
            matchType: data.matchType ?? null,
            verifiedAt: new Date().toISOString(),
          });
          setPollingStatus('VERIFIED');
          setCurrentStep('SUCCESS');
          emitVerifiedOnce({
            orderId: resolvedOrderId,
            paymentIntentId: data.paymentIntentId ?? null,
            sessionId: data.sessionId || config.sessionId || null,
            trxId: finalTrx,
            amount: finalAmt,
            matchType: data.matchType ?? null,
          });
        } else if (
          data.status === 'MANUAL_REVIEW_REQUIRED' ||
          data.sessionStatus === 'ESCALATED'
        ) {
          setPollingStatus('MANUAL_REVIEW_REQUIRED');
          setEscalationReason(data.escalationReason ?? null);
          setCurrentStep('POLLING');
        } else if (
          data.status === 'WAITING_FOR_SMS' ||
          data.sessionStatus === 'SUBMITTED'
        ) {
          setPollingStatus('PENDING_VERIFICATION');
          setCurrentStep('POLLING');
        } else if (data.status === 'REJECTED' || data.sessionStatus === 'REJECTED') {
          setPollingStatus('REJECTED');
          setEscalationReason(data.escalationReason ?? null);
          setCurrentStep('POLLING');
        } else if (data.status === 'EXPIRED' || data.sessionStatus === 'EXPIRED') {
          setPollingStatus('EXPIRED');
          setCurrentStep('POLLING');
        }
      } catch (err: unknown) {
        if (isMounted) {
          const message =
            err instanceof Error ? err.message : 'Unable to initialize payment session.';
          setErrorMessage(message);
          onErrorRef.current?.(message);
        }
      } finally {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      }
    }

    hydrateOrCreate();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.sessionId, config.sessionToken, config.merchantId, config.orderId, config.amount]);

  const uploadReceipt = useCallback(
    async (file: File) => {
      setReceiptError(null);
      if (!sessionToken) {
        const msg =
          'Session token unavailable in URL — open via your checkout link to attach screenshots.';
        setReceiptError(msg);
        throw new Error(msg);
      }

      setIsUploadingReceipt(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionToken', sessionToken);

        const res = await fetch('/api/v1/checkout/receipt', {
          method: 'POST',
          headers: {
            'X-Session-Token': sessionToken,
          },
          body: formData,
        });

        const uploaded = await unwrapApiResponse<ReceiptUploadResponse>(
          res,
          'Receipt upload failed',
        );

        setReceiptAssetId(uploaded.receiptAssetId);
        setReceiptUrl(uploaded.receiptUrl);
        setReceiptUploadCount(uploaded.uploadCount);
        setReceiptMaxUploads(uploaded.maxUploads);
        return uploaded;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to upload receipt proof';
        setReceiptError(msg);
        throw err;
      } finally {
        setIsUploadingReceipt(false);
      }
    },
    [sessionToken],
  );

  // Submit 2-field payment verification (mobile number + TrxID)
  const submitPayment = async () => {
    setErrorMessage(null);
    let cleanSender = senderNumber.trim().replace(/[\s-]/g, '');
    if (cleanSender.startsWith('+880')) cleanSender = cleanSender.slice(3);
    else if (cleanSender.startsWith('880')) cleanSender = cleanSender.slice(2);
    else if (cleanSender.startsWith('+88')) cleanSender = cleanSender.slice(3);
    else if (cleanSender.startsWith('88')) cleanSender = cleanSender.slice(2);

    const cleanTrx = trxId.trim().toUpperCase();
    const cleanEmail = customerEmail.trim();
    const effectivePayAmount =
      baseAmount > 0 ? baseAmount : uniqueAmount > 0 ? uniqueAmount : Number(paidAmount) || 0;

    if (!activeWallet) {
      setErrorMessage(
        `${selectedProvider} is currently unavailable. Please choose an active payment method.`,
      );
      return;
    }
    if (!/^01[3-9]\d{8}$/.test(cleanSender)) {
      setErrorMessage('Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX).');
      return;
    }
    if (!cleanTrx || cleanTrx.length < 5) {
      setErrorMessage('Please enter a valid Transaction ID (TrxID).');
      return;
    }
    if (!Number.isFinite(effectivePayAmount) || effectivePayAmount <= 0) {
      setErrorMessage('Unable to determine order amount.');
      return;
    }
    if (
      receiptPolicy === 'ALWAYS_REQUIRED' &&
      !receiptUrl &&
      !receiptAssetId
    ) {
      setErrorMessage('Please attach a screenshot proof of your payment before verifying.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        merchantId,
        orderId,
        sessionId,
        paymentIntentId: paymentIntentId || undefined,
        provider: selectedProvider,
        amount: effectivePayAmount,
        paidAmount: effectivePayAmount,
        baseAmount: baseAmount > 0 ? baseAmount : effectivePayAmount,
        trxId: cleanTrx,
        senderNumber: cleanSender,
        sessionToken,
      };

      if (cleanEmail && cleanEmail.toLowerCase() !== 'buyer@orbitsaas.cloud') {
        payload.customerEmail = cleanEmail;
      }
      if (receiptAssetId) {
        payload.receiptAssetId = receiptAssetId;
      }
      if (receiptUrl) {
        payload.receiptUrl = receiptUrl;
      }

      const res = await fetch('/api/v1/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await unwrapApiResponse<VerifyCheckoutResponse>(
        res,
        'Verification submission failed',
      );

      setSubmitAttempts((prev) => Math.min(MAX_SUBMIT_ATTEMPTS, prev + 1));
      if (result.paymentIntentId) setPaymentIntentId(result.paymentIntentId);
      if (
        result.customerEmail?.trim() &&
        result.customerEmail.trim().toLowerCase() !== 'buyer@orbitsaas.cloud'
      ) {
        setCustomerEmail(result.customerEmail.trim());
      }

      if (result.status === 'VERIFIED') {
        const finalAmount = Number(result.paidAmount ?? result.amount ?? effectivePayAmount);
        const finalTrx = result.trxId || cleanTrx;
        const providerName = MFS_METADATA[selectedProvider]?.name || selectedProvider;
        toast.success('Payment verified!', {
          id: `buyer-verified-${orderId}`,
          description: `${formatBDT(finalAmount)} confirmed via ${providerName} · TrxID ${finalTrx}`,
          duration: 5000,
        });
        setVerifiedData({
          trxId: finalTrx,
          amount: finalAmount,
          matchType: result.matchType ?? null,
          verifiedAt: new Date().toISOString(),
        });
        setPollingStatus('VERIFIED');
        setCurrentStep('SUCCESS');
        emitVerifiedOnce({
          orderId,
          paymentIntentId: result.paymentIntentId ?? paymentIntentId,
          sessionId: sessionId ?? null,
          trxId: finalTrx,
          amount: finalAmount,
          matchType: result.matchType ?? null,
        });
      } else {
        const nextStatus: 'PENDING_VERIFICATION' | 'MANUAL_REVIEW_REQUIRED' =
          result.status === 'MANUAL_REVIEW_REQUIRED'
            ? 'MANUAL_REVIEW_REQUIRED'
            : 'PENDING_VERIFICATION';

        setPollingStatus(nextStatus);
        setEscalationReason(result.escalationReason ?? null);
        if (result.deviceOnline !== undefined) {
          setDeviceStatus((prev) => ({ ...prev, online: result.deviceOnline! }));
        }
        setCurrentStep('POLLING');
        emitPending({
          orderId,
          paymentIntentId: result.paymentIntentId ?? paymentIntentId,
          sessionId: sessionId ?? null,
          status: nextStatus,
          trxId: result.trxId || cleanTrx,
          amount: Number(result.paidAmount ?? result.amount ?? effectivePayAmount),
          escalationReason: result.escalationReason ?? null,
        });
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Verification submission failed. Please verify your details.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Allow buyer to edit a mistyped TrxID or mobile number and re-submit
  const editSubmission = useCallback(() => {
    setErrorMessage(null);
    setPreferredStepperStep(2);
    setCurrentStep('SUBMIT_TRX');
  }, []);

  // Handle terminal or escalated updates from PollingStatus
  const markVerified = useCallback(
    (finalTrxId: string, amount: number, matchType?: string | null) => {
      setVerifiedData({
        trxId: finalTrxId,
        amount,
        matchType: matchType ?? null,
        verifiedAt: new Date().toISOString(),
      });
      setPollingStatus('VERIFIED');
      setCurrentStep('SUCCESS');
      emitVerifiedOnce({
        orderId,
        paymentIntentId,
        sessionId: sessionId ?? null,
        trxId: finalTrxId,
        amount,
        matchType: matchType ?? null,
      });
    },
    [emitVerifiedOnce, orderId, paymentIntentId, sessionId],
  );

  const handlePollStateChange = useCallback(
    (next: {
      status: CheckoutPollStatus;
      escalationReason?: string | null;
      trxId?: string;
      amount?: number;
    }) => {
      setPollingStatus(next.status);
      if (next.escalationReason !== undefined) {
        setEscalationReason(next.escalationReason);
      }

      if (next.status === 'MANUAL_REVIEW_REQUIRED' || next.status === 'PENDING_VERIFICATION') {
        emitPending({
          orderId,
          paymentIntentId,
          sessionId: sessionId ?? null,
          status: next.status,
          trxId: next.trxId || trxId,
          amount: next.amount ?? (Number(paidAmount) || uniqueAmount),
          escalationReason: next.escalationReason ?? null,
        });
      } else if (next.status === 'REJECTED' || next.status === 'EXPIRED') {
        emitFailedOnce({
          orderId,
          paymentIntentId,
          sessionId: sessionId ?? null,
          status: next.status,
          trxId: next.trxId || trxId,
          error:
            next.status === 'EXPIRED'
              ? 'Checkout session expired before confirmation.'
              : next.escalationReason || 'Payment submission was rejected by merchant.',
        });
      }
    },
    [emitFailedOnce, emitPending, orderId, paidAmount, paymentIntentId, sessionId, trxId, uniqueAmount],
  );

  return {
    currentStep,
    setCurrentStep,
    preferredStepperStep,
    setPreferredStepperStep,
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
    sessionId,
    paymentIntentId,
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
    actions,
    pollingStatus,
    escalationReason,
    submitAttempts,
    maxSubmitAttempts: MAX_SUBMIT_ATTEMPTS,
    receiptAssetId,
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
  };
}
