/**
 * Timing-safe cryptography utilities built on standard Web Crypto API (crypto.subtle).
 * Fully compatible with Cloudflare Workers / Pages Functions edge runtime.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Constant-time string equality check to mitigate timing attack side-channels.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Converts ArrayBuffer to lowercase hex string.
 */
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts hex string to Uint8Array.
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const sanitized = hex.trim();
  const match = sanitized.match(/.{1,2}/g) || [];
  return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
}

/**
 * Returns a strict ArrayBuffer copy backed by the exact byte range of a Uint8Array,
 * satisfying Web Crypto BufferSource and Fetch BodyInit under TypeScript 5.7+.
 */
export function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URL encoding without padding.
 */
export function base64UrlEncode(str: string): string {
  return base64UrlEncodeBytes(textEncoder.encode(str));
}

/**
 * Base64URL decoding.
 */
export function base64UrlDecode(base64url: string): string {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return textDecoder.decode(bytes);
}

/**
 * Generates an HMAC-SHA256 signature as a lowercase hex string.
 */
export async function signHmacSha256(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  return bufferToHex(signature);
}

/**
 * Verifies an HMAC-SHA256 signature in constant time.
 */
export async function verifyHmacSha256(
  payload: string,
  receivedSignatureHex: string,
  secret: string
): Promise<boolean> {
  try {
    const expectedSignatureHex = await signHmacSha256(payload, secret);
    return timingSafeEqual(expectedSignatureHex, receivedSignatureHex.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Computes SHA-256 digest of input as a lowercase hex string.
 */
export async function hashSha256(input: string): Promise<string> {
  const digestBuffer = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return bufferToHex(digestBuffer);
}

/**
 * Computes salted/peppered SHA-256 hash for Android device API key.
 */
export async function hashDeviceApiKey(apiKey: string, pepper: string = ''): Promise<string> {
  const payload = pepper ? `${apiKey}:${pepper}` : apiKey;
  return hashSha256(payload);
}

/**
 * Generates cryptographically secure random token string.
 */
export function generateSecureToken(byteLength = 24): string {
  const buffer = new Uint8Array(byteLength);
  crypto.getRandomValues(buffer);
  return bufferToHex(buffer);
}

/**
 * Generates a merchant webhook secret (e.g., whsec_...).
 */
export function generateWebhookSecret(): string {
  return `whsec_${generateSecureToken(24)}`;
}

/**
 * Generates a mobile device API key (e.g., dev_live_...).
 */
export function generateDeviceApiKey(): string {
  return `dev_live_${generateSecureToken(20)}`;
}

/**
 * Generates a server-to-server merchant API key (e.g., sk_live_...).
 */
export function generateMerchantApiKey(): string {
  return `sk_live_${generateSecureToken(24)}`;
}

/**
 * Generates a server-to-server project-scoped API key (e.g., sk_proj_...).
 */
export function generateProjectApiKey(): string {
  return `sk_proj_${generateSecureToken(24)}`;
}

/**
 * Generates a publishable merchant key (e.g., pk_live_...).
 */
export function generatePublishableKey(): string {
  return `pk_live_${generateSecureToken(16)}`;
}

/**
 * Creates a signed tamper-proof session token for checkout flows.
 */
export async function createSignedSessionToken<T extends Record<string, unknown>>(
  payload: T,
  secret: string
): Promise<string> {
  const serialized = JSON.stringify({
    ...payload,
    issuedAt: Date.now(),
  });
  const encodedPayload = base64UrlEncode(serialized);
  const signature = await signHmacSha256(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and unpacks a signed session token.
 */
export async function verifySignedSessionToken<T extends Record<string, unknown>>(
  token: string,
  secret: string
): Promise<T | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, receivedSignature] = parts;
    const isValid = await verifyHmacSha256(encodedPayload, receivedSignature, secret);
    if (!isValid) return null;
    const jsonStr = base64UrlDecode(encodedPayload);
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_PREFIX = 'pbkdf2_sha256';

/**
 * Hashes a user password using Web Crypto PBKDF2-SHA256 (100,000 iterations, random 16-byte salt).
 * Format: pbkdf2_sha256$100000$<saltHex>$<hashHex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toExactArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${bufferToHex(salt)}$${bufferToHex(derivedBits)}`;
}

/**
 * Verifies a password against a stored PBKDF2-SHA256 hash in constant time.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[0] !== PBKDF2_PREFIX) {
      return false;
    }

    const iterations = parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations < 1000) {
      return false;
    }

    const saltHex = parts[2];
    const expectedHashHex = parts[3].toLowerCase();
    if (!saltHex || !expectedHashHex) {
      return false;
    }

    const salt = hexToUint8Array(saltHex);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: toExactArrayBuffer(salt),
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const actualHashHex = bufferToHex(derivedBits);
    return timingSafeEqual(actualHashHex, expectedHashHex);
  } catch {
    return false;
  }
}

/**
 * Generates an HMAC-SHA256 JWT (header.payload.signature).
 */
export async function signJwt<T extends Record<string, unknown>>(
  payload: T,
  secret: string
): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(signingInput));
  const encodedSig = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${signingInput}.${encodedSig}`;
}

/**
 * Verifies an HMAC-SHA256 JWT in constant time and checks expiration (`exp` in Unix seconds).
 */
export async function verifyJwt<T extends Record<string, unknown>>(
  token: string,
  secret: string
): Promise<T | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSig] = parts;
    if (!encodedHeader || !encodedPayload || !encodedSig) return null;

    const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const expectedSigBuffer = await crypto.subtle.sign('HMAC', key, textEncoder.encode(signingInput));
    const expectedSig = base64UrlEncodeBytes(new Uint8Array(expectedSigBuffer));

    if (!timingSafeEqual(expectedSig, encodedSig)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as T & { exp?: number };
    if (typeof payload.exp === 'number') {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds >= payload.exp) {
        return null;
      }
    }

    return payload;
  } catch {
    return null;
  }
}
