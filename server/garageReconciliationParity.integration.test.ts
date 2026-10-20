import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from '../src/__tests__/mockFirestore';
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

import { api } from './api';
installDefaultWorkerTestSessionHeaders(api, mockDb);

const garageId = 'reconciliation-test-garage';

function seedWinterBoundaryEvents() {
  const eventsPath = `garages/${garageId}/events`;
  mockDb.seed(`${eventsPath}/winter-before`, {
    occurredAt: '2026-01-14T21:59:59.999Z', eventType: 'vehicle_entered'
  });
  mockDb.seed(`${eventsPath}/winter-entry`, {
    occurredAt: '2026-01-14T22:00:00.000Z', eventType: 'vehicle_entered'
  });
  mockDb.seed(`${eventsPath}/winter-exit`, {
    occurredAt: '2026-01-15T21:30:00.000Z', eventId: 'winter-exit',
    eventType: 'vehicle_exited', payload: { cost: 40 }
  });
  mockDb.seed(`${eventsPath}/winter-next-day`, {
    occurredAt: '2026-01-15T22:00:00.000Z', eventType: 'vehicle_entered'
  });
}

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

async function callHono(token: string, body: unknown) {
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

async function callHonoSummaryRebuild(token: string, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return api.fetch(new Request('http://localhost/api/garages/dashboard-summary/rebuild', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }));
}

