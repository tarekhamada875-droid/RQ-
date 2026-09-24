import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from './middleware';

vi.mock('./firebaseAdmin', () => ({ adminDb: null, adminAuth: null, firebaseConfig: {} }));

vi.mock('./middleware', () => ({
  requireAuth(req: Request, _res: Response, next: NextFunction) {
    (req as AuthRequest).user = {
      uid: 'test-actor',
      role: req.header('x-test-role') || 'garage'
    };
    next();
  },
  sendApiError(res: Response, statusCode: number, code: string, message: string) {
    return res.status(statusCode).json({ success: false, error: code, message });
  }
}));

vi.mock('./financialReporting', () => ({ calculateFinancialReport: vi.fn() }));

import reportsRouter from './routes/reports';

let server: Server;
let baseUrl: string;

async function getFinancialReport(role?: string) {
  const url = new URL('/api/reports/financial', baseUrl);
  const response = await new Promise<{ status: number; body: string }>((resolveResponse, rejectResponse) => {
    const request = httpRequest(url, {
      method: 'GET',
      headers: role ? { 'x-test-role': role } : {}
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => resolveResponse({ status: res.statusCode || 0, body: responseBody }));
    });
    request.on('error', rejectResponse);
    request.end();
  });
  return { status: response.status, json: JSON.parse(response.body) as Record<string, unknown> };
}

beforeAll(async () => {
  const app = express();
  app.use('/api/reports', reportsRouter);
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

describe('financial report authorization route', () => {
  it.each(['garage', 'staff', 'delegate', 'supervisor', 'backend-operator'])('rejects %s before reaching report dependencies', async (role) => {
    const response = await getFinancialReport(role);
    expect(response.status).toBe(403);
    expect(response.json).toEqual({ success: false, error: 'FORBIDDEN', message: 'ADMIN_ONLY' });
  });

  it('rejects a request with no resolved principal', async () => {
    const response = await getFinancialReport();
    expect(response.status).toBe(403);
    expect(response.json).toEqual({ success: false, error: 'FORBIDDEN', message: 'ADMIN_ONLY' });
  });

  it('allows an admin through authorization but does not access Firestore in the test', async () => {
    const response = await getFinancialReport('admin');
    expect(response.status).toBe(500);
    expect(response.json).toEqual({ success: false, error: 'INTERNAL_ERROR', message: 'ADMIN_SDK_NOT_INITIALIZED' });
  });
});
