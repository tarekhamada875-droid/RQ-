import { auth } from '../firebase';
import { debugRecorder, sanitizeValue } from '../debug/debugRecorder';
import { getApiUrl } from './apiUrl';

// Debug timing source: performance.now where available (monotonic),
// Date.now fallback for exotic runtimes.
const nowMs = (): number => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  // PERF (owner debug audit 2026-11-17, finding F7): opt-in stale-while-
  // revalidate TTL for shareable GETs. See the SWR cache block below.
  cacheTtlMs?: number;
}

/**
 * Loose error shape parsed from unknown server responses.
 * All fields optional because we can't trust the server to always send them.
 * Distinct from the strict ApiErrorEnvelope in types/apiContracts.ts which
 * represents the contract the server promises to follow.
 */
interface ParsedApiError {
  success?: false;
  code?: string;
  error?: string;
  message?: string;
  correlationId?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly code?: string;
  readonly status: number;
  readonly correlationId?: string;
  readonly envelope: ParsedApiError;

  constructor(message: string, details: {
    code?: string;
    status?: number;
    correlationId?: string;
    envelope?: ParsedApiError;
    cause?: unknown;
  } = {}) {
    super(message, { cause: details.cause });
    this.name = 'ApiError';
    this.code = details.code;
    this.status = details.status || 0;
    this.correlationId = details.correlationId;
    this.envelope = details.envelope || { success: false, error: message };
  }
}

const DEFAULT_API_TIMEOUT_MS = 15000;

