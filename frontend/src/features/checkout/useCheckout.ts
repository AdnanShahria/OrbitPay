import { useState, useEffect, useCallback, useRef } from 'react';
import { MfsProvider } from '@/shared/utils/format';
import { unwrapApiResponse } from '@/shared/utils/api';

export interface CheckoutConfig {
  merchantId: string;
  orderId: string;
  amount: number;
  customerEmail?: string;
  storeName?: string;
  onSuccess?: (data: { orderId: string; trxId: string; amount: number; matchType?: string | null }) => void;
  onClose?: () => void;
}

export interface ActiveWallet {
  provider: MfsProvider;
  walletNumber: string;
  accountType: 'PERSONAL' | 'PRA' | 'MERCHANT';
}

export interface CheckoutSessionData {
  sessionId?: string;
  sessionToken: string;
  merchantId: string;
  orderId: string;
  storeName?: string;
  baseAmount: number;
  uniqueAmount: number;
  expectedAmount: number;
  offsetCents: number;
  expiresAt?: string;
  activeWallets: ActiveWallet[];
}

export interface VerifyCheckoutResponse {
  status: 'VERIFIED' | 'PENDING_VERIFICATION';
  trxId: string;
  amount: number;
  baseAmount?: number;
  uniqueAmount?: number;
  paidAmount?: number;
  matchType?: string | null;
  provider: MfsProvider;
  message?: string;
  expiresAt?: string;
}

export const DEFAULT_MERCHANT_ID = 'mer_live_fb8eb757cceb7c35';

export type CheckoutStep = 'SELECT_PROVIDER' | 'INSTRUCTIONS' | 'SUBMIT_TRX' | 'POLLING' | 'SUCCESS';

export function useCheckout(config: CheckoutConfig) {
  const effectiveMerchantId = config.merchantId?.trim() || DEFAULT_MERCHANT_ID;
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('SELECT_PROVIDER');
  const [selectedProvider, setSelectedProvider] = useState<MfsProvider>('BKASH');
  const [senderNumber, setSenderNumber] = useState('');
  const [paidAmount, setPaidAmount] = useState(() => config.amount.toFixed(2));
  const [trxId, setTrxId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [baseAmount, setBaseAmount] = useState<number>(config.amount);
  const [uniqueAmount, setUniqueAmount] = useState<number>(config.amount);
  const [offsetCents, setOffsetCents] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);

  const [verifiedData, setVerifiedData] = useState<{
    trxId: string;
    amount: number;
    matchType?: string | null;
    verifiedAt: string;
  } | null>(null);

  const [activeWallets, setActiveWallets] = useState<ActiveWallet[]>([]);

  const activeWallet: ActiveWallet =
    activeWallets.find((w) => w.provider === selectedProvider) ||
    activeWallets[0] || {
      provider: selectedProvider,
      walletNumber: 'Unavailable',
      accountType: 'PERSONAL',
    };

  // Initialize checkout session & allocate unique poisha amount
  useEffect(() => {
    let isMounted = true;

    setIsSessionLoading(true);
    setBaseAmount(config.amount);
    setUniqueAmount(config.amount);
    setOffsetCents(0);
    setPaidAmount(config.amount.toFixed(2));
    setErrorMessage(null);

    async function initSession() {
      try {
        const res = await fetch('/api/v1/checkout/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantId: effectiveMerchantId,
            orderId: config.orderId,
            amount: config.amount,
            customerEmail: config.customerEmail || 'customer@example.com',
          }),
        });

        const data = await unwrapApiResponse<CheckoutSessionData>(
          res,
          'Failed to initialize checkout session',
        );

        if (!isMounted) return;

        const resolvedBase = Number(data.baseAmount ?? config.amount);
        const resolvedUnique = Number(data.uniqueAmount ?? data.expectedAmount ?? config.amount);
        const resolvedOffset =
          typeof data.offsetCents === 'number'
            ? data.offsetCents
            : Math.round((resolvedUnique - resolvedBase) * 100);

        setSessionToken(data.sessionToken);
        setBaseAmount(resolvedBase);
        setUniqueAmount(resolvedUnique);
        setOffsetCents(resolvedOffset);
        setExpiresAt(data.expiresAt);
        setPaidAmount(resolvedUnique.toFixed(2));

        if (data.activeWallets?.length) {
          setActiveWallets(data.activeWallets);
          const hasDefault = data.activeWallets.some((w) => w.provider === selectedProvider);
          if (!hasDefault) {
            setSelectedProvider(data.activeWallets[0].provider);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Unable to initialize payment session.',
          );
        }
      } finally {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      }
    }

    initSession();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMerchantId, config.orderId, config.amount, config.customerEmail]);

  const onSuccessCallback = config.onSuccess;
  const onSuccessRef = useRef(onSuccessCallback);
  useEffect(() => {
    onSuccessRef.current = onSuccessCallback;
  }, [onSuccessCallback]);

  // Submit 3-field payment verification
  const submitPayment = async () => {
    setErrorMessage(null);
    const cleanSender = senderNumber.trim().replace(/^\+88/, '');
    const cleanTrx = trxId.trim().toUpperCase();
    const numericPaid = Number(paidAmount);

    if (!cleanSender || cleanSender.length < 11) {
      setErrorMessage('Please enter a valid 11 or 12 digit sender phone number.');
      return;
    }
    if (!Number.isFinite(numericPaid) || numericPaid <= 0) {
      setErrorMessage('Please enter a valid payment amount in BDT.');
      return;
    }
    if (!cleanTrx || cleanTrx.length < 6) {
      setErrorMessage('Please enter a valid Transaction ID (TrxID).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: effectiveMerchantId,
          orderId: config.orderId,
          provider: selectedProvider,
          amount: numericPaid,
          paidAmount: numericPaid,
          baseAmount,
          trxId: cleanTrx,
          senderNumber: cleanSender,
          customerEmail: config.customerEmail,
          sessionToken,
        }),
      });

      const result = await unwrapApiResponse<VerifyCheckoutResponse>(
        res,
        'Verification submission failed',
      );

      if (result.status === 'VERIFIED') {
        const finalAmount = Number(result.paidAmount ?? result.amount ?? numericPaid);
        setVerifiedData({
          trxId: result.trxId || cleanTrx,
          amount: finalAmount,
          matchType: result.matchType ?? null,
          verifiedAt: new Date().toISOString(),
        });
        setCurrentStep('SUCCESS');
        onSuccessRef.current?.({
          orderId: config.orderId,
          trxId: result.trxId || cleanTrx,
          amount: finalAmount,
          matchType: result.matchType ?? null,
        });
      } else {
        setCurrentStep('POLLING');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Verification submission failed. Please verify your details.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle successful polling verification
  const markVerified = useCallback(
    (finalTrxId: string, amount: number, matchType?: string | null) => {
      setVerifiedData({
        trxId: finalTrxId,
        amount,
        matchType: matchType ?? null,
        verifiedAt: new Date().toISOString(),
      });
      setCurrentStep('SUCCESS');
      onSuccessRef.current?.({
        orderId: config.orderId,
        trxId: finalTrxId,
        amount,
        matchType: matchType ?? null,
      });

      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            event: 'payment.verified',
            orderId: config.orderId,
            trxId: finalTrxId,
            amount,
            matchType: matchType ?? null,
          },
          '*',
        );
      }
    },
    [config.orderId],
  );

  return {
    currentStep,
    setCurrentStep,
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
    sessionToken,
    expiresAt,
    isSessionLoading,
    isSubmitting,
    errorMessage,
    verifiedData,
    submitPayment,
    markVerified,
  };
}
