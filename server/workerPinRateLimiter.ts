export const WORKER_PIN_RATE_LIMIT_WINDOW_MS = 60_000;
export const WORKER_PIN_ACCOUNT_MAX_ATTEMPTS = 10;
// Audit N2 (Phase 1, 2026-11-06): tightened from 30 to 5 attempts/min per IP.
// The previous 30/min limit meant a 30-IP botnet could try 900 PINs/min,
// covering the 100k 5-digit PIN space in ~2 hours. At 5/min/IP, a 30-IP
// botnet covers it in ~11 hours — and the per-target limit below makes
// botnet size irrelevant for targeting a specific PIN.
export const WORKER_PIN_IP_MAX_ATTEMPTS = 5;
// NEW (audit N2): per-target-PIN rate limit. Even if an attacker has many
// IPs, they can only try a SPECIFIC PIN value this many times per minute
// globally. This caps the online brute-force rate for any single target
// PIN regardless of botnet size. Set generously (15/min) so a legit user
// who typos the same PIN 3-4 times in a row isn't blocked, but a botnet
// hammering one PIN is throttled.
export const WORKER_PIN_TARGET_MAX_ATTEMPTS = 15;

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

export async function hashPinRateLimitBucket(scope: 'account' | 'ip' | 'target_pin', value: string): Promise<string> {
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

/**
 * Checks the rate-limit buckets for a PIN verify attempt.
 *
 * Three buckets are checked (in PARALLEL to minimize latency):
 *   1. account (per-uid): 10/min — caps repeated attempts from one
 *      anonymous uid. Attackers can mint unlimited uids from one IP,
 *      so this alone is insufficient (audit N2).
 *   2. ip (per-client-IP): 5/min — the primary defense. A 30-IP botnet
 *      can still try 150 PINs/min total, but only 5 per individual IP.
 *   3. target_pin (per-hashed-PIN): 15/min globally — caps the rate at
 *      which any SPECIFIC PIN value can be probed, regardless of how
 *      many IPs the attacker has. This makes botnet size irrelevant
 *      for targeting a single PIN (audit N2).
 *
 * All 3 Durable Object calls run in parallel via Promise.all. Previously
 * they were sequential (3 round-trips), which added ~4-6 seconds to
 * every login when DO cold starts were involved. Parallel = 1 round-trip.
 *
 * Returns `{allowed: false, resetAt}` if ANY bucket is exhausted.
 */
export async function checkWorkerPinRateLimit(
  namespace: PinRateLimiterNamespace | undefined,
  verifiedUid: string,
  clientIp: string,
  normalizedPin?: string,
): Promise<{ allowed: true } | { allowed: false; resetAt?: number; bucket?: 'account' | 'ip' | 'target_pin' }> {
  if (!namespace) throw new Error('PIN_RATE_LIMITER_UNAVAILABLE');
  const accountBucket = await hashPinRateLimitBucket('account', verifiedUid);
  const ipBucket = await hashPinRateLimitBucket('ip', clientIp || 'unknown');
  const targetBucket = normalizedPin ? await hashPinRateLimitBucket('target_pin', normalizedPin) : null;

  // Run all rate-limit checks in PARALLEL. Each check is a Durable Object
  // subrequest. Sequential calls (the previous approach) added ~2-3s per
  // extra bucket because each DO call has a network round-trip + potential
  // cold-start. Parallel cuts the total from N × round-trip to 1 × round-trip.
  //
  // Trade-off: all buckets get incremented even if one would have denied.
  // This means a denied request "wastes" one increment in each non-blocking
  // bucket. This is acceptable — the extra increment is at most 1 attempt,
  // and the latency improvement is critical for login UX.
  const checks: Array<Promise<{ bucket: 'account' | 'ip' | 'target_pin'; result: { allowed?: boolean; resetAt?: number } }>> = [
    callLimiter(namespace, accountBucket, { action: 'check', maxAttempts: WORKER_PIN_ACCOUNT_MAX_ATTEMPTS }).then(r => ({ bucket: 'account', result: r })),
    callLimiter(namespace, ipBucket, { action: 'check', maxAttempts: WORKER_PIN_IP_MAX_ATTEMPTS }).then(r => ({ bucket: 'ip', result: r })),
  ];
  if (targetBucket) {
    checks.push(
      callLimiter(namespace, targetBucket, { action: 'check', maxAttempts: WORKER_PIN_TARGET_MAX_ATTEMPTS }).then(r => ({ bucket: 'target_pin', result: r })),
    );
  }

  const results = await Promise.all(checks);

  // Check results: if ANY bucket denied, return the first denial.
  for (const { bucket, result } of results) {
    if (result.allowed === false) {
      return { allowed: false, resetAt: result.resetAt, bucket };
    }
  }
  return { allowed: true };
}

export async function resetWorkerPinRateLimit(
  namespace: PinRateLimiterNamespace | undefined,
  verifiedUid: string,
  clientIp: string,
  normalizedPin?: string,
): Promise<void> {
  if (!namespace) throw new Error('PIN_RATE_LIMITER_UNAVAILABLE');
  const accountBucket = await hashPinRateLimitBucket('account', verifiedUid);
  const ipBucket = await hashPinRateLimitBucket('ip', clientIp || 'unknown');
  const buckets = [
    callLimiter(namespace, accountBucket, { action: 'reset' }),
    callLimiter(namespace, ipBucket, { action: 'reset' }),
  ];
  // Audit N2: also reset the target-PIN bucket on successful auth, so a
  // legit user who finally gets the right PIN doesn't leave a half-full
  // bucket that throttles them next time they typo it.
  if (normalizedPin) {
    const targetBucket = await hashPinRateLimitBucket('target_pin', normalizedPin);
    buckets.push(callLimiter(namespace, targetBucket, { action: 'reset' }));
  }
  await Promise.all(buckets);
}
