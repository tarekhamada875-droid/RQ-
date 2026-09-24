import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from './middleware';

vi.mock('./firebaseAdmin', () => ({ adminDb: null, adminAuth: null, firebaseConfig: {} }));

vi.mock('./middleware', () => ({
  requireAuth(req: Request, _res: Response, next: NextFunction) {
    (req as AuthRequest).user = {
      uid: req.header('x-test-uid') || 'test-user',
      role: req.header('x-test-role') || 'garage',
      garageId: req.header('x-test-garage-id') || 'garage_1'
    };
    next();
  },
  financialRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next()
}));

vi.mock('./utils', () => ({ saveEntityPin: vi.fn(), checkPinAvailabilityAcrossAll: vi.fn() }));
vi.mock('./unlimitedFairUse', () => ({ manualAdminExtendFairUse: vi.fn(), initializeFairUse: vi.fn() }));
vi.mock('./projections', () => ({ calculateDailyProjection: vi.fn() }));
vi.mock('./dashboardSummary', () => ({
  aggregateProjectionBuckets: vi.fn(),
  isFreshDashboardSummary: vi.fn(),
  isValidDateKey: vi.fn((value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)),
  reconcileDashboardSummary: vi.fn()
}));
vi.mock('./summaryTelemetry', () => ({ recordSummaryRead: vi.fn() }));

import garagesRouter from './routes/garages';

const maintenanceRoutes = [
  ['/api/garages/recalculate-cars-inside', { garageId: 'garage_1' }],
  ['/api/garages/reconciliation', { garageId: 'garage_1' }],
  ['/api/garages/dashboard-summary/rebuild', { garageId: 'garage_1', date: '2026-09-18' }],
  ['/api/garages/rebuild-projections', { garageId: 'garage_1', date: '2026-09-18' }]
] as const;

let server: Server;
let baseUrl: string;

async function post(path: string, role: string, body: Record<string, unknown>) {
  const url = new URL(path, baseUrl);
  const response = await new Promise<{ status: number; body: string }>((resolveResponse, rejectResponse) => {
    const payload = JSON.stringify(body);
    const request = httpRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'x-test-role': role
      }
    }, (res) => {
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
  app.use('/api/garages', garagesRouter);
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

describe('garage reconciliation and projection maintenance authorization routes', () => {
  it.each(maintenanceRoutes)('denies non-admin access to %s', async (path, body) => {
    for (const role of ['garage', 'staff', 'delegate', 'supervisor', 'backend-operator']) {
      const response = await post(path, role, body);

      expect(response.status).toBe(403);
      expect(response.json).toEqual({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
  });

  it.each([
    ['/api/garages/recalculate-cars-inside', { garageId: 'garage_1' }, 400, 'INVALID_REQUEST'],
    ['/api/garages/reconciliation', { garageId: 'garage_1' }, 500, 'ADMIN_SDK_NOT_INITIALIZED'],
    ['/api/garages/dashboard-summary/rebuild', { garageId: 'garage_1', date: '2026-09-18' }, 400, 'INVALID_REQUEST'],
    ['/api/garages/rebuild-projections', { garageId: 'garage_1', date: '2026-09-18' }, 400, 'INVALID_REQUEST']
  ])('allows admins through the authorization gate for %s', async (path, body, expectedStatus, expectedError) => {
    const response = await post(path, 'admin', body);

    expect(response.status).toBe(expectedStatus);
    expect(response.json).toEqual({ success: false, error: expectedError });
  });
});

export {};
