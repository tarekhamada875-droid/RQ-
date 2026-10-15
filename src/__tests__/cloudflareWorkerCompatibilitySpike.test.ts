import { beforeEach, vi, describe, it, expect } from 'vitest';
import { MockFirestore, mockAdminAuth } from './mockFirestore';

const mockDb = new MockFirestore();
const diagnosticToken = '0123456789abcdef0123456789abcdef';
const preproductionEnv = {
  ENVIRONMENT: 'preproduction',
  SPIKE_ENVIRONMENT_ALLOWLIST: 'preproduction',
  SPIKE_DIAGNOSTIC_TOKEN: diagnosticToken
};
const diagnosticHeaders = { 'X-RQ-Diagnostic-Token': diagnosticToken };

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { api } from '../../server/api';

beforeEach(() => mockDb.clear());

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

  it('2. Requires the diagnostic secret separately from the Firebase token', async () => {
    const missingDiagnosticRes = await api.fetch(new Request('http://localhost/api/test-auth-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }), preproductionEnv);
    expect(missingDiagnosticRes.status).toBe(401);
    expect((await missingDiagnosticRes.json() as any).error).toBe('DIAGNOSTIC_CREDENTIAL_REQUIRED');

    const missingFirebaseTokenRes = await api.fetch(new Request('http://localhost/api/test-auth-verify', {
      method: 'POST',
      headers: { ...diagnosticHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }), preproductionEnv);
    expect(missingFirebaseTokenRes.status).toBe(401);
    expect((await missingFirebaseTokenRes.json() as any).error).toBe('TOKEN_REQUIRED');

    const invalidTokenRes = await api.fetch(new Request('http://localhost/api/test-auth-verify', {
      method: 'POST',
      headers: {
        ...diagnosticHeaders,
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_test_token_format'
      },
      body: JSON.stringify({})
    }), preproductionEnv);
    expect(invalidTokenRes.status).toBe(401);
    expect((await invalidTokenRes.json() as any).error).toBe('AUTH_VERIFICATION_FAILED');

    const validTokenRes = await api.fetch(new Request('http://localhost/api/test-auth-verify', {
      method: 'POST',
      headers: {
        ...diagnosticHeaders,
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token'
      },
      body: JSON.stringify({})
    }), preproductionEnv);
    expect(validTokenRes.status).toBe(200);
    expect((await validTokenRes.json() as any).success).toBe(true);
  });

  it('3. Fails closed for production, missing environment, or an unlisted environment', async () => {
    const requests = [
      {
        request: new Request('http://localhost/api/test-auth-verify', {
          method: 'POST', headers: { ...diagnosticHeaders, Authorization: 'Bearer valid-admin-token' }
        }),
        env: { ...preproductionEnv, ENVIRONMENT: 'production', SPIKE_ENVIRONMENT_ALLOWLIST: 'production,preproduction' },
        expectedError: 'SPIKE_ENDPOINT_DISABLED_IN_PRODUCTION'
      },
      {
        request: new Request('http://localhost/api/test-firestore-read', { headers: diagnosticHeaders }),
        env: { ...preproductionEnv, ENVIRONMENT: 'staging' },
        expectedError: 'SPIKE_ENDPOINT_DISABLED'
      },
      {
        request: new Request('http://localhost/api/test-firestore-write', {
          method: 'POST', headers: { ...diagnosticHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: 'synthetic' })
        }),
        env: { SPIKE_ENVIRONMENT_ALLOWLIST: 'preproduction', SPIKE_DIAGNOSTIC_TOKEN: diagnosticToken },
        expectedError: 'SPIKE_ENDPOINT_DISABLED'
      },
      {
        request: new Request('http://localhost/api/test-firestore-read', { headers: diagnosticHeaders }),
        env: { ENVIRONMENT: 'preproduction', SPIKE_DIAGNOSTIC_TOKEN: diagnosticToken },
        expectedError: 'SPIKE_ENDPOINT_DISABLED'
      },
      {
        request: new Request('http://localhost/api/test-firestore-read', { headers: diagnosticHeaders }),
        env: { ENVIRONMENT: 'preproduction', SPIKE_ENVIRONMENT_ALLOWLIST: 'preproduction' },
        expectedError: 'SPIKE_ENDPOINT_DISABLED'
      },
      {
        request: new Request('http://localhost/api/test-firestore-read', { headers: diagnosticHeaders }),
        env: { ENVIRONMENT: 'preproduction', SPIKE_ENVIRONMENT_ALLOWLIST: 'preproduction', SPIKE_DIAGNOSTIC_TOKEN: 'short' },
        expectedError: 'SPIKE_ENDPOINT_DISABLED'
      }
    ];

    for (const { request, env, expectedError } of requests) {
      const response = await api.fetch(request, env);
      expect(response.status).toBe(403);
      expect((await response.json() as any).error).toBe(expectedError);
    }
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('_spike_tests/'))).toHaveLength(0);
  });

  it('4. Rejects missing or wrong credentials without reading or writing synthetic data', async () => {
    mockDb.seed('_spike_tests/synthetic_doc', { synthetic: true });
    mockDb.resetDocumentCounts();

    const unauthorizedRead = await api.fetch(new Request('http://localhost/api/test-firestore-read'), preproductionEnv);
    expect(unauthorizedRead.status).toBe(401);
    const wrongCredentialWrite = await api.fetch(new Request('http://localhost/api/test-firestore-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RQ-Diagnostic-Token': 'wrong-diagnostic-token' },
      body: JSON.stringify({ payload: 'must-not-write' })
    }), preproductionEnv);
    expect(wrongCredentialWrite.status).toBe(403);

    expect(mockDb.documentReadCount).toBe(0);
    expect(mockDb.documentWriteCount).toBe(0);
    expect(mockDb.records.get('_spike_tests/synthetic_doc')).toEqual({ synthetic: true });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('_spike_tests/'))).toEqual(['_spike_tests/synthetic_doc']);
  });

  it('5. Keeps authorized diagnostic reads and writes confined to _spike_tests', async () => {
    mockDb.seed('_spike_tests/synthetic_doc', { synthetic: true, payload: 'read-fixture' });

    const writeRes = await api.fetch(new Request('http://localhost/api/test-firestore-write', {
      method: 'POST',
      headers: { ...diagnosticHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'synthetic_spike_run' })
    }), { ...preproductionEnv, FIREBASE_DATABASE_ID: 'ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759' });

    expect(writeRes.status).toBe(200);
    const writeBody = await writeRes.json() as any;
    expect(writeBody.success).toBe(true);
    expect(writeBody.transactionSupported).toBe(true);
    expect(writeBody.path).toContain('_spike_tests/');
    expect(mockDb.records.get(`_spike_tests/${writeBody.docId}`)).toMatchObject({
      synthetic: true,
      testPayload: 'synthetic_spike_run',
      runtime: 'cloudflare-worker'
    });

    const readRes = await api.fetch(new Request('http://localhost/api/test-firestore-read', {
      headers: diagnosticHeaders
    }), {
      ...preproductionEnv,
      FIREBASE_DATABASE_ID: 'ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759'
    });
    expect(readRes.status).toBe(200);
    const readBody = await readRes.json() as any;
    expect(readBody.success).toBe(true);
    expect(readBody.data).toEqual({ synthetic: true, payload: 'read-fixture' });
    expect(readBody.runtime).toBe('cloudflare-worker');
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('_spike_tests/'))).toHaveLength(2);
  });

  it('6. Enforces both character and serialized-body bounds before writing', async () => {
    const oversizedFieldRes = await api.fetch(new Request('http://localhost/api/test-firestore-write', {
      method: 'POST',
      headers: { ...diagnosticHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(513) })
    }), preproductionEnv);
    expect(oversizedFieldRes.status).toBe(400);
    expect((await oversizedFieldRes.json() as any).error).toBe('INVALID_SPIKE_PAYLOAD');

    const oversizedBodyRes = await api.fetch(new Request('http://localhost/api/test-firestore-write', {
      method: 'POST',
      headers: { ...diagnosticHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'safe', padding: 'x'.repeat(2200) })
    }), preproductionEnv);
    expect(oversizedBodyRes.status).toBe(413);
    expect((await oversizedBodyRes.json() as any).error).toBe('SPIKE_PAYLOAD_TOO_LARGE');
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('_spike_tests/'))).toHaveLength(0);
    expect(mockDb.documentWriteCount).toBe(0);
  });

  it('7. Verifies concurrent synthetic requests handling', async () => {
    const requests = Array.from({ length: 15 }, (_, i) =>
      api.fetch(new Request(`http://localhost/api/health?req=${i}`))
    );
    const responses = await Promise.all(requests);
    for (const res of responses) {
      expect(res.status).toBe(200);
    }
  });
});