async function callHonoProjectionRebuild(token: string, body: unknown) {
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

async function callHonoGarageUpdate(token: string, body: unknown) {
  return api.fetch(new Request('http://localhost/api/garages/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }));
}

async function callHonoGarageDelete(token: string, body: unknown) {
  return api.fetch(new Request('http://localhost/api/garages/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }));
}

async function callHonoGarageDeleteStep(token: string, body: unknown) {
  return api.fetch(new Request('http://localhost/api/garages/delete-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }));
}

async function completeHonoGarageDeletion(token: string, garageId: string, jobToken: string) {
  for (let index = 0; index < 100; index += 1) {
    const response = await callHonoGarageDeleteStep(token, { garageId, jobToken });
    const body = await response.json() as any;
    if (!response.ok) throw new Error(`Garage deletion step failed: ${body.code || response.status}`);
    if (body.status === 'completed') return body;
    if (body.status !== 'running') throw new Error(`Unexpected garage deletion status: ${body.status}`);
  }
  throw new Error('Synthetic garage deletion did not complete within 100 bounded steps');
}

beforeEach(() => {
  mockDb.clear();
  seedReconciliationFixture();
});

describe('garage reconciliation Hono contract', () => {
  it('serves a synthetic Admin diagnostic without writes', async () => {
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const hono = await callHono('valid-admin-token', { garageId });

    expect(hono.status).toBe(200);
    expect(await hono.json()).toMatchObject({ success: true, data: { garageId } });
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('preserves Admin validation and missing-garage errors without writes', async () => {
    const cases = [
      { body: { garageId: 'invalid/id' }, status: 400 },
      { body: { garageId: 'missing-reconciliation-garage' }, status: 404 },
      { body: null, status: 400 }
    ];
    for (const testCase of cases) {
      const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
      const hono = await callHono('valid-admin-token', testCase.body);
      expect(hono.status).toBe(testCase.status);
      const honoBody = await hono.json();
      if (testCase.body === null) {
        expect(honoBody).toMatchObject({ success: false });
      }
      expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
    }
  });

  it('denies non-Admin access without writes', async () => {
    const hono = await callHono('valid-garage-token-reconciliation-test-garage', { garageId });
    expect(hono.status).toBe(403);
    expect(await hono.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required' });
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
    expect(await hono.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required', code: 'FORBIDDEN', statusCode: 403 });
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

  });

  it('denies non-Admins without writes', async () => {
    seedSummaryRebuildFixture();
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const hono = await callHonoSummaryRebuild('valid-garage-token-reconciliation-test-garage', { garageId, date: targetDate });
    expect(hono.status).toBe(403);
    expect(await hono.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required', code: 'FORBIDDEN', statusCode: 403 });
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('denies unauthenticated Hono requests without writes', async () => {
    seedSummaryRebuildFixture();
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const hono = await callHonoSummaryRebuild('', { garageId, date: targetDate });
    expect(hono.status).toBe(401);
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('preserves Admin malformed-input and missing-garage contracts without writing', async () => {
    for (const [body, expectedStatus] of [[null, 400], [{}, 400], [{ garageId, date: '2026-02-30' }, 500], [{ garageId: 'missing-summary-garage', date: targetDate }, 404]] as const) {
      const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
      const hono = await callHonoSummaryRebuild('valid-admin-token', body);
      expect(hono.status).toBe(expectedStatus);
      expect((await hono.json()).success).toBe(false);
      expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
    }
  });
});

describe('daily projection rebuild Hono contract', () => {
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

  it('replays the synthetic ledger with the expected projection, watermark, Cairo boundaries, and stable retries', async () => {
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

  });

  it('denies unauthenticated and non-Admin callers without writing', async () => {
    seedProjectionRebuildFixture();
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
    const [unauthenticated, hono] = await Promise.all([
      callHonoProjectionRebuild('', { garageId, date: targetDate }),
      callHonoProjectionRebuild('valid-garage-token-reconciliation-test-garage', { garageId, date: targetDate })
    ]);
    expect(unauthenticated.status).toBe(401);
    expect(hono.status).toBe(403);
    expect(await hono.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required', code: 'FORBIDDEN', statusCode: 403 });
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('matches missing-input and invalid-date validation without writing', async () => {
    seedProjectionRebuildFixture();
    for (const body of [null, {}, { garageId, date: '2026-02-30' }]) {
      const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));
      const hono = await callHonoProjectionRebuild('valid-admin-token', body);
      expect(hono.status).toBe(400);
      const honoBody = await hono.json();
      if (body === null) {
        expect(honoBody).toMatchObject({ success: false });
      } else {
        expect(honoBody).toMatchObject({ success: false });
      }
      expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
    }
  });
});

describe('winter Cairo maintenance boundaries', () => {
  it('selects the correct winter-day events for Hono summary and daily-projection rebuilds', async () => {
    const winterDate = '2026-01-15';
    seedWinterBoundaryEvents();
    mockDb.seed(`garages/${garageId}`, { carsInside: 1 });
    mockDb.seed(`garages/${garageId}/daily_stats/${winterDate}`, { count: 1, revenue: 40 });
    mockDb.seed(`garages/${garageId}/projection_buckets/winter`, {
      dateId: winterDate, activeVehicleCount: 1, entriesToday: 1, exitsToday: 1,
      grossRevenue: 40, refundTotal: 0, netRevenue: 40
    });
    const body = { garageId, date: winterDate };

    const honoSummary = await callHonoSummaryRebuild('valid-admin-token', body);
    const honoSummaryBody = await honoSummary.json() as any;
    expect(honoSummary.status).toBe(200);
    expect(honoSummaryBody.data.eventCount).toBe(2);
    expect(honoSummaryBody.data.summary.eventProjection).toMatchObject({ count: 1, exitsCount: 1, grossRevenue: 40 });
    const honoProjection = await callHonoProjectionRebuild('valid-admin-token', body);
    const honoProjectionBody = await honoProjection.json() as any;
    expect(honoProjection.status).toBe(200);
    expect(honoProjectionBody.data.projection).toMatchObject({
      count: 1,
      exitsCount: 1,
      grossRevenue: 40,
      netRevenue: 40,
      eventWatermark: {
        lastProcessedOccurredAt: '2026-01-15T21:30:00.000Z',
        lastProcessedEventId: 'winter-exit'
      }
    });
  });
});

describe('garage creation Hono contract', () => {
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

  it('denies roles outside Admin/delegate scope without writes', async () => {
    const deniedTokens = [
      'valid-garage-token-create-test-garage',
      'valid-staff-token-create-test-garage',
      'valid-worker-token'
    ];
    for (const token of deniedTokens) {
      mockDb.clear();
      const before = snapshotRecords();
      const response = await callHonoCreate(token, {});
      if (token === 'valid-worker-token') {
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED', code: 'SESSION_REVOKED', statusCode: 401 });
      } else {
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Creation not permitted for role', code: 'FORBIDDEN', statusCode: 403 });
      }
      expect(snapshotRecords()).toEqual(before);
    }
  });

  it('enforces the shared 30-per-minute limit and resets an expired window', async () => {
    const rateLimitDocId = createHash('sha256').update('fin:admin-uid').digest('hex');
    const rateLimitPath = `rate_limits/${rateLimitDocId}`;
    const now = Date.now();
    mockDb.seed(rateLimitPath, { count: 29, resetAt: now + 60_000, expiresAt: new Date(now + 60_000) });

    const allowed = await callHonoCreate('valid-admin-token', {
      name: 'Synthetic Limit Boundary Garage', pin: '41827536'
    });
    const allowedBody = await allowed.json() as any;
    expect(allowed.status).toBe(200);
    expect(mockDb.records.get(rateLimitPath).count).toBe(30);
    expect(mockDb.records.has(`garages/${allowedBody.id}`)).toBe(true);

    const beforeBlockedRequest = snapshotRecords();
    const blocked = await callHonoCreate('valid-admin-token', {
      name: 'Synthetic Over-Limit Garage', pin: '52618473'
    });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({
      success: false,
      error: 'TOO_MANY_REQUESTS: Rate limit exceeded. Please try again in 1 minute.',
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429
    });
    expect(snapshotRecords()).toEqual(beforeBlockedRequest);

    mockDb.clear();
    seedReconciliationFixture();
    const expiredAt = Date.now() - 1;
    mockDb.seed(rateLimitPath, { count: 30, resetAt: expiredAt, expiresAt: new Date(expiredAt) });
    const afterExpiry = await callHonoCreate('valid-admin-token', {
      name: 'Synthetic Expired-Window Garage', pin: '63729481'
    });
    expect(afterExpiry.status).toBe(200);
    expect(mockDb.records.get(rateLimitPath)).toMatchObject({ count: 1 });
  });

  it('serializes concurrent creates at the rate-limit boundary', async () => {
    const rateLimitDocId = createHash('sha256').update('fin:admin-uid').digest('hex');
    const rateLimitPath = `rate_limits/${rateLimitDocId}`;
    const now = Date.now();
    mockDb.seed(rateLimitPath, { count: 28, resetAt: now + 60_000, expiresAt: new Date(now + 60_000) });
    const requests = [
      { name: 'Synthetic Concurrent Limit Garage A', pin: '41827537' },
      { name: 'Synthetic Concurrent Limit Garage B', pin: '52618474' },
      { name: 'Synthetic Concurrent Limit Garage C', pin: '63729482' }
    ];
    const responses = await Promise.all(requests.map((body) => callHonoCreate('valid-admin-token', body)));
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<any>));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 429]);
    expect(mockDb.records.get(rateLimitPath).count).toBe(30);
    expect(bodies.filter((body) => body?.success === true)).toHaveLength(2);
    expect(bodies.filter((body) => body?.code === 'RATE_LIMIT_EXCEEDED')).toHaveLength(1);
  });

  it('fails closed without garage writes when rate-limit storage is unavailable', async () => {
    const before = snapshotRecords();
    const originalRunTransaction = mockDb.runTransaction.bind(mockDb);
    (mockDb as any).runTransaction = async () => { throw new Error('SYNTHETIC_RATE_LIMIT_STORAGE_FAILURE'); };
    let response: Response;
    try {
      response = await callHonoCreate('valid-admin-token', {
        name: 'Synthetic Limiter Outage Garage', pin: '74831592'
      });
    } finally {
      (mockDb as any).runTransaction = originalRunTransaction;
    }
    expect(response!.status).toBe(503);
    expect(await response!.json()).toEqual({ success: false, error: 'RATE_LIMITER_UNAVAILABLE' });
    expect(snapshotRecords()).toEqual(before);
  });

  it('creates an Admin garage with the prepaid-credit defaults and complete activity-log details', async () => {
    mockDb.clear();
    const response = await callHonoCreate('valid-admin-token', {
      name: '  Synthetic Trial Garage  ', pin: '62841357', isTrial: true
    });
    const result = await response.json() as any;
    const garage = structuredClone(mockDb.records.get(`garages/${result.id}`));
    const log = [...mockDb.records.entries()]
      .find(([path, record]) => path.startsWith('activity_logs/') && record.garageId === result.id)?.[1];
    expect(response.status).toBe(200);
    expect(garage).toMatchObject({
      name: 'Synthetic Trial Garage', status: 'approved', isTrial: true,
      billingModel: 'prepaid_credits', dailyCapacity: 0, activePackageName: '',
      packageName: '', balance: 0, creditBalance: { paid: 0, referral: 0, trial: 100 }
    });
    expect(garage.balanceExpiry).toBeNull();
    expect(log).toMatchObject({
      garageName: 'Synthetic Trial Garage', actionType: 'create',
      plateNumber: 'إنشاء حساب جراج جديد (نظام الرصيد)', amount: 0,
      details: { packageName: '', durationDays: 0, carsCount: 0, revenueAmount: 0, isTrial: true, trialCreditsGranted: 100 }
    });
    expect([...mockDb.records.values()].some((record: any) => record.kind === 'trial_grant' && record.amount === 100 && record.bucket === 'trial')).toBe(true);
  });

  it('creates a delegate-owned pending garage below the daily quota', async () => {
    mockDb.clear();
    seedDelegateGarages(2);
    const response = await callHonoCreate('valid-delegate-token-delegate-a', {
      name: 'Synthetic Delegate Garage', pin: '73916428', isTrial: true,
      createdByDelegateName: 'Delegate A', referrerName: 'Delegate A'
    });
    const result = await response.json() as any;
    const garage = structuredClone(mockDb.records.get(`garages/${result.id}`));
    expect(response.status).toBe(200);
    expect(garage).toMatchObject({
      status: 'pending', createdByDelegateId: delegateContext.entityId,
      createdByDelegateName: 'Delegate A', referrerId: delegateContext.entityId, referrerName: 'Delegate A'
    });
  });

  it('enforces the three-garage Cairo-day delegate quota without writes', async () => {
    mockDb.clear();
    seedDelegateGarages(3);
    const before = snapshotRecords();
    const response = await callHonoCreate('valid-delegate-token-delegate-a', { name: 'Quota Limit Garage', pin: '82517364' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' });
    expect(snapshotRecords()).toEqual(before);
  });

  it('rejects an already-reserved PIN without creating a garage or activity log', async () => {
    mockDb.clear();
    mockDb.seed('garages/existing-pin-owner', { name: 'Existing PIN Owner' });
    await saveEntityPin('garages', 'existing-pin-owner', '91427538');
    const before = snapshotRecords();
    const response = await callHonoCreate('valid-admin-token', { name: 'Duplicate PIN Garage', pin: '91427538' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: 'PIN_ALREADY_TAKEN' });
    expect(snapshotRecords()).toEqual(before);
  });

  it('validates, replays, rejects key reuse, and serializes concurrent idempotent creates', async () => {
    mockDb.clear();
    const invalidBody = { name: 'Invalid Key Garage', pin: '41927536', idempotencyKey: 'bad!key-1234' };
    const invalidBefore = snapshotRecords();
    const invalid = await callHonoCreate('valid-admin-token', invalidBody);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ success: false, error: 'Idempotency key contains invalid characters' });
    expect(snapshotRecords()).toEqual(invalidBefore);

    mockDb.clear();
    const body = { name: 'Keyed Garage', pin: '59182736', isTrial: true, idempotencyKey: 'garage-create-key-20261010' };
    const first = await callHonoCreate('valid-admin-token', body);
    const firstBody = await first.json();
    const replay = await callHonoCreate('valid-admin-token', body);
    const replayBody = await replay.json();
    expect([first.status, replay.status]).toEqual([200, 200]);
    expect(replayBody).toEqual(firstBody);
    expect([...mockDb.records.keys()].filter((path) => /^garages\/[^/]+$/.test(path))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/'))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('private_pins/'))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('pin_reservations/'))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('idempotency_records/'))).toHaveLength(1);

    mockDb.clear();
    const firstConflict = await callHonoCreate('valid-admin-token', { name: 'Original keyed garage', pin: '59182736', idempotencyKey: 'garage-create-conflict-20261010' });
    await firstConflict.json();
    const changed = await callHonoCreate('valid-admin-token', { name: 'Changed keyed garage', pin: '59182737', idempotencyKey: 'garage-create-conflict-20261010' });
    expect(firstConflict.status).toBe(200);
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ success: false });
    expect([...mockDb.records.keys()].filter((path) => /^garages\/[^/]+$/.test(path))).toHaveLength(1);

    mockDb.clear();
    const concurrentBody = { name: 'Concurrent Keyed Garage', pin: '75319486', idempotencyKey: 'garage-create-concurrent-20261010' };
    const concurrent = await Promise.all([
      callHonoCreate('valid-admin-token', concurrentBody),
      callHonoCreate('valid-admin-token', concurrentBody)
    ]);
    const concurrentBodies = await Promise.all(concurrent.map((response) => response.json()));
    expect(concurrent.map((response) => response.status).sort()).toEqual([200, 200]);
    expect(concurrentBodies[0]).toEqual(concurrentBodies[1]);
    expect([...mockDb.records.keys()].filter((path) => /^garages\/[^/]+$/.test(path))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('activity_logs/'))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('idempotency_records/'))).toHaveLength(1);
  });

});

describe('garage update Hono contract', () => {
  const targetId = 'garage-update-parity-target';

  it('applies the Hono allowlist and preserves unrelated fields', async () => {
    const initial = {
      name: 'Before update',
      balance: 12,
      untouchedField: 'preserve-me',
      ownerName: 'Old Owner'
    };
    const allowedFields: Record<string, unknown> = {
      name: 'Synthetic Updated Garage',
      phone: null,
      hourlyRate: 0,
      overnightRate: 55,
      monthlySubscriptionFee: 120,
      billingModel: 'subscription',
      commissionPerVehicle: 5,
      status: 'pending',
      isLocked: true,
      lockReason: null,
      isSuspended: false,
      isMaintenanceMode: true,
      maintenanceMessage: 'Synthetic maintenance window',
      warningDaysThreshold: 4,
      assignedDelegateId: 'synthetic-delegate-id',
      currentSessionId: 'synthetic-session-id',
      hasMonthlySubscribers: true,
      allowMonthlySubscribers: false,
      subscriberFlatFee: 0,
      checkInSound: 'synthetic-check-in',
      checkOutSound: 'synthetic-check-out',
      ownerName: 'Synthetic Owner',
      dailyCapacity: 0,
      capacity: 3,
      shimmerColor: '#abcdef',
      activePackageName: 'Synthetic Package',
      trialDecision: 'approved',
      trialDecisionAt: '2026-10-10T06:00:00.000Z',
      referredByGarageId: 'synthetic-referrer-id',
      referredByGarageName: 'Synthetic Referrer Garage',
      referrerId: 'synthetic-referrer-id',
      referrerName: 'Synthetic Referrer',
      createdByDelegateId: 'synthetic-delegate-id',
      createdByDelegateName: 'Synthetic Delegate',
      balance: 125.5,
      balanceExpiry: '2027-01-02T00:00:00.000Z',
      carsInside: 0
    };
    const requestBody = { id: targetId, ...allowedFields, unapprovedField: 'must-not-be-stored' };

    mockDb.clear();
    mockDb.seed(`garages/${targetId}`, structuredClone(initial));
    const hono = await callHonoGarageUpdate('valid-admin-token', requestBody);
    expect(hono.status).toBe(200);
    expect(await hono.json()).toEqual({ success: true });

    const persisted = structuredClone(mockDb.records.get(`garages/${targetId}`));
    const updatedAt = persisted.updatedAt;
    delete persisted.updatedAt;
    expect(persisted).toEqual({ ...initial, ...allowedFields });
    expect(persisted).not.toHaveProperty('unapprovedField');
    expect(persisted).not.toHaveProperty('id');
    expect(updatedAt instanceof Date).toBe(true);

  });

  it('denies every non-Admin role without changing financial, access, or session fields', async () => {
    const initial = {
      name: 'Synthetic Protected Garage',
      balance: 50,
      balanceExpiry: '2027-02-01T00:00:00.000Z',
      isLocked: false,
      currentSessionId: 'existing-session'
    };
    const roleTokens = [
      'valid-garage-token-reconciliation-test-garage',
      'valid-staff-token-garage-a',
      'valid-delegate-token',
      'valid-worker-token'
    ];

    for (const token of roleTokens) {
      mockDb.seed(`garages/${targetId}`, structuredClone(initial));
      const before = [...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]);
      const body = { id: targetId, balance: 999, isLocked: true, currentSessionId: 'attacker-session' };
      const hono = await callHonoGarageUpdate(token, body);
      if (token === 'valid-worker-token') {
        expect(hono.status).toBe(401);
        expect(await hono.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED', code: 'SESSION_REVOKED', statusCode: 401 });
      } else {
        expect(hono.status).toBe(403);
        expect(await hono.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required', code: 'FORBIDDEN', statusCode: 403 });
      }
      expect([...mockDb.records.entries()]).toEqual(before);
    }
  });

  it('enforces Hono Admin validation, missing-garage, and authorization-order contracts', async () => {
    const honoMissingId = await callHonoGarageUpdate('valid-admin-token', {});
    expect(honoMissingId.status).toBe(400);
    expect(await honoMissingId.json()).toEqual({ success: false, error: 'INVALID_REQUEST' });

    const honoNullBody = await callHonoGarageUpdate('valid-admin-token', null);
    expect(honoNullBody.status).toBe(400);
    expect(await honoNullBody.json()).toEqual({ success: false, error: 'INVALID_REQUEST' });

    const honoMissingGarage = await callHonoGarageUpdate('valid-admin-token', { id: 'missing-update-target', balance: 0 });
    expect(honoMissingGarage.status).toBe(500);
    expect((await honoMissingGarage.json()).error).toContain('Document not found');

    const honoDeniedMissingId = await callHonoGarageUpdate('valid-garage-token-reconciliation-test-garage', {});
    expect(honoDeniedMissingId.status).toBe(403);
    expect(await honoDeniedMissingId.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required', code: 'FORBIDDEN', statusCode: 403 });
  });
});

describe('garage deletion Hono contract', () => {
  const targetId = 'garage-delete-parity-target';
  const rootPath = `garages/${targetId}`;
  const snapshotBusinessRecords = () => new Map(
    [...mockDb.records.entries()]
      .filter(([path]) => !path.startsWith('rate_limits/'))
      .map(([path, data]) => [path, structuredClone(data)])
  );
  const omitTimestamps = (record: Record<string, any>) => {
    const normalized = structuredClone(record);
    for (const key of ['updatedAt', 'startedAt', 'completedAt', 'deletionStartedAt', 'timestamp', 'leaseExpiresAt', 'leaseToken', 'auditLogId']) delete normalized[key];
    return normalized;
  };
  const matchingAuditLogs = () => [...mockDb.records.values()]
    .filter((record) => record.garageId === targetId && record.actionType === 'garage_delete')
    .map(omitTimestamps);
  function seedCompleteDeletionFixture() {
    mockDb.clear();
    mockDb.seed(rootPath, { name: 'Synthetic Garage for Deletion', balance: 250, isDeleting: false });
    for (const collection of ['vehicles', 'subscribers', 'daily_counts', 'daily_stats', 'events', 'projection_buckets']) mockDb.seed(`${rootPath}/${collection}/owned-record`, { garageId: targetId, synthetic: true });
    mockDb.seed('activity_logs/old-owned-log', { garageId: targetId, actionType: 'synthetic_old' });
    mockDb.seed('activity_logs/unrelated-log', { garageId: 'other-garage', actionType: 'preserve' });
    mockDb.seed('recharge_requests/owned-request', { garageId: targetId });
    mockDb.seed('recharge_requests/unrelated-request', { garageId: 'other-garage' });
    mockDb.seed('staff/owned-staff', { garageId: targetId });
    mockDb.seed('staff/unrelated-staff', { garageId: 'other-garage' });
    mockDb.seed('garage_sessions/owned-session', { entityId: targetId });
    mockDb.seed('garage_sessions/unrelated-session', { entityId: 'other-garage' });
    mockDb.seed('private_pins/owned-garage-pin', { entityId: targetId, entityType: 'garages' });
    mockDb.seed('private_pins/same-id-other-type', { entityId: targetId, entityType: 'staff' });
    mockDb.seed('pin_reservations/owned-garage-reservation', { entityId: targetId, entityType: 'garages' });
    mockDb.seed('pin_reservations/same-id-other-type', { entityId: targetId, entityType: 'staff' });
    mockDb.seed('garages/unrelated-garage', { name: 'Preserve unrelated garage' });
    mockDb.seed('garages/unrelated-garage/events/unrelated-event', { synthetic: true });
  }

  it('removes only garage-owned data and completes the audit/job', async () => {
    seedCompleteDeletionFixture();
    const response = await callHonoGarageDelete('valid-admin-token', { garageId: targetId });
    const started = await response.json() as any;
    expect(response.status).toBe(202);
    expect(started).toMatchObject({ success: true, garageId: targetId, status: 'running', processedRecords: 0 });
    const body = await completeHonoGarageDeletion('valid-admin-token', targetId, started.jobToken);
    const job = omitTimestamps(mockDb.records.get(`garage_deletion_jobs/${targetId}`));
    const remainingOwnedPaths = [...mockDb.records.keys()].filter((path) => path.startsWith(`${rootPath}/`));
    const remainingTargetData = [...mockDb.records.entries()].filter(([path, record]) => !path.startsWith('rate_limits/') && !path.startsWith('garage_deletion_jobs/') && record?.garageId === targetId && record?.actionType !== 'garage_delete');
    expect(body).toMatchObject({
      success: true,
      garageId: targetId,
      status: 'completed',
      processedRecords: 12
    });
    expect(remainingOwnedPaths).toEqual([]);
    expect(remainingTargetData).toEqual([]);
    expect(['activity_logs/unrelated-log', 'recharge_requests/unrelated-request', 'staff/unrelated-staff', 'garage_sessions/unrelated-session', 'private_pins/same-id-other-type', 'pin_reservations/same-id-other-type', 'garages/unrelated-garage/events/unrelated-event'].every((path) => mockDb.records.has(path))).toBe(true);
    expect(job).toMatchObject({ garageId: targetId, status: 'completed', startedBy: 'admin-uid', completedBy: 'admin-uid' });
    expect(matchingAuditLogs()).toHaveLength(1);
    expect(matchingAuditLogs()[0]).toMatchObject({ garageId: targetId, actionType: 'garage_delete', details: { deletedByRole: 'admin', deletedByUid: 'admin-uid' } });
  });

  it('enforces the deletion-specific three-start limit and blocks the next delete without writes', async () => {
    const rateLimitPath = `rate_limits/${createHash('sha256').update('garage-delete:admin-uid').digest('hex')}`;
    const now = Date.now();
    seedCompleteDeletionFixture();
    mockDb.seed(rateLimitPath, { count: 3, resetAt: now + 60_000, expiresAt: new Date(now + 60_000) });
    const before = snapshotBusinessRecords();
    const blocked = await callHonoGarageDelete('valid-admin-token', { garageId: targetId });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ success: false, code: 'RATE_LIMIT_EXCEEDED', statusCode: 429 });
    expect(snapshotBusinessRecords()).toEqual(before);
  });

  it('renews the lease across multi-page cleanup and releases it on completion', async () => {
    mockDb.clear();
    mockDb.seed(rootPath, { name: 'Synthetic Multi-Page Garage' });
    for (let index = 0; index < 805; index += 1) mockDb.seed(`${rootPath}/vehicles/vehicle-${String(index).padStart(4, '0')}`, { synthetic: true, index });
    const jobPath = `garage_deletion_jobs/${targetId}`;
    const originalRunTransaction = mockDb.runTransaction.bind(mockDb);
    let leaseRenewals = 0;
    (mockDb as any).runTransaction = async (callback: any) => originalRunTransaction(async (transaction: any) => {
      const originalSet = transaction.set.bind(transaction);
      transaction.set = (ref: any, data: any, options: any) => {
        if (ref.path === jobPath && data.status === 'running' && data.leaseExpiresAt instanceof Date) leaseRenewals += 1;
        return originalSet(ref, data, options);
      };
      return callback(transaction);
    });
    try {
      const response = await callHonoGarageDelete('valid-admin-token', { garageId: targetId });
      expect(response.status).toBe(202);
      const started = await response.json() as any;
      const completed = await completeHonoGarageDeletion('valid-admin-token', targetId, started.jobToken);
      expect(completed.status).toBe('completed');
    }
    finally { (mockDb as any).runTransaction = originalRunTransaction; }
    expect(leaseRenewals).toBe(7);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith(`${rootPath}/vehicles/`))).toHaveLength(0);
    expect(mockDb.records.has(rootPath)).toBe(false);
    expect(mockDb.records.get(jobPath)?.status).toBe('completed');
    expect(mockDb.records.get(jobPath)?.leaseExpiresAt).toBeNull();
  });

  it('resumes an active client-step job and reclaims an expired legacy lease safely', async () => {
    mockDb.clear();
    mockDb.seed(rootPath, { name: 'Synthetic Lease Garage' });
    for (let index = 0; index < 401; index += 1) mockDb.seed(`${rootPath}/vehicles/lease-${String(index).padStart(4, '0')}`, { synthetic: true, index });
    const jobPath = `garage_deletion_jobs/${targetId}`;
    const start = await callHonoGarageDelete('valid-admin-token', { garageId: targetId });
    expect(start.status).toBe(202);
    const started = await start.json() as any;
    const firstStep = await callHonoGarageDeleteStep('valid-admin-token', { garageId: targetId, jobToken: started.jobToken });
    expect(await firstStep.json()).toMatchObject({ status: 'running', processedRecords: 200 });
    const resumed = await callHonoGarageDelete('valid-admin-token', { garageId: targetId });
    expect(resumed.status).toBe(202);
    const resumedBody = await resumed.json() as any;
    expect(resumedBody).toMatchObject({ jobToken: started.jobToken, processedRecords: 200 });
    const completed = await completeHonoGarageDeletion('valid-admin-token', targetId, resumedBody.jobToken);
    expect(completed).toMatchObject({ status: 'completed', processedRecords: 401 });
    expect(mockDb.records.has(rootPath)).toBe(false);
    expect(mockDb.records.get(jobPath)?.leaseExpiresAt).toBeNull();

    mockDb.clear();
    mockDb.seed(rootPath, { name: 'Synthetic Expired Lease Garage' });
    mockDb.seed(`${rootPath}/vehicles/expired-lease-vehicle`, { synthetic: true });
    mockDb.seed(jobPath, { garageId: targetId, garageName: 'Synthetic Expired Lease Garage', auditLogId: 'synthetic-expired-lease-audit', status: 'running', leaseToken: 'synthetic-stale-token', leaseExpiresAt: new Date(Date.now() - 1), updatedAt: new Date(Date.now() - 1), processedRecords: 1 });
    const reclaimed = await callHonoGarageDelete('valid-admin-token', { garageId: targetId });
    expect(reclaimed.status).toBe(202);
    const reclaimedBody = await reclaimed.json() as any;
    expect(reclaimedBody.jobToken).not.toBe('synthetic-stale-token');
    const resumedCompletion = await completeHonoGarageDeletion('valid-admin-token', targetId, reclaimedBody.jobToken);
    expect(resumedCompletion).toMatchObject({ status: 'completed', processedRecords: 2 });
    expect(mockDb.records.has(rootPath)).toBe(false);
    expect(mockDb.records.has(`${rootPath}/vehicles/expired-lease-vehicle`)).toBe(false);
    expect(mockDb.records.get(jobPath)?.status).toBe('completed');
    expect(mockDb.records.get(jobPath)?.leaseExpiresAt).toBeNull();
  });

  it('enforces Admin authorization and validation without writes', async () => {
    seedCompleteDeletionFixture();
    const before = snapshotBusinessRecords();
    const denied = await callHonoGarageDelete('valid-garage-token-reconciliation-test-garage', { garageId: targetId });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required', code: 'FORBIDDEN', statusCode: 403 });
    expect(snapshotBusinessRecords()).toEqual(before);
    expect((await callHonoGarageDelete('valid-admin-token', {})).status).toBe(400);
    expect((await callHonoGarageDelete('valid-admin-token', { garageId: 'invalid/id' })).status).toBe(400);
  });

});
