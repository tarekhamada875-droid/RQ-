import { describe, expect, it, vi } from 'vitest';

// Mock the modules that delegateRoutes imports directly.
vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(),
    doc: vi.fn(),
    runTransaction: vi.fn(),
  },
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }) },
}));
vi.mock('./sessionInfrastructure', () => ({
  requireWorkerAuth: vi.fn((_c, next) => next()),
  sessionIndexPath: () => '',
}));
vi.mock('./pinRepository', () => ({
  checkPinAvailabilityAcrossAll: vi.fn(async () => ({ taken: false })),
  saveEntityPinInTransaction: vi.fn(),
  deleteEntityPinInTransaction: vi.fn(),
}));

import { registerDelegateRoutes } from './delegateRoutes';
import { adminDb } from './firebaseAdmin';

function createDelegateRoutesHarness() {
  const routes = new Map<string, (context: any) => Promise<any>>();
  const app: any = new Proxy({}, {
    get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
      const handler = handlers[handlers.length - 1];
      if (typeof handler === 'function') routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
      return app;
    }
  });

  let generatedId = 0;
  const ref = (path: string) => ({ path, id: path.split('/').pop() });
  const writes: Array<{ operation: string; path: string; data: any }> = [];
  const transaction = {
    get: vi.fn(async (documentRef: any) => ({
      exists: documentRef.path === 'delegates/delegate-1',
      data: () => ({ id: 'delegate-1', name: 'مندوب اختبار' })
    })),
    set: vi.fn((documentRef: any, data: any) => writes.push({ operation: 'set', path: documentRef.path, data })),
    update: vi.fn((documentRef: any, data: any) => writes.push({ operation: 'update', path: documentRef.path, data })),
    delete: vi.fn()
  };
  const db = {
    doc: (path: string) => ref(path),
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${name}/${id || (name === 'delegates' ? 'delegate-new' : `generated-${++generatedId}`)}`),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(async () => ({ size: 0, docs: [] }))
    }),
    runTransaction: vi.fn(async (callback: (t: any) => unknown) => callback(transaction))
  };

  // Wire the mocked adminDb to return our test db.
  (adminDb.collection as any).mockImplementation((name: string) => db.collection(name));
  (adminDb.doc as any).mockImplementation((path: string) => db.doc(path));
  (adminDb.runTransaction as any).mockImplementation((callback: (t: any) => unknown) => db.runTransaction(callback));

  registerDelegateRoutes(app);

  return {
    create: routes.get('POST /api/delegates/create')!,
    update: routes.get('POST /api/delegates/update')!,
    writes,
    transaction,
    runTransaction: db.runTransaction
  };
}

function context(body: Record<string, unknown>) {
  return {
    get: (key: string) => key === 'user' ? { role: 'admin', uid: 'admin-1' } : undefined,
    req: {
      json: async () => body,
      header: () => undefined,
      param: () => 'delegate-1'
    },
    json: (responseBody: unknown, status = 200) => ({ body: responseBody, status })
  };
}

describe('retired delegate commission configuration', () => {
  it('creates delegates with only the canonical commission totals', async () => {
    const harness = createDelegateRoutesHarness();
    const response = await harness.create(context({ name: 'مندوب اختبار', phone: '01000000000', pin: '12345' }));

    expect(response.status).toBe(200);
    const created = harness.writes.find((write) => write.operation === 'set' && write.path === 'delegates/delegate-new')?.data;
    expect(created).toMatchObject({ totalCommissionEarned: 0, totalRechargedAmount: 0 });
    expect(created).not.toHaveProperty('commissionRate');
    expect(created).not.toHaveProperty('commissions');
    expect(created).not.toHaveProperty('balance');
    expect(created).not.toHaveProperty('totalEarned');
  });

  it.each(['commissionRate', 'commissions', 'balance', 'totalEarned'])(
    'rejects retired field %s during delegate creation',
    async (field) => {
      const harness = createDelegateRoutesHarness();
      const response = await harness.create(context({
        name: 'مندوب اختبار',
        phone: '01000000000',
        pin: '12345',
        [field]: field === 'commissions' ? { daily: 5 } : 10
      }));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ success: false, error: 'RETIRED_DELEGATE_FIELD', field });
      expect(harness.writes).toHaveLength(0);
      expect(harness.runTransaction).not.toHaveBeenCalled();
    }
  );

  it.each(['commissionRate', 'commissions', 'balance', 'totalEarned'])(
    'rejects retired field %s during delegate updates',
    async (field) => {
      const harness = createDelegateRoutesHarness();
      const response = await harness.update(context({
        id: 'delegate-1',
        [field]: field === 'commissions' ? { daily: 5 } : 10
      }));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ success: false, error: 'RETIRED_DELEGATE_FIELD', field });
      expect(harness.writes).toHaveLength(0);
      expect(harness.runTransaction).not.toHaveBeenCalled();
    }
  );
});
