#!/usr/bin/env node

/**
 * ORBIT Payment Hub - Real-Time Transaction Simulator CLI
 * Simulates incoming bKash, Nagad, and Rocket transactions directly against
 * the running local backend and triggers live SSE updates + auto-reconciliation.
 *
 * Usage:
 *   node scripts/simulate-realtime.mjs
 *   bun scripts/simulate-realtime.mjs --provider=BKASH --amount=2500
 *   npm run simulate -- --interval=5000
 */

const args = process.argv.slice(2);
const once = args.includes('--once');
const intervalArg = args.find((a) => a.startsWith('--interval='));
const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 6000;

const providerArg = args.find((a) => a.startsWith('--provider='));
const amountArg = args.find((a) => a.startsWith('--amount='));
const trxArg = args.find((a) => a.startsWith('--trx=') || a.startsWith('--trxId='));

const targetUrl = process.env.API_URL || 'http://localhost:8787/api/v1/realtime/simulate';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

async function sendSimulation() {
  const payload = {};
  if (providerArg) payload.provider = providerArg.split('=')[1].toUpperCase();
  if (amountArg) payload.amount = Number(amountArg.split('=')[1]);
  if (trxArg) payload.trxId = trxArg.split('=')[1];

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`${c.red}[ERROR]${c.reset} Simulator HTTP ${res.status}: ${res.statusText}`);
      return;
    }

    const data = await res.json();
    const tx = data.data;
    console.log(
      `${c.green}✔ [REALTIME SMS SIMULATED]${c.reset} ${c.bold}${tx.provider}${c.reset} | ৳${tx.amount} | TrxID: ${c.cyan}${tx.trxId}${c.reset} | Sender: ${tx.senderNumber} | Active SSE Clients: ${tx.subscribers}`
    );
  } catch (err) {
    console.error(`${c.yellow}[WAITING]${c.reset} Backend at ${targetUrl} not reachable yet (${err.message}). Retrying...`);
  }
}

console.log(`${c.bold}${c.cyan}⚡ ORBIT Real-Time MFS Transaction Simulator${c.reset}`);
console.log(`Targeting: ${targetUrl}`);
console.log(`Mode: ${once ? 'Single-Shot (--once)' : `Continuous (every ${intervalMs / 1000}s)`}\n`);

// First immediate trigger
sendSimulation();

if (!once) {
  setInterval(sendSimulation, intervalMs);
}
