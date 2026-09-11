/**
 * The Ark — Shared API Contracts & Error Envelope (Phase 1)
 *
 * Provides a canonical, type-safe contract layer for requests, responses,
 * error envelopes, and idempotency key transport across both client and server.
 */

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
  correlationId?: string;
}

export interface ApiErrorEnvelope {
  success: false;
  error: string;
  code: string;
  statusCode: number;
  timestamp: string;
  correlationId?: string;
  details?: Record<string, any>;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorEnvelope;

/**
 * Standard Machine-Readable API Error Codes
 */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'GARAGE_SCOPE_MISMATCH'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

/**
 * Idempotency Key Transport Helper
 */
export const IDEMPOTENCY_HEADER_NAME = 'x-idempotency-key';
export const IDEMPOTENCY_HEADER_NAME_ALT = 'idempotency-key';

/**
 * Extracts and normalizes the idempotency key from request headers or object.
 */
export function extractIdempotencyKey(headers: Record<string, any>): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const key = headers[IDEMPOTENCY_HEADER_NAME] || headers[IDEMPOTENCY_HEADER_NAME_ALT] || null;
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Generates a client-side idempotency key for state-mutating requests
 */
export function generateIdempotencyKey(prefix = 'idemp'): string {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
  return `${prefix}_${randomPart}`;
}
