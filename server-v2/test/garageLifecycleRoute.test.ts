import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import type { GarageLifecycleRepository } from '../repositories/firestoreGarageLifecycle.js';
import type { GarageLifecycleCommandInput, GarageLifecycleResult } from '../contracts/garageLifecycle.js';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

const baseResult: GarageLifecycleResult = {
  operationId: 'garage_op_1',
  garage: { id: 'garage-1', name: 'Main Garage', isLocked: true, isSuspended: false, updatedAt: '2026-09-21T12:00:00.000Z' }
};

async function start(role: 'admin' | 'garage' = 'admin'): Promise<{ baseUrl: string; calls: Array<GarageLifecycleCommandInput & { operation: 'lock' | 'unlock' | 'suspend' | 'unsuspend' }> }> {
  const calls: Array<GarageLifecycleCommandInput & { operation: 'lock' | 'unlock' | 'suspend' | 'unsuspend' }> = [];
  const run = (operation: 'lock' | 'unlock' | 'suspend' | 'unsuspend') => async (input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult> => {
    calls.push({ ...input, operation });
    return { ...baseResult, garage: { ...baseResult.garage, isLocked: operation === 'lock', isSuspended: operation === 'suspend' } };
  };
  const repository: GarageLifecycleRepository = {
    lock: run('lock'),
    unlock: run('unlock'),
    suspend: run('suspend'),
    unsuspend: run('unsuspend')
  };
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }),
    garageLifecycle: repository,
    authMiddleware: (request, _response, next) => {
      request.v2Authorization = {
        uid: 'actor-1', sessionId: 'session-1', role,
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

describe('v2 garage lifecycle routes', () => {
  it.each(['lock', 'unlock', 'suspend', 'unsuspend'] as const)('forwards authenticated admin %s commands', async (operation) => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/${operation}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: `${operation}-0001` })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(calls[0]).toMatchObject({ operation, garageId: 'garage-1', actorUid: 'actor-1', idempotencyKey: `${operation}-0001` });
  });

  it('rejects malformed input before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/lock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'short' })
    });
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('denies non-admin and cross-tenant callers before repository execution', async () => {
    const { baseUrl, calls } = await start('garage');
    const response = await fetch(`${baseUrl}/v2/garages/garage-2/lock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'lock-0002' })
    });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('does not expose lifecycle commands in production without both preview flags', async () => {
    const repository: GarageLifecycleRepository = { lock: async () => baseResult, unlock: async () => baseResult, suspend: async () => baseResult, unsuspend: async () => baseResult };
    const app = createV2App({ environment: parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-production-test' }), garageLifecycle: repository });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/lock`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'lock-0003' }) });
    expect(response.status).toBe(404);
  });
});
