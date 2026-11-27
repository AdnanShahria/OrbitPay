import type { AppDb } from '../db/client';
import { routerProviderLogs } from '../db/schema';
import { generateSecureToken } from '../shared/crypto';
import type { Env } from '../shared/types';
import type {
  ProviderAdapter,
  ProviderAttempt,
  ProviderCapability,
  RouterChannel,
  RouterDispatchResponse,
  RouterHealthSnapshot,
} from './types';

/**
 * In-memory per-isolate circuit-breaker state for exhausted or rate-limited providers.
 * Prevents hitting an exhausted service (e.g. AWS SES daily quota or Resend 429) on every request.
 */
const providerCooldowns = new Map<string, number>();

const DEFAULT_TRANSIENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_QUOTA_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function cooldownKey(channel: RouterChannel, provider: string): string {
  return `${channel}:${provider}`;
}

export function isProviderInCooldown(channel: RouterChannel, provider: string): boolean {
  const until = providerCooldowns.get(cooldownKey(channel, provider));
  if (!until) return false;
  if (Date.now() >= until) {
    providerCooldowns.delete(cooldownKey(channel, provider));
    return false;
  }
  return true;
}

export function getProviderCooldownUntil(channel: RouterChannel, provider: string): string | undefined {
  const until = providerCooldowns.get(cooldownKey(channel, provider));
  if (!until || Date.now() >= until) return undefined;
  return new Date(until).toISOString();
}

export function markProviderCooldown(
  channel: RouterChannel,
  provider: string,
  quotaExhausted = false
): void {
  const ttl = quotaExhausted ? DEFAULT_QUOTA_COOLDOWN_MS : DEFAULT_TRANSIENT_COOLDOWN_MS;
  providerCooldowns.set(cooldownKey(channel, provider), Date.now() + ttl);
}

export function clearProviderCooldown(channel: RouterChannel, provider: string): void {
  providerCooldowns.delete(cooldownKey(channel, provider));
}

/**
 * Detects whether an HTTP status code or error message indicates provider quota/rate exhaustion.
 */
export function isQuotaOrRateLimitError(statusCode?: number, errorText?: string): boolean {
  if (statusCode === 402 || statusCode === 429) return true;
  if (!errorText) return false;
  const lower = errorText.toLowerCase();
  return (
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('ratelimit') ||
    lower.includes('limit exceeded') ||
    lower.includes('daily limit') ||
    lower.includes('monthly limit') ||
    lower.includes('insufficient') ||
    lower.includes('credit') ||
    lower.includes('throttl')
  );
}

/**
 * Parses an optional comma-separated priority override (e.g. "aws_ses,resend,brevo")
 * and appends any remaining default providers so fallback coverage is never lost.
 */
export function resolveProviderOrder<T extends string = string>(
  overrideCsv: string | undefined,
  defaults: readonly T[],
  preferredProvider?: string
): T[] {
  const ordered: T[] = [];
  const pushUnique = (id: string) => {
    const clean = id.trim().toLowerCase() as T;
    if (clean && defaults.includes(clean) && !ordered.includes(clean)) {
      ordered.push(clean);
    }
  };

  if (preferredProvider) {
    pushUnique(preferredProvider);
  }

  if (overrideCsv) {
    for (const part of overrideCsv.split(',')) {
      pushUnique(part);
    }
  }

  for (const def of defaults) {
    pushUnique(def);
  }

  return ordered;
}

/**
 * Shared fallback execution engine used by email.ts, sms.ts, image.ts, and database.ts.
 * Intelligently selects configured providers, skips providers in quota cooldown,
 * automatically fails over to the next provider, and logs failover audit trails to D1.
 */
