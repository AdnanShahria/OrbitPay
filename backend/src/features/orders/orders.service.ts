import { eq, and, desc, sql, like, or, inArray, type SQL } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  merchantOrders,
  merchantProjects,
  paymentIntents,
  type MerchantRecord,
  type MerchantOrderRecord,
  type OrderStatus,
  type OrderPaymentStatus,
} from '../../db/schema';
import { generateSecureToken } from '../../shared/crypto';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { validateSafeWebhookUrl } from '../../shared/ssrf';
import type { Env } from '../../shared/types';
import { dispatchWebhook, sendPushToMerchantDevices } from '../webhooks/webhook.dispatcher';
import { emitMerchantRealtimeEvent } from '../realtime/realtime.service';
import { resolveProjectDispatchContext } from '../projects/projects.service';
import type { NotifyOrderInput, ListOrdersQuery, OrderActionInput, OrderAction } from './orders.schema';

const ACTION_CONFIG: Record<
  OrderAction,
  { event: string; orderStatus?: OrderStatus; paymentStatus?: OrderPaymentStatus }
> = {
  CONFIRM: { event: 'order.confirmed', orderStatus: 'CONFIRMED' },
  READY_TO_SHIP: { event: 'order.ready_to_ship', orderStatus: 'READY_TO_SHIP' },
  SHIP: { event: 'order.shipped', orderStatus: 'SHIPPED' },
  MARK_PAID: { event: 'order.paid', paymentStatus: 'PAID' },
  CANCEL: { event: 'order.cancelled', orderStatus: 'CANCELLED' },
};

/**
 * Upserts a storefront order notification into merchant_orders, broadcasts SSE,
 * and dispatches an FCM push alert to all active merchant Android companion devices.
 */
export async function notifyOrder(
  db: AppDb,
  merchant: MerchantRecord,
  input: NotifyOrderInput,
  envOrFcmKey?: string | Env
): Promise<{ order: MerchantOrderRecord; created: boolean }> {
  const env = typeof envOrFcmKey === 'string' ? undefined : envOrFcmKey;
  const now = new Date();
  const normalizedTrxId = input.trxId ? input.trxId.trim().toUpperCase() : null;
  const callbackUrl = input.storeCallbackUrl ? input.storeCallbackUrl.trim() : null;
  const dispatchCtx = await resolveProjectDispatchContext(
    db,
    merchant,
    input.projectId,
    callbackUrl
  );
  if (callbackUrl) {
    validateSafeWebhookUrl(
      callbackUrl,
      env,
      dispatchCtx.effective.allowedCallbackOrigins
    );
  }
  const customerEmail = input.customerEmail ? input.customerEmail.trim() : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const defaultPaymentStatus: OrderPaymentStatus =
    input.paymentMethod === 'COD' ? 'COD_COLLECTIBLE' : 'UNPAID';
  const defaultOrderStatus: OrderStatus = 'AWAITING_CONFIRMATION';

  const existingRes = await db
    .select()
    .from(merchantOrders)
    .where(
      and(
        eq(merchantOrders.merchantId, merchant.id),
        eq(merchantOrders.externalOrderId, input.externalOrderId)
      )
    )
    .limit(1);

  const existing = existingRes[0];
  let order: MerchantOrderRecord;
  let created = false;

  if (existing) {
    if (
      input.projectId !== undefined &&
      (existing.projectId ?? null) !== (input.projectId || null)
    ) {
      throw new ForbiddenError(
        `Order '${input.externalOrderId}' is already bound to a different sub-project`
      );
    }

    await db
      .update(merchantOrders)
      .set({
        customerName: input.customerName ?? existing.customerName,
        customerPhone: input.customerPhone ?? existing.customerPhone,
        customerEmail: customerEmail ?? existing.customerEmail,
        shippingAddress: input.shippingAddress ?? existing.shippingAddress,
        itemsSummary: input.itemsSummary ?? existing.itemsSummary,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus ?? existing.paymentStatus,
        orderStatus: input.orderStatus ?? existing.orderStatus,
        baseAmount: input.baseAmount,
        uniqueAmount: input.uniqueAmount ?? existing.uniqueAmount,
        paidAmount: input.paidAmount ?? existing.paidAmount,
        trxId: normalizedTrxId ?? existing.trxId,
        storeCallbackUrl: callbackUrl ?? existing.storeCallbackUrl,
        metadataJson: metadataJson ?? existing.metadataJson,
        updatedAt: now,
      })
      .where(eq(merchantOrders.id, existing.id));

    const updatedRes = await db
      .select()
      .from(merchantOrders)
      .where(eq(merchantOrders.id, existing.id))
      .limit(1);
    order = updatedRes[0];
  } else {
    created = true;
    const orderId = `ord_${generateSecureToken(12)}`;

    await db.insert(merchantOrders).values({
      id: orderId,
      merchantId: merchant.id,
      projectId: input.projectId ?? null,
      externalOrderId: input.externalOrderId,
      customerName: input.customerName || null,
      customerPhone: input.customerPhone || null,
      customerEmail,
      shippingAddress: input.shippingAddress || null,
      itemsSummary: input.itemsSummary || null,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus ?? defaultPaymentStatus,
      orderStatus: input.orderStatus ?? defaultOrderStatus,
      baseAmount: input.baseAmount,
      uniqueAmount: input.uniqueAmount ?? null,
      paidAmount: input.paidAmount ?? null,
      trxId: normalizedTrxId,
      storeCallbackUrl: callbackUrl,
      metadataJson,
      createdAt: now,
      updatedAt: now,
    });

    const insertedRes = await db
      .select()
      .from(merchantOrders)
      .where(eq(merchantOrders.id, orderId))
      .limit(1);
    order = insertedRes[0];
  }

  emitMerchantRealtimeEvent(
    env,
    created ? 'ORDER_CREATED' : 'ORDER_UPDATED',
    {
      merchantId: merchant.id,
      order,
    },
    merchant.id
  );

  sendPushToMerchantDevices(
    db,
    envOrFcmKey,
    merchant,
    created
      ? `New ${order.paymentMethod} Order #${order.externalOrderId}`
      : `Order #${order.externalOrderId} Updated`,
    `৳${order.baseAmount} • ${order.customerName || order.customerPhone || 'Storefront Customer'}`,
    {
      event: 'order.created',
      externalOrderId: order.externalOrderId,
      paymentMethod: order.paymentMethod,
      orderStatus: order.orderStatus,
      baseAmount: String(order.baseAmount),
    }
  ).catch((err) => {
    console.warn('[Order FCM Push Error]:', err);
  });

  return { order, created };
}

