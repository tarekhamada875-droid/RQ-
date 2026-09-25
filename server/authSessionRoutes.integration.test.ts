import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRequest } from './middleware';

type StoredDoc = Record<string, unknown>;

const { store, fakeDb } = vi.hoisted(() => {
  const store = new Map<string, StoredDoc>();

  const ref = (path: string) => ({
    path,
    async get() {
      const value = store.get(path);
      return { exists: value !== undefined, data: () => value ? { ...value } : undefined, ref: ref(path) };
    },
    async set(data: StoredDoc, options?: { merge?: boolean }) {
      const current = store.get(path) || {};
      store.set(path, options?.merge ? { ...current, ...data } : { ...data });
    },
    async update(data: StoredDoc) {
      if (!store.has(path)) throw new Error(`MISSING_DOCUMENT:${path}`);
      store.set(path, { ...(store.get(path) || {}), ...data });
    },
    collection(name: string) {
      return collection(`${path}/${name}`);
    }
  });

  const collection = (prefix: string) => ({
    async get() {
      const docs = [...store.entries()]
        .filter(([path]) => path.startsWith(`${prefix}/`) && path.slice(prefix.length + 1).length > 0 && !path.slice(prefix.length + 1).includes('/'))
        .map(([path, data]) => ({ id: path.slice(prefix.length + 1), data: () => ({ ...data }), ref: ref(path) }));
      return { docs };
    }
  });

  return {
    store,
    fakeDb: {
      doc: ref,
      collection,
      batch: () => {
        const operations: Array<() => Promise<void>> = [];
        return {
          set(target: ReturnType<typeof ref>, data: StoredDoc, options?: { merge?: boolean }) {
            operations.push(() => target.set(data, options));
            return this;
          },
          update(target: ReturnType<typeof ref>, data: StoredDoc) {
            operations.push(() => target.update(data));
            return this;
          },
          async commit() {
            for (const operation of operations) await operation();
          }
        };
      }
    }
  };
});

