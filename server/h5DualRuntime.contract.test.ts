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
  it('keeps Hono public health/version while retired Express endpoints return 404', async () => {
    for (const path of ['/api/health', '/api/version']) {
      const [hono, express] = await Promise.all([honoRequest(path), expressRequest(path)]);
      expect(hono.status, `${path}: Hono endpoint`).toBe(200);
      expect(express.status, `${path}: retired Express endpoint`).toBe(404);
    }
    expect((await expressRequest('/api/system-config')).status).toBe(404);
  });

  it('keeps Hono authentication while retired Express mutation routes return 404', async () => {
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
      const [hono, express] = await Promise.all([honoRequest(path, jsonInit), expressRequest(path, jsonInit)]);
      expect(hono.status, `${path}: Hono authentication`).toBe(401);
      expect(express.status, `${path}: retired Express route`).toBe(404);
    }
  });

  it('keeps Hono session lifecycle authentication while retired Express routes return 404', async () => {
    const cases: Array<[string, RequestInit]> = [
      ['/api/auth/sessions', {}],
      ['/api/auth/sessions/session-key', { method: 'DELETE' }],
      ['/api/auth/validate-or-refresh-session', { method: 'POST', body: JSON.stringify({}) }],
      ['/api/auth/release-session', { method: 'POST', body: JSON.stringify({}) }],
      ['/api/auth/invalidate-all-sessions', { method: 'POST', body: JSON.stringify({}) }]
    ];
    for (const [path, init] of cases) {
      const headers = new Headers(init.headers);
      if (init.method === 'POST') headers.set('content-type', 'application/json');
      const normalizedInit = { ...init, headers };
      const [hono, express] = await Promise.all([honoRequest(path, normalizedInit), expressRequest(path, normalizedInit)]);
      expect(hono.status, `${path}: Hono authentication`).toBe(401);
      expect(express.status, `${path}: retired Express route`).toBe(404);
    }
  });

  it('keeps Hono operator-token blocking while retired Express routes return 404', async () => {
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
        expect(hono.status, `${path}: Hono operator policy`).toBe(403);
        expect(express.status, `${path}: retired Express route`).toBe(404);
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

  it('keeps Hono correlation and operation IDs while retired Express routes return 404', async () => {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'h5_error_corr',
        'x-operation-id': 'h5_error_operation'
      },
      body: JSON.stringify({})
    };
    const [hono, express] = await Promise.all([honoRequest('/api/subscribers/add', init), expressRequest('/api/subscribers/add', init)]);

    expect(hono.status).toBe(401);
    expect(express.status).toBe(404);
    expect(hono.headers['x-correlation-id']).toBe('h5_error_corr');
    expect(express.headers['x-correlation-id']).toBe('h5_error_corr');
    expect(hono.headers['x-operation-id']).toBe('h5_error_operation');
    expect(express.headers['x-operation-id']).toBe('h5_error_operation');
  });

  it('documents status/header parity for an unknown route without requiring envelope parity', async () => {
    const init: RequestInit = {
      headers: {
        'x-correlation-id': 'h5_not_found_corr',
        'x-operation-id': 'h5_not_found_operation'
      }
    };
    const [hono, express] = await Promise.all([honoRequest('/api/h5-not-a-real-route', init), expressRequest('/api/h5-not-a-real-route', init)]);

    expect(hono.status).toBe(404);
    expect(express.status).toBe(404);
    expect(hono.headers['x-correlation-id']).toBe('h5_not_found_corr');
    expect(express.headers['x-correlation-id']).toBe('h5_not_found_corr');
    expect(hono.headers['x-operation-id']).toBe('h5_not_found_operation');
    expect(express.headers['x-operation-id']).toBe('h5_not_found_operation');
  });

  it('does not grant CORS access to a disallowed origin', async () => {
    const [hono, express] = await Promise.all([
      honoRequest('/api/health', { method: 'OPTIONS', headers: { origin: 'https://malicious.example' } }),
      expressRequest('/api/health', { method: 'OPTIONS', headers: { origin: 'https://malicious.example' } })
    ]);

    expect(hono.headers['access-control-allow-origin']).not.toBe('https://malicious.example');
    expect(express.headers['access-control-allow-origin']).not.toBe('https://malicious.example');
  });
});