/**
 * Lists merchant orders with filtering by orderStatus, paymentMethod, and search term,
 * alongside total and pendingConfirmationCount.
 */
export async function listOrders(
  db: AppDb,
  merchantId: string,
  query: ListOrdersQuery
): Promise<{
  items: Array<MerchantOrderRecord & { projectName?: string | null }>;
  total: number;
  pendingConfirmationCount: number;
}> {
  const conditions: SQL[] = [eq(merchantOrders.merchantId, merchantId)];

  if (query.projectId) {
    conditions.push(eq(merchantOrders.projectId, query.projectId));
  }

  if (query.orderStatus && query.orderStatus !== 'ALL') {
    conditions.push(eq(merchantOrders.orderStatus, query.orderStatus as OrderStatus));
  }

  if (query.paymentMethod && query.paymentMethod !== 'ALL') {
    conditions.push(eq(merchantOrders.paymentMethod, query.paymentMethod as any));
  }

  if (query.search && query.search.trim().length > 0) {
    const term = `%${query.search.trim()}%`;
    conditions.push(
      or(
        like(merchantOrders.externalOrderId, term),
        like(merchantOrders.customerName, term),
        like(merchantOrders.customerPhone, term),
        like(merchantOrders.trxId, `%${query.search.trim().toUpperCase()}%`)
      )!
    );
  }

  const whereClause = and(...conditions);

  const [countRes, pendingRes, items, projects] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(merchantOrders)
      .where(whereClause),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(merchantOrders)
      .where(
        and(
          eq(merchantOrders.merchantId, merchantId),
          ...(query.projectId ? [eq(merchantOrders.projectId, query.projectId)] : []),
          inArray(merchantOrders.orderStatus, ['NEW', 'AWAITING_CONFIRMATION'])
        )
      ),
    db
      .select()
      .from(merchantOrders)
      .where(whereClause)
      .orderBy(desc(merchantOrders.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ id: merchantProjects.id, name: merchantProjects.name })
      .from(merchantProjects)
      .where(eq(merchantProjects.merchantId, merchantId)),
  ]);

  const projectNameMap = new Map(projects.map((p) => [p.id, p.name]));

  return {
    items: items.map((o) => ({
      ...o,
      projectName: o.projectId ? projectNameMap.get(o.projectId) ?? null : null,
    })),
    total: Number(countRes[0]?.count || 0),
    pendingConfirmationCount: Number(pendingRes[0]?.count || 0),
  };
}

