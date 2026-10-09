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
        uid: req.header('x-test-uid') || (req.header('x-test-role') === 'admin' ? 'admin-uid' : 'reconciliation-test-user'),
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

async function callHonoRecalculate(token: string, body: Record<string, unknown>) {
  return api.fetch(new Request('http://localhost/api/garages/recalculate-cars-inside', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }));
}

async function callHonoSummaryRebuild(token: string, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return api.fetch(new Request('http://localhost/api/garages/dashboard-summary/rebuild', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }));
}

async function callHonoProjectionRebuild(token: string, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return api.fetch(new Request('http://localhost/api/garages/rebuild-projections', {
    method: 'POST',
    headers,
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

async function callExpressSummaryRebuild(role: string, body: Record<string, unknown>) {
  return fetch(`${expressUrl}/api/garages/dashboard-summary/rebuild`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-role': role },
    body: JSON.stringify(body)
  });
}

async function callExpressProjectionRebuild(role: string, body: Record<string, unknown>) {
  return fetch(`${expressUrl}/api/garages/rebuild-projections`, {
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

describe('garage active-vehicle recalculation Hono contract', () => {
  it('recalculates the count from inside vehicles and persists it using a synthetic fixture', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Synthetic Recalculation Garage', carsInside: 99 });
    mockDb.seed(`garages/${garageId}/vehicles/inside-1`, { status: 'inside' });
    mockDb.seed(`garages/${garageId}/vehicles/inside-2`, { status: 'inside' });
    mockDb.seed(`garages/${garageId}/vehicles/outside-1`, { status: 'outside' });
    mockDb.seed(`garages/${garageId}/vehicles/departed-1`, { status: 'departed' });

    const hono = await callHonoRecalculate('valid-admin-token', { garageId });
    const honoBody = await hono.json();
    const honoGarage = structuredClone(mockDb.records.get(`garages/${garageId}`));
    expect(hono.status).toBe(200);
    expect(honoBody).toEqual({ success: true, count: 2 });
    expect(honoGarage.carsInside).toBe(2);

    expect(mockDb.records.get(`garages/${garageId}`)).toEqual(honoGarage);
  });

  it('denies non-Admins without changing any synthetic records', async () => {
    mockDb.seed(`garages/${garageId}`, { name: 'Synthetic Recalculation Garage', carsInside: 7 });
    mockDb.seed(`garages/${garageId}/vehicles/inside-1`, { status: 'inside' });
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const hono = await callHonoRecalculate('valid-garage-token-reconciliation-test-garage', { garageId });

    expect(hono.status).toBe(403);
    expect(await hono.json()).toEqual({ success: false, error: 'FORBIDDEN: Admin role required' });
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('rejects missing and empty garageId without writes', async () => {
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    for (const body of [{}, { garageId: '' }]) {
      const hono = await callHonoRecalculate('valid-admin-token', body);
      expect(hono.status).toBe(400);
      expect(await hono.json()).toEqual({ success: false, error: 'INVALID_REQUEST' });
    }
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });
});

describe('dashboard-summary rebuild dual-runtime characterization', () => {
  const targetDate = '2026-09-18';

  function seedSummaryRebuildFixture() {
    const dayStart = new Date(`${targetDate}T00:00:00+03:00`);
    const eventAt = (offset: number) => new Date(dayStart.getTime() + offset).toISOString();
    mockDb.seed(`garages/${garageId}`, { carsInside: 2 });
    mockDb.seed(`garages/${garageId}/daily_stats/${targetDate}`, { count: 1, revenue: 15 });
    mockDb.seed(`garages/${garageId}/projection_buckets/shard-a`, {
      dateId: targetDate, activeVehicleCount: 2, entriesToday: 1, exitsToday: 1,
      grossRevenue: 20, refundTotal: 5, netRevenue: 15
    });
    mockDb.seed(`garages/${garageId}/projection_buckets/shard-b`, {
      dateId: targetDate, activeVehicleCount: 1, entriesToday: 0, exitsToday: 0,
      grossRevenue: 0, refundTotal: 0, netRevenue: 0
    });
    mockDb.seed(`garages/${garageId}/projection_buckets/other-day`, {
      dateId: '2026-09-17', activeVehicleCount: 100, entriesToday: 100
    });
    mockDb.seed(`garages/${garageId}/events/enter`, {
      occurredAt: eventAt(60_000), eventType: 'vehicle_entered'
    });
    mockDb.seed(`garages/${garageId}/events/exit`, {
      occurredAt: eventAt(120_000), eventType: 'vehicle_exited', payload: { cost: 20 }
    });
    mockDb.seed(`garages/${garageId}/events/refund`, {
      occurredAt: eventAt(180_000), eventType: 'vehicle_refunded', payload: { refundAmount: 5 }
    });
    mockDb.seed(`garages/${garageId}/events/before-day`, {
      occurredAt: eventAt(-1), eventType: 'vehicle_entered'
    });
    mockDb.seed(`garages/${garageId}/events/next-day`, {
      occurredAt: eventAt(24 * 60 * 60 * 1000), eventType: 'vehicle_entered'
    });
    mockDb.seed(`garages/${garageId}/dashboard_summary/current`, { preservedField: 'keep-on-merge' });
  }

  it('matches synthetic Admin summary, projection, boundary counts, and persisted read-model fields', async () => {
    seedSummaryRebuildFixture();
    const body = { garageId, date: targetDate };
    const hono = await callHonoSummaryRebuild('valid-admin-token', body);
    const honoBody = await hono.json() as any;
    const persistedAfterHono = structuredClone(mockDb.records.get(`garages/${garageId}/dashboard_summary/current`));

    expect(hono.status).toBe(200);
    expect(honoBody).toMatchObject({
      success: true,
      data: {
        bucketCount: 2,
        eventCount: 3,
        consistentWithEvents: true,
        legacyDifferences: { activeVehicleCount: 1, entriesToday: 0, grossRevenue: 5 },
        summary: {
          garageId,
          dateId: targetDate,
          activeVehicleCount: 3,
          entriesToday: 1,
          exitsToday: 1,
          grossRevenue: 20,
          refundTotal: 5,
          netRevenue: 15,
          projectionVersion: 1,
          rebuiltBy: 'admin-uid',
          eventProjection: { count: 1, exitsCount: 1, grossRevenue: 20, refundRevenue: 5, netRevenue: 15, revenue: 15 },
          reconciliation: { consistent: true }
        }
      }
    });
    expect(persistedAfterHono).toMatchObject(honoBody.data.summary);
    expect(persistedAfterHono.preservedField).toBe('keep-on-merge');

    mockDb.seed(`garages/${garageId}/dashboard_summary/current`, { preservedField: 'keep-on-merge' });
    const expressResponse = await callExpressSummaryRebuild('admin', body);
    const expressBody = await expressResponse.json() as any;
    const persistedAfterExpress = mockDb.records.get(`garages/${garageId}/dashboard_summary/current`);
    expect(expressResponse.status).toBe(hono.status);
    const withoutRebuiltAt = (summary: Record<string, unknown>) => Object.fromEntries(
      Object.entries(summary).filter(([key]) => key !== 'rebuiltAt')
    );
    expect(expressBody.success).toBe(honoBody.success);
    expect(expressBody.data).toMatchObject({
      bucketCount: honoBody.data.bucketCount,
      eventCount: honoBody.data.eventCount,
      consistentWithEvents: honoBody.data.consistentWithEvents,
      legacyDifferences: honoBody.data.legacyDifferences
    });
    expect(withoutRebuiltAt(expressBody.data.summary)).toEqual(withoutRebuiltAt(honoBody.data.summary));
    expect(withoutRebuiltAt(persistedAfterExpress)).toEqual(withoutRebuiltAt(persistedAfterHono));
  });

  it('denies non-Admins in both runtimes without writes', async () => {
    seedSummaryRebuildFixture();
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const body = { garageId, date: targetDate };
    const [hono, expressResponse] = await Promise.all([
      callHonoSummaryRebuild('valid-garage-token-reconciliation-test-garage', body),
      callExpressSummaryRebuild('garage', body)
    ]);
    expect(hono.status).toBe(403);
    expect(hono.status).toBe(expressResponse.status);
    expect(await hono.json()).toEqual(await expressResponse.json());
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('denies unauthenticated Hono requests without writes', async () => {
    seedSummaryRebuildFixture();
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const hono = await callHonoSummaryRebuild('', { garageId, date: targetDate });
    expect(hono.status).toBe(401);
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('matches Admin malformed-input and missing-garage contracts without writing', async () => {
    for (const body of [{}, { garageId, date: '2026-02-30' }, { garageId: 'missing-summary-garage', date: targetDate }]) {
      const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
      const [hono, expressResponse] = await Promise.all([
        callHonoSummaryRebuild('valid-admin-token', body),
        callExpressSummaryRebuild('admin', body)
      ]);
      expect(hono.status).toBe(expressResponse.status);
      expect(await hono.json()).toEqual(await expressResponse.json());
      expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
    }
  });
});

describe('daily projection rebuild dual-runtime characterization', () => {
  const targetDate = '2026-09-18';

  function seedProjectionRebuildFixture() {
    const dayStart = new Date(`${targetDate}T00:00:00+03:00`);
    const eventAt = (offset: number) => new Date(dayStart.getTime() + offset).toISOString();
    mockDb.seed(`garages/${garageId}/daily_stats/${targetDate}`, {
      count: 999, revenue: 999, preservedField: 'keep-on-merge'
    });
    mockDb.seed(`garages/${garageId}/events/entry`, {
      occurredAt: eventAt(60_000), eventId: 'entry-event', eventType: 'vehicle_entered'
    });
    mockDb.seed(`garages/${garageId}/events/exit`, {
      occurredAt: eventAt(120_000), eventId: 'exit-event', eventType: 'vehicle_exited', payload: { cost: 50 }
    });
    mockDb.seed(`garages/${garageId}/events/refund`, {
      occurredAt: eventAt(180_000), eventType: 'vehicle_refunded', payload: { refundAmount: 5 }
    });
    mockDb.seed(`garages/${garageId}/events/before-day`, {
      occurredAt: eventAt(-1), eventType: 'vehicle_entered'
    });
    mockDb.seed(`garages/${garageId}/events/next-day`, {
      occurredAt: eventAt(24 * 60 * 60 * 1000), eventType: 'vehicle_entered'
    });
  }

  it('replays the synthetic ledger with matching projection, watermark, Cairo boundaries, and stable retries', async () => {
    seedProjectionRebuildFixture();
    const body = { garageId, date: targetDate };
    const hono = await callHonoProjectionRebuild('valid-admin-token', body);
    const honoBody = await hono.json() as any;
    const firstProjection = structuredClone(honoBody.data.projection);
    const persistedAfterHono = structuredClone(mockDb.records.get(`garages/${garageId}/daily_stats/${targetDate}`));

    expect(hono.status).toBe(200);
    expect(honoBody).toMatchObject({
      success: true,
      data: {
        garageId,
        date: targetDate,
        projection: {
          count: 1,
          exitsCount: 1,
          grossRevenue: 50,
          refundRevenue: 5,
          netRevenue: 45,
          revenue: 45,
          rebuiltBy: 'admin-uid',
          eventWatermark: {
            lastProcessedOccurredAt: new Date(`${targetDate}T00:03:00+03:00`).toISOString(),
            lastProcessedEventId: 'refund',
            projectionVersion: 1
          }
        }
      }
    });
    expect(persistedAfterHono).toMatchObject(firstProjection);
    expect(persistedAfterHono.preservedField).toBe('keep-on-merge');

    const retry = await callHonoProjectionRebuild('valid-admin-token', body);
    const retryBody = await retry.json() as any;
    expect(retry.status).toBe(200);
    expect(retryBody.data.projection).toMatchObject({
      ...firstProjection,
      rebuiltAt: expect.any(String)
    });
    expect(mockDb.records.get(`garages/${garageId}/daily_stats/${targetDate}`)).toMatchObject({
      count: 1, exitsCount: 1, grossRevenue: 50, refundRevenue: 5, netRevenue: 45, revenue: 45
    });

    mockDb.seed(`garages/${garageId}/daily_stats/${targetDate}`, { preservedField: 'keep-on-merge' });
    const expressResponse = await callExpressProjectionRebuild('admin', body);
    const expressBody = await expressResponse.json() as any;
    expect(expressResponse.status).toBe(hono.status);
    const withoutRebuiltAt = (projection: Record<string, unknown>) => Object.fromEntries(
      Object.entries(projection).filter(([key]) => key !== 'rebuiltAt')
    );
    expect(expressBody.success).toBe(honoBody.success);
    expect(expressBody.data.garageId).toBe(honoBody.data.garageId);
    expect(expressBody.data.date).toBe(honoBody.data.date);
    expect(withoutRebuiltAt(expressBody.data.projection)).toEqual(withoutRebuiltAt(firstProjection));
    expect(withoutRebuiltAt(mockDb.records.get(`garages/${garageId}/daily_stats/${targetDate}`)))
      .toEqual(withoutRebuiltAt(persistedAfterHono));
  });

  it('denies unauthenticated and non-Admin callers without writing', async () => {
    seedProjectionRebuildFixture();
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const [unauthenticated, hono, expressResponse] = await Promise.all([
      callHonoProjectionRebuild('', { garageId, date: targetDate }),
      callHonoProjectionRebuild('valid-garage-token-reconciliation-test-garage', { garageId, date: targetDate }),
      callExpressProjectionRebuild('garage', { garageId, date: targetDate })
    ]);
    expect(unauthenticated.status).toBe(401);
    expect(hono.status).toBe(403);
    expect(hono.status).toBe(expressResponse.status);
    expect(await hono.json()).toEqual(await expressResponse.json());
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('matches missing-input and invalid-date validation without writing', async () => {
    seedProjectionRebuildFixture();
    for (const body of [{}, { garageId, date: '2026-02-30' }]) {
      const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
      const [hono, expressResponse] = await Promise.all([
        callHonoProjectionRebuild('valid-admin-token', body),
        callExpressProjectionRebuild('admin', body)
      ]);
      expect(hono.status).toBe(expressResponse.status);
      expect(await hono.json()).toEqual(await expressResponse.json());
      expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
    }
  });
});
