/**
 * The Ark — Shared API Contracts & Error Envelope (Phase 1)
 *
 * Provides a canonical, type-safe contract layer for requests, responses,
 * error envelopes, and idempotency key transport across both client and server.
 */

export interface ApiErrorEnvelope {
  success: false;
  error: string;
  code: string;
  statusCode: number;
  timestamp: string;
  correlationId?: string;
  details?: Record<string, any>;
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
