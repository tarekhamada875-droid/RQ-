import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCairoDayBounds } from './projections';

// Mock the modules that garageRoutes imports directly.
vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(),
    doc: vi.fn(),
    runTransaction: vi.fn(),
  },
}));
vi.mock('./sessionInfrastructure', () => ({
  requireWorkerAuth: vi.fn((_c, next) => next()),
  sessionIndexPath: () => '',
}));
vi.mock('./cloudflareWorker', () => ({
  enforceWorkerFinancialRateLimit: vi.fn((_c, next) => next()),
  readWorkerFirestorePage: vi.fn(),
}));
vi.mock('./idempotency', () => ({
  checkIdempotencyInTransaction: vi.fn(async () => ({ isDuplicate: false })),
  createRequestFingerprint: vi.fn(() => 'request-fingerprint'),
  storeIdempotencyInTransaction: vi.fn(),
}));
vi.mock('./pinRepository', () => ({
  checkPinAvailabilityAcrossAll: vi.fn(async () => ({ taken: false })),
  saveEntityPinInTransaction: vi.fn(),
}));

import { registerGarageRoutes } from './garageRoutes';
import { adminDb } from './firebaseAdmin';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createGarageRouteHarness() {
  const routes = new Map<string, (context: any) => Promise<any>>();
  const app: any = new Proxy({}, {
    get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
      const handler = handlers[handlers.length - 1];
      if (typeof handler === 'function') {
        routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
      }
      return app;
    }
  });

  const queryCalls: unknown[][] = [];
  const query: any = {
    where: vi.fn((...args: unknown[]) => {
      queryCalls.push(args);
      return query;
    }),
    limit: vi.fn(() => query),
    get: vi.fn(async () => ({ size: 3 }))
  };
  const db = {
    collection: vi.fn((_name: string) => query),
    doc: vi.fn((path: string) => ({ path, id: path.split('/').pop() })),
    runTransaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback({}))
  };

  // Wire the mocked adminDb to return our test db.
  (adminDb.collection as any).mockImplementation((name: string) => db.collection(name));
  (adminDb.doc as any).mockImplementation((path: string) => db.doc(path));
  (adminDb.runTransaction as any).mockImplementation((callback: (transaction: unknown) => unknown) => db.runTransaction(callback));

  registerGarageRoutes(app);
  return { createGarage: routes.get('POST /api/garages/create'), queryCalls, query, db };
}

describe('delegate daily garage creation limit', () => {
  it('uses the full Cairo-local calendar day during standard time', async () => {
    vi.useFakeTimers();
    // 00:30 in Cairo on 11 December 2026 (UTC+02:00).
    vi.setSystemTime(new Date('2026-12-10T22:30:00.000Z'));

    const harness = createGarageRouteHarness();
    expect(harness.createGarage).toBeTypeOf('function');

    const response = await harness.createGarage!({
      get: (key: string) => key === 'user' ? {
        role: 'delegate',
        uid: 'delegate-1',
        entityId: 'delegate-1',
        displayName: 'Delegate'
      } : undefined,
      req: {
        json: async () => ({
          name: 'Test Garage',
          pin: '12345',
          idempotencyKey: 'create-garage-at-boundary'
        }),
        header: () => undefined
      },
      json: (body: unknown, status = 200) => ({ body, status })
    });

    const expectedBounds = getCairoDayBounds('2026-12-11');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' });
    expect(harness.queryCalls).toEqual([
      ['createdByDelegateId', '==', 'delegate-1'],
      ['createdAt', '>=', expectedBounds.start],
      ['createdAt', '<', expectedBounds.end]
    ]);
  });
});
