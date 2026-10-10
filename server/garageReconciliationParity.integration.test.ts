import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFirestore, mockAdminAuth } from '../src/__tests__/mockFirestore';
import { saveEntityPin } from './utils';

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
        garageId: req.header('x-test-garage-id') || 'reconciliation-test-garage',
        entityId: req.header('x-test-entity-id') || undefined
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

async function callHonoCreate(token: string, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return api.fetch(new Request('http://localhost/api/garages/create', {
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

async function callExpressCreate(
  role: string,
  body: Record<string, unknown>,
  context: { uid?: string; entityId?: string } = {}
) {
  return fetch(`${expressUrl}/api/garages/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-role': role,
      ...(context.uid ? { 'x-test-uid': context.uid } : {}),
      ...(context.entityId ? { 'x-test-entity-id': context.entityId } : {})
    },
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

describe('garage creation dual-runtime characterization', () => {
  const delegateContext = { uid: 'delegate-uid', entityId: 'delegate-a' };

  const snapshotRecords = () => new Map(
    [...mockDb.records.entries()]
      .filter(([path]) => !path.startsWith('rate_limits/'))
      .map(([path, data]) => [path, structuredClone(data)])
  );

  const seedDelegateGarages = (count: number) => {
    const createdAt = new Date();
    for (let index = 0; index < count; index += 1) {
      mockDb.seed(`garages/delegate-existing-${index}`, {
        name: `Delegate Existing ${index}`,
        createdByDelegateId: 'delegate-a',
        createdAt
      });
    }
  };

  it('denies roles outside Admin/delegate scope in both runtimes without writes', async () => {
    const deniedRoles = [
      { role: 'garage', token: 'valid-garage-token-create-test-garage' },
      { role: 'staff', token: 'valid-staff-token-create-test-garage' },
      { role: 'worker', token: 'valid-worker-token' }
    ];

    for (const { role, token } of deniedRoles) {
      mockDb.clear();
      const [hono, expressResponse] = await Promise.all([
        callHonoCreate(token, {}),
        callExpressCreate(role, {})
      ]);
      const expected = { success: false, error: 'FORBIDDEN: Creation not permitted for role' };
      expect(hono.status).toBe(403);
      expect(expressResponse.status).toBe(403);
      expect(await hono.json()).toEqual(expected);
      expect(await expressResponse.json()).toEqual(expected);
      expect(snapshotRecords().size).toBe(0);
    }
  });

  it('matches Admin trial initialization and characterizes the activity-log detail difference', async () => {
    const body = {
      name: '  Synthetic Trial Garage  ',
      pin: '62841357',
      isTrial: true,
      trialDays: 3
    };

    mockDb.clear();
    const honoResponse = await callHonoCreate('valid-admin-token', body);
    const honoResult = await honoResponse.json() as any;
    const honoGarage = structuredClone(mockDb.records.get(`garages/${honoResult.id}`));
    const honoLog = [...mockDb.records.entries()]
      .find(([path, record]) => path.startsWith('activity_logs/') && record.garageId === honoResult.id)?.[1];

    mockDb.clear();
    const expressResponse = await callExpressCreate('admin', body);
    const expressResult = await expressResponse.json() as any;
    const expressGarage = structuredClone(mockDb.records.get(`garages/${expressResult.id}`));
    const expressLog = [...mockDb.records.entries()]
      .find(([path, record]) => path.startsWith('activity_logs/') && record.garageId === expressResult.id)?.[1];

    expect(honoResponse.status).toBe(200);
    expect(expressResponse.status).toBe(200);
    expect(honoResult.success).toBe(true);
    expect(expressResult.success).toBe(true);
    const withoutGeneratedTimes = (garage: Record<string, any>) => {
      const { createdAt: _createdAt, balanceExpiry: _balanceExpiry, ...stableFields } = garage;
      return stableFields;
    };
    expect(withoutGeneratedTimes(honoGarage)).toEqual(withoutGeneratedTimes(expressGarage));
    expect(honoGarage).toMatchObject({
      name: 'Synthetic Trial Garage',
      status: 'approved',
      isTrial: true,
      dailyCapacity: 100,
      activePackageName: 'الباقة التجريبية (3 يوم)',
      packageName: 'الباقة التجريبية (3 يوم)',
      balance: 0
    });
    expect(honoGarage.balanceExpiry.getTime() - honoGarage.createdAt.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    expect(expressGarage.balanceExpiry.getTime() - expressGarage.createdAt.getTime()).toBe(3 * 24 * 60 * 60 * 1000);

    expect(honoLog).toMatchObject({
      garageName: 'Synthetic Trial Garage',
      actionType: 'recharge',
      plateNumber: 'تفعيل الباقة التجريبية (3 يوم)',
      amount: 0
    });
    expect(expressLog).toMatchObject({
      garageName: 'Synthetic Trial Garage',
      actionType: 'recharge',
      plateNumber: 'تفعيل الباقة التجريبية (3 يوم)',
      amount: 0,
      details: {
        packageName: 'الباقة التجريبية (3 يوم)',
        durationDays: 3,
        carsCount: 100,
        revenueAmount: 0,
        isTrial: true
      }
    });
    expect(honoLog).not.toHaveProperty('details');
  });

  it('creates delegate-owned pending garages consistently while below the daily quota', async () => {
    const body = {
      name: 'Synthetic Delegate Garage',
      pin: '73916428',
      isTrial: true,
      trialDays: 4,
      createdByDelegateName: 'Delegate A',
      referrerName: 'Delegate A'
    };

    mockDb.clear();
    seedDelegateGarages(2);
    const honoResponse = await callHonoCreate('valid-delegate-token-delegate-a', body);
    const honoResult = await honoResponse.json() as any;
    const honoGarage = structuredClone(mockDb.records.get(`garages/${honoResult.id}`));

    mockDb.clear();
    seedDelegateGarages(2);
    const expressResponse = await callExpressCreate('delegate', body, delegateContext);
    const expressResult = await expressResponse.json() as any;
    const expressGarage = structuredClone(mockDb.records.get(`garages/${expressResult.id}`));

    expect(honoResponse.status).toBe(200);
    expect(expressResponse.status).toBe(200);
    expect(honoGarage).toMatchObject({
      status: 'pending',
      createdByDelegateId: 'delegate-a',
      createdByDelegateName: 'Delegate A',
      referrerId: 'delegate-a',
      referrerName: 'Delegate A'
    });
    const withoutGeneratedTimes = (garage: Record<string, any>) => {
      const { createdAt: _createdAt, balanceExpiry: _balanceExpiry, ...stableFields } = garage;
      return stableFields;
    };
    expect(withoutGeneratedTimes(honoGarage)).toEqual(withoutGeneratedTimes(expressGarage));
    expect(honoResult.success).toBe(true);
    expect(expressResult.success).toBe(true);
  });

  it('enforces the three-garage Cairo-day delegate quota without writes in either runtime', async () => {
    const body = { name: 'Quota Limit Garage', pin: '82517364' };

    mockDb.clear();
    seedDelegateGarages(3);
    const honoBefore = snapshotRecords();
    const honoResponse = await callHonoCreate('valid-delegate-token-delegate-a', body);
    const honoBody = await honoResponse.json();
    expect(honoResponse.status).toBe(409);
    expect(honoBody).toEqual({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' });
    expect(snapshotRecords()).toEqual(honoBefore);

    mockDb.clear();
    seedDelegateGarages(3);
    const expressBefore = snapshotRecords();
    const expressResponse = await callExpressCreate('delegate', body, delegateContext);
    expect(expressResponse.status).toBe(409);
    expect(await expressResponse.json()).toEqual(honoBody);
    expect(snapshotRecords()).toEqual(expressBefore);
  });

  it('rejects an already-reserved PIN identically without creating a garage or activity log', async () => {
    const pin = '91427538';
    const seedExistingPin = async () => {
      mockDb.clear();
      mockDb.seed('garages/existing-pin-owner', { name: 'Existing PIN Owner' });
      await saveEntityPin('garages', 'existing-pin-owner', pin);
    };
    const body = { name: 'Duplicate PIN Garage', pin };

    await seedExistingPin();
    const honoBefore = snapshotRecords();
    const honoResponse = await callHonoCreate('valid-admin-token', body);
    const honoBody = await honoResponse.json();
    expect(honoResponse.status).toBe(400);
    expect(honoBody).toMatchObject({ success: false, error: 'PIN_ALREADY_TAKEN' });
    expect(snapshotRecords()).toEqual(honoBefore);

    await seedExistingPin();
    const expressBefore = snapshotRecords();
    const expressResponse = await callExpressCreate('admin', body);
    expect(expressResponse.status).toBe(400);
    expect(await expressResponse.json()).toEqual(honoBody);
    expect(snapshotRecords()).toEqual(expressBefore);
  });

  it('validates idempotency keys but characterizes that repeated valid keys do not replay creation', async () => {
    const invalidBody = { name: 'Invalid Key Garage', pin: '41927536', idempotencyKey: 'bad!key-1234' };
    mockDb.clear();
    const honoInvalidBefore = snapshotRecords();
    const honoInvalid = await callHonoCreate('valid-admin-token', invalidBody);
    const honoInvalidBody = await honoInvalid.json();
    expect(honoInvalid.status).toBe(400);
    expect(honoInvalidBody).toMatchObject({ success: false, error: 'Idempotency key contains invalid characters' });
    expect(snapshotRecords()).toEqual(honoInvalidBefore);

    mockDb.clear();
    const expressInvalidBefore = snapshotRecords();
    const expressInvalid = await callExpressCreate('admin', invalidBody);
    expect(expressInvalid.status).toBe(400);
    expect(await expressInvalid.json()).toEqual(honoInvalidBody);
    expect(snapshotRecords()).toEqual(expressInvalidBefore);

    const runRepeatedValidKey = async (runtime: 'hono' | 'express') => {
      mockDb.clear();
      const statuses: number[] = [];
      for (const [name, pin] of [
        ['First keyed garage', '59182736'],
        ['Second keyed garage', '59182737']
      ]) {
        const body = { name, pin, idempotencyKey: 'garage-create-key-20261010' };
        const response = runtime === 'hono'
          ? await callHonoCreate('valid-admin-token', body)
          : await callExpressCreate('admin', body);
        statuses.push(response.status);
        await response.json();
      }
      return {
        statuses,
        garageCount: [...mockDb.records.keys()].filter((path) => path.startsWith('garages/')).length,
        activityLogCount: [...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/')).length
      };
    };

    const honoRepeatedKey = await runRepeatedValidKey('hono');
    const expressRepeatedKey = await runRepeatedValidKey('express');
    expect(honoRepeatedKey).toEqual({ statuses: [200, 200], garageCount: 2, activityLogCount: 2 });
    expect(expressRepeatedKey).toEqual(honoRepeatedKey);
  });
});