vi.mock('./firebaseAdmin', () => ({ adminDb: fakeDb, adminAuth: {}, firebaseConfig: {} }));
vi.mock('./middleware', () => ({
  requireAuth(req: Request, _res: Response, next: NextFunction) {
    const authReq = req as AuthRequest;
    authReq.user = {
      uid: req.header('x-test-uid') || 'synthetic-user',
      role: req.header('x-test-role') || 'garage',
      entityId: req.header('x-test-entity-id') || 'synthetic-garage',
      sessionId: req.header('x-test-session-id') || 'device-a'
    };
    next();
  },
  requireFirebaseUser(req: Request, _res: Response, next: NextFunction) {
    const authReq = req as AuthRequest;
    authReq.user = {
      uid: req.header('x-test-uid') || 'synthetic-user',
      role: req.header('x-test-role') || 'garage',
      entityId: req.header('x-test-entity-id') || 'synthetic-garage',
      sessionId: req.header('x-test-session-id') || 'device-a'
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

function seed(path: string, data: StoredDoc) {
  store.set(path, { ...data });
}

function doc(path: string) {
  return store.get(path) || {};
}

async function request(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  options: { uid?: string; role?: string; sessionId?: string; body?: StoredDoc } = {}
) {
  const url = new URL(path, baseUrl);
  const payload = options.body ? JSON.stringify(options.body) : '';
  const response = await new Promise<{ status: number; body: string }>((resolveResponse, rejectResponse) => {
    const req = httpRequest(url, {
      method,
      headers: {
        ...(payload ? {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(payload))
        } : {}),
        ...(options.uid ? { 'x-test-uid': options.uid } : {}),
        ...(options.role ? { 'x-test-role': options.role } : {}),
        ...(options.sessionId ? { 'x-test-session-id': options.sessionId } : {})
      }
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { responseBody += chunk; });
      res.on('end', () => resolveResponse({ status: res.statusCode || 0, body: responseBody }));
    });
    req.on('error', rejectResponse);
    req.end(payload);
  });
  return { status: response.status, json: JSON.parse(response.body) as StoredDoc };
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

beforeEach(() => {
  store.clear();
});

describe('synthetic multi-device session routes', () => {
  it('refreshes a valid device session without removing another active device', async () => {
    const now = new Date();
    seed('garage_sessions/synthetic-user', {
      sessionId: 'device-b',
      isActive: true,
      activeSessionIds: ['device-a', 'device-b'],
      lastActive: now
    });
    seed('garage_sessions/synthetic-user/sessions/device-a', {
      sessionId: 'device-a',
      entityId: 'synthetic-garage',
      isActive: true,
      lastActive: now
    });
    seed('garage_sessions/synthetic-user/sessions/device-b', {
      sessionId: 'device-b',
      entityId: 'synthetic-garage',
      isActive: true,
      lastActive: now
    });
    seed('garages/synthetic-garage', {
      currentSessionId: 'device-b',
      activeSessionIds: ['device-a', 'device-b'],
      lastActive: now
    });

    const response = await request('POST', '/api/auth/validate-or-refresh-session', {
      uid: 'synthetic-user',
      role: 'garage',
      sessionId: 'device-a',
      body: { uid: 'synthetic-user', sessionId: 'device-a', role: 'garage', entityId: 'synthetic-garage' }
    });

    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ success: true, valid: true });
    expect(doc('garage_sessions/synthetic-user/sessions/device-a').isActive).toBe(true);
    expect(doc('garage_sessions/synthetic-user/sessions/device-b').isActive).toBe(true);
    expect(doc('garages/synthetic-garage').activeSessionIds).toEqual(['device-a', 'device-b']);
  });

  it('rejects a device missing from the entity active-session marker as revoked', async () => {
    const now = new Date();
    seed('garage_sessions/synthetic-user/sessions/device-a', { sessionId: 'device-a', isActive: true, lastActive: now });
    seed('garage_sessions/synthetic-user', { sessionId: 'device-a', isActive: true, lastActive: now });
    seed('garages/synthetic-garage', { activeSessionIds: ['device-b'], currentSessionId: 'device-b' });

    const response = await request('POST', '/api/auth/validate-or-refresh-session', {
      uid: 'synthetic-user',
      role: 'garage',
      sessionId: 'device-a',
      body: { uid: 'synthetic-user', sessionId: 'device-a', role: 'garage', entityId: 'synthetic-garage' }
    });

    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ success: false, valid: false, code: 'SESSION_REVOKED' });
    expect(doc('garage_sessions/synthetic-user/sessions/device-a').isActive).toBe(false);
  });

  it('expires an inactive device session and marks the root session inactive', async () => {
    seed('garage_sessions/synthetic-user/sessions/device-a', {
      sessionId: 'device-a',
      isActive: true,
      lastActive: new Date(Date.now() - 16 * 60 * 1000)
    });
    seed('garage_sessions/synthetic-user', {
      sessionId: 'device-a',
      isActive: true,
      lastActive: new Date(Date.now() - 16 * 60 * 1000)
    });

    const response = await request('POST', '/api/auth/validate-or-refresh-session', {
      uid: 'synthetic-user',
      role: 'garage',
      sessionId: 'device-a',
      body: { uid: 'synthetic-user', sessionId: 'device-a', role: 'garage', entityId: 'synthetic-garage' }
    });

    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ success: false, valid: false, code: 'SESSION_EXPIRED' });
    expect(doc('garage_sessions/synthetic-user').isActive).toBe(false);
  });

  it('releases only the requested device and preserves the other device', async () => {
    seed('garage_sessions/synthetic-user', {
      sessionId: 'device-b',
      isActive: true,
      activeSessionIds: ['device-a', 'device-b']
    });
    seed('garage_sessions/synthetic-user/sessions/device-a', { sessionId: 'device-a', entityId: 'synthetic-garage', isActive: true });
    seed('garage_sessions/synthetic-user/sessions/device-b', { sessionId: 'device-b', entityId: 'synthetic-garage', isActive: true });
    seed('garages/synthetic-garage', { currentSessionId: 'device-a', activeSessionIds: ['device-a', 'device-b'] });

    const response = await request('POST', '/api/auth/release-session', {
      uid: 'synthetic-user',
      role: 'garage',
      sessionId: 'device-a',
      body: { uid: 'synthetic-user', sessionId: 'device-a', role: 'garage', entityId: 'synthetic-garage' }
    });

    expect(response.status).toBe(200);
    expect(response.json).toEqual({ success: true });
    expect(doc('garage_sessions/synthetic-user/sessions/device-a').isActive).toBe(false);
    expect(doc('garage_sessions/synthetic-user/sessions/device-b').isActive).toBe(true);
    expect(doc('garage_sessions/synthetic-user').activeSessionIds).toEqual(['device-b']);
    expect(doc('garages/synthetic-garage')).toMatchObject({ activeSessionIds: ['device-b'], currentSessionId: 'device-b' });
  });

  it('denies another user from releasing the synthetic user session', async () => {
    const response = await request('POST', '/api/auth/release-session', {
      uid: 'other-user',
      role: 'garage',
      sessionId: 'device-a',
      body: { uid: 'synthetic-user', sessionId: 'device-a', role: 'garage', entityId: 'synthetic-garage' }
    });

    expect(response.status).toBe(403);
    expect(response.json).toMatchObject({ success: false, error: 'FORBIDDEN' });
  });
});
