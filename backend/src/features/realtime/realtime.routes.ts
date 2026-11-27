import { Hono, type MiddlewareHandler } from 'hono';
import { streamSSE } from 'hono/streaming';
import { eq } from 'drizzle-orm';
import type { AppContextEnv } from '../../shared/types';
import { base64UrlDecode } from '../../shared/crypto';
import { ForbiddenError } from '../../shared/errors';
import {
  authenticateAdminJwt,
  authMasterAdminMiddleware,
  authMerchantOrDeviceMiddleware,
  authenticateJwtSession,
} from '../../shared/middleware';
import { realtimeHub, type RealtimeEvent } from './realtime.service';
import { ingestDeviceSmsBatch } from '../device/device.service';
import { merchants } from '../../db/schema';

const router = new Hono<AppContextEnv>();

/**
 * Authenticates SSE connections via:
 * - `?adminToken=<admin_jwt>` or `Authorization: Bearer <admin_jwt>` (Master Admin cross-tenant stream)
 * - `?token=<merchant_jwt>` or standard merchant/device headers (strictly tenant-scoped)
 */
const authStreamMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const db = c.get('db');
  const adminToken = c.req.query('adminToken')?.trim();
  if (adminToken && adminToken.split('.').length === 3) {
    await authenticateAdminJwt(c, db, adminToken);
    await next();
    return;
  }

  const authHeader = c.req.header('authorization');
  const bearerToken =
    authHeader && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.substring(7).trim()
      : undefined;

  if (bearerToken && bearerToken.split('.').length === 3) {
    try {
      const payloadPart = bearerToken.split('.')[1];
      const decoded = JSON.parse(base64UrlDecode(payloadPart)) as { typ?: string };
      if (decoded?.typ === 'ORBIT_ADMIN_JWT') {
        await authenticateAdminJwt(c, db, bearerToken);
        await next();
        return;
      }
    } catch {
      // Fall through to standard merchant/device auth which will reject malformed tokens
    }
  }

  const queryToken = c.req.query('token')?.trim();
  if (queryToken && queryToken.split('.').length === 3 && !authHeader) {
    await authenticateJwtSession(c, db, queryToken, c.req.header('x-merchant-id')?.trim());
    await next();
    return;
  }

  return authMerchantOrDeviceMiddleware(c, next);
};

/**
 * GET /api/v1/realtime/stream
 * Server-Sent Events (SSE) live stream for Master Admin Hub (all tenants)
 * and Merchant Portal / Companion Apps (strictly tenant-isolated).
 */
router.get('/stream', authStreamMiddleware, async (c) => {
  const adminUserId = c.get('adminUserId');
  const isAdminStream = Boolean(adminUserId);
  const callerMerchantId = c.get('merchantId');

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'CONNECTED',
      data: JSON.stringify(
        isAdminStream
          ? {
              status: 'connected',
              scope: 'admin',
              adminUserId,
              timestamp: new Date().toISOString(),
              message: 'ORBIT Payment Hub Admin Realtime SSE Stream Active',
            }
          : {
              status: 'connected',
              scope: 'merchant',
              merchantId: callerMerchantId,
              timestamp: new Date().toISOString(),
              message: 'ORBIT Payment Hub Realtime SSE Stream Active',
            }
      ),
    });

    const unsubscribe = realtimeHub.subscribe(async (event: RealtimeEvent) => {
      // Strictly tenant-isolated for merchants; Admin stream receives all hub events
      if (!isAdminStream && event.merchantId !== callerMerchantId) {
        return;
      }
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
          id: String(Date.now()),
        });
      } catch (err) {
        console.warn('Error pushing SSE event to client:', err);
      }
    });

    const pingInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: 'PING',
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        });
      } catch {
        clearInterval(pingInterval);
      }
    }, 15000);

    stream.onAbort(() => {
      clearInterval(pingInterval);
      unsubscribe();
    });

    await stream.sleep(60000 * 60 * 24);
  });
});

/**
 * POST /api/v1/realtime/simulate
 * Fail-closed simulation endpoint: disabled in production and gated by Master Admin Key everywhere.
 */
router.post('/simulate', authMasterAdminMiddleware, async (c) => {
  if (c.env.ENVIRONMENT === 'production') {
    throw new ForbiddenError('Simulation endpoint is disabled in production');
  }

  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));

  const provider = (body.provider || ['BKASH', 'NAGAD', 'ROCKET'][Math.floor(Math.random() * 3)]) as
    | 'BKASH'
    | 'NAGAD'
    | 'ROCKET';
  const amount = Number(body.amount) || Math.floor(Math.random() * 4000) + 500;
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const trxId =
    body.trxId ||
    `${provider === 'BKASH' ? 'BLM' : provider === 'NAGAD' ? '72J' : '984'}${randomSuffix}`;
  const senderNumber = body.senderNumber || `017${Math.floor(10000000 + Math.random() * 90000000)}`;

  let rawSms = '';
  let smsSender = 'bKash';
  if (provider === 'BKASH') {
    smsSender = 'bKash';
    rawSms = `You have received Tk ${amount.toFixed(2)} from ${senderNumber}. Fee Tk 0.00. Balance Tk 150,000.00. TrxID ${trxId} at ${new Date().toLocaleString()}`;
  } else if (provider === 'NAGAD') {
    smsSender = 'NAGAD';
    rawSms = `Money received: Amount: Tk ${amount.toFixed(2)}, Sender: ${senderNumber}, TxnID: ${trxId}, Balance: Tk 85,000.00, ${new Date().toLocaleString()}`;
  } else {
    smsSender = '16216';
    rawSms = `Tk${amount.toFixed(2)} received from A/C:${senderNumber}. Fee Tk0.00. TxnId:${trxId}. Date:${new Date().toLocaleString()}`;
  }

  const merchantList = body.merchantId
    ? await db.select().from(merchants).where(eq(merchants.id, String(body.merchantId))).limit(1)
    : await db.select().from(merchants).where(eq(merchants.isActive, true)).limit(1);
  const merchant = merchantList[0];

  let ingestResult = { ingestedCount: 0, autoVerifiedCount: 0, flaggedCount: 0 };
  if (merchant) {
    ingestResult = await ingestDeviceSmsBatch(
      db,
      merchant,
      [
        {
          provider,
          amount,
          senderNumber,
          trxId,
          rawSms,
          receivedAt: Date.now(),
          smsSender,
          source: 'SMS',
        },
      ],
      c.env,
      c
    );

    realtimeHub.broadcast(
      'TRANSACTION_NEW',
      {
        merchantId: merchant.id,
        provider,
        trxId,
        amount,
        senderNumber,
        rawSms,
        ingestResult,
        timestamp: new Date().toISOString(),
      },
      merchant.id
    );
  }

  return c.json({
    success: true,
    data: {
      provider,
      trxId,
      amount,
      senderNumber,
      rawSms,
      ingestResult,
      subscribers: realtimeHub.subscriberCount,
    },
  });
});

export default router;
