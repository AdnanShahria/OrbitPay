import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { eq } from 'drizzle-orm';
import type { AppContextEnv } from '../../shared/types';
import { timingSafeEqual } from '../../shared/crypto';
import { ForbiddenError } from '../../shared/errors';
import { realtimeHub, type RealtimeEvent } from './realtime.service';
import { ingestDeviceSmsBatch } from '../device/device.service';
import { merchants } from '../../db/schema';

const router = new Hono<AppContextEnv>();

/**
 * GET /api/v1/realtime/stream
 * Server-Sent Events (SSE) live stream for Merchant Portal, Checkout Modals, and Companion Apps.
 */
router.get('/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    // Send initial connection handshake
    await stream.writeSSE({
      event: 'CONNECTED',
      data: JSON.stringify({
        status: 'connected',
        timestamp: new Date().toISOString(),
        message: 'ORBIT Payment Hub Realtime SSE Stream Active',
      }),
    });

    // Subscribe to hub broadcasts
    const unsubscribe = realtimeHub.subscribe(async (event: RealtimeEvent) => {
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

    // Heartbeat ping interval every 15 seconds to keep edge connection alive
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

    // Clean up when client disconnects
    stream.onAbort(() => {
      clearInterval(pingInterval);
      unsubscribe();
    });

    // Keep stream active
    await stream.sleep(60000 * 60 * 24);
  });
});

/**
 * POST /api/v1/realtime/simulate
 * Simulates an incoming bKash / Nagad / Rocket transaction in real time.
 * Ingests into D1 sms_ledger, executes auto-reconciliation loop, and broadcasts live SSE event.
 */
router.post('/simulate', async (c) => {
  if (c.env.ENVIRONMENT === 'production') {
    const expectedKey = c.env.MASTER_ADMIN_KEY?.trim();
    const adminKey = c.req.header('x-admin-key')?.trim();
    if (!expectedKey || !adminKey || !timingSafeEqual(adminKey, expectedKey)) {
      throw new ForbiddenError('Simulation endpoint is disabled in production');
    }
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
  if (provider === 'BKASH') {
    rawSms = `You have received Tk ${amount.toFixed(2)} from ${senderNumber}. Fee Tk 0.00. Balance Tk 150,000.00. TrxID ${trxId} at ${new Date().toLocaleString()}`;
  } else if (provider === 'NAGAD') {
    rawSms = `Money received: Amount: Tk ${amount.toFixed(2)}, Sender: ${senderNumber}, TxnID: ${trxId}, Balance: Tk 85,000.00, ${new Date().toLocaleString()}`;
  } else {
    rawSms = `Received Tk${amount.toFixed(2)} from A/C ${senderNumber}. Fee Tk0.00. TxnId: ${trxId}. Date:${new Date().toLocaleString()}`;
  }

  // Get active merchant or fallback to demo merchant
  let merchantList = await db
    .select()
    .from(merchants)
    .where(eq(merchants.isActive, true))
    .limit(1);
  let merchant = merchantList[0];

  if (!merchant) {
    const demoId = 'mer_live_fb8eb757cceb7c35';
    await db
      .insert(merchants)
      .values({
        id: demoId,
        storeName: 'ORBIT Demo Storefront',
        webhookUrl: '',
        webhookSecret: 'orbit_sec_mock_key_001',
        deviceApiKeyHash: 'hash_demo_device_key',
        gracePeriodMinutes: 60,
        isActive: true,
      })
      .onConflictDoNothing();

    merchantList = await db.select().from(merchants).where(eq(merchants.id, demoId)).limit(1);
    merchant = merchantList[0];
  }

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
          smsSender: 'SIMULATOR',
          source: 'SMS',
        },
      ],
      c.env
    );
  }

  // Broadcast the realtime event to all connected clients
  realtimeHub.broadcast('TRANSACTION_NEW', {
    provider,
    trxId,
    amount,
    senderNumber,
    rawSms,
    ingestResult,
    timestamp: new Date().toISOString(),
  });

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
