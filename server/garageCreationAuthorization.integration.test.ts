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
    const user = {
      uid: 'test-actor',
      displayName: 'Test actor',
      role: req.header('x-test-role') || 'garage',
      canCreateGarage: false
    };
    (req as AuthRequest).user = user;
    next();
  },
  correlationMiddleware(_req: Request, _res: Response, next: NextFunction) {
    next();
  },
  requestTimeoutMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  financialRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next()
  };
});

vi.mock('./utils', () => ({
  saveEntityPin: vi.fn(),
  checkPinAvailabilityAcrossAll: vi.fn()
}));
vi.mock('./unlimitedFairUse', () => ({ manualAdminExtendFairUse: vi.fn(), initializeFairUse: vi.fn() }));
vi.mock('./projections', () => ({ calculateDailyProjection: vi.fn() }));
vi.mock('./dashboardSummary', () => ({
  aggregateProjectionBuckets: vi.fn(),
  isFreshDashboardSummary: vi.fn(),
  isValidDateKey: vi.fn(),
  reconcileDashboardSummary: vi.fn()
}));
vi.mock('./summaryTelemetry', () => ({ recordSummaryRead: vi.fn() }));
vi.mock('./operationTrace', () => ({
  operationTraceMiddleware: (_req: Request, _res: Response, next: NextFunction) => next()
}));

let server: Server;
let baseUrl: string;

async function postGarageCreate(role: string, body: Record<string, unknown>) {
  const url = new URL('/api/garages/create', baseUrl);
  const response = await new Promise<{ status: number; body: string }>((resolveResponse, rejectResponse) => {
    const payload = JSON.stringify(body);
    const request = httpRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(payload)),
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
    // The retired Express fallback uses its default HTML 404 response.
  }
  return { status: response.status, json };
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

describe('retired Express garage-create route', () => {
  it('returns 404 for all callers after Hono ownership transfer', async () => {
    const response = await postGarageCreate('admin', { name: 'Retired Express Garage', pin: '12345678' });

    expect(response.status).toBe(404);
  });
});