/**
 * Retrieves a single merchant order by externalOrderId alongside any linked paymentIntent.
 */
export async function getOrderByExternalId(
  db: AppDb,
  merchantId: string,
  externalOrderId: string
) {
  const [orderRes, intentRes] = await Promise.all([
    db
      .select()
      .from(merchantOrders)
      .where(
        and(
          eq(merchantOrders.merchantId, merchantId),
          eq(merchantOrders.externalOrderId, externalOrderId)
        )
      )
      .limit(1),
    db
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.merchantId, merchantId),
          eq(paymentIntents.externalRefId, externalOrderId)
        )
      )
      .limit(1),
  ]);

  const order = orderRes[0];
  if (!order) {
    throw new NotFoundError(`Order '${externalOrderId}' not found`);
  }

  return {
    ...order,
    paymentIntent: intentRes[0] || null,
  };
}

/**
 * Applies a merchant confirmation/fulfillment action to an order, updates D1,
 * dispatches an HMAC-SHA256 signed webhook back to the storefront, and broadcasts SSE.
 */
export async function performOrderAction(
  db: AppDb,
  merchant: MerchantRecord,
  externalOrderId: string,
  input: OrderActionInput,
  env?: Env
) {
  const existingRes = await db
    .select()
    .from(merchantOrders)
    .where(
      and(
        eq(merchantOrders.merchantId, merchant.id),
        eq(merchantOrders.externalOrderId, externalOrderId)
      )
    )
    .limit(1);

  const existing = existingRes[0];
  if (!existing) {
    throw new NotFoundError(`Order '${externalOrderId}' not found`);
  }

  const config = ACTION_CONFIG[input.action];
  const now = new Date();

  const updateFields: Partial<typeof merchantOrders.$inferInsert> = {
    updatedAt: now,
  };

  if (config.orderStatus) {
    updateFields.orderStatus = config.orderStatus;
  }
  if (config.paymentStatus) {
    updateFields.paymentStatus = config.paymentStatus;
    updateFields.paidAmount =
      existing.paidAmount ?? existing.uniqueAmount ?? existing.baseAmount;
  }

  await db
    .update(merchantOrders)
    .set(updateFields)
    .where(eq(merchantOrders.id, existing.id));

  const updatedRes = await db
    .select()
    .from(merchantOrders)
    .where(eq(merchantOrders.id, existing.id))
    .limit(1);
  const updated = updatedRes[0];

  const dispatchCtx = await resolveProjectDispatchContext(
    db,
    merchant,
    updated.projectId,
    updated.storeCallbackUrl
  );

  const webhookData: Record<string, unknown> = {
    merchantId: merchant.id,
    projectId: updated.projectId,
    externalOrderId: updated.externalOrderId,
    orderId: updated.externalOrderId,
    action: input.action,
    orderStatus: updated.orderStatus,
    paymentStatus: updated.paymentStatus,
    paymentMethod: updated.paymentMethod,
    baseAmount: updated.baseAmount,
    uniqueAmount: updated.uniqueAmount,
    paidAmount: updated.paidAmount,
    trxId: updated.trxId,
    note: input.note,
    storeCallbackUrl: updated.storeCallbackUrl,
    updatedAt: now.toISOString(),
  };

  const webhookResult = await dispatchWebhook(
    db,
    merchant,
    config.event,
    webhookData,
    1,
    undefined,
    dispatchCtx.targetUrlOverride,
    env,
    undefined,
    dispatchCtx.webhookOptions
  );

  emitMerchantRealtimeEvent(
    env,
    'ORDER_UPDATED',
    {
      merchantId: merchant.id,
      order: updated,
      action: input.action,
      event: config.event,
    },
    merchant.id
  );

  return {
    order: updated,
    event: config.event,
    webhookDispatched: webhookResult.success,
    deliveryId: webhookResult.deliveryId,
    webhookStatusCode: webhookResult.statusCode,
  };
}
