export const WORKER_PIN_RATE_LIMIT_WINDOW_MS = 60_000;
export const WORKER_PIN_ACCOUNT_MAX_ATTEMPTS = 10;
export const WORKER_PIN_IP_MAX_ATTEMPTS = 30;

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T, options?: { expiration?: number }): Promise<void>;
  delete(key: string): Promise<boolean>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

interface DurableObjectRequestTarget {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface PinRateLimiterNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectRequestTarget;
}

interface PinLimitRecord {
  count: number;
  resetAt: number;
}

interface PinLimiterCommand {
  action: 'check' | 'reset';
  maxAttempts?: number;
  now?: number;
}

const RECORD_KEY = 'pin-limit-record';
const HASHED_BUCKET_PATTERN = /^[a-f0-9]{64}$/;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isValidCommand(command: unknown): command is PinLimiterCommand {
  if (!command || typeof command !== 'object') return false;
  const value = command as Partial<PinLimiterCommand>;
  if (value.action !== 'check' && value.action !== 'reset') return false;
  if (value.maxAttempts !== undefined && (!Number.isInteger(value.maxAttempts) || value.maxAttempts < 1 || value.maxAttempts > 10_000)) return false;
  if (value.now !== undefined && (!Number.isFinite(value.now) || value.now < 0)) return false;
  return true;
}

/**
 * Serialized per-bucket counter. The Worker never sends raw account/IP values
 * to the object; only a SHA-256 bucket name is used as the Durable Object ID.
 */
export class PinRateLimiterDurableObject {
  constructor(private readonly state: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return jsonResponse({ success: false, error: 'METHOD_NOT_ALLOWED' }, 405);

    const bucketName = new URL(request.url).pathname.split('/').filter(Boolean).pop() || '';
    if (!HASHED_BUCKET_PATTERN.test(bucketName)) return jsonResponse({ success: false, error: 'INVALID_BUCKET' }, 400);

    let command: unknown;
    try {
      command = await request.json();
    } catch {
      return jsonResponse({ success: false, error: 'INVALID_JSON' }, 400);
    }
    if (!isValidCommand(command)) return jsonResponse({ success: false, error: 'INVALID_COMMAND' }, 400);

    if (command.action === 'reset') {
      await this.state.storage.delete(RECORD_KEY);
      return jsonResponse({ success: true, reset: true });
    }

    const now = command.now ?? Date.now();
    const maxAttempts = command.maxAttempts ?? WORKER_PIN_ACCOUNT_MAX_ATTEMPTS;
    const current = await this.state.storage.get<PinLimitRecord>(RECORD_KEY);
    const record = current && now < current.resetAt
      ? current
      : { count: 0, resetAt: now + WORKER_PIN_RATE_LIMIT_WINDOW_MS };

    if (record.count >= maxAttempts) {
      return jsonResponse({
        success: true,
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
      });
    }

    const nextRecord = { ...record, count: record.count + 1 };
    await this.state.storage.put(RECORD_KEY, nextRecord, { expiration: Math.ceil(nextRecord.resetAt / 1000) });
    return jsonResponse({
      success: true,
      allowed: true,
      remaining: Math.max(0, maxAttempts - nextRecord.count),
      resetAt: nextRecord.resetAt,
    });
  }
}

export async function hashPinRateLimitBucket(scope: 'account' | 'ip', value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${scope}:${value}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function callLimiter(namespace: PinRateLimiterNamespace, bucket: string, command: PinLimiterCommand): Promise<{ allowed?: boolean; resetAt?: number }> {
  const stub = namespace.get(namespace.idFromName(bucket));
  const response = await stub.fetch(`https://pin-rate-limiter/${bucket}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`PIN_RATE_LIMITER_HTTP_${response.status}`);
  const body = await response.json() as { success?: boolean; allowed?: boolean; resetAt?: number };
  if (body.success !== true) throw new Error('PIN_RATE_LIMITER_REJECTED');
  return body;
}

export async function checkWorkerPinRateLimit(
  namespace: PinRateLimiterNamespace | undefined,
  verifiedUid: string,
  clientIp: string,
): Promise<{ allowed: true } | { allowed: false; resetAt?: number }> {
  if (!namespace) throw new Error('PIN_RATE_LIMITER_UNAVAILABLE');
  const accountBucket = await hashPinRateLimitBucket('account', verifiedUid);
  const ipBucket = await hashPinRateLimitBucket('ip', clientIp || 'unknown');
  const accountResult = await callLimiter(namespace, accountBucket, { action: 'check', maxAttempts: WORKER_PIN_ACCOUNT_MAX_ATTEMPTS });
  if (accountResult.allowed === false) return { allowed: false, resetAt: accountResult.resetAt };
  const ipResult = await callLimiter(namespace, ipBucket, { action: 'check', maxAttempts: WORKER_PIN_IP_MAX_ATTEMPTS });
  if (ipResult.allowed === false) return { allowed: false, resetAt: ipResult.resetAt };
  return { allowed: true };
}

export async function resetWorkerPinRateLimit(
  namespace: PinRateLimiterNamespace | undefined,
  verifiedUid: string,
  clientIp: string,
): Promise<void> {
  if (!namespace) throw new Error('PIN_RATE_LIMITER_UNAVAILABLE');
  const accountBucket = await hashPinRateLimitBucket('account', verifiedUid);
  const ipBucket = await hashPinRateLimitBucket('ip', clientIp || 'unknown');
  await Promise.all([
    callLimiter(namespace, accountBucket, { action: 'reset' }),
    callLimiter(namespace, ipBucket, { action: 'reset' }),
  ]);
}