// Surface a one-time console warning in production if the default URL is
// being used — so the operator can see the personal-account dependency
// in browser dev tools without grepping source.
if (typeof window !== 'undefined' && typeof import.meta !== 'undefined' && import.meta.env
    && import.meta.env.PROD
    && !(import.meta.env.VITE_BACKEND_API_URL || '').trim()
    && !((window.location?.hostname || '').toLowerCase() === 'localhost'
         || (window.location?.hostname || '').toLowerCase() === '127.0.0.1')) {
  // eslint-disable-next-line no-console
  console.warn(
    '[RQ] API requests are using the default Worker URL (rq.tarekhamada875.workers.dev). ' +
    'Set VITE_BACKEND_API_URL to a project-owned domain to remove this personal-account dependency. ' +
    'See audit Phase 0 / N6.'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// RELIABILITY (DevTools runtime audit 2026-11-11): concurrent requests each
// awaited `getIdToken()` independently; when the cached token neared expiry,
// several requests could trigger overlapping refresh work for the same user.
// Token fetches are now shared per user while in flight ("single-flight").
//
// Deliberately NOT the audit's suggested 5-minute blind TTL with
// `getIdToken(true)` (forced refresh): forcing refreshes changes token
// freshness semantics, and caching tokens on a wall-clock TTL risks sending
// stale credentials — the same class of auth-timing regression that forced
// the revert of PRs #710–#714. Single-flight deduplication only: once the
// fetch settles, the next request calls `getIdToken()` again and the
// Firebase SDK serves its own cached token (refreshing only when near
// expiry), exactly as before.
let inFlightTokenFetch: Promise<string> | null = null;
let inFlightTokenFetchUid: string | null = null;

// PERF (owner debug audit 2026-11-17, finding F2): the first admin screen load
// fired the SAME GETs twice at the same instant (garages list + delegates list,
// started 3-4ms apart from two components mounting together) — two full round
// trips and two copies of the same ~9KB answer. Identical in-flight GETs are
// now shared ("single-flight"): a second caller with the same key receives the
// same response instead of paying a second round trip. This is NOT a cache:
// once the request settles the entry is dropped and the next call hits the
// network exactly as before, so freshness semantics are unchanged. The key
// includes the signed-in uid (different users never share a response — see
// apiClient.test.ts "different users") plus custom headers/timeout so call
// variants stay separate.
// PERF (owner debug audit 2026-11-17, finding F7): every time the tab came
// back (or the admin shell re-initialized), the app re-validated the session
// and re-downloaded the same bootstrap reads (/api/system-config, admin
// garages page, admin delegates page) — 6 full cycles in one 18-minute
// session, ~1-1.5s of waiting each time, because config listeners refetch on
// every rq-session-ready event. An opt-in stale-while-revalidate cache fixes
// the wait:
//   - opt-in per call via `cacheTtlMs` — all other endpoints behave as before
//   - within the TTL the cached value answers IMMEDIATELY and a background
//     revalidation refreshes the copy for the next caller (throttled so
//     simultaneous mounts can't stampede the endpoint)
//   - beyond the TTL the call falls through to a normal blocking fetch
//   - every non-auth mutation (POST/PUT/PATCH/DELETE) bumps a generation
//     counter AND clears the cache: in-flight GETs started before the
//     mutation are split off (new single-flight key) so neither the cache nor
//     a joining caller can ever serve pre-mutation data
//   - memory-only, keyed per signed-in uid; never persisted
const swrCache = new Map<string, { value: unknown; storedAt: number; revalidatedAt: number }>();
let swrCacheGeneration = 0;
const SWR_REVALIDATE_MIN_GAP_MS = 5000;

const inFlightGets = new Map<string, Promise<unknown>>();

function inFlightGetKey(endpoint: string, options: ApiClientOptions): string {
  const uid = auth.currentUser?.uid || 'anon';
  const variant = JSON.stringify({ h: options.headers || {}, t: options.timeoutMs ?? null });
  return `${swrCacheGeneration}|${uid}|${endpoint}|${variant}`;
}

function startSharedGet<T>(key: string, endpoint: string, options: ApiClientOptions, ttl: number): Promise<T> {
  const existing = inFlightGets.get(key);
  if (existing) return existing as Promise<T>;
  // Cache-write guard: a GET that started before a mutation must never
  // populate the cache after that mutation bumped the generation.
  const generationAtStart = swrCacheGeneration;
  const request = apiFetchOnce<T>(endpoint, options)
    .then((result) => {
      if (ttl > 0 && swrCacheGeneration === generationAtStart) {
        swrCache.set(key, { value: result, storedAt: nowMs(), revalidatedAt: nowMs() });
      }
      return result;
    })
    .finally(() => {
      if (inFlightGets.get(key) === request) inFlightGets.delete(key);
    });
  inFlightGets.set(key, request);
  return request;
}

// Test-only escape hatch: reset single-flight + SWR state between tests.
export function __resetInFlightGetsForTests(): void {
  inFlightGets.clear();
  swrCache.clear();
  swrCacheGeneration = 0;
}

function fetchTokenOnce(user: { uid?: string; getIdToken: () => Promise<string> }): Promise<string> {
  const uid = typeof user.uid === 'string' ? user.uid : null;
  if (inFlightTokenFetch && inFlightTokenFetchUid === uid) {
    return inFlightTokenFetch;
  }
  const fetchPromise = user.getIdToken().finally(() => {
    if (inFlightTokenFetch === fetchPromise) {
      inFlightTokenFetch = null;
      inFlightTokenFetchUid = null;
    }
  });
  inFlightTokenFetch = fetchPromise;
  inFlightTokenFetchUid = uid;
  return fetchPromise;
}

function errorText(result: unknown, status: number): string {
  if (isRecord(result)) {
    if (typeof result.error === 'string') return result.error;
    if (typeof result.message === 'string') return result.message;
  }
  return `فشلت العملية برمز الاستجابة ${status}`;
}

function makeRequestSignal(options: ApiClientOptions): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(new Error('API_REQUEST_TIMEOUT')), timeoutMs);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function apiFetchOnce<T = Record<string, any>>(endpoint: string, options: ApiClientOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options.headers };

  let token = '';
  if (auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
    try {
      token = await fetchTokenOnce(auth.currentUser);
    } catch (cause) {
      console.warn('[ApiClient] Failed to obtain Firebase ID token:', cause);
      debugRecorder.record('error', {
        ev: 'id_token_fetch_failed',
        endpoint,
        msg: cause instanceof Error ? cause.message.slice(0, 200) : String(cause).slice(0, 200),
      });
    }
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const correlationId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
  headers['X-Correlation-ID'] = correlationId;
  const operationId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `ui_${crypto.randomUUID()}`
    : `ui_${Math.random().toString(36).substring(2)}_${Date.now().toString(36)}`;
  headers['X-Operation-ID'] = operationId;
  if (typeof window !== 'undefined') {
    const sessionId = localStorage.getItem('rq_canonical_session_id') || localStorage.getItem('app_session_id');
    if (sessionId) headers['X-Session-ID'] = sessionId;
  }

  let safeBody: string | undefined;
  if (options.body !== undefined) {
    if (typeof options.body === 'string') {
      safeBody = options.body;
    } else if (options.body && typeof options.body === 'object') {
      const isAuthEndpoint = endpoint.includes('/api/auth/');
      if (isAuthEndpoint) {
        safeBody = JSON.stringify(options.body);
      } else {
        const { uid: _uid, role: _role, firebaseIdToken: _firebaseIdToken, ...rest } = options.body as Record<string, unknown>;
        safeBody = JSON.stringify(rest);
      }
    } else {
      safeBody = JSON.stringify(options.body);
    }
  }

  const url = getApiUrl(endpoint);
  // DEBUG (owner audit 2026-11-17): record every API call — start a pending
  // entry now, patch it when the call settles (success or any throw path).
  const dbgSeq = debugRecorder.apiBegin({
    method,
    endpoint,
    uid: auth.currentUser?.uid || null,
    bodyString: safeBody,
  });
  const dbgStart = nowMs();
  const request = makeRequestSignal(options);
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: safeBody, signal: request.signal });
  } catch (cause) {
    const timedOut = request.signal.aborted && !options.signal?.aborted;
    const message = timedOut
      ? 'استغرق الاتصال بالخادم وقتاً أطول من المتوقع. يرجى المحاولة مرة أخرى.'
      : 'تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.';
    console.error(`[ApiClient] ${timedOut ? 'Timeout' : 'Network error'} for ${endpoint}:`, cause);
    debugRecorder.apiEnd(dbgSeq, {
      ok: false,
      clientMs: nowMs() - dbgStart,
      errorCode: timedOut ? 'API_TIMEOUT' : 'NETWORK_ERROR',
      errorMessage: message.slice(0, 160),
    });
    throw new ApiError(message, { code: timedOut ? 'API_TIMEOUT' : 'NETWORK_ERROR', cause });
  } finally {
    request.cleanup();
  }
  const dbgTtfbMs = nowMs() - dbgStart;

  const serverCorrelationId = response.headers?.get?.('X-Correlation-ID') || correlationId;
  const dbgServerMsRaw = response.headers?.get?.('X-Debug-Server-Ms');
  const dbgServerMs = dbgServerMsRaw ? Number(dbgServerMsRaw) : null;
  const contentType = response.headers?.get?.('content-type') || 'application/json';
  if (contentType && !contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    console.error(`[ApiClient] Received non-JSON response from ${endpoint} (Correlation ID: ${serverCorrelationId}):`, text);
    debugRecorder.apiEnd(dbgSeq, {
      status: response.status,
      ok: false,
      clientMs: nowMs() - dbgStart,
      ttfbMs: dbgTtfbMs,
      serverMs: Number.isFinite(dbgServerMs) ? dbgServerMs : null,
      resBytes: text.length,
      errorCode: response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'INVALID_RESPONSE',
      errorMessage: 'non-JSON response',
      correlationId: serverCorrelationId,
    });
    if (response.status === 429 || text.toLowerCase().includes('rate exceeded') || text.toLowerCase().includes('too many requests')) {
      throw new ApiError('تم تجاوز حد الطلبات المسموح به مؤقتاً. يرجى الانتظار قليلاً.', {
        code: 'RATE_LIMIT_EXCEEDED',
        status: 429,
        correlationId: serverCorrelationId,
        cause: text
      });
    }
    const message = text.includes('FUNCTION_INVOCATION_FAILED')
      ? `تعذر تشغيل خدمة الخادم على منصة الاستضافة (ID: ${serverCorrelationId})`
      : `استجابة غير صالحة من الخادم (ID: ${serverCorrelationId})`;
    throw new ApiError(message, { code: 'INVALID_RESPONSE', status: response.status, correlationId: serverCorrelationId, cause: text });
  }

  let result: unknown;
  const dbgParseStart = nowMs();
  try {
    result = await response.json();
  } catch (cause) {
    console.error(`[ApiClient] JSON parse error for ${endpoint} (Correlation ID: ${serverCorrelationId}):`, cause);
    debugRecorder.apiEnd(dbgSeq, {
      status: response.status,
      ok: false,
      clientMs: nowMs() - dbgStart,
      ttfbMs: dbgTtfbMs,
      serverMs: Number.isFinite(dbgServerMs) ? dbgServerMs : null,
      errorCode: 'INVALID_RESPONSE',
      errorMessage: 'JSON parse error',
      correlationId: serverCorrelationId,
    });
    throw new ApiError(`خطأ في معالجة استجابة الخادم (ID: ${serverCorrelationId})`, {
      code: 'INVALID_RESPONSE', status: response.status, correlationId: serverCorrelationId, cause,
    });
  }
  const dbgParseMs = nowMs() - dbgParseStart;

  const envelope = isRecord(result) ? result as ParsedApiError : {};
  const errorCode = typeof envelope.code === 'string' ? envelope.code : undefined;
  const errorMessage = typeof envelope.error === 'string' ? envelope.error : '';
  const isSessionTerminated = response.status === 401 ||
    errorCode === 'SESSION_REVOKED' || errorCode === 'SESSION_EXPIRED' || errorCode === 'UNAUTHORIZED' ||
    errorMessage.includes('SESSION_REVOKED') || errorMessage.includes('SESSION_EXPIRED');

  if (isSessionTerminated) {
    const isLoginEndpoint = endpoint.includes('/api/auth/verify-pin');

    const message = errorMessage.includes('SESSION_REVOKED') || errorCode === 'SESSION_REVOKED'
      ? 'تم تسجيل خروجك من جهاز آخر'
      : 'انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً';
    if (typeof window !== 'undefined' && !isLoginEndpoint) {
      window.dispatchEvent(new CustomEvent('api-session-expired', {
        detail: { status: response.status, error: message, code: errorCode || 'UNAUTHORIZED', correlationId: serverCorrelationId },
      }));
    }
    debugRecorder.apiEnd(dbgSeq, {
      status: response.status,
      ok: false,
      clientMs: nowMs() - dbgStart,
      ttfbMs: dbgTtfbMs,
      parseMs: dbgParseMs,
      serverMs: Number.isFinite(dbgServerMs) ? dbgServerMs : null,
      errorCode: errorCode || 'UNAUTHORIZED',
      errorMessage: message.slice(0, 160),
      correlationId: serverCorrelationId,
    });
    throw new ApiError(message, {
      code: errorCode || 'UNAUTHORIZED', status: response.status, correlationId: serverCorrelationId, envelope,
    });
  }

  if (!response.ok) {
    const message = errorText(result, response.status);
    console.error(`[ApiClient] Error response from ${endpoint} (Correlation ID: ${serverCorrelationId}):`, message);
    debugRecorder.apiEnd(dbgSeq, {
      status: response.status,
      ok: false,
      clientMs: nowMs() - dbgStart,
      ttfbMs: dbgTtfbMs,
      parseMs: dbgParseMs,
      serverMs: Number.isFinite(dbgServerMs) ? dbgServerMs : null,
      errorCode: errorCode || null,
      errorMessage: message.slice(0, 160),
      correlationId: serverCorrelationId,
    });
    throw new ApiError(message, {
      code: errorCode, status: response.status, correlationId: serverCorrelationId, envelope,
    });
  }

  // DEBUG (owner audit 2026-11-17): settle the entry with timings and a
  // PII-safe structural snapshot of the response (field names + sizes only).
  // AUDIT F-2 (2026-11-26): the response stringify + sanitize pass now runs
  // only while recording is actually enabled (?debug=1) — on production
  // devices these two evaluation costs per API call are pure waste.
  let dbgResBytes: number | null = null;
  let dbgResFields: unknown = null;
  if (debugRecorder.isEnabled) {
    try {
      dbgResBytes = JSON.stringify(result).length;
    } catch {
      dbgResBytes = null;
    }
    dbgResFields = sanitizeValue(result);
  }
  debugRecorder.apiEnd(dbgSeq, {
    status: response.status,
    ok: true,
    clientMs: nowMs() - dbgStart,
    ttfbMs: dbgTtfbMs,
    parseMs: dbgParseMs,
    serverMs: Number.isFinite(dbgServerMs) ? dbgServerMs : null,
    resBytes: dbgResBytes,
    errorCode: null,
    errorMessage: null,
    correlationId: serverCorrelationId,
    resFields: dbgResFields,
  });

  return result as T;
}

