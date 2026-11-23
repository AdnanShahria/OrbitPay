/**
 * ORBIT Payment Hub — Standalone Embed Widget (dist/widget.js)
 * Zero external dependencies. Injects an accessible, responsive modal iframe.
 */

export interface OrbitPayConfig {
  merchantId: string;
  orderId: string;
  amount: number;
  customerEmail?: string;
  storeName?: string;
  hostUrl?: string;
  onSuccess?: (data: { orderId: string; trxId: string; amount: number }) => void;
  onError?: (err: unknown) => void;
  onClose?: () => void;
}

export interface OrbitPayInstance {
  open: (config: OrbitPayConfig) => void;
  init: (config: OrbitPayConfig) => void;
  close: () => void;
}

declare global {
  interface Window {
    OrbitPay: OrbitPayInstance;
  }
}

(function (window: Window) {
  let activeOverlay: HTMLDivElement | null = null;
  let activeConfig: OrbitPayConfig | null = null;

  function close() {
    if (activeOverlay && activeOverlay.parentNode) {
      activeOverlay.parentNode.removeChild(activeOverlay);
      activeOverlay = null;
    }
    if (activeConfig && activeConfig.onClose) {
      activeConfig.onClose();
    }
    activeConfig = null;
    document.body.style.overflow = '';
  }

  function handleMessage(event: MessageEvent) {
    if (!event.data || typeof event.data !== 'object') return;
    const { event: eventName, orderId, trxId, amount, error } = event.data;

    if (eventName === 'payment.verified' || eventName === 'orbit_payment_verified') {
      if (activeConfig && activeConfig.onSuccess) {
        activeConfig.onSuccess({ orderId, trxId, amount });
      }
    } else if (eventName === 'checkout.close' || eventName === 'orbit_checkout_close') {
      close();
    } else if (eventName === 'payment.failed') {
      if (activeConfig && activeConfig.onError) {
        activeConfig.onError(error || 'Payment failed');
      }
    }
  }

  function open(config: OrbitPayConfig) {
    if (activeOverlay) {
      close();
    }

    activeConfig = config;

    const host =
      config.hostUrl ||
      (window.location.hostname === 'localhost'
        ? window.location.origin
        : 'https://payment.orbitsaas.cloud');

    const params = new URLSearchParams({
      merchantId: config.merchantId,
      orderId: config.orderId,
      amount: config.amount.toString(),
      customerEmail: config.customerEmail || '',
      storeName: config.storeName || '',
      embedded: 'true',
    });

    const checkoutUrl = `${host}/?${params.toString()}#checkout`;

    // Create Modal Overlay
    const overlay = document.createElement('div');
    overlay.id = 'orbit-pay-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.7)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.padding = '16px';
    overlay.style.animation = 'orbitFadeIn 0.2s ease-out';

    // Container box
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.maxWidth = '540px';
    container.style.height = '680px';
    container.style.maxHeight = '92vh';
    container.style.borderRadius = '24px';
    container.style.backgroundColor = '#FFFFFF';
    container.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.35)';
    container.style.overflow = 'hidden';
    container.style.border = '1px solid rgba(226, 232, 240, 0.8)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    // Close Button Header
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.setAttribute('aria-label', 'Close Payment Modal');
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '14px';
    closeBtn.style.right = '14px';
    closeBtn.style.width = '36px';
    closeBtn.style.height = '36px';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.border = 'none';
    closeBtn.style.backgroundColor = 'rgba(241, 245, 249, 0.9)';
    closeBtn.style.color = '#64748B';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.zIndex = '10';
    closeBtn.style.transition = 'all 0.15s ease';

    closeBtn.onmouseenter = () => {
      closeBtn.style.backgroundColor = '#E2E8F0';
      closeBtn.style.color = '#0F172A';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.backgroundColor = 'rgba(241, 245, 249, 0.9)';
      closeBtn.style.color = '#64748B';
    };
    closeBtn.onclick = close;

    // Iframe Element
    const iframe = document.createElement('iframe');
    iframe.src = checkoutUrl;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.setAttribute('allow', 'clipboard-write');

    container.appendChild(closeBtn);
    container.appendChild(iframe);
    overlay.appendChild(container);

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    // Close on backdrop click
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    // Close on ESC
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        window.removeEventListener('keydown', keyHandler);
      }
    };
    window.addEventListener('keydown', keyHandler);
  }

  // Register message listener once
  window.addEventListener('message', handleMessage);

  const OrbitPay: OrbitPayInstance = {
    open,
    init: open,
    close,
  };

  window.OrbitPay = OrbitPay;
})(typeof window !== 'undefined' ? window : ({} as any));

export default window.OrbitPay;
