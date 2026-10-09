import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFirestore, mockAdminAuth } from '../src/__tests__/mockFirestore';

const mockDb = new MockFirestore();

vi.mock('./firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

vi.mock('./middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./middleware')>();
  return {
    ...actual,
    requireAuth(req: any, _res: any, next: () => void) {
      req.user = {
        uid: 'reconciliation-test-user',
        role: req.header('x-test-role') || 'garage',
        garageId: req.header('x-test-garage-id') || 'reconciliation-test-garage'
      };
      next();
    }
  };
});

import { api } from './api';
import garagesRouter from './routes/garages';

const garageId = 'reconciliation-test-garage';
let server: Server;
let expressUrl: string;

function seedReconciliationFixture() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const dayStart = new Date(`${today}T00:00:00+03:00`);
  mockDb.seed(`garages/${garageId}`, {
    carsInside: 1, lastTransactionDate: today, todayCount: 1, todayRevenue: 20
  });
  mockDb.seed(`garages/${garageId}/daily_stats/${today}`, { count: 1, exitsCount: 1, revenue: 20 });
  mockDb.seed(`garages/${garageId}/vehicles/inside-1`, { status: 'inside' });
  mockDb.seed(`garages/${garageId}/events/enter`, {
    occurredAt: new Date(dayStart.getTime() + 60_000).toISOString(), eventType: 'vehicle_entered'
  });
  mockDb.seed(`garages/${garageId}/events/exit`, {
    occurredAt: new Date(dayStart.getTime() + 120_000).toISOString(), eventType: 'vehicle_exited', payload: { cost: 20 }
  });
}

async function callHono(token: string, body: Record<string, unknown>) {
  return api.fetch(new Request('http://localhost/api/garages/reconciliation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }));
}

async function callExpress(role: string, body: Record<string, unknown>) {
  return fetch(`${expressUrl}/api/garages/reconciliation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-role': role },
    body: JSON.stringify(body)
  });
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/garages', garagesRouter);
  server = createServer(app);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  expressUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
});

beforeEach(() => {
  mockDb.clear();
  seedReconciliationFixture();
});

describe('garage reconciliation dual-runtime characterization', () => {
  it('matches the Express response and performs no writes for a synthetic Admin diagnostic', async () => {
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const [hono, expressResponse] = await Promise.all([
      callHono('valid-admin-token', { garageId }),
      callExpress('admin', { garageId })
    ]);

    expect(hono.status).toBe(expressResponse.status);
    expect(await hono.json()).toEqual(await expressResponse.json());
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('matches Admin validation and missing-garage errors across runtimes', async () => {
    const cases = [
      { body: { garageId: 'invalid/id' }, status: 400 },
      { body: { garageId: 'missing-reconciliation-garage' }, status: 404 }
    ];
    for (const testCase of cases) {
      const [hono, expressResponse] = await Promise.all([
        callHono('valid-admin-token', testCase.body),
        callExpress('admin', testCase.body)
      ]);
      expect(hono.status).toBe(testCase.status);
      expect(hono.status).toBe(expressResponse.status);
      expect(await hono.json()).toEqual(await expressResponse.json());
    }
  });

  it('matches non-Admin denial across runtimes', async () => {
    const [hono, expressResponse] = await Promise.all([
      callHono('valid-garage-token-reconciliation-test-garage', { garageId }),
      callExpress('garage', { garageId })
    ]);
    expect(hono.status).toBe(403);
    expect(hono.status).toBe(expressResponse.status);
    expect(await hono.json()).toEqual(await expressResponse.json());
  });
});
