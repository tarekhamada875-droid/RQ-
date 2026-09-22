import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import type { GarageProfileUpdateInput, GarageProfileUpdateResult } from '../contracts/garageProfile.js';
import type { GarageProfileManagementRepository } from '../repositories/firestoreGarageProfile.js';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

const result: GarageProfileUpdateResult = {
  garage: {
    id: 'garage-1', name: 'Updated Garage', phone: '+201000000000', dailyCapacity: 80,
    isMaintenanceMode: false, maintenanceMessage: '', warningDaysThreshold: 3,
    checkInSound: 'chime', checkOutSound: 'bell', shimmerColor: '#10b981',
    updatedAt: '2026-09-22T12:00:00.000Z'
  }
};

async function start(role: 'admin' | 'garage' = 'admin', production = false): Promise<{ baseUrl: string; calls: GarageProfileUpdateInput[] }> {
  const calls: GarageProfileUpdateInput[] = [];
  const repository: GarageProfileManagementRepository = {
    update: async (input) => { calls.push(input); return result; }
  };
  const app = createV2App({
    environment: parseEnvironment({
      NODE_ENV: production ? 'production' : 'test', FIREBASE_PROJECT_ID: 'rq-v2-profile-route-test',
      ...(production ? {} : { V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' })
    }),
    garageProfileManagement: repository,
    authMiddleware: (request, _response, next) => {
      request.v2Authorization = {
        uid: 'actor-1', sessionId: 'session-1', role,
        ...(role === 'garage' ? { garageId: 'garage-1' } : {}), delegateGarageIds: []
      };
      next();
    }
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, calls };
}

const post = (baseUrl: string, body: unknown, garageId = 'garage-1') => fetch(`${baseUrl}/v2/garages/${garageId}/profile/update`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

describe('v2 garage profile update route', () => {
  it('forwards a valid partial update only for an authenticated admin', async () => {
    const { baseUrl, calls } = await start();
    const response = await post(baseUrl, { name: 'Updated Garage', dailyCapacity: 80, idempotencyKey: 'profile-0001' });
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ garageId: 'garage-1', actorUid: 'actor-1', name: 'Updated Garage', dailyCapacity: 80, idempotencyKey: 'profile-0001' });
  });

  it.each([{}, { idempotencyKey: 'profile-0002' }, { name: 'Name', idempotencyKey: 'short' }, { name: 'Name', idempotencyKey: 'profile-0003', balanceMinor: 1 }])('rejects malformed, empty, or forbidden request %o', async (body) => {
    const { baseUrl, calls } = await start();
    const response = await post(baseUrl, body);
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('denies non-admin callers before repository execution, including another garage target', async () => {
    const { baseUrl, calls } = await start('garage');
    const response = await post(baseUrl, { name: 'Denied', idempotencyKey: 'profile-0004' }, 'garage-2');
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('does not expose the route in production without both preview gates', async () => {
    const { baseUrl, calls } = await start('admin', true);
    const response = await post(baseUrl, { name: 'Hidden', idempotencyKey: 'profile-0005' });
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('maps repository replay and conflict errors to 409', async () => {
    const calls: GarageProfileUpdateInput[] = [];
    const repository: GarageProfileManagementRepository = {
      update: async (input) => {
        calls.push(input);
        if (calls.length === 1) return result;
        throw new Error(calls[1]?.name === 'Changed' ? 'IDEMPOTENCY_KEY_REUSE' : 'GARAGE_NOT_FOUND');
      }
    };
    const app = createV2App({
      environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-profile-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }),
      garageProfileManagement: repository,
      authMiddleware: (request, _response, next) => { request.v2Authorization = { uid: 'actor-1', sessionId: 'session-1', role: 'admin', delegateGarageIds: [] }; next(); }
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    expect((await post(baseUrl, { name: 'First', idempotencyKey: 'profile-0006' })).status).toBe(200);
    expect((await post(baseUrl, { name: 'Changed', idempotencyKey: 'profile-0006' })).status).toBe(409);
  });
});