export async function apiFetch<T = Record<string, any>>(endpoint: string, options: ApiClientOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  // Only body-less GETs without a caller-provided signal are shareable: an
  // AbortSignal belongs to one caller, and aborting must not cancel others.
  const shareable = method === 'GET' && options.body === undefined && options.signal === undefined;
  // A business mutation may change anything → drop cached reads and split off
  // any GET that started before it (generation counter in the single-flight key).
  if (method !== 'GET' && !endpoint.includes('/api/auth/')) {
    swrCacheGeneration += 1;
    swrCache.clear();
  }
  if (!shareable) return apiFetchOnce<T>(endpoint, options);

  const key = inFlightGetKey(endpoint, options);
  const ttl = options.cacheTtlMs ?? 0;
  if (ttl > 0) {
    const entry = swrCache.get(key);
    if (entry && (nowMs() - entry.storedAt) < ttl) {
      const now = nowMs();
      // Serve instantly; refresh quietly for the next caller (rate-limited).
      if (now - entry.revalidatedAt > SWR_REVALIDATE_MIN_GAP_MS) {
        entry.revalidatedAt = now;
        void startSharedGet<T>(key, endpoint, options, ttl).catch(() => {
          // Revalidation failed — keep serving the last good value.
        });
      }
      return entry.value as T;
    }
  }
  return startSharedGet<T>(key, endpoint, options, ttl);
}
