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
  operationId: 'subscriber_update_1',
  subscriber: {
    id: 'plate_YWJjLTEyMw', garageId: 'garage-1', plate: 'ABC123', status: 'active' as const,
    startAt: '2026-09-21T00:00:00.000Z', endAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-09-21T12:00:00.000Z'
  }
};

const body = {
  startAt: '2026-09-21T00:00:00.000Z', endAt: '2026-10-21T00:00:00.000Z', ownerName: 'Updated Owner',
  phone: '+201000000000', notes: 'Updated notes', idempotencyKey: 'update-0001'
};

async function start(role: 'garage' | 'admin' = 'garage'): Promise<{ baseUrl: string; calls: unknown[] }> {
  const calls: unknown[] = [];
  const subscriberCommands: SubscriberCommandRepository = {
    create: async () => { throw new Error('unused'); },
    renew: async () => { throw new Error('unused'); },
    update: async (input) => { calls.push(input); return result; },
    suspend: async () => { throw new Error('unused'); }, cancel: async () => { throw new Error('unused'); }
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

describe('v2 subscriber-update route', () => {
  it('validates and forwards an authenticated update', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/subscribers/plate_YWJjLTEyMw/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: result });
    expect(calls[0]).toMatchObject({ garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', ownerName: 'Updated Owner', actorUid: 'staff-1' });
  });

  it('rejects malformed or empty updates before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const malformed = await fetch(`${baseUrl}/v2/garages/garage-1/subscribers/plate_YWJjLTEyMw/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'short' }) });
    expect(malformed.status).toBe(400);
    const empty = await fetch(`${baseUrl}/v2/garages/garage-1/subscribers/plate_YWJjLTEyMw/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'update-0002' }) });
    expect(empty.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects cross-garage access before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-2/subscribers/plate_YWJjLTEyMw/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('allows admin targeting of a garage', async () => {
    const { baseUrl, calls } = await start('admin');
    const response = await fetch(`${baseUrl}/v2/garages/garage-2/subscribers/plate_YWJjLTEyMw/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ garageId: 'garage-2' });
  });

  it('maps not-found, date-range, and idempotency conflicts to 409', async () => {
    const subscriberCommands: SubscriberCommandRepository = {
      create: async () => { throw new Error('unused'); },
      renew: async () => { throw new Error('unused'); },
      update: async () => { throw new Error('SUBSCRIBER_NOT_FOUND'); },
      suspend: async () => { throw new Error('unused'); }, cancel: async () => { throw new Error('unused'); }
    };
    const app = createV2App({ environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }), subscriberCommands, authMiddleware: (request, _response, next) => { request.v2Authorization = { uid: 'staff-1', sessionId: 'session-1', role: 'garage', garageId: 'garage-1', delegateGarageIds: [] }; next(); } });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/subscribers/plate_YWJjLTEyMw/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(409);
  });

  it('does not expose the write route without the authenticated preview gate', async () => {
    const app = createV2App({ environment: parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-route-test' }), subscriberCommands: { create: async () => { throw new Error('unused'); }, renew: async () => { throw new Error('unused'); }, update: async () => result, suspend: async () => { throw new Error('unused'); }, cancel: async () => { throw new Error('unused'); } } });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/subscribers/plate_YWJjLTEyMw/update`, { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
