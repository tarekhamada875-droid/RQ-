import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the modules that garageRoutes imports directly.
vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(),
    doc: vi.fn(),
    runTransaction: vi.fn(),
  },
  // writeMaintainedGarageDelta uses FieldValue.increment to atomically
  // bump admin summary counters. Daily-limit tests don't reach that path,
  // but our create-garage tests do.
  FieldValue: {
    increment: (v: number) => ({ __op: 'increment', value: v }),
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
  // By default the candidate PIN is available. Tests can override per-test
  // to force collisions and exercise the retry loop.
  checkPinAvailabilityAcrossAll: vi.fn(async () => ({ taken: false })),
  saveEntityPinInTransaction: vi.fn(),
}));

import { registerGarageRoutes } from './garageRoutes';
import { adminDb } from './firebaseAdmin';
import { checkPinAvailabilityAcrossAll } from './pinRepository';

afterEach(() => {
  // clearAllMocks resets call counts but keeps the mock factory's
  // implementations in place. restoreAllMocks would strip the vi.mock
  // factory implementations themselves, breaking subsequent tests.
  vi.clearAllMocks();
});

beforeEach(() => {
  // Reset the PIN availability mock to its default "available" state.
  // Tests that need to force collisions override this per-test.
  (checkPinAvailabilityAcrossAll as any).mockReset();
  (checkPinAvailabilityAcrossAll as any).mockResolvedValue({ taken: false });
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

  const query: any = {
    where: vi.fn((..._args: unknown[]) => query),
    limit: vi.fn(() => query),
    get: vi.fn(async () => ({ size: 0, docs: [] })),
    // The route uses `adminDb.collection('garages').doc()` to allocate a
    // new garage ID. Return a synthetic ref with a stable id.
    doc: vi.fn((id?: string) => ({ path: `garages/${id || 'gen-1'}`, id: id || 'gen-1' })),
  };
  const transaction = {
    get: vi.fn(async () => ({ exists: false, data: () => ({}) })),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const db = {
    collection: vi.fn((_name: string) => query),
    doc: vi.fn((path: string) => ({ path, id: path.split('/').pop() })),
    runTransaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(transaction))
  };

  (adminDb.collection as any).mockImplementation((name: string) => db.collection(name));
  (adminDb.doc as any).mockImplementation((path: string) => db.doc(path));
  (adminDb.runTransaction as any).mockImplementation((callback: (t: any) => unknown) => db.runTransaction(callback));

  registerGarageRoutes(app);
  return { createGarage: routes.get('POST /api/garages/create')!, transaction, db };
}

function delegateContext(body: Record<string, unknown>) {
  return {
    get: (key: string) => key === 'user' ? {
      role: 'delegate',
      uid: 'delegate-uid-1',
      entityId: 'delegate-entity-1',
      displayName: 'Test Delegate',
    } : undefined,
    req: {
      json: async () => body,
      header: () => undefined,
    },
    json: (data: any, status?: number) => ({ data, status: status || 200 }),
  };
}

function adminContext(body: Record<string, unknown>) {
  return {
    get: (key: string) => key === 'user' ? {
      role: 'admin',
      uid: 'admin-uid-1',
      displayName: 'Test Admin',
    } : undefined,
    req: {
      json: async () => body,
      header: () => undefined,
    },
    json: (data: any, status?: number) => ({ data, status: status || 200 }),
  };
}

describe('delegate create-garage PIN policy (2026-11-15)', () => {
  it('rejects a delegate request that includes a pin field', async () => {
    const { createGarage } = createGarageRouteHarness();
    const ctx = delegateContext({
      name: 'Test Garage',
      hourlyRate: 10,
      overnightRate: 50,
      pin: '12345',  // delegate must not send this
    });

    const response = await createGarage(ctx);

    expect(response.status).toBe(400);
    expect(response.data).toEqual({ success: false, error: 'DELEGATE_CANNOT_SET_PIN' });
    // Critical: PIN availability check should not even run when the request
    // is rejected upfront. The pin field must never reach pinRepository.
    expect(checkPinAvailabilityAcrossAll).not.toHaveBeenCalled();
  });

  it('treats empty-string pin field same as omitted (proceeds with generation)', async () => {
    // An empty string is the same as not sending a pin field. The route
    // checks `pin !== ''` so empty string falls through to the generation
    // path. This is intentional — a delegate who accidentally submits an
    // empty pin field should NOT be rejected; the server just generates
    // one. The strict rejection only fires when the delegate tries to
    // SET a non-empty pin value.
    const { createGarage } = createGarageRouteHarness();
    const ctx = delegateContext({
      name: 'Test Garage',
      hourlyRate: 10,
      overnightRate: 50,
      pin: '',
    });

    const response = await createGarage(ctx);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
  });

  it('generates a server-side PIN when delegate omits pin field', async () => {
    const { createGarage, transaction } = createGarageRouteHarness();
    const ctx = delegateContext({
      name: 'Test Garage',
      hourlyRate: 10,
      overnightRate: 50,
      // No pin field — server should generate one.
    });

    const response = await createGarage(ctx);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // PIN availability check must have been called — once per retry attempt
    // during generation, plus one more verification call inside the
    // create-garage transaction (line 161 of garageRoutes.ts).
    expect(checkPinAvailabilityAcrossAll).toHaveBeenCalled();
    const generatedPin = (checkPinAvailabilityAcrossAll as any).mock.calls[0][0];
    expect(generatedPin).toMatch(/^\d{5}$/);

    // The garage doc written in the transaction must NOT carry the PIN in
    // plaintext (private_pins/ holds it, never the garage doc).
    const setCalls = transaction.set.mock.calls;
    const garageSet = setCalls.find((c: any[]) => c[0]?.path?.startsWith('garages/'));
    expect(garageSet).toBeDefined();
    expect(garageSet[1]).not.toHaveProperty('pin');
    expect(garageSet[1]).not.toHaveProperty('ownerPin');

    // private_pins/ should have been written via saveEntityPinInTransaction
    // with the server-generated PIN. We can't read the saved PIN directly
    // (it's hashed), but the helper was called with a 5-digit string.
    const { saveEntityPinInTransaction } = await import('./pinRepository');
    expect(saveEntityPinInTransaction).toHaveBeenCalled();
    const savedPin = (saveEntityPinInTransaction as any).mock.calls[0][3];
    expect(savedPin).toMatch(/^\d{5}$/);
    expect(savedPin).toBe(generatedPin);
  });

  it('retries PIN generation when the first candidate is taken', async () => {
    // First two candidates are taken, third is available. Then the
    // create-garage transaction re-verifies the generated PIN one more
    // time (also returns available) — so 4 calls total.
    (checkPinAvailabilityAcrossAll as any)
      .mockResolvedValueOnce({ taken: true, role: 'garage', name: 'existing' })
      .mockResolvedValueOnce({ taken: true, role: 'garage', name: 'existing-2' })
      .mockResolvedValueOnce({ taken: false })
      .mockResolvedValueOnce({ taken: false });

    const { createGarage } = createGarageRouteHarness();
    const ctx = delegateContext({
      name: 'Test Garage',
      hourlyRate: 10,
      overnightRate: 50,
    });

    const response = await createGarage(ctx);

    expect(response.status).toBe(200);
    // 3 generation attempts + 1 transaction re-verification = 4 calls.
    expect(checkPinAvailabilityAcrossAll).toHaveBeenCalledTimes(4);
    const finalPin = (checkPinAvailabilityAcrossAll as any).mock.calls[2][0];
    expect(finalPin).toMatch(/^\d{5}$/);
  });

  it('admin caller path is unchanged — admin-supplied pin is used', async () => {
    const { createGarage } = createGarageRouteHarness();
    const ctx = adminContext({
      name: 'Admin Created Garage',
      hourlyRate: 15,
      overnightRate: 75,
      pin: '99988',  // admin is allowed to set this
    });

    const response = await createGarage(ctx);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // PIN availability check runs once for admin path (existing behavior).
    expect(checkPinAvailabilityAcrossAll).toHaveBeenCalledTimes(1);
    const checkedPin = (checkPinAvailabilityAcrossAll as any).mock.calls[0][0];
    expect(checkedPin).toBe('99988');
  });
});
