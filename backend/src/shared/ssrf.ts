import { BadRequestError } from './errors';
import type { Env } from './types';

const BLOCKED_HOSTNAMES = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  '169.254.169.254',
  '100.100.100.200',
  'fd00:ec2::254',
]);

const BLOCKED_TLDS = ['.local', '.internal', '.localhost', '.arpa'];

function isPrivateOrReservedIpv4(host: string, allowLocalhost: boolean): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) {
    return false;
  }

  const octets = parts.map((p) => Number(p));
  if (octets.some((o) => o < 0 || o > 255)) {
    return true; // Invalid IPv4 literal
  }

  const [a, b, c] = octets;

  // 0.0.0.0/8 ("this network")
  if (a === 0) return true;
  // 10.0.0.0/8 (RFC1918)
  if (a === 10) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return !(allowLocalhost && host === '127.0.0.1');
  // 169.254.0.0/16 (Link-local & Cloud Metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (RFC1918)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.168.0.0/16 (RFC1918)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateOrReservedIpv6(rawHost: string, allowLocalhost: boolean): boolean {
  const host = rawHost.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes(':')) return false;

  if (host === '::' || host === '0:0:0:0:0:0:0:0') return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return !allowLocalhost;

  // IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (host.startsWith('::ffff:') || host.startsWith('0:0:0:0:0:ffff:')) {
    const mapped = host.split(':').pop() || '';
    if (isIpv4Literal(mapped)) {
      return isPrivateOrReservedIpv4(mapped, allowLocalhost);
    }
    return true;
  }

  // Link-local fe80::/10, ULA fc00::/7 (fc.. / fd..), Multicast ff00::/8
  const firstSegment = host.split(':')[0] || '';
  if (
    firstSegment.startsWith('fe8') ||
    firstSegment.startsWith('fe9') ||
    firstSegment.startsWith('fea') ||
    firstSegment.startsWith('feb') ||
    firstSegment.startsWith('fc') ||
    firstSegment.startsWith('fd') ||
    firstSegment.startsWith('ff')
  ) {
    return true;
  }

  return false;
}

/**
 * Parses a merchant's allowedCallbackOriginsJson safely into normalized origin strings.
 */
export function parseAllowedOrigins(jsonStr?: string | null): string[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    const origins: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string' || !item.trim()) continue;
      try {
        origins.push(new URL(item.trim()).origin.toLowerCase());
      } catch {
        // Ignore malformed entries
      }
    }
    return origins;
  } catch {
    return [];
  }
}

export interface SafeUrlCheckResult {
  ok: boolean;
  url?: URL;
  reason?: string;
}

/**
 * Non-throwing SSRF validator for webhook and callback URLs.
 */
export function checkSafeWebhookUrl(
  rawUrl: string,
  env?: Pick<Env, 'ENVIRONMENT'>,
  allowedOrigins?: string[]
): SafeUrlCheckResult {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'Webhook/callback URL is empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'Malformed webhook/callback URL' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'Embedded credentials are not permitted in webhook URLs' };
  }

  const isProd = (env?.ENVIRONMENT || 'production') === 'production';
  const rawHost = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  const isLocalhostHost =
    rawHost === 'localhost' ||
    rawHost === '127.0.0.1' ||
    rawHost === '::1' ||
    rawHost === '[::1]';

  if (parsed.protocol === 'https:') {
    // Allowed scheme
  } else if (!isProd && parsed.protocol === 'http:' && isLocalhostHost) {
    // Localhost HTTP permitted only in non-production environments
  } else if (isProd) {
    return { ok: false, reason: 'Only https:// webhook URLs are permitted in production' };
  } else {
    return {
      ok: false,
      reason: 'Webhook URL must use https:// (or http://localhost / http://127.0.0.1 in development)',
    };
  }

  if (!rawHost) {
    return { ok: false, reason: 'Webhook URL hostname is missing' };
  }

  if (BLOCKED_HOSTNAMES.has(rawHost)) {
    return { ok: false, reason: `Blocked internal/metadata hostname '${rawHost}'` };
  }

  if (BLOCKED_TLDS.some((tld) => rawHost === tld.slice(1) || rawHost.endsWith(tld))) {
    if (!(!isProd && rawHost === 'localhost')) {
      return { ok: false, reason: `Blocked internal hostname '${rawHost}'` };
    }
  }

  // Reject decimal/hex/octal obfuscated IPv4 hostnames (e.g. 2130706433 or 0x7f000001)
  if (/^\d+$/.test(rawHost) || /^0x[0-9a-f]+$/i.test(rawHost)) {
    return { ok: false, reason: 'Numeric/hex IP hostnames are not permitted' };
  }

  if (isIpv4Literal(rawHost) && isPrivateOrReservedIpv4(rawHost, !isProd)) {
    return { ok: false, reason: `Private or reserved IPv4 address '${rawHost}' is blocked` };
  }

  if (rawHost.includes(':') && isPrivateOrReservedIpv6(rawHost, !isProd)) {
    return { ok: false, reason: `Private or reserved IPv6 address '${rawHost}' is blocked` };
  }

  if (allowedOrigins && allowedOrigins.length > 0) {
    const normalizedAllowed = allowedOrigins
      .map((o) => {
        try {
          return new URL(o).origin.toLowerCase();
        } catch {
          return o.trim().toLowerCase();
        }
      })
      .filter(Boolean);

    if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(parsed.origin.toLowerCase())) {
      return {
        ok: false,
        reason: `Callback origin '${parsed.origin}' is not in merchant's allowedCallbackOrigins`,
      };
    }
  }

  return { ok: true, url: parsed };
}

/**
 * Validates that a webhook or callback URL is safe against SSRF attacks.
 * Throws BadRequestError if the URL violates security policy.
 */
export function validateSafeWebhookUrl(
  rawUrl: string,
  env?: Pick<Env, 'ENVIRONMENT'>,
  allowedOrigins?: string[]
): URL {
  const result = checkSafeWebhookUrl(rawUrl, env, allowedOrigins);
  if (!result.ok || !result.url) {
    throw new BadRequestError(result.reason || 'Invalid or unsafe webhook URL');
  }
  return result.url;
}
