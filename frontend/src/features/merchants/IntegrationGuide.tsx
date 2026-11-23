import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/base/card/card';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { Tab, TabList, TabPanel, Tabs } from '@/components/base/tabs/tabs';
import { toast } from '@/components/base/toast/toast';
import { useAuth } from '@/features/auth/useAuth';
import { useMerchant } from './useMerchant';
import {
  RiCheckLine,
  RiCodeSSlashLine,
  RiFileCopyLine,
  RiNotification3Line,
  RiShoppingBag3Line,
  RiWebhookLine,
} from '@remixicon/react';

export function IntegrationGuide() {
  const { merchant: authMerchant } = useAuth();
  const { data: merchantProfile } = useMerchant(authMerchant?.id);

  const merchantId = merchantProfile?.id || authMerchant?.id || 'YOUR_MERCHANT_ID';
  const storeName = merchantProfile?.storeName || authMerchant?.storeName || 'Your Storefront';
  const webhookUrl =
    merchantProfile?.webhookUrl || authMerchant?.webhookUrl || 'https://yourstore.com/payment/v1';
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://payment.orbitsaas.cloud';

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copySnippet = (id: string, label: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const frontendSnippet = `<!-- 1. Load the ORBIT Checkout Widget on your storefront checkout page -->
<script src="${origin}/widget.js"></script>

<!-- 2. Launch ORBIT Pay with your standard integer/base order amount -->
<script>
  function payWithOrbit(order) {
    OrbitPay.open({
      merchantId: "${merchantId}",
      orderId: order.id,                 // e.g. "ORD-2026-1042"
      amount: order.totalAmount,         // Pass standard price (e.g. 500) — ORBIT assigns .01 poisha automatically
      customerEmail: order.customerEmail,
      storeName: "${storeName}",
      onSuccess: function (data) {
        // data = { orderId, trxId, amount, matchType }
        window.location.href = "/order-confirmed?orderId=" + encodeURIComponent(data.orderId);
      },
      onClose: function () {
        console.log("Customer closed checkout modal");
      }
    });
  }
</script>`;

  const webhookSnippet = `import { Hono } from 'hono';

const app = new Hono();

async function verifyOrbitHmac(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const pairs = signatureHex.match(/.{1,2}/g) || [];
  const sigBytes = new Uint8Array(pairs.map((b) => parseInt(b, 16)));
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(rawBody));
}

// Endpoint configured in ORBIT Hub: ${webhookUrl}
app.post('/payment/v1', async (c) => {
  const signature = c.req.header('x-orbit-signature') || '';
  const rawBody = await c.req.text();
  const secret = process.env.ORBIT_WEBHOOK_SECRET || '';

  const valid = await verifyOrbitHmac(rawBody, signature, secret);
  if (!valid) {
    return c.json({ error: 'Invalid X-Orbit-Signature' }, 401);
  }

  const event = JSON.parse(rawBody);
  // event.event: 'payment.verified' | 'order.confirmed' | 'order.ready_to_ship' | 'order.shipped' | 'order.paid' | 'order.cancelled'
  const payload = event.data ?? event;

  switch (event.event) {
    case 'payment.verified': {
      // payload includes: externalOrderId, trxId, baseAmount, uniqueAmount, paidAmount, matchType, provider
      // matchType is 'EXACT_UNIQUE' | 'BASE_AMOUNT_FALLBACK' | 'OVERPAID' | 'MANUAL_VERIFIED'
      await markOrderPaidInStoreDb({
        orderId: payload.externalOrderId,
        trxId: payload.trxId,
        baseAmount: payload.baseAmount,
        uniqueAmount: payload.uniqueAmount,
        paidAmount: payload.paidAmount,
        matchType: payload.matchType,
      });
      break;
    }
    case 'order.confirmed':
      await updateStoreOrderStatus(payload.externalOrderId, 'CONFIRMED');
      break;
    case 'order.ready_to_ship':
      await updateStoreOrderStatus(payload.externalOrderId, 'READY_TO_SHIP');
      break;
    case 'order.shipped':
      await updateStoreOrderStatus(payload.externalOrderId, 'SHIPPED');
      break;
    case 'order.cancelled':
      await updateStoreOrderStatus(payload.externalOrderId, 'CANCELLED');
      break;
  }

  return c.json({ received: true });
});`;

  const orderNotifySnippet = `// Call this from your storefront backend whenever ANY order is placed
// (Cash on Delivery, Card, or non-ORBIT gateways) so ORBIT Android & Web Portal alert immediately.

const response = await fetch('${origin}/api/v1/orders/notify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Merchant-Secret': process.env.ORBIT_WEBHOOK_SECRET!, // Your HMAC / Merchant secret
  },
  body: JSON.stringify({
    merchantId: '${merchantId}',
    externalOrderId: 'ORD-2026-1043',
    customerName: 'Nusrat Jahan',
    customerPhone: '01711223344',
    customerEmail: 'nusrat@example.com',
    shippingAddress: 'House 14, Road 6, Dhanmondi, Dhaka',
    itemsSummary: '1x Linen Kurta (M), 1x Cotton Scarf',
    paymentMethod: 'COD', // 'ORBIT_MFS' | 'COD' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'
    paymentStatus: 'COD_COLLECTIBLE',
    baseAmount: 1850,
    storeCallbackUrl: '${webhookUrl}',
  }),
});

const result = await response.json();
// -> { success: true, data: { order, notifiedAndroid: true } }`;

  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-button-default bg-background-secondary-default text-foreground-icon-primary">
                <RiCodeSSlashLine className="size-5" aria-hidden />
              </div>
              <div>
                <CardTitle>Storefront Integration Guide</CardTitle>
                <CardDescription>
                  Copy-ready integration snippets pre-configured for{' '}
                  <strong className="font-medium text-text-primary">{storeName}</strong>.
                </CardDescription>
              </div>
            </div>
            <Chip variant="caption" color="gray" className="font-mono self-start sm:self-center">
              {merchantId}
            </Chip>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultSelectedKey="frontend">
            <TabList aria-label="Integration steps" className="overflow-x-auto">
              <Tab id="frontend" icon={RiShoppingBag3Line}>
                1. Frontend Checkout
              </Tab>
              <Tab id="webhook" icon={RiWebhookLine}>
                2. Webhook Receiver
              </Tab>
              <Tab id="notify" icon={RiNotification3Line}>
                3. Order Push (COD &amp; Card)
              </Tab>
            </TabList>

            <TabPanel id="frontend" className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-body-medium text-text-primary">
                    Standard amount checkout widget
                  </h3>
                  <p className="text-caption-1-regular text-text-secondary">
                    Pass your normal order total (e.g. <code className="font-mono text-text-primary">50</code>). ORBIT automatically allocates a unique positive poisha code (<code className="font-mono text-text-primary">50.01</code>, <code className="font-mono text-text-primary">50.02</code>, ...) so concurrent buyers never collide.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => copySnippet('frontend', 'Frontend checkout snippet', frontendSnippet)}
                  leadingIcon={copiedId === 'frontend' ? RiCheckLine : RiFileCopyLine}
                  className="shrink-0"
                >
                  {copiedId === 'frontend' ? 'Copied' : 'Copy snippet'}
                </Button>
              </div>

              <pre className="overflow-x-auto rounded-2xl border border-separator-border bg-background-secondary-default p-4 font-mono text-caption-1-regular leading-relaxed text-text-primary select-all">
                {frontendSnippet}
              </pre>
            </TabPanel>

            <TabPanel id="webhook" className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-body-medium text-text-primary">
                    Signed webhook handler (Payments + Bi-directional Orders)
                  </h3>
                  <p className="text-caption-1-regular text-text-secondary">
                    Verifies <code className="font-mono text-text-primary">X-Orbit-Signature</code> and handles both <code className="font-mono text-text-primary">payment.verified</code> (including <code className="font-mono text-text-primary">baseAmount</code>, <code className="font-mono text-text-primary">uniqueAmount</code>, <code className="font-mono text-text-primary">paidAmount</code>, <code className="font-mono text-text-primary">matchType</code>) and <code className="font-mono text-text-primary">order.*</code> lifecycle events.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => copySnippet('webhook', 'Webhook receiver code', webhookSnippet)}
                  leadingIcon={copiedId === 'webhook' ? RiCheckLine : RiFileCopyLine}
                  className="shrink-0"
                >
                  {copiedId === 'webhook' ? 'Copied' : 'Copy snippet'}
                </Button>
              </div>

              <pre className="overflow-x-auto rounded-2xl border border-separator-border bg-background-secondary-default p-4 font-mono text-caption-1-regular leading-relaxed text-text-primary select-all">
                {webhookSnippet}
              </pre>
            </TabPanel>

            <TabPanel id="notify" className="space-y-4 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-body-medium text-text-primary">
                    Push COD, Card &amp; non-ORBIT orders to Android &amp; Web Portal
                  </h3>
                  <p className="text-caption-1-regular text-text-secondary">
                    Send new orders to <code className="font-mono text-text-primary">POST /api/v1/orders/notify</code> so your Android companion app rings immediately and lets you confirm or ship from your phone.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => copySnippet('notify', 'Order notify snippet', orderNotifySnippet)}
                  leadingIcon={copiedId === 'notify' ? RiCheckLine : RiFileCopyLine}
                  className="shrink-0"
                >
                  {copiedId === 'notify' ? 'Copied' : 'Copy snippet'}
                </Button>
              </div>

              <pre className="overflow-x-auto rounded-2xl border border-separator-border bg-background-secondary-default p-4 font-mono text-caption-1-regular leading-relaxed text-text-primary select-all">
                {orderNotifySnippet}
              </pre>
            </TabPanel>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
