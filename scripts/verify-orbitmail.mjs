#!/usr/bin/env node

/**
 * OrbitMail Delivery Verification Script
 * Usage: node scripts/verify-orbitmail.mjs [recipient@example.com]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let val = line.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(rootDir, '.env'));
loadEnvFile(path.join(rootDir, '.dev.vars'));

const url = process.env.ORBITMAIL_URL || 'https://mail.orbitsaas.cloud/api/v1/send';
const apiKey = process.env.ORBITMAIL_API_KEY;
const from = process.env.ORBITMAIL_FROM || 'contact@mail.orbitsaas.cloud';
const to = process.argv[2] || from;

if (!apiKey) {
  console.error('Missing ORBITMAIL_API_KEY in environment, .env, or .dev.vars');
  process.exit(1);
}

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: 'ORBIT Payment Hub — OrbitMail Delivery Verification',
    html: '<p>OrbitMail delivery verification from <strong>ORBIT Payment Hub</strong>.</p>',
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`OrbitMail verification failed (HTTP ${res.status}): ${text}`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = { raw: text };
}

console.log(`HTTP ${res.status}`, parsed);
if (!parsed?.id && !parsed?.data?.id) {
  console.warn('Warning: HTTP 200 received, but response JSON did not include an id field.');
}
