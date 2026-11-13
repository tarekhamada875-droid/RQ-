/**
 * Shared route combinators — reduce boilerplate across route handlers.
 *
 * Audit ref: Phase 7 / C3 (consolidated audit, 2026-11-06).
 *
 * C3: withErrorHandler replaces 18+ try/catch blocks with consistent
 * error formatting. Also eliminates the dead `if (!adminDb)` guards
 * (the Proxy is always truthy after Phase 0/N1; the try/catch in
 * withErrorHandler catches the ADMIN_SDK_NOT_INITIALIZED throw from
 * the Proxy on first property access).
 */

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
