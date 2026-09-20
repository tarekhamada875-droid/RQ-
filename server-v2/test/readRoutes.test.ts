import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import { InMemoryActivityRepository, InMemoryPendingQueueRepository } from '../repositories/readModels.js';

const pending = { id: 'pending-1', garageId: 'garage-1', kind: 'approval' as const, priority: 1, createdAt: '2026-09-20T10:00:00.000Z', status: 'pending' as const };
const activity = { id: 'activity-1', garageId: 'garage-1', type: 'entry', occurredAt: '2026-09-20T10:00:00.000Z', resultCode: 'OK', projectionVersion: 1 };
let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

async function start(environment: 'test' | 'production' = 'test'): Promise<string> {
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: environment, FIREBASE_PROJECT_ID: 'rq-v2-test', V2_PORT: '8081' }),
    pendingQueue: new InMemoryPendingQueueRepository([pending]),
    activity: new InMemoryActivityRepository([activity])
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('v2 read routes', () => {
  it('returns stable envelopes for pending and activity pages', async () => {
    const baseUrl = await start();
    const pendingResponse = await fetch(`${baseUrl}/v2/pending?limit=10`);
    const activityResponse = await fetch(`${baseUrl}/v2/activity?limit=10`);
    expect(pendingResponse.status).toBe(200);
    expect(activityResponse.status).toBe(200);
    expect(await pendingResponse.json()).toMatchObject({ success: true, data: { items: [pending], projectionVersion: 1 } });
    expect(await activityResponse.json()).toMatchObject({ success: true, data: { items: [activity], projectionVersion: 1 } });
  });

  it('rejects invalid page parameters with a stable bad-request envelope', async () => {
    const baseUrl = await start();
    const invalidLimit = await fetch(`${baseUrl}/v2/pending?limit=0`);
    const invalidCursor = await fetch(`${baseUrl}/v2/activity?limit=1&cursor=bad-cursor`);
    expect(invalidLimit.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
    expect(await invalidLimit.json()).toMatchObject({ success: false, code: 'BAD_REQUEST' });
    expect(await invalidCursor.json()).toMatchObject({ success: false, code: 'BAD_REQUEST' });
  });

  it('keeps both read routes disabled in production', async () => {
    const baseUrl = await start('production');
    expect((await fetch(`${baseUrl}/v2/pending`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/v2/activity`)).status).toBe(404);
  });
});
