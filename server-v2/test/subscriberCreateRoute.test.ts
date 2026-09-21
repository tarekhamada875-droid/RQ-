import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import type { SubscriberCommandRepository } from '../repositories/firestoreSubscriberCommands.js';

let server: Server | undefined;
afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

const result = {
  operationId: 'subscriber_create_1',
  subscriber: {
    id: 'plate_YWJjLTEyMw', garageId: 'garage-1', plate: 'ABC123', status: 'active' as const,
    startAt: '2026-09-21T00:00:00.000Z', endAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-09-21T12:00:00.000Z'
  }
};

async function start(role: 'garage' | 'admin' = 'garage'): Promise<{ baseUrl: string; calls: unknown[] }> {
  const calls: unknown[] = [];
  const subscriberCommands: SubscriberCommandRepository = {
    create: async (input) => { calls.push(input); return result; }
  };
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }),
    subscriberCommands,
    authMiddleware: (request, _response, next) => {
      request.v2Authorization = {
        uid: 'staff-1', sessionId: 'session-1', role,
        ...(role === 'garage' ? { garageId: 'garage-1' } : {}),
        delegateGarageIds: []
      };
      next();
    }
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, calls };
}

const body = {
  plate: 'ABC123', plateRaw: 'abc-123',
  startAt: '2026-09-21T00:00:00.000Z', endAt: '2026-10-21T00:00:00.000Z', idempotencyKey: 'subscriber-0001'
};

describe('v2 subscriber-create route', () => {
  it('validates and forwards an authenticated create', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: result });
    expect(calls[0]).toMatchObject({ garageId: 'garage-1', actorUid: 'staff-1', plateRaw: 'abc-123' });
  });

  it('rejects malformed input before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, idempotencyKey: 'short' }) });
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects cross-garage access before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-2/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('maps duplicate and idempotency conflicts to 409', async () => {
    const repository: SubscriberCommandRepository = { create: async () => { throw new Error('SUBSCRIBER_ALREADY_EXISTS'); } };
    const app = createV2App({ environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }), subscriberCommands: repository, authMiddleware: (request, _response, next) => { request.v2Authorization = { uid: 'staff-1', sessionId: 'session-1', role: 'garage', garageId: 'garage-1', delegateGarageIds: [] }; next(); } });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/subscribers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(409);
  });

  it('does not expose the write route without the authenticated preview gate', async () => {
    const app = createV2App({ environment: parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-route-test' }), subscriberCommands: { create: async () => result } });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/subscribers`, { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
