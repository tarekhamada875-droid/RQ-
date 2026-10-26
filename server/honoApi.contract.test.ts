import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  adminDb: { doc: () => ({ set: async () => undefined }) },
  adminAuth: { verifyIdToken: async () => ({ uid: 'hono-synthetic-user', role: 'admin' }) },
  firebaseConfig: {}
}));

import api from './api';

type ApiResponse = {
  status: number;
  headers: Record<string, string | null>;
  body: unknown;
};

async function honoRequest(path: string, init: RequestInit = {}): Promise<ApiResponse> {
  const response = await api.fetch(new Request(`https://rq.synthetic${path}`, init));
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A plain-text 404 is valid; keep it available to assertions if needed.
  }
  return {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type'),
      'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
      'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
      'x-correlation-id': response.headers.get('x-correlation-id'),
      'x-operation-id': response.headers.get('x-operation-id')
    },
    body
  };
}

const emptyPost: RequestInit = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({})
};

describe('Hono API contracts', () => {
  it('serves public health and version endpoints', async () => {
    expect((await honoRequest('/api/health')).status).toBe(200);
    expect((await honoRequest('/api/version')).status).toBe(200);
  });

  it('requires authentication for protected mutation routes', async () => {
    const paths = [
      '/api/subscribers/add', '/api/subscribers/renew', '/api/subscribers/update', '/api/subscribers/delete',
      '/api/vehicles/check-in', '/api/vehicles/check-out', '/api/auth/verify-pin',
      '/api/auth/check-pin-availability', '/api/auth/verify-admin-pin', '/api/auth/claim-admin-session',
      '/api/auth/release-admin-session', '/api/admin/update-pin'
    ];
    for (const path of paths) {
      expect((await honoRequest(path, emptyPost)).status, path).toBe(401);
    }
  });

  it('requires authentication for session lifecycle and financial report routes', async () => {
    const cases: Array<[string, RequestInit]> = [
      ['/api/auth/sessions', {}],
      ['/api/auth/sessions/session-key', { method: 'DELETE' }],
      ['/api/auth/validate-or-refresh-session', emptyPost],
      ['/api/auth/release-session', emptyPost],
      ['/api/auth/invalidate-all-sessions', emptyPost],
      ['/api/reports/financial', {}]
    ];
    for (const [path, init] of cases) {
      expect((await honoRequest(path, init)).status, path).toBe(401);
    }
  });

  it('does not let the backend operator credential bypass normal route authorization', async () => {
    const originalToken = process.env.BACKEND_OPERATOR_TOKEN;
    process.env.BACKEND_OPERATOR_TOKEN = 'hono-synthetic-operator-token';
    try {
      const init: RequestInit = {
        ...emptyPost,
        headers: {
          'content-type': 'application/json',
          'x-backend-operator-token': 'hono-synthetic-operator-token'
        }
      };
      for (const path of ['/api/subscribers/add', '/api/vehicles/check-in']) {
        const response = await honoRequest(path, init);
        expect(response.status, path).toBe(403);
        expect(response.body).toMatchObject({ success: false });
      }
    } finally {
      if (originalToken === undefined) delete process.env.BACKEND_OPERATOR_TOKEN;
      else process.env.BACKEND_OPERATOR_TOKEN = originalToken;
    }
  });

  it('allows the production frontend and authenticated headers in CORS preflight', async () => {
    const response = await honoRequest('/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://rq-acg.pages.dev',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,x-session-id'
      }
    });
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://rq-acg.pages.dev');
    expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain('x-session-id');
  });

  it('returns request correlation identifiers and keeps unknown routes unavailable', async () => {
    const init: RequestInit = {
      ...emptyPost,
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'hono_error_corr',
        'x-operation-id': 'hono_error_operation'
      }
    };
    const protectedResponse = await honoRequest('/api/subscribers/add', init);
    expect(protectedResponse.status).toBe(401);
    expect(protectedResponse.headers['x-correlation-id']).toBe('hono_error_corr');
    expect(protectedResponse.headers['x-operation-id']).toBe('hono_error_operation');

    const unknownResponse = await honoRequest('/api/hono-not-a-real-route', {
      headers: { 'x-correlation-id': 'hono_not_found_corr', 'x-operation-id': 'hono_not_found_operation' }
    });
    expect(unknownResponse.status).toBe(404);
    expect(unknownResponse.headers['x-correlation-id']).toBe('hono_not_found_corr');
    expect(unknownResponse.headers['x-operation-id']).toBe('hono_not_found_operation');
  });

  it('does not reflect an unapproved website as a trusted CORS origin', async () => {
    const response = await honoRequest('/api/health', {
      method: 'OPTIONS',
      headers: { Origin: 'https://malicious.example' }
    });
    expect(response.headers['access-control-allow-origin']).not.toBe('https://malicious.example');
  });
});
