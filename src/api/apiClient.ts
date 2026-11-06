import { auth } from '../firebase';

export interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data?: T;
  [key: string]: unknown;
}

/**
 * Loose error shape parsed from unknown server responses.
 * All fields optional because we can't trust the server to always send them.
 * Distinct from the strict ApiErrorEnvelope in types/apiContracts.ts which
 * represents the contract the server promises to follow.
 */
export interface ParsedApiError {
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

// Production backend API base URL.
//
// Audit ref: Phase 0 / N6 (consolidated audit, 2026-11-06).
//
// SECURITY NOTE: this default points at a personal Cloudflare Worker
// subdomain (`rq.tarekhamada875.workers.dev`). If that account is suspended,
// sold, or compromised, the entire production fleet stops working or could
// be MITM'd. To migrate to a project-owned domain, set the
// `VITE_BACKEND_API_URL` environment variable at build time (Cloudflare Pages
// → Project → Settings → Environment variables) and rebuild — the variable
// takes precedence over this default. See `getApiUrl()` below.
//
// TODO(operator): pick a project-owned domain (e.g. api.rq.app) and set
// VITE_BACKEND_API_URL to it; remove this fallback once Pages env var is in
// place for all environments.
export const DEFAULT_BACKEND_API_URL = 'https://rq.tarekhamada875.workers.dev';
export const DEFAULT_API_TIMEOUT_MS = 15000;

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

export const getApiUrl = (endpoint: string): string => {
  if (!endpoint.startsWith('/api')) return endpoint;

  if (typeof window !== 'undefined' && window.location) {
    const currentHost = (window.location.hostname || '').toLowerCase();
    if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
      return endpoint;
    }
  }

  const rawBaseUrl = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_BACKEND_API_URL || '') : '';
  const customBaseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl.trim().replace(/\/+$/, '') : '';
  if (!customBaseUrl) {
    return `${DEFAULT_BACKEND_API_URL}${endpoint}`;
  }
  return `${customBaseUrl}${endpoint}`;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

export async function apiFetch<T = Record<string, any>>(endpoint: string, options: ApiClientOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options.headers };

  let token = '';
  if (auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
    try {
      token = await auth.currentUser.getIdToken();
    } catch (cause) {
      console.warn('[ApiClient] Failed to obtain Firebase ID token:', cause);
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
    throw new ApiError(message, { code: timedOut ? 'API_TIMEOUT' : 'NETWORK_ERROR', cause });
  } finally {
    request.cleanup();
  }

  const serverCorrelationId = response.headers?.get?.('X-Correlation-ID') || correlationId;
  const contentType = response.headers?.get?.('content-type') || 'application/json';
  if (contentType && !contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    console.error(`[ApiClient] Received non-JSON response from ${endpoint} (Correlation ID: ${serverCorrelationId}):`, text);
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
  try {
    result = await response.json();
  } catch (cause) {
    console.error(`[ApiClient] JSON parse error for ${endpoint} (Correlation ID: ${serverCorrelationId}):`, cause);
    throw new ApiError(`خطأ في معالجة استجابة الخادم (ID: ${serverCorrelationId})`, {
      code: 'INVALID_RESPONSE', status: response.status, correlationId: serverCorrelationId, cause,
    });
  }

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
    throw new ApiError(message, {
      code: errorCode || 'UNAUTHORIZED', status: response.status, correlationId: serverCorrelationId, envelope,
    });
  }

  if (!response.ok) {
    const message = errorText(result, response.status);
    console.error(`[ApiClient] Error response from ${endpoint} (Correlation ID: ${serverCorrelationId}):`, message);
    throw new ApiError(message, {
      code: errorCode, status: response.status, correlationId: serverCorrelationId, envelope,
    });
  }

  return result as T;
}
