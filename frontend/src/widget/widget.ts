/**
 * ORBIT Payment Hub — Standalone Embed Widget (dist/widget.js)
 * Zero external dependencies. Injects an accessible, responsive modal / bottom-sheet iframe
 * with strict origin validation and session-first hydration.
 */

export interface OrbitPaySuccessPayload {
  orderId: string;
  externalRefId?: string;
  paymentIntentId?: string | null;
  sessionId?: string | null;
  trxId: string;
  amount: number;
  matchType?: string | null;
  status?: 'VERIFIED';
}

export interface OrbitPayPendingPayload {
  orderId: string;
  externalRefId?: string;
  paymentIntentId?: string | null;
  sessionId?: string | null;
  status: 'PENDING_VERIFICATION' | 'MANUAL_REVIEW_REQUIRED';
  trxId?: string;
  amount?: number;
  escalationReason?: string | null;
}

export interface OrbitPayConfig {
  sessionId?: string;
  sessionToken?: string;
  checkoutUrl?: string;
  merchantId?: string;
  orderId?: string;
  amount?: number;
  customerEmail?: string;
  storeName?: string;
  hostUrl?: string;
  theme?: 'light' | 'dark';
  onSuccess?: (data: OrbitPaySuccessPayload) => void;
  onPending?: (data: OrbitPayPendingPayload) => void;
  onError?: (err: unknown) => void;
  onClose?: () => void;
}

export interface OrbitPayInstance {
  open: (config: OrbitPayConfig) => void;
  init: (config: OrbitPayConfig) => void;
  close: () => void;
  destroy: () => void;
}

declare global {
  interface Window {
    OrbitPay: OrbitPayInstance;
  }
}

