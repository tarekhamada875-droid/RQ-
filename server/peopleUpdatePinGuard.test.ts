import { afterEach, describe, expect, it, vi } from 'vitest';

// Audit regression (2026-11-21): /api/people/update-pin had (a) NO rate
// limit — any authorized caller could probe candidate PINs against
// checkPinAvailabilityAcrossAll indefinitely and learn which PINs exist
// across all roles; and (b) it returned takenBy.name to EVERY role — so
// probing harvested account owner names. Now: same DO limiter as
// /api/auth/check-pin-availability (fail-closed when unavailable), and the
// owner name is only disclosed to admins.

vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    doc: vi.fn((path: string) => ({ path })),
    collection: vi.fn((path: string) => ({ path, doc: vi.fn(() => ({ path: `${path}/x` })) })),
    runTransaction: vi.fn(),
  },
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }), delete: () => ({ __op: 'delete' }) },
}));
vi.mock('./sessionInfrastructure', () => ({
  requireWorkerAuth: vi.fn((_c, next) => next()),
  WORKER_SESSION_DEFINITIONS: {},
  sessionIndexPath: () => '',
}));
vi.mock('./pinRepository', () => ({
  checkPinAvailabilityAcrossAll: vi.fn(),
  saveEntityPin: vi.fn(),
}));
vi.mock('./workerPinRateLimiter', () => ({
  checkWorkerPinRateLimit: vi.fn(),
}));

import { registerCreditGrantRoutes } from './creditGrantRoutes';
import { checkPinAvailabilityAcrossAll } from './pinRepository';
import { checkWorkerPinRateLimit } from './workerPinRateLimiter';

afterEach(() => vi.clearAllMocks());

function buildContext(user: any, env: any = {}) {
  return {
    get: (key: string) => (key === 'user' ? user : undefined),
    env,
    req: {
      json: async () => ({ entityType: 'garages', entityId: 'garage-1', newPin: '54321' }),
      header: () => '203.0.113.9'
    },
    json: (data: any, status?: number) => ({ data, status: status || 200 })
  };
}

function createHarness() {
  const routes = new Map<string, (context: any) => Promise<any>>();
  const app: any = new Proxy({}, {
    get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
      const handler = handlers[handlers.length - 1];
      if (typeof handler === 'function') routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
      return app;
    }
  });
  registerCreditGrantRoutes(app);
  return routes.get('POST /api/people/update-pin')!;
}

describe('POST /api/people/update-pin — probe guard (audit 2026-11-21)', () => {
  it('fails closed with 503 when the limiter ERRORS while the binding is present', async () => {
    const handler = createHarness();
    vi.mocked(checkWorkerPinRateLimit).mockRejectedValue(new Error('DO_SEV_FAILURE'));

    const response = await handler(buildContext({ role: 'garage', uid: 'u1', entityId: 'garage-1' }, { PIN_RATE_LIMITER: { fake: true } }));

    expect(response.status).toBe(503);
    expect(response.data.error).toBe('RATE_LIMIT_UNAVAILABLE');
    expect(checkPinAvailabilityAcrossAll).not.toHaveBeenCalled();
  });

  it('proceeds to availability when the DO binding is absent (dev/test harness)', async () => {
    const handler = createHarness();
    vi.mocked(checkWorkerPinRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(checkPinAvailabilityAcrossAll).mockResolvedValue({ taken: true, name: 'x', role: 'staff' } as any);

    const response = await handler(buildContext({ role: 'garage', uid: 'u1', entityId: 'garage-1' }));

    // Taken → 400 (returned before any session-kick sweep, which the minimal
    // firebaseAdmin mock here does not implement).
    expect(response.status).toBe(400);
    // The limiter was never consulted (no binding) — the probe falls through
    // to availability with a loud warning in the logs.
    expect(checkWorkerPinRateLimit).not.toHaveBeenCalled();
    expect(checkPinAvailabilityAcrossAll).toHaveBeenCalled();
  });

  it('returns 429 when the limiter denies the probe', async () => {
    const handler = createHarness();
    vi.mocked(checkWorkerPinRateLimit).mockResolvedValue({ allowed: false, resetAt: 12345, bucket: 'ip' });

    const response = await handler(buildContext({ role: 'garage', uid: 'u1', entityId: 'garage-1' }, { PIN_RATE_LIMITER: { fake: true } }));

    expect(response.status).toBe(429);
    expect(response.data.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.data.resetAt).toBe(12345);
    expect(checkPinAvailabilityAcrossAll).not.toHaveBeenCalled();
  });

  it('hides the colliding PIN owner name from non-admin callers but keeps the role', async () => {
    const handler = createHarness();
    vi.mocked(checkWorkerPinRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(checkPinAvailabilityAcrossAll).mockResolvedValue({ taken: true, name: 'جراج حسن', role: 'garage' } as any);

    const response = await handler(buildContext({ role: 'garage', uid: 'u1', entityId: 'garage-1' }, { PIN_RATE_LIMITER: { fake: true } }));

    expect(response.status).toBe(400);
    expect(response.data.error).toBe('PIN_ALREADY_TAKEN');
    expect(response.data.takenBy).toEqual({ name: '', role: 'garage' });
  });

  it('still discloses the owner name to admins (they can list all accounts anyway)', async () => {
    const handler = createHarness();
    vi.mocked(checkWorkerPinRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(checkPinAvailabilityAcrossAll).mockResolvedValue({ taken: true, name: 'جراج حسن', role: 'garage' } as any);

    const response = await handler(buildContext({ role: 'admin', uid: 'admin-1' }, { PIN_RATE_LIMITER: { fake: true } }));

    expect(response.status).toBe(400);
    expect(response.data.takenBy).toEqual({ name: 'جراج حسن', role: 'garage' });
  });
});
