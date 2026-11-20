import { afterEach, describe, expect, it, vi } from 'vitest';

// Audit regression (2026-11-21): creating a credit request used a
// check-then-set outside any transaction — two concurrent requests for the
// same garage both passed the "no pending request" check, both committed, and
// the admin could approve both — a double credit grant. The creation now
// takes a per-garage lock document (credit_request_locks/{garageId}) inside a
// transaction; a concurrent create collides on the commit and gets a clean
// 409 instead of a second pending request.

vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    doc: vi.fn((path: string) => ({ path })),
    collection: vi.fn(),
    runTransaction: vi.fn(),
  },
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }), delete: () => ({ __op: 'delete' }) },
}));
vi.mock('./sessionInfrastructure', () => ({
  requireWorkerAuth: vi.fn((_c, next) => next()),
  sessionIndexPath: () => '',
}));
vi.mock('./events', () => ({
  recordDomainEventInTransaction: vi.fn((_t: any, _db: any, event: any) => event),
}));

import { registerCreditRequestRoutes } from './creditRequestRoutes';
import { adminDb } from './firebaseAdmin';

afterEach(() => vi.clearAllMocks());

const adminDbMock = vi.mocked(adminDb, true);

function buildContext() {
  return {
    get: (key: string) => (key === 'user' ? {
      role: 'delegate',
      uid: 'uid-1',
      entityId: 'delegate-1',
      displayName: 'المندوب'
    } : undefined),
    req: { json: async () => ({ garageId: 'garage-1', amount: 100 }) },
    json: (data: any, status?: number) => ({ data, status: status || 200 })
  };
}

function createHarness(options: { lockExists?: boolean; legacyPendingExists?: boolean } = {}) {
  const routes = new Map<string, (context: any) => Promise<any>>();
  const app: any = new Proxy({}, {
    get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
      const handler = handlers[handlers.length - 1];
      if (typeof handler === 'function') routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
      return app;
    }
  });
  registerCreditRequestRoutes(app);
  const createHandler = routes.get('POST /api/delegates/credit-requests')!;
  const context = buildContext();

  const writes: Array<{ operation: string; path: string; data: any }> = [];
  const transaction = {
    get: vi.fn(async (ref: any) => {
      if (String(ref.path).startsWith('credit_request_locks/')) return { exists: options.lockExists === true, data: () => ({}) };
      return { exists: false, data: () => undefined };
    }),
    set: vi.fn((ref: any, data: any) => { writes.push({ operation: 'set', path: String(ref.path), data }); }),
    update: vi.fn((ref: any, data: any) => { writes.push({ operation: 'update', path: String(ref.path), data }); }),
    delete: vi.fn((ref: any) => { writes.push({ operation: 'delete', path: String(ref.path), data: null }); })
  };

  adminDbMock.runTransaction.mockImplementation(async (callback: any) => callback(transaction));

  // Garage lookup — created by this delegate, prepaid.
  adminDbMock.doc.mockImplementation((path: string) => ({ path }));
  const garageGet = vi.fn(async () => ({
    exists: true,
    data: () => ({ name: 'جراج الاختبار', billingModel: 'prepaid_credits', createdByDelegateId: 'delegate-1' })
  }));
  (adminDbMock.doc as any).mockImplementation((path: string) => {
    if (path === 'garages/garage-1') return { path, get: garageGet };
    return { path };
  });

  // Fast pre-check query (legacy pending requests).
  const pendingGet = vi.fn(async () => ({ empty: options.legacyPendingExists !== true, size: options.legacyPendingExists ? 1 : 0, docs: [] }));
  const query = {
    where: vi.fn(() => query),
    limit: vi.fn(() => query),
    get: pendingGet
  };
  adminDbMock.collection.mockImplementation(() => ({
    ...query,
    doc: vi.fn(() => ({ path: 'credit_requests/new-request-1' }))
  }));

  return { createHandler, context, writes, transaction, garageGet, pendingGet };
}

describe('POST /api/delegates/credit-requests — one pending request per garage (audit 2026-11-21)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates the request and the lock document inside one transaction', async () => {
    const { createHandler, context, writes } = createHarness();

    const response = await createHandler(context);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    const lockWrite = writes.find((write) => write.operation === 'set' && write.path.startsWith('credit_request_locks/'));
    expect(lockWrite).toBeDefined();
    expect(lockWrite?.data.garageId).toBe('garage-1');
    const requestWrite = writes.find((write) => write.operation === 'set' && write.path.startsWith('credit_requests/'));
    expect(requestWrite?.data.status).toBe('pending');
    expect(requestWrite?.data.amount).toBe(100);
  });

  it('returns 409 without writing when the per-garage lock is already held', async () => {
    const { createHandler, context, writes, transaction } = createHarness({ lockExists: true });

    const response = await createHandler(context);

    expect(response.status).toBe(409);
    expect(response.data).toEqual({ success: false, error: 'PENDING_REQUEST_EXISTS' });
    expect(writes).toHaveLength(0);
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('returns 409 before any transaction when a legacy pending request exists', async () => {
    const { createHandler, context, pendingGet } = createHarness({ legacyPendingExists: true });

    const response = await createHandler(context);

    expect(response.status).toBe(409);
    expect(response.data.error).toBe('PENDING_REQUEST_EXISTS');
    expect(pendingGet).toHaveBeenCalled();
    // The transactional lock was never even consulted.
    expect(adminDbMock.runTransaction).not.toHaveBeenCalled();
  });
});
