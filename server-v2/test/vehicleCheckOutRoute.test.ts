import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import type { VehicleCheckOutRepository } from '../repositories/firestoreVehicleCheckOut.js';

let server: Server | undefined;
afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

const result = { operationId: 'vehicle_exit_1', garageId: 'garage-1', vehicleId: 'abc-123', cost: 100, currency: 'EGP' as const };

async function start(role: 'garage' | 'admin' = 'garage'): Promise<{ baseUrl: string; calls: unknown[] }> {
  const calls: unknown[] = [];
  const vehicleCheckOut: VehicleCheckOutRepository = {
    checkOut: async (input) => { calls.push(input); return result; }
  };
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }),
    vehicleCheckOut,
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

describe('v2 vehicle check-out route', () => {
  it('validates and forwards an authenticated check-out', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/vehicles/abc-123/check-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: 'checkout-0001' })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: result });
    expect(calls[0]).toMatchObject({ garageId: 'garage-1', vehicleId: 'abc-123', actorUid: 'staff-1' });
  });

  it('rejects malformed input before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/vehicles/abc-123/check-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'short' })
    });
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects cross-garage access before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-2/vehicles/abc-123/check-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'checkout-0001' })
    });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('allows an admin to target a garage explicitly', async () => {
    const { baseUrl, calls } = await start('admin');
    const response = await fetch(`${baseUrl}/v2/garages/garage-2/vehicles/abc-123/check-out`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'checkout-0001' })
    });
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ garageId: 'garage-2', vehicleId: 'abc-123' });
  });

  it('does not expose the write route without the authenticated preview gate', async () => {
    const app = createV2App({
      environment: parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-route-test' }),
      vehicleCheckOut: { checkOut: async () => result }
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/vehicles/abc-123/check-out`, { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
