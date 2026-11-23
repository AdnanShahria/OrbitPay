#!/usr/bin/env node

/**
 * ORBIT Payment Hub - Ultra-Fast Unified Development Orchestrator
 * Supports: `npm run dev:full` | `bun run dev` | `npm run dev:realtime`
 *
 * Runs Cloudflare Pages edge runtime (Wrangler + D1) and React 19 Frontend (Vite)
 * in parallel with zero lag, colored stream logs, and instant process management.
 */

import { spawn, execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isBun = typeof process.versions.bun !== 'undefined';
const isWindows = process.platform === 'win32';
const isRealtimeEnabled = process.argv.includes('--realtime') || process.argv.includes('--simulate');
const shouldOpenBrowser = process.argv.includes('--open');

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const ifaceList of Object.values(nets)) {
    if (!ifaceList) continue;
    for (const net of ifaceList) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

function openBrowser(url) {
  let child;
  if (isWindows) {
    child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    child = spawn('open', [url], { detached: true, stdio: 'ignore' });
  } else {
    child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  }
  child.unref();
}

const lanIp = getLanIp();

// ANSI Color Helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(tag, color, message) {
  const lines = message.toString().split('\n');
  for (const line of lines) {
    if (line.trim().length > 0) {
      console.log(`${color}${c.bold}[${tag}]${c.reset} ${line}`);
    }
  }
}

console.log(`
${c.cyan}${c.bold}╔══════════════════════════════════════════════════════════════════════╗
║                🪐 ORBIT Payment Hub — Unified Dev Server             ║
╠══════════════════════════════════════════════════════════════════════╣${c.reset}
  ${c.yellow}⚡ Runtime:${c.reset}      ${isBun ? 'Bun ' + process.versions.bun : 'Node.js ' + process.version} ${c.dim}(fastest native execution)${c.reset}
  ${c.magenta}📱 Frontend:${c.reset}     http://localhost:3000
  ${c.magenta}🌐 Mobile (Wi-Fi):${c.reset} ${lanIp ? `http://${lanIp}:3000` : 'Unavailable (check Wi-Fi/LAN)'}
  ${c.cyan}⛅ Backend API:${c.reset}  http://localhost:8787
  ${c.green}📡 Realtime SSE:${c.reset} http://localhost:8787/api/v1/realtime/stream
  ${c.blue}💾 Database:${c.reset}     Cloudflare D1 (orbit-payment-d1)
  ${c.yellow}🔄 Mode:${c.reset}         ${isRealtimeEnabled ? 'Real-Time Auto-Simulator ACTIVE' : 'Standard Fullstack Dev'}
${c.cyan}${c.bold}╚══════════════════════════════════════════════════════════════════════╝${c.reset}
`);

const children = [];

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (isWindows) {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    // Process already exited
  }
}

function cleanExit() {
  console.log(`\n${c.yellow}${c.bold}[SYSTEM]${c.reset} Shutting down dev servers gracefully...`);
  for (const child of children) {
    if (child && child.pid) {
      killProcessTree(child.pid);
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);
process.on('exit', () => {
  for (const child of children) {
    if (child && child.pid) {
      killProcessTree(child.pid);
    }
  }
});

// 1. Start Backend: Unified Cloudflare Worker dev with local D1 + Static Assets
const backendCmd = isBun ? 'bunx' : 'npx';
const backendArgs = ['wrangler', 'dev', '--port', '8787'];

log('SYSTEM', c.yellow, `Spawning Cloudflare Worker edge runtime on port 8787...`);
const backendProc = spawn(backendCmd, backendArgs, {
  cwd: rootDir,
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' },
});
children.push(backendProc);

backendProc.stdout.on('data', (d) => log('BACKEND', c.cyan, d));
backendProc.stderr.on('data', (d) => log('BACKEND', c.red, d));
backendProc.on('error', (err) => log('BACKEND', c.red, `Failed to spawn: ${err.message}`));

// 2. Start Frontend: Vite dev server on port 3000
const frontendCmd = isBun ? 'bunx' : 'npx';
const frontendArgs = ['vite', '--port', '3000', '--host'];

log('SYSTEM', c.yellow, `Spawning Vite React 19 Frontend server on port 3000...`);
const frontendProc = spawn(frontendCmd, frontendArgs, {
  cwd: path.resolve(rootDir, 'frontend'),
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' },
});
children.push(frontendProc);

frontendProc.stdout.on('data', (d) => log('FRONTEND', c.magenta, d));
frontendProc.stderr.on('data', (d) => log('FRONTEND', c.red, d));
frontendProc.on('error', (err) => log('FRONTEND', c.red, `Failed to spawn: ${err.message}`));

if (shouldOpenBrowser) {
  const openTimer = setTimeout(() => {
    log('SYSTEM', c.green, 'Opening http://localhost:3000 in your browser...');
    openBrowser('http://localhost:3000');
  }, 2500);
  openTimer.unref();
}

// 3. Optional: Real-Time Transaction Generator
if (isRealtimeEnabled) {
  log('REALTIME', c.green, 'Real-time simulator daemon initialized (transacting every 10s)...');
  const simInterval = setInterval(async () => {
    try {
      const res = await fetch('http://localhost:8787/api/v1/realtime/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const body = await res.json();
        const d = body.data;
        log(
          'REALTIME',
          c.green,
          `⚡ Live SMS Ingested: ${d.provider} | ৳${d.amount} | TrxID: ${d.trxId} | Connected SSE Subscribers: ${d.subscribers}`
        );
      }
    } catch {
      // Backend still booting
    }
  }, 10000);

  process.on('exit', () => clearInterval(simInterval));
}