export async function executeWithFallback<TInput, TOutput>(opts: {
  channel: RouterChannel;
  env: Env;
  input: TInput;
  adapters: Record<string, ProviderAdapter<TInput, TOutput>>;
  priorityOrder: string[];
  db?: AppDb;
  callerId?: string;
}): Promise<RouterDispatchResponse<TOutput>> {
  const { channel, env, input, adapters, priorityOrder, db, callerId } = opts;
  const startedAt = Date.now();
  const attempts: ProviderAttempt[] = [];

  const configuredOrder = priorityOrder.filter((id) => {
    const adapter = adapters[id];
    return adapter && adapter.isConfigured(env);
  });

  if (configuredOrder.length === 0) {
    return {
      success: false,
      channel,
      providerUsed: null,
      fallbackTriggered: false,
      attempts: [],
      error: `No configured providers available for channel '${channel}'`,
    };
  }

  // First pass: prioritize healthy providers not in cooldown.
  // If every configured provider is currently in cooldown, fall back to trying all configured ones.
  const healthyProviders = configuredOrder.filter((id) => !isProviderInCooldown(channel, id));
  const candidates = healthyProviders.length > 0 ? healthyProviders : configuredOrder;

  if (healthyProviders.length > 0) {
    for (const skippedId of configuredOrder) {
      if (!healthyProviders.includes(skippedId)) {
        attempts.push({
          provider: skippedId,
          ok: false,
          skippedDueToCooldown: true,
          quotaExhausted: true,
          error: 'Skipped temporarily due to recent quota/rate-limit cooldown',
          latencyMs: 0,
        });
      }
    }
  }

  let succeededData: TOutput | undefined;
  let usedProvider: string | null = null;

  for (const providerId of candidates) {
    const adapter = adapters[providerId];
    if (!adapter) continue;

    const attemptStart = Date.now();
    try {
      const result = await adapter.execute(env, input);
      const latencyMs = Date.now() - attemptStart;

      if (result.ok) {
        clearProviderCooldown(channel, providerId);
        attempts.push({
          provider: providerId,
          ok: true,
          statusCode: result.statusCode,
          latencyMs,
        });
        succeededData = result.data;
        usedProvider = providerId;
        break;
      }

      const quotaExhausted =
        result.quotaExhausted || isQuotaOrRateLimitError(result.statusCode, result.error);

      if (quotaExhausted || (result.statusCode && result.statusCode >= 500)) {
        markProviderCooldown(channel, providerId, quotaExhausted);
      }

      attempts.push({
        provider: providerId,
        ok: false,
        statusCode: result.statusCode,
        error: result.error || 'Provider rejected request',
        quotaExhausted,
        latencyMs,
      });
    } catch (err: any) {
      const latencyMs = Date.now() - attemptStart;
      const errMsg = err?.message || 'Unexpected provider exception';
      const quotaExhausted = isQuotaOrRateLimitError(undefined, errMsg);
      markProviderCooldown(channel, providerId, quotaExhausted);
      attempts.push({
        provider: providerId,
        ok: false,
        error: errMsg,
        quotaExhausted,
        latencyMs,
      });
    }
  }

  const totalLatencyMs = Date.now() - startedAt;
  const firstCandidate = configuredOrder[0];
  const fallbackTriggered = usedProvider !== null && usedProvider !== firstCandidate;

  // Non-blocking audit trail write to D1 when DB is available
  if (db) {
    try {
      await db.insert(routerProviderLogs).values({
        id: `rlog_${generateSecureToken(12)}`,
        channel,
        selectedProvider: usedProvider,
        status: usedProvider ? (fallbackTriggered ? 'FALLBACK_SUCCESS' : 'SUCCESS') : 'FAILED',
        fallbackTriggered,
        attemptsJson: JSON.stringify(attempts),
        latencyMs: totalLatencyMs,
        callerId: callerId || null,
      });
    } catch {
      // Never block service routing if audit log insertion fails
    }
  }

  if (usedProvider) {
    return {
      success: true,
      channel,
      providerUsed: usedProvider,
      fallbackTriggered,
      attempts,
      data: succeededData,
    };
  }

  const lastErr = attempts[attempts.length - 1]?.error || 'All providers failed';
  return {
    success: false,
    channel,
    providerUsed: null,
    fallbackTriggered: attempts.length > 1,
    attempts,
    error: `All ${channel} providers failed. Last error: ${lastErr}`,
  };
}

/**
 * Checks which secrets/bindings are configured without ever exposing raw secret values.
 */
export function buildChannelCapabilities(
  channel: RouterChannel,
  env: Env,
  adapters: Record<string, ProviderAdapter<any, any>>,
  order: string[]
): ProviderCapability[] {
  return order.map((id, index) => ({
    provider: id,
    configured: Boolean(adapters[id]?.isConfigured(env)),
    priority: index + 1,
    inCooldown: isProviderInCooldown(channel, id),
    cooldownUntil: getProviderCooldownUntil(channel, id),
  }));
}

export function createHealthSnapshot(
  channels: Record<RouterChannel, ProviderCapability[]>
): RouterHealthSnapshot {
  return {
    timestamp: new Date().toISOString(),
    channels,
  };
}
