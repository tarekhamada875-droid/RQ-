import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { createV2App } from '../app.js';
import type { ProjectionRepository } from '../repositories/firestoreProjection.js';
import type { ProjectionState } from '../contracts/projection.js';
import type { GarageSummaryRepository } from '../repositories/garageSummary.js';
import type { GarageSummary } from '../contracts/summary.js';

let server: Server | undefined;
const asOf = new Date().toISOString();
const summary: GarageSummary = {
  garageId: 'garage-1', dateKey: '2026-09-22', activeVehicleCount: 1, entriesToday: 1, exitsToday: 0,
  grossRevenueMinor: 1000, refundTotalMinor: 0, netRevenueMinor: 1000, projectionVersion: 1, asOf
};
const projection: ProjectionState = { ...summary, appliedEventIds: [] };

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

async function start(options: { enabled?: boolean; currentProjection?: ProjectionState | null; projectionError?: Error; currentSummary?: GarageSummary | null; summaryError?: Error; role?: 'admin' | 'garage'; garageId?: string } = {}) {
  const enabled = options.enabled ?? true;
  const projectionRepository: ProjectionRepository = {
    get: async () => {
      if (options.projectionError) throw options.projectionError;
      return options.currentProjection === undefined ? projection : options.currentProjection;
    },
    applyEvent: async () => projection,
    rebuild: async () => ({ projection, sourceEventCount: 0, replayed: false })
  };
  const summaryRepository: GarageSummaryRepository = {
    getSummary: async () => {
      if (options.summaryError) throw options.summaryError;
      return options.currentSummary === undefined ? summary : options.currentSummary;
    }
  };
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: enabled ? 'test' : 'production', FIREBASE_PROJECT_ID: 'rq-v2-report-route-test', V2_PREVIEW_ENABLED: String(enabled), V2_PREVIEW_AUTH_ENABLED: String(enabled) }),
    projection: projectionRepository,
    garageSummary: summaryRepository,
    authMiddleware: (request, _response, next) => { request.v2Authorization = { uid: 'actor-1', sessionId: 'session-1', role: options.role ?? 'admin', garageId: options.garageId, delegateGarageIds: [] }; next(); }
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

const getReport = (baseUrl: string) => fetch(`${baseUrl}/v2/garages/garage-1/report?date=2026-09-22`);

describe('v2 dashboard report route', () => {
  it('returns a consistency-labeled report without writing', async () => {
    const response = await getReport(await start());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: 'consistent', projectionVersion: 1, differences: { activeVehicleCount: 0 } } });
  });

  it('labels summary/projection mismatches as repair-needed', async () => {
    const response = await getReport(await start({ currentProjection: { ...projection, entriesToday: 2 } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: 'repair_needed', repairReason: 'SUMMARY_PROJECTION_MISMATCH', differences: { entriesToday: 1 } } });
  });

  it('labels an old projection as stale without treating it as a data mismatch', async () => {
    const response = await getReport(await start({ currentProjection: { ...projection, asOf: '2026-09-22T00:00:00.000Z' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: 'repair_needed', repairReason: 'PROJECTION_STALE', differences: { activeVehicleCount: 0 } } });
  });

  it('rejects an invalid report date', async () => {
    const baseUrl = await start({
      currentSummary: summary,
      currentProjection: projection
    });
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/report?date=2026-99-99`);
    expect(response.status).toBe(400);
  });

  it('blocks a report when the projection is missing', async () => {
    const response = await getReport(await start({ currentProjection: null }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, code: 'CONFLICT' });
  });

  it('denies a garage user access to another garage report before repository reads', async () => {
    const baseUrl = await start({ role: 'garage', garageId: 'garage-2', currentSummary: summary });
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/report?date=2026-09-22`);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, code: 'FORBIDDEN' });
  });

  it('redacts dashboard report repository failures', async () => {
    const internalFailure = 'Firestore path projects/rq-v2/databases/(default)/documents/secret-internal';
    const response = await getReport(await start({ summaryError: new Error(internalFailure) }));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR', error: 'Unable to read dashboard report' });
    expect(JSON.stringify(body)).not.toContain(internalFailure);
  });

  it('redacts dashboard report projection failures', async () => {
    const internalFailure = 'Firestore transaction failed at projection secret path';
    const response = await getReport(await start({ projectionError: new Error(internalFailure) }));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR', error: 'Unable to read dashboard report' });
    expect(JSON.stringify(body)).not.toContain(internalFailure);
  });

  it('does not expose the report in production', async () => {
    expect((await getReport(await start({ enabled: false }))).status).toBe(404);
  });
});
