import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import type { VehicleCheckInRepository } from '../repositories/firestoreVehicleCheckIn.js';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

const result = {
  operationId: 'vehicle_operation_1',
  vehicle: {
    id: 'abc-123', garageId: 'garage-1', plate: 'ABC123', status: 'inside' as const,
    entryAt: '2026-09-21T10:00:00.000Z', updatedAt: '2026-09-21T10:00:00.000Z'
  },
  carsInside: 1, dailyCount: 1, dailyCapacity: 50
};

async function start(role: 'garage' | 'admin' = 'garage'): Promise<{ baseUrl: string; calls: unknown[] }> {
  const calls: unknown[] = [];
  const vehicleCheckIn: VehicleCheckInRepository = {
    checkIn: async (input) => {
      calls.push(input);
      return result;
    }
  };
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'rq-v2-route-test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }),
    vehicleCheckIn,
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

describe('v2 vehicle check-in route', () => {
  it('validates input, authorizes garage scope, and forwards the authenticated actor', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/vehicles/check-in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate: 'ABC123', plateRaw: 'abc-123', idempotencyKey: 'checkin-0001' })
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: result });
    expect(calls[0]).toMatchObject({ garageId: 'garage-1', actorUid: 'staff-1', plate: 'ABC123', type: 'hourly' });
  });

  it('rejects malformed input before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-1/vehicles/check-in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate: 'A', plateRaw: 'a', idempotencyKey: 'short' })
    });
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects cross-garage access before calling the repository', async () => {
    const { baseUrl, calls } = await start();
    const response = await fetch(`${baseUrl}/v2/garages/garage-2/vehicles/check-in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate: 'ABC123', plateRaw: 'abc-123', idempotencyKey: 'checkin-0001' })
    });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('allows an admin to target a garage explicitly', async () => {
    const { baseUrl, calls } = await start('admin');
    const response = await fetch(`${baseUrl}/v2/garages/garage-2/vehicles/check-in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate: 'ABC123', plateRaw: 'abc-123', idempotencyKey: 'checkin-0001' })
    });
    expect(response.status).toBe(201);
    expect(calls[0]).toMatchObject({ garageId: 'garage-2', actorUid: 'staff-1' });
  });

  it('does not expose the write route when the authenticated preview gate is absent', async () => {
    const app = createV2App({
      environment: parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-route-test' }),
      vehicleCheckIn: { checkIn: async () => result }
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/vehicles/check-in`, { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
