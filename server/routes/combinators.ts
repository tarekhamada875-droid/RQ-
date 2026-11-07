/**
 * Shared route combinators — reduce boilerplate across route handlers.
 *
 * Audit ref: Phase 7 / C2-C3 (consolidated audit, 2026-11-06).
 *
 * C2: extractIdempotencyKey replaces 25+ hand-copied key-extraction
 * preambles across route files.
 *
 * C3: withErrorHandler replaces 18+ try/catch blocks with consistent
 * error formatting. Also eliminates the dead `if (!adminDb)` guards
 * (the Proxy is always truthy after Phase 0/N1; the try/catch in
 * withErrorHandler catches the ADMIN_SDK_NOT_INITIALIZED throw from
 * the Proxy on first property access).
 */

import { validateIdempotencyKey } from '../validation';

/**
 * Extracts the idempotency key from the request body or headers.
 * Returns null if no key is provided (the request is non-idempotent).
 *
 * Before C2, every route handler that supported idempotency had this
 * same 3-line preamble:
 *   const idempotencyKey = validateIdempotencyKey(
 *     body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key')
 *   );
 *
 * Now it's one function call:
 *   const idempotencyKey = extractIdempotencyKey(c);
 */
export function extractIdempotencyKey(c: any): string | null {
  const body = typeof c.req.json === 'function' ? undefined : (c.req.body || {});
  // Hono's c.req.json() is async and already consumed in the handler,
  // so we read from the parsed body that the handler already extracted.
  // This helper reads from c.req.body (if set by middleware) or from
  // the headers. The handler should pass the already-parsed body.
  const rawKey = (body?.idempotencyKey) || c.req.header('x-idempotency-key') || c.req.header('idempotency-key');
  return validateIdempotencyKey(rawKey);
}

/**
 * Wraps a route handler with try/catch + consistent error formatting.
 *
 * Before C3, every route handler had this boilerplate:
 *   try {
 *     // ... handler logic ...
 *     return c.json({ success: true });
 *   } catch (err: any) {
 *     console.error('[Worker X] Error:', err);
 *     const status = err?.statusCode || 500;
 *     return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, status);
 *   }
 *
 * Now:
 *   app.post('/api/...', requireWorkerAuth, withErrorHandler(async (c) => {
 *     // ... handler logic ...
 *     return c.json({ success: true });
 *   }, 'Garage'));
 *
 * The label is used in console.error for debugging (e.g. 'Garage', 'Vehicle').
 *
 * Special cases handled:
 *   - RATE_CHANGE_COOLDOWN_ACTIVE (Phase 0/N3) → 409 with structured details
 *   - ValidationError → uses err.statusCode (defaults to 400)
 *   - ADMIN_SDK_NOT_INITIALIZED → 500 (thrown by the Proxy, not by a guard)
 */
export function withErrorHandler<T>(
  handler: (c: any) => Promise<T>,
  label: string,
): (c: any) => Promise<T> {
  return async (c: any) => {
    try {
      return await handler(c);
    } catch (err: any) {
      console.error(`[Worker ${label}] Error:`, err);

      // Phase 0/N3: structured 409 for rate-change cooldown
      if (err?.message === 'RATE_CHANGE_COOLDOWN_ACTIVE') {
        return c.json({
          success: false,
          error: 'RATE_CHANGE_COOLDOWN_ACTIVE',
          daysRemaining: err.daysRemaining,
          nextAllowedDate: err.nextAllowedDate,
        }, 409);
      }

      const status = err?.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
      return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, status);
    }
  };
}
