import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { createV2App } from '../app.js';
import type { ProjectionRepository } from '../repositories/firestoreProjection.js';
import type { ProjectionRebuildInput, ProjectionRebuildResult } from '../contracts/projectionRepair.js';

let server: Server | undefined;
afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

const projection: ProjectionRebuildResult = {
  projection: { garageId: 'garage-1', dateKey: '2026-09-22', activeVehicleCount: 0, entriesToday: 1, exitsToday: 1, grossRevenueMinor: 0, refundTotalMinor: 0, netRevenueMinor: 0, projectionVersion: 1, asOf: '2026-09-22T12:00:00.000Z', appliedEventIds: ['entry-1', 'exit-1'] },
  sourceEventCount: 2,
  replayed: false
};

async function start(role: 'admin' | 'garage' = 'admin', enabled = true) {
  const calls: ProjectionRebuildInput[] = [];
  const repository: ProjectionRepository = {
    get: async () => projection.projection,
    applyEvent: async () => projection.projection,
    rebuild: async (input) => { calls.push(input); return projection; }
  };
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: enabled ? 'test' : 'production', FIREBASE_PROJECT_ID: 'rq-v2-repair-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true', V2_PROJECTION_REPAIR_ENABLED: String(enabled) }),
    projection: repository,
    authMiddleware: (request, _response, next) => { request.v2Authorization = { uid: 'actor-1', sessionId: 'session-1', role, delegateGarageIds: [] }; next(); }
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, calls };
}

const body = { dateKey: '2026-09-22', idempotencyKey: 'repair-0001', events: [
  { id: 'entry-1', garageId: 'garage-1', dateKey: '2026-09-22', type: 'entry', occurredAt: '2026-09-22T11:00:00.000Z' },
  { id: 'exit-1', garageId: 'garage-1', dateKey: '2026-09-22', type: 'exit', occurredAt: '2026-09-22T11:01:00.000Z' }
] };

const post = (baseUrl: string, payload: unknown, garageId = 'garage-1') => fetch(`${baseUrl}/v2/garages/${garageId}/projection/rebuild`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

describe('v2 projection repair route', () => {
  it('delegates a valid rebuild only for an authenticated admin when explicitly enabled', async () => {
    const { baseUrl, calls } = await start();
    const response = await post(baseUrl, body);
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ garageId: 'garage-1', actorUid: 'actor-1', idempotencyKey: 'repair-0001', dateKey: '2026-09-22' });
  });

  it('rejects malformed requests before repository execution', async () => {
    const { baseUrl, calls } = await start();
    const response = await post(baseUrl, { dateKey: 'bad', events: [] });
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('denies non-admin callers before repository execution', async () => {
    const { baseUrl, calls } = await start('garage');
    const response = await post(baseUrl, body);
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('does not expose repair in production unless the explicit flag is enabled', async () => {
    const { baseUrl, calls } = await start('admin', false);
    const response = await post(baseUrl, body);
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
