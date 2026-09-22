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
  operationId: 'subscriber_delete_1',
  subscriber: {
    id: 'plate_YWJjLTEyMw', garageId: 'garage-1', plate: 'ABC123', status: 'deleted' as const,
    startAt: '2026-09-21T00:00:00.000Z', endAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-09-21T12:00:00.000Z'
  }
};
const body = { idempotencyKey: 'delete-0001' };

async function start(role: 'garage' | 'staff' | 'admin' = 'admin', garageId = 'garage-1', command: SubscriberCommandRepository['delete'] = async (input) => {
  calls.push(input);
  return result;
}): Promise<{ baseUrl: string; calls: unknown[] }> {
  calls = [];
  const subscriberCommands: SubscriberCommandRepository = {
    create: async () => { throw new Error('unused'); }, renew: async () => { throw new Error('unused'); }, update: async () => { throw new Error('unused'); },
    suspend: async () => { throw new Error('unused'); }, cancel: async () => { throw new Error('unused'); }, delete: command
  };
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }),
    subscriberCommands,
    authMiddleware: (request, _response, next) => {
      request.v2Authorization = {
        uid: 'actor-1', sessionId: 'session-1', role,
        ...(role === 'admin' ? {} : { garageId }), delegateGarageIds: []
      };
      next();
    }
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, calls };
}

let calls: unknown[] = [];

async function request(baseUrl: string, pathGarage = 'garage-1', payload: unknown = body): Promise<Response> {
  return fetch(`${baseUrl}/v2/garages/${pathGarage}/subscribers/plate_YWJjLTEyMw/delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
}

describe('v2 subscriber-delete route', () => {
  it('allows an admin and forwards the scoped command', async () => {
    const { baseUrl, calls: forwarded } = await start('admin');
    const response = await request(baseUrl);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: result });
    expect(forwarded[0]).toMatchObject({ garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'actor-1' });
  });

  it.each(['garage', 'staff'] as const)('denies non-admin role %s before repository invocation', async (role) => {
    const { baseUrl, calls: forwarded } = await start(role);
    const response = await request(baseUrl);
    expect(response.status).toBe(403);
    expect(forwarded).toHaveLength(0);
  });

  it('denies cross-garage access for a garage-scoped principal', async () => {
    const { baseUrl, calls: forwarded } = await start('garage', 'garage-1');
    const response = await request(baseUrl, 'garage-2');
    expect(response.status).toBe(403);
    expect(forwarded).toHaveLength(0);
  });

  it('rejects malformed and extra-key request bodies before repository invocation', async () => {
    const { baseUrl, calls: forwarded } = await start('admin');
    expect((await request(baseUrl, 'garage-1', { idempotencyKey: 'short' })).status).toBe(400);
    expect((await request(baseUrl, 'garage-1', { ...body, extra: true })).status).toBe(400);
    expect(forwarded).toHaveLength(0);
  });

  it.each(['SUBSCRIBER_NOT_FOUND', 'SUBSCRIBER_ALREADY_DELETED', 'IDEMPOTENCY_KEY_REUSE'] as const)('maps %s to conflict', async (code) => {
    const { baseUrl } = await start('admin', 'garage-1', async () => { throw new Error(code); });
    const response = await request(baseUrl);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, code: 'CONFLICT', error: code });
  });

  it('is not exposed in production without the preview gate', async () => {
    const subscriberCommands: SubscriberCommandRepository = {
      create: async () => { throw new Error('unused'); }, renew: async () => { throw new Error('unused'); }, update: async () => { throw new Error('unused'); },
      suspend: async () => { throw new Error('unused'); }, cancel: async () => { throw new Error('unused'); }, delete: async () => result
    };
    const app = createV2App({ environment: parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-route-test' }), subscriberCommands });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/subscribers/plate_YWJjLTEyMw/delete`, { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
