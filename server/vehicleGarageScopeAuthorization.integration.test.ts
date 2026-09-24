import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from './middleware';

vi.mock('./firebaseAdmin', () => ({ adminDb: null, adminAuth: null, firebaseConfig: {} }));

vi.mock('./middleware', () => ({
  requireAuth(req: Request, _res: Response, next: NextFunction) {
    const authReq = req as AuthRequest;
    authReq.user = {
      uid: 'test-actor',
      role: req.header('x-test-role') || 'garage',
      garageId: req.header('x-test-no-garage') === 'true'
        ? undefined
        : req.header('x-test-garage-id') || 'garage_1'
    };
    next();
  }
}));

vi.mock('./utils', () => ({ calculateVehicleCost: vi.fn(() => 0) }));
vi.mock('./unlimitedFairUse', () => ({ evaluateFairUseCheckIn: vi.fn() }));
vi.mock('./idempotency', () => ({
  checkIdempotencyInTransaction: vi.fn(),
  createRequestFingerprint: vi.fn(),
  storeIdempotencyInTransaction: vi.fn()
}));
vi.mock('./events', () => ({ recordDomainEventInTransaction: vi.fn() }));

import vehiclesRouter from './routes/vehicles';

const vehicleRoutes = [
  ['/api/vehicles/check-in', { plateNumber: 'ABC 123' }],
  ['/api/vehicles/check-out', { vehicleId: 'vehicle_1' }]
] as const;

let server: Server;
let baseUrl: string;

async function post(
  path: string,
  body: Record<string, unknown>,
  options: { role?: string; garageId?: string; omitSessionGarage?: boolean } = {}
) {
  const url = new URL(path, baseUrl);
  const response = await new Promise<{ status: number; body: string }>((resolveResponse, rejectResponse) => {
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
      'x-test-role': options.role || 'garage'
    };
    if (options.garageId) headers['x-test-garage-id'] = options.garageId;
    if (options.omitSessionGarage) headers['x-test-no-garage'] = 'true';

    const request = httpRequest(url, { method: 'POST', headers }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => resolveResponse({ status: res.statusCode || 0, body: responseBody }));
    });
    request.on('error', rejectResponse);
    request.end(payload);
  });
  return { status: response.status, json: JSON.parse(response.body) as Record<string, unknown> };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/vehicles', vehiclesRouter);
  server = createServer(app);
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
});

describe('vehicle garage-scope authorization routes', () => {
  it.each(vehicleRoutes)('preserves owner/staff scope and rejects cross-garage requests for %s', async (path, baseBody) => {
    for (const role of ['garage', 'staff']) {
      const matchingScope = await post(path, { ...baseBody, garageId: 'garage_1' }, { role, garageId: 'garage_1' });
      expect(matchingScope.status).toBe(500);
      expect(matchingScope.json).toEqual({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const mismatch = await post(path, { ...baseBody, garageId: 'garage_2' }, { role, garageId: 'garage_1' });
      expect(mismatch.status).toBe(403);
      expect(mismatch.json).toEqual({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });

      const missingSessionGarage = await post(path, { ...baseBody, garageId: 'garage_1' }, { role, omitSessionGarage: true });
      expect(missingSessionGarage.status).toBe(403);
      expect(missingSessionGarage.json).toEqual({ success: false, error: 'FORBIDDEN: Garage ID missing in session' });
    }
  });

  it.each(vehicleRoutes)('preserves admin targeting and denies unsupported roles for %s', async (path, baseBody) => {
    const admin = await post(path, { ...baseBody, garageId: 'garage_2' }, { role: 'admin' });
    expect(admin.status).toBe(500);
    expect(admin.json).toEqual({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

    const adminWithoutGarage = await post(path, baseBody, { role: 'admin' });
    expect(adminWithoutGarage.status).toBe(400);
    expect(adminWithoutGarage.json).toEqual({ success: false, error: 'MISSING_PARAMETERS' });

    for (const role of ['delegate', 'supervisor', 'backend-operator']) {
      const denied = await post(path, { ...baseBody, garageId: 'garage_1' }, { role });
      expect(denied.status).toBe(403);
      expect(denied.json).toEqual({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' });
    }
  });
});

export {};
