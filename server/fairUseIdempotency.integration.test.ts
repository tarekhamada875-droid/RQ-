import express from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ db: null as any }));

vi.mock('./firebaseAdmin', () => ({
  get adminDb() { return harness.db; },
  adminAuth: null,
  firebaseConfig: {}
}));

vi.mock('./middleware', () => ({
  requireAuth(req: express.Request & { user?: unknown }, _res: express.Response, next: express.NextFunction) {
    req.user = { uid: String(req.header('x-test-uid') || 'express-admin'), role: String(req.header('x-test-role') || 'admin') };
    next();
  },
  financialRateLimiter: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
}));

vi.mock('./utils', () => ({ saveEntityPin: vi.fn(), checkPinAvailabilityAcrossAll: vi.fn() }));
vi.mock('./projections', () => ({ calculateDailyProjection: vi.fn() }));
vi.mock('./dashboardSummary', () => ({
  aggregateProjectionBuckets: vi.fn(),
  isValidDateKey: vi.fn((value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)),
  reconcileDashboardSummary: vi.fn()
}));
vi.mock('./unlimitedFairUse', () => ({
  initializeFairUse: vi.fn((durationDays = 30) => ({ isActive: true, tierType: durationDays > 15 ? 'monthly' : 'biweekly', cycleCarsCount: 0, currentAllowance: 1000, maxAllowance: 5000, stepAmount: 1000, threshold: 100, extensionsCount: 0 })),
  manualAdminExtendFairUse: vi.fn((fairUse: any, extraCars = 0) => ({
    ...fairUse,
    maxAllowance: fairUse.maxAllowance + (extraCars > 0 ? extraCars : fairUse.stepAmount),
    currentAllowance: Math.max(fairUse.currentAllowance, fairUse.cycleCarsCount) + (extraCars > 0 ? extraCars : fairUse.stepAmount),
    extensionsCount: (fairUse.extensionsCount || 0) + 1,
    isMaxLimitReached: false,
    isNearMaxLimit: false,
    lastExtendedAt: new Date()
  }))
}));

import garagesRouter from './routes/garages';

class InMemoryFirestore {
  readonly records = new Map<string, Record<string, any>>();
  private sequence = 0;

  doc(path: string) { return { path, id: path.split('/').at(-1) || '' }; }
  collection(path: string) { return { doc: (id?: string) => this.doc(`${path}/${id || `auto_${++this.sequence}`}`) }; }

  async runTransaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    const writes: Array<{ kind: 'set' | 'delete'; ref: any; value?: any; options?: any }> = [];
    const transaction = {
      get: async (ref: any) => ({ exists: this.records.has(ref.path), data: () => this.records.has(ref.path) ? structuredClone(this.records.get(ref.path)) : undefined }),
      set: (ref: any, value: any, options?: any) => writes.push({ kind: 'set', ref, value: structuredClone(value), options }),
      delete: (ref: any) => writes.push({ kind: 'delete', ref })
    };
    const result = await callback(transaction);
    for (const write of writes) {
      if (write.kind === 'delete') this.records.delete(write.ref.path);
      else this.records.set(write.ref.path, write.options?.merge ? { ...(this.records.get(write.ref.path) || {}), ...write.value } : write.value);
    }
    return result;
  }
}

let server: Server;
let baseUrl: string;
const garageId = 'express-fair-use-garage';

async function post(path: string, body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  return new Promise<{ status: number; json: any }>((resolveResponse, rejectResponse) => {
    const request = httpRequest(new URL(path, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-test-role': 'admin' }
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolveResponse({ status: response.statusCode || 0, json: JSON.parse(text) }));
    });
    request.on('error', rejectResponse);
    request.end(payload);
  });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/garages', garagesRouter);
  server = createServer(app);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
});

beforeEach(() => {
  harness.db = new InMemoryFirestore();
  harness.db.records.set(`garages/${garageId}`, {
    name: 'Express Unlimited Garage', dailyCapacity: 0, activePackageName: 'باقة مفتوحة',
    unlimitedFairUse: { isActive: true, tierType: 'monthly', cycleCarsCount: 40, currentAllowance: 1000, maxAllowance: 5000, stepAmount: 1000, threshold: 100, extensionsCount: 0 }
  });
});

describe('Express fair-use idempotency compatibility', () => {
  it('replays the same keyed extension without applying it twice', async () => {
    const body = { extraCars: 250, idempotencyKey: 'express-fair-use-replay-001' };
    const first = await post(`/api/garages/${garageId}/extend-fair-use`, body);
    const second = await post(`/api/garages/${garageId}/extend-fair-use`, body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.json).toEqual(first.json);
    expect(harness.db.records.get(`garages/${garageId}`)?.unlimitedFairUse).toMatchObject({ maxAllowance: 5250, currentAllowance: 1250 });
    expect([...harness.db.records.values()].filter((record) => record.actionType === 'fair_use_admin_extended')).toHaveLength(1);
  });

  it('rejects keyed reuse with a different payload', async () => {
    const first = await post(`/api/garages/${garageId}/extend-fair-use`, { extraCars: 250, idempotencyKey: 'express-fair-use-reuse-001' });
    const reused = await post(`/api/garages/${garageId}/extend-fair-use`, { extraCars: 500, idempotencyKey: 'express-fair-use-reuse-001' });

    expect(first.status).toBe(200);
    expect(reused.status).toBe(409);
    expect([...harness.db.records.values()].filter((record) => record.actionType === 'fair_use_admin_extended')).toHaveLength(1);
  });
});