(function (window: Window) {
  if (typeof document === 'undefined') return;

  let activeOverlay: HTMLDivElement | null = null;
  let activeIframe: HTMLIFrameElement | null = null;
  let activeConfig: OrbitPayConfig | null = null;
  let activeExpectedOrigin: string | null = null;
  let activeKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  let hasFiredSuccess = false;
  let messageListenerAttached = false;

  function ensureStyles() {
    if (document.getElementById('orbit-pay-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'orbit-pay-widget-styles';
    style.textContent = `
      @keyframes orbitFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes orbitSlideUp {
        from { transform: translateY(24px); opacity: 0.6; }
        to { transform: translateY(0); opacity: 1; }
      }
      #orbit-pay-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(9, 9, 11, 0.72);
        backdrop-filter: blur(6px);
        padding: 16px;
        animation: orbitFadeIn 0.2s ease-out;
      }
      #orbit-pay-modal-container {
        position: relative;
        width: 100%;
        max-width: 540px;
        height: 700px;
        max-height: 92vh;
        border-radius: 24px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.42);
      }
      @media (max-width: 640px) {
        #orbit-pay-modal-overlay {
          align-items: flex-end;
          padding: 0;
        }
        #orbit-pay-modal-container {
          max-width: 100%;
          height: 92dvh;
          max-height: 92dvh;
          border-radius: 24px 24px 0 0;
          border-bottom: none;
          animation: orbitSlideUp 0.24s cubic-bezier(0.32, 0.72, 0, 1);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function close() {
    if (activeKeyHandler) {
      window.removeEventListener('keydown', activeKeyHandler);
      activeKeyHandler = null;
    }
    if (activeOverlay && activeOverlay.parentNode) {
      activeOverlay.parentNode.removeChild(activeOverlay);
    }
    activeOverlay = null;
    activeIframe = null;
    activeExpectedOrigin = null;
    hasFiredSuccess = false;

    const closingConfig = activeConfig;
    activeConfig = null;
    document.body.style.overflow = '';

    if (closingConfig && closingConfig.onClose) {
      closingConfig.onClose();
    }
  }

  function destroy() {
    close();
    if (messageListenerAttached) {
      window.removeEventListener('message', handleMessage);
      messageListenerAttached = false;
    }
  }

  function handleMessage(event: MessageEvent) {
    if (!activeExpectedOrigin || event.origin !== activeExpectedOrigin) {
      return;
    }
    if (activeIframe && event.source && event.source !== activeIframe.contentWindow) {
      return;
    }
    if (!event.data || typeof event.data !== 'object') return;

    const payload = event.data as Record<string, unknown>;
    const typeName = typeof payload.type === 'string' ? payload.type : '';
    const eventName = typeof payload.event === 'string' ? payload.event : '';

    if (
      typeName === 'ORBIT_PAYMENT_VERIFIED' ||
      eventName === 'payment.verified' ||
      eventName === 'orbit_payment_verified'
    ) {
      if (hasFiredSuccess) return;
      hasFiredSuccess = true;
      if (activeConfig && activeConfig.onSuccess) {
        activeConfig.onSuccess({
          orderId: String(payload.orderId || payload.externalRefId || ''),
          externalRefId: payload.externalRefId ? String(payload.externalRefId) : undefined,
          paymentIntentId: payload.paymentIntentId ? String(payload.paymentIntentId) : null,
          sessionId: payload.sessionId ? String(payload.sessionId) : null,
          trxId: String(payload.trxId || ''),
          amount: Number(payload.amount || 0),
          matchType: payload.matchType ? String(payload.matchType) : null,
          status: 'VERIFIED',
        });
      }
    } else if (
      typeName === 'ORBIT_PAYMENT_PENDING' ||
      eventName === 'payment.pending'
    ) {
      if (activeConfig && activeConfig.onPending) {
        const statusVal =
          payload.status === 'MANUAL_REVIEW_REQUIRED'
            ? 'MANUAL_REVIEW_REQUIRED'
            : 'PENDING_VERIFICATION';
        activeConfig.onPending({
          orderId: String(payload.orderId || payload.externalRefId || ''),
          externalRefId: payload.externalRefId ? String(payload.externalRefId) : undefined,
          paymentIntentId: payload.paymentIntentId ? String(payload.paymentIntentId) : null,
          sessionId: payload.sessionId ? String(payload.sessionId) : null,
          status: statusVal,
          trxId: payload.trxId ? String(payload.trxId) : undefined,
          amount: payload.amount != null ? Number(payload.amount) : undefined,
          escalationReason: payload.escalationReason ? String(payload.escalationReason) : null,
        });
      }
    } else if (
      typeName === 'ORBIT_CHECKOUT_CLOSE' ||
      eventName === 'checkout.close' ||
      eventName === 'orbit_checkout_close'
    ) {
      close();
    } else if (
      typeName === 'ORBIT_PAYMENT_FAILED' ||
      eventName === 'payment.failed'
    ) {
      if (activeConfig && activeConfig.onError) {
        activeConfig.onError(payload.error || 'Payment failed');
      }
    }
  }

  function resolveCheckoutTarget(config: OrbitPayConfig): { url: string; origin: string } {
    const defaultHost =
      config.hostUrl ||
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? window.location.origin
        : 'https://payment.orbitsaas.cloud');

    const parentOrigin = window.location.origin;

    if (config.checkoutUrl) {
      const target = new URL(config.checkoutUrl, defaultHost);
      target.searchParams.set('embedded', 'true');
      target.searchParams.set('origin', parentOrigin);
      if (config.sessionToken && !target.searchParams.has('token')) {
        target.searchParams.set('token', config.sessionToken);
      }
      if (config.theme) {
        target.searchParams.set('theme', config.theme);
      }
      return { url: target.toString(), origin: target.origin };
    }

    if (config.sessionId) {
      const base = new URL(`/checkout/${encodeURIComponent(config.sessionId)}`, defaultHost);
      base.searchParams.set('embedded', 'true');
      base.searchParams.set('origin', parentOrigin);
      if (config.sessionToken) {
        base.searchParams.set('token', config.sessionToken);
      }
      if (config.theme) {
        base.searchParams.set('theme', config.theme);
      }
      return { url: base.toString(), origin: base.origin };
    }

    if (!config.orderId || !config.amount || config.amount <= 0) {
      throw new Error('OrbitPay.open requires sessionId/checkoutUrl or { orderId, amount }.');
    }

    const legacy = new URL('/', defaultHost);
    legacy.searchParams.set('merchantId', config.merchantId || 'mer_live_fb8eb757cceb7c35');
    legacy.searchParams.set('orderId', config.orderId);
    legacy.searchParams.set('amount', String(config.amount));
    if (config.customerEmail) legacy.searchParams.set('customerEmail', config.customerEmail);
    if (config.storeName) legacy.searchParams.set('storeName', config.storeName);
    if (config.theme) legacy.searchParams.set('theme', config.theme);
    legacy.searchParams.set('embedded', 'true');
    legacy.searchParams.set('origin', parentOrigin);
    legacy.hash = 'checkout';

    return { url: legacy.toString(), origin: legacy.origin };
  }

  function open(config: OrbitPayConfig) {
    if (activeOverlay) {
      close();
    }

    ensureStyles();
    if (!messageListenerAttached) {
      window.addEventListener('message', handleMessage);
      messageListenerAttached = true;
    }

    const { url: checkoutUrl, origin: expectedOrigin } = resolveCheckoutTarget(config);
    activeConfig = config;
    activeExpectedOrigin = expectedOrigin;
    hasFiredSuccess = false;

    const isDark = config.theme === 'dark';

    const overlay = document.createElement('div');
    overlay.id = 'orbit-pay-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'ORBIT Secure Checkout');

    const container = document.createElement('div');
    container.id = 'orbit-pay-modal-container';
    container.style.backgroundColor = isDark ? '#0d0d0f' : '#ffffff';
    container.style.border = isDark
      ? '1px solid rgba(255, 255, 255, 0.12)'
      : '1px solid rgba(9, 9, 11, 0.1)';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.setAttribute('aria-label', 'Close Payment Modal');
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '12px';
    closeBtn.style.right = '12px';
    closeBtn.style.width = '40px';
    closeBtn.style.height = '40px';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.border = 'none';
    closeBtn.style.backgroundColor = isDark
      ? 'rgba(39, 39, 45, 0.92)'
      : 'rgba(244, 244, 246, 0.95)';
    closeBtn.style.color = isDark ? '#f5f5f7' : '#52525b';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.fontWeight = '600';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.zIndex = '10';
    closeBtn.style.transition = 'background-color 0.15s ease, color 0.15s ease';

    closeBtn.onmouseenter = () => {
      closeBtn.style.backgroundColor = isDark ? '#32323a' : '#e4e4e7';
      closeBtn.style.color = isDark ? '#ffffff' : '#09090b';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.backgroundColor = isDark
        ? 'rgba(39, 39, 45, 0.92)'
        : 'rgba(244, 244, 246, 0.95)';
      closeBtn.style.color = isDark ? '#f5f5f7' : '#52525b';
    };
    closeBtn.onclick = close;

    const iframe = document.createElement('iframe');
    iframe.src = checkoutUrl;
    iframe.title = 'ORBIT Secure Checkout';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.setAttribute('allow', 'clipboard-write');

    container.appendChild(closeBtn);
    container.appendChild(iframe);
    overlay.appendChild(container);

    document.body.style.overflow = 'hidden';
    document.body.appendChild(overlay);
    activeOverlay = overlay;
    activeIframe = iframe;

    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    activeKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', activeKeyHandler);
  }

  messageListenerAttached = true;
  window.addEventListener('message', handleMessage);

  const OrbitPay: OrbitPayInstance = {
    open,
    init: open,
    close,
    destroy,
  };

  window.OrbitPay = OrbitPay;
})(typeof window !== 'undefined' ? window : ({} as Window));

export default typeof window !== 'undefined' ? window.OrbitPay : undefined;
