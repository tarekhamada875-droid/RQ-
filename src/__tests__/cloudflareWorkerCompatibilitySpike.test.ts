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

describe('CF2 — Cloudflare Worker Runtime Compatibility Spike', () => {
  it('1. Verifies health and version endpoints under worker runtime', async () => {
    const healthRes = await api.fetch(new Request('http://localhost/api/health'));
    expect(healthRes.status).toBe(200);
    const healthBody = await healthRes.json() as any;
    expect(healthBody.status).toBe('ok');
    expect(healthBody.runtime).toBe('cloudflare-worker');

    const versionRes = await api.fetch(new Request('http://localhost/api/version'));
    expect(versionRes.status).toBe(200);
    const versionBody = await versionRes.json() as any;
    expect(versionBody.version).toBe('1.0.0');
    expect(versionBody.status).toBe('operational');
  });

  it('2. Verifies POST /api/test-auth-verify validation and error envelopes', async () => {
    // Missing token
    const missingRes = await api.fetch(new Request('http://localhost/api/test-auth-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }), { ENVIRONMENT: 'preproduction' });
    expect(missingRes.status).toBe(400);
    const missingBody = await missingRes.json() as any;
    expect(missingBody.error).toBe('TOKEN_REQUIRED');

    // Invalid token format
    const invalidRes = await api.fetch(new Request('http://localhost/api/test-auth-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_test_token_format'
      },
      body: JSON.stringify({})
    }), { ENVIRONMENT: 'preproduction' });
    expect(invalidRes.status).toBe(401);
    const invalidBody = await invalidRes.json() as any;
    expect(invalidBody.error).toBe('AUTH_VERIFICATION_FAILED');
  });

  it('3. Verifies spike endpoints are disabled in production environment', async () => {
    const prodRes = await api.fetch(new Request('http://localhost/api/test-auth-verify', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer some_token' }
    }), { ENVIRONMENT: 'production' });
    expect(prodRes.status).toBe(403);
    const prodBody = await prodRes.json() as any;
    expect(prodBody.error).toBe('SPIKE_ENDPOINT_DISABLED_IN_PRODUCTION');

    const prodReadRes = await api.fetch(new Request('http://localhost/api/test-firestore-read'), {
      ENVIRONMENT: 'production'
    });
    expect(prodReadRes.status).toBe(403);

    const prodWriteRes = await api.fetch(new Request('http://localhost/api/test-firestore-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'test' })
    }), { ENVIRONMENT: 'production' });
    expect(prodWriteRes.status).toBe(403);
  });

  it('4. Verifies synthetic Firestore read and write spike endpoints', async () => {
    // Write synthetic document in preproduction
    const writeRes = await api.fetch(new Request('http://localhost/api/test-firestore-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'synthetic_spike_run' })
    }), { ENVIRONMENT: 'preproduction', FIREBASE_DATABASE_ID: 'ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759' });

    // With our mock, it should succeed
    expect(writeRes.status).toBe(200);
    const writeBody = await writeRes.json() as any;
    expect(writeBody.success).toBe(true);
    expect(writeBody.transactionSupported).toBe(true);
    expect(writeBody.path).toContain('_spike_tests/');

    // Read synthetic document in preproduction
    const readRes = await api.fetch(new Request('http://localhost/api/test-firestore-read'), {
      ENVIRONMENT: 'preproduction',
      FIREBASE_DATABASE_ID: 'ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759'
    });
    expect(readRes.status).toBe(200);
    const readBody = await readRes.json() as any;
    expect(readBody.success).toBe(true);
    expect(readBody.runtime).toBe('cloudflare-worker');
  });

  it('5. Verifies concurrent synthetic requests handling', async () => {
    const requests = Array.from({ length: 15 }, (_, i) =>
      api.fetch(new Request(`http://localhost/api/health?req=${i}`))
    );
    const responses = await Promise.all(requests);
    for (const res of responses) {
      expect(res.status).toBe(200);
    }
  });
});
