import { vi, describe, it, expect } from 'vitest';
import { MockFirestore, mockAdminAuth } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { api } from '../../server/api';

describe('CF3 — Cloudflare Worker HTTP Foundation', () => {
  it('1. Verifies correlation ID and operation ID injection in all responses', async () => {
    const res = await api.fetch(new Request('http://localhost/api/health', {
      headers: {
        'x-correlation-id': 'custom_corr_12345',
        'x-operation-id': 'custom_op_67890'
      }
    }));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-correlation-id')).toBe('custom_corr_12345');
    expect(res.headers.get('x-operation-id')).toBe('custom_op_67890');
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(body.runtime).toBe('cloudflare-worker');
  });

  it('2. Automatically generates correlation ID when missing from request', async () => {
    const res = await api.fetch(new Request('http://localhost/api/version'));
    expect(res.status).toBe(200);
    const corrId = res.headers.get('x-correlation-id');
    const opId = res.headers.get('x-operation-id');

    expect(corrId).toBeDefined();
    expect(corrId?.startsWith('corr_')).toBe(true);
    expect(opId).toBeDefined();
    expect(opId?.startsWith('op_')).toBe(true);
  });

  it('3. Serves GET /api/system-config with default fallback or database record', async () => {
    const res = await api.fetch(new Request('http://localhost/api/system-config'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-correlation-id')).toBeDefined();

    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.config).toBeDefined();
    expect(body.config.monthlySubscribersFlatFee).toBeDefined();
  });

  it('4. Enforces authentication on POST /api/admin/update-system-config', async () => {
    // Missing credentials
    const unauthRes = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletNumber: '01000000000' })
    }));

    expect(unauthRes.status).toBe(401);
    const unauthBody = await unauthRes.json() as any;
    expect(unauthBody.success).toBe(false);
    expect(unauthBody.error).toContain('UNAUTHORIZED');
  });

  it('5. Rejects operator token on POST /api/admin/update-system-config but allows valid admin token', async () => {
    const operatorToken = 'test-operator-token-32-chars-long!!';
    
    // 1. Should reject operator token on mutations
    const opRes = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({ warningDaysThreshold: 3 })
    }), { BACKEND_OPERATOR_TOKEN: operatorToken });

    expect(opRes.status).toBe(403);
    const opBody = await opRes.json() as any;
    expect(opBody.success).toBe(false);

    // 2. Should allow valid admin token
    const adminRes = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({ warningDaysThreshold: 3 })
    }), { BACKEND_OPERATOR_TOKEN: operatorToken });

    expect(adminRes.status).toBe(200);
    const adminBody = await adminRes.json() as any;
    expect(adminBody.success).toBe(true);
  });

  it('6. Verifies CORS policy rejects or handles disallowed origins gracefully', async () => {
    // Allowed origin
    const allowedRes = await api.fetch(new Request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://rq-acg.pages.dev',
        'Access-Control-Request-Method': 'GET'
      }
    }));
    expect(allowedRes.status).toBe(204);
    expect(allowedRes.headers.get('access-control-allow-origin')).toBe('https://rq-acg.pages.dev');

    // Disallowed external origin
    const disallowedRes = await api.fetch(new Request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://malicious-website.com',
        'Access-Control-Request-Method': 'GET'
      }
    }));
    expect(disallowedRes.headers.get('access-control-allow-origin')).not.toBe('https://malicious-website.com');
  });
});
