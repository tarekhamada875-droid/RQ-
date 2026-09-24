import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from './middleware';

vi.mock('./firebaseAdmin', () => ({ adminDb: null, adminAuth: null, firebaseConfig: {} }));

vi.mock('./middleware', () => ({
  requireAuth(req: Request, _res: Response, next: NextFunction) {
    (req as AuthRequest).user = {
      uid: req.header('x-test-uid') || 'test-user',
      role: req.header('x-test-role') || 'garage'
    };
    next();
  },
  requireFirebaseUser(req: Request, _res: Response, next: NextFunction) {
    (req as AuthRequest).user = {
      uid: req.header('x-test-uid') || 'test-user',
      role: req.header('x-test-role') || 'garage'
    };
    next();
  },
  financialRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  sendApiError(res: Response, statusCode: number, code: string, message: string) {
    return res.status(statusCode).json({ success: false, error: code, message });
  }
}));

vi.mock('./utils', () => ({
  cleanPin: vi.fn(),
  verifyPinMatch: vi.fn(),
  verifyDocMatch: vi.fn(),
  saveEntityPin: vi.fn(),
  migratePinToHash: vi.fn(),
  checkRateLimit: vi.fn(),
  resetRateLimit: vi.fn(),
  getAdminPin: vi.fn(),
  queryAccountWherePin: vi.fn(),
  queryDelegatesWherePhone: vi.fn(),
  checkPinAvailabilityAcrossAll: vi.fn()
}));

import { registerAuthRoutes } from './routes/auth';

let server: Server;
let baseUrl: string;

async function post(path: string, role: string, body: Record<string, unknown> = {}) {
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
  const router = express.Router();
  registerAuthRoutes(router);
  app.use(router);
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

describe('admin maintenance authorization routes', () => {
  it.each(['garage', 'staff', 'delegate', 'supervisor'])('denies %s from global session invalidation', async (role) => {
    const response = await post('/api/auth/invalidate-all-sessions', role);

    expect(response.status).toBe(403);
    expect(response.json).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required' });
  });

  it('allows an admin through the session-invalidation gate to the existing SDK availability check', async () => {
    const response = await post('/api/auth/invalidate-all-sessions', 'admin');

    expect(response.status).toBe(503);
    expect(response.json).toEqual({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
  });

  it.each(['garage', 'staff', 'delegate', 'supervisor'])('denies %s from changing the admin PIN', async (role) => {
    const response = await post('/api/admin/update-pin', role, { currentPin: '12345678', newPin: '23456789' });

    expect(response.status).toBe(403);
    expect(response.json).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required' });
  });

  it('allows an admin through the PIN-update gate to the existing current-PIN validation', async () => {
    const response = await post('/api/admin/update-pin', 'admin', { newPin: '23456789' });

    expect(response.status).toBe(400);
    expect(response.json).toMatchObject({ success: false, error: 'CURRENT_PIN_REQUIRED' });
  });
});

export {};
