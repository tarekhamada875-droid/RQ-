import type { Request, Response, NextFunction } from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from './middleware';
import { createApp } from './app';

vi.mock('./firebaseAdmin', () => ({ adminDb: null, adminAuth: null, firebaseConfig: {} }));

vi.mock('./middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./middleware')>();
  return {
  ...actual,
  requireAuth(req: Request, _res: Response, next: NextFunction) {
    (req as AuthRequest).user = {
      uid: req.header('x-test-uid') || 'test-user',
      role: req.header('x-test-role') || 'garage',
      garageId: req.header('x-test-garage-id') || 'garage_1'
    };
    next();
  },
  correlationMiddleware(_req: Request, _res: Response, next: NextFunction) {
    next();
  },
  requestTimeoutMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  financialRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next()
  };
});

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
vi.mock('./operationTrace', () => ({
  operationTraceMiddleware: (_req: Request, _res: Response, next: NextFunction) => next()
}));

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
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(response.body) as Record<string, unknown>;
  } catch {
    // The Express fallback's default 404 response is HTML, not a JSON route envelope.
  }
  return { status: response.status, json, body: response.body };
}

beforeAll(async () => {
  const app = createApp();
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

describe('retired Express projection maintenance route', () => {
  it('returns 404 for Admin and non-Admin callers after Hono ownership transfer', async () => {
    for (const role of ['admin', 'garage', 'staff', 'delegate', 'supervisor', 'backend-operator']) {
      const response = await post('/api/garages/rebuild-projections', role, { garageId: 'garage_1', date: '2026-09-18' });

      expect(response.status).toBe(404);
    }
  });

  it('does not expose the retired reconciliation endpoint on the Express fallback', async () => {
    const response = await post('/api/garages/reconciliation', 'admin', { garageId: 'garage_1' });

    expect(response.status).toBe(404);
  });

  it('does not expose the retired recalculation endpoint on the Express fallback', async () => {
    const response = await post('/api/garages/recalculate-cars-inside', 'admin', { garageId: 'garage_1' });

    expect(response.status).toBe(404);
  });

  it('does not expose the retired dashboard-summary rebuild endpoint on the Express fallback', async () => {
    const response = await post('/api/garages/dashboard-summary/rebuild', 'admin', { garageId: 'garage_1', date: '2026-09-18' });

    expect(response.status).toBe(404);
  });
});

export {};
