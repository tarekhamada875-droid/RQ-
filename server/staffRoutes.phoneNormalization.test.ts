import { describe, expect, it, vi } from 'vitest';

// Mock the modules that staffRoutes imports directly (same harness pattern as
// garageRoutes.delegateFields.test.ts).
vi.mock('./firebaseAdmin', () => ({
  adminAuth: {},
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

import { registerStaffRoutes } from './staffRoutes';
import { adminDb } from './firebaseAdmin';

function createStaffRoutesHarness() {
  const routes = new Map<string, (context: any) => Promise<any>>();
  const app: any = new Proxy({}, {
    get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
      const handler = handlers[handlers.length - 1];
      if (typeof handler === 'function') routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
      return app;
    }
  });

  let generatedId = 0;
  const ref = (path: string) => ({
    path,
    id: path.split('/').pop(),
    // The update route does an initial document get outside the transaction.
    get: async () => ({
      exists: path === 'staff/staff-1',
      data: () => ({ id: 'staff-1', name: 'موظف اختبار', garageId: 'garage-a' })
    })
  });
  const writes: Array<{ operation: string; path: string; data: any }> = [];
  const transaction = {
    get: vi.fn(async (documentRef: any) => ({
      exists: documentRef.path === 'staff/staff-1',
      data: () => ({ id: 'staff-1', name: 'موظف اختبار', garageId: 'garage-a' })
    })),
    set: vi.fn((documentRef: any, data: any) => writes.push({ operation: 'set', path: documentRef.path, data })),
    update: vi.fn((documentRef: any, data: any) => writes.push({ operation: 'update', path: documentRef.path, data })),
    delete: vi.fn()
  };
  const db = {
    doc: (path: string) => ref(path),
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${name}/${id || (name === 'staff' ? 'staff-new' : `generated-${++generatedId}`)}`),
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

  registerStaffRoutes(app);

  return {
    create: routes.get('POST /api/staff/create')!,
    update: routes.get('POST /api/staff/update')!,
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
      param: () => 'staff-1'
    },
    json: (responseBody: unknown, status = 200) => ({ body: responseBody, status })
  };
}

describe('staff phone normalization (audit N9 parity)', () => {
  it('create stores the canonical phone form', async () => {
    const harness = createStaffRoutesHarness();
    const response = await harness.create(context({
      name: 'موظف اختبار',
      phone: ' 010-1234 5678 ',
      pin: '12345',
      garageId: 'garage-a'
    }));

    expect(response.status).toBe(200);
    const created = harness.writes.find((write) => write.operation === 'set' && write.path === 'staff/staff-new')?.data;
    expect(created).toMatchObject({ phone: '01012345678' });
  });

  it('update stores the canonical phone form, same as create', async () => {
    const harness = createStaffRoutesHarness();
    const response = await harness.update(context({
      id: 'staff-1',
      phone: ' +20(100)123-4567 '
    }));

    expect(response.status).toBe(200);
    const updated = harness.writes.find((write) => write.operation === 'update' && write.path === 'staff/staff-1')?.data;
    expect(updated).toMatchObject({ phone: '+201001234567' });
  });

  it('update normalizes Arabic-Indic digits', async () => {
    const harness = createStaffRoutesHarness();
    await harness.update(context({ id: 'staff-1', phone: '٠١٠١٢٣٤٥٦٧٨' }));
    const updated = harness.writes.find((write) => write.operation === 'update' && write.path === 'staff/staff-1')?.data;
    expect(updated).toMatchObject({ phone: '01012345678' });
  });

  it('update keeps an empty phone as empty (clearing is still allowed)', async () => {
    const harness = createStaffRoutesHarness();
    await harness.update(context({ id: 'staff-1', phone: '' }));
    const updated = harness.writes.find((write) => write.operation === 'update' && write.path === 'staff/staff-1')?.data;
    expect(updated).toMatchObject({ phone: '' });
  });
});
