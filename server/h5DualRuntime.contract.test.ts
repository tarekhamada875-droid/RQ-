import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  adminDb: { doc: () => ({ set: async () => undefined }) },
  adminAuth: { verifyIdToken: async () => ({ uid: 'h5-synthetic-user', role: 'admin' }) },
  firebaseConfig: {},
}));
import { app } from './app';
import api from './api';

type RuntimeResponse = {
  status: number;
  headers: Record<string, string | null>;
  body: unknown;
};

let expressServer: ReturnType<typeof app.listen>;
let expressPort = 0;

async function readResponse(response: Response): Promise<RuntimeResponse> {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON response bodies visible to the comparison assertion.
  }
  return {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type'),
      'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
      'x-correlation-id': response.headers.get('x-correlation-id'),
      'x-operation-id': response.headers.get('x-operation-id'),
    },
    body,
  };
}

function comparable(response: RuntimeResponse): unknown {
  const body = response.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { correlationId: _correlationId, operationId: _operationId, timestamp: _timestamp, runtime: _runtime, environment: _environment, version: _version, adminSdk: _adminSdk, ...rest } = body as Record<string, unknown>;
  if (rest.success === false && (rest.code === 'UNAUTHORIZED' || String(rest.error || '').startsWith('UNAUTHORIZED'))) {
    return { success: false, unauthorized: true };
  }
  return rest;
}

async function expressRequest(path: string, init: RequestInit = {}): Promise<RuntimeResponse> {
  return readResponse(await fetch(`http://127.0.0.1:${expressPort}${path}`, init));
}

async function honoRequest(path: string, init: RequestInit = {}): Promise<RuntimeResponse> {
  return readResponse(await api.fetch(new Request(`http://h5.synthetic${path}`, init)));
}

async function compareCase(name: string, path: string, init: RequestInit = {}) {
  const [hono, express] = await Promise.all([
    honoRequest(path, init),
    expressRequest(path, init),
  ]);
  expect(hono.status, `${name}: Hono status`).toBe(express.status);
  expect(comparable(hono), `${name}: response envelope`).toEqual(comparable(express));
  return { hono, express };
}

beforeAll(async () => {
  expressServer = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = expressServer.address();
  expressPort = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => expressServer.close((error) => error ? reject(error) : resolve()));
});

describe('H5 — synthetic Hono and Express runtime comparison', () => {
  it('agrees on public health and records the Express version-route gap', async () => {
    await compareCase('health', '/api/health');
    const [hono, express] = await Promise.all([honoRequest('/api/version'), expressRequest('/api/version')]);
    expect(hono.status).toBe(200);
    expect(express.status).toBe(404);
    expect(hono.body).toMatchObject({ status: 'operational' });
    expect(express.body).toMatchObject({ success: false });
  });

  it('agrees on unauthenticated mutation authorization outcomes', async () => {
    const jsonInit: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    };
    for (const path of [
      '/api/subscribers/add',
      '/api/subscribers/renew',
      '/api/subscribers/update',
      '/api/subscribers/delete',
      '/api/vehicles/check-in',
      '/api/vehicles/check-out',
    ]) {
      await compareCase(`unauthenticated ${path}`, path, jsonInit);
    }
  });

  it('records the current operator-token policy divergence without allowing a synthetic write', async () => {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-backend-operator-token': 'h5-synthetic-operator-token',
      },
      body: JSON.stringify({}),
    };
    process.env.BACKEND_OPERATOR_TOKEN = 'h5-synthetic-operator-token';
    try {
      for (const path of ['/api/subscribers/add', '/api/vehicles/check-in']) {
        const [hono, express] = await Promise.all([honoRequest(path, init), expressRequest(path, init)]);
        // Hono deliberately blocks operator-token mutations (403); Express currently
        // accepts the operator identity and reaches route validation (400). This is
        // a recorded H5 migration finding, not an equivalence claim.
        expect(hono.status, `${path}: Hono operator policy`).toBe(403);
        expect(express.status, `${path}: Express legacy behavior`).toBe(400);
        expect(hono.body).toMatchObject({ success: false });
        expect(express.body).toMatchObject({ success: false });
      }
    } finally {
      delete process.env.BACKEND_OPERATOR_TOKEN;
    }
  });

  it('agrees on allowed CORS preflight behavior', async () => {
    const result = await compareCase('allowed CORS preflight', '/api/health', {
      method: 'OPTIONS',
      headers: { origin: 'https://rq-acg.pages.dev' },
    });
    expect(result.hono.headers['access-control-allow-origin']).toBe('https://rq-acg.pages.dev');
    expect(result.express.headers['access-control-allow-origin']).toBe('https://rq-acg.pages.dev');
  });
});
