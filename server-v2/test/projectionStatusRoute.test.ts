import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { createV2App } from '../app.js';
import type { ProjectionRepository } from '../repositories/firestoreProjection.js';
import type { ProjectionState } from '../contracts/projection.js';

let server: Server | undefined;
afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

const current: ProjectionState = { garageId: 'garage-1', dateKey: '2026-09-22', activeVehicleCount: 1, entriesToday: 1, exitsToday: 0, grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0, projectionVersion: 1, asOf: new Date().toISOString(), appliedEventIds: [] };
const stale = { ...current, asOf: new Date(Date.now() - 16 * 60 * 1000).toISOString() };

async function start(role: 'admin' | 'garage' = 'admin', enabled = true, projection: ProjectionState | null = current) {
  const repository: ProjectionRepository = { get: async () => projection, applyEvent: async () => current, rebuild: async () => ({ projection: current, sourceEventCount: 0, replayed: false }) };
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: enabled ? 'test' : 'production', FIREBASE_PROJECT_ID: 'rq-v2-status-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true', V2_PROJECTION_STATUS_ENABLED: String(enabled) }),
    projection: repository,
    authMiddleware: (request, _response, next) => { request.v2Authorization = { uid: 'actor-1', sessionId: 'session-1', role, delegateGarageIds: [] }; next(); }
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

const getStatus = (baseUrl: string) => fetch(`${baseUrl}/v2/garages/garage-1/projection/status?date=2026-09-22`);

describe('v2 projection status route', () => {
  it('reports healthy current projections', async () => {
    const baseUrl = await start();
    const response = await getStatus(baseUrl);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { state: 'healthy', garageId: 'garage-1' } });
  });

  it('reports missing projections and denies non-admin access', async () => {
    const missingUrl = await start('admin', true, null);
    const missing = await getStatus(missingUrl);
    expect(missing.status).toBe(200);
    expect(await missing.json()).toMatchObject({ data: { state: 'missing' } });
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    expect((await getStatus(await start('garage'))).status).toBe(403);
  });

  it('reports stale projections without modifying them', async () => {
    const response = await getStatus(await start('admin', true, stale));
    expect(await response.json()).toMatchObject({ data: { state: 'stale' } });
  });

  it('does not expose status in production without the explicit flag', async () => {
    expect((await getStatus(await start('admin', false))).status).toBe(404);
  });
});
