import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminDb, FieldValue, initializeFirebaseAdmin } from './firebaseWorkerAdmin';

/**
 * Behavior tests for the REST-client surface fixes (audit 2026-11-21):
 * adminDb.getAll, FieldValue.delete, adminAuth.deleteUser.
 *
 * These three were previously MISSING in production (the real Admin SDK
 * provides them, so dev/tests never noticed) and crashed real money flows:
 *   - getAll         → /api/admin/credit-requests always 500'd
 *   - FieldValue.delete → clearing a per-garage credit price always failed
 *   - deleteUser     → staff Firebase Auth accounts were never removed
 */

const FIRESTORE_ROOT = (project: string) => `projects/${project}/databases/(default)/documents`;

function initTestProject(project: string): void {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  initializeFirebaseAdmin({
    FIREBASE_PROJECT_ID: project,
    FIREBASE_DATABASE_ID: '(default)',
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: project,
      client_email: `${project}@example.invalid`,
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      token_uri: 'https://oauth2.googleapis.com/token'
    })
  });
}

describe('FirestoreRest.getAll (audit fix 2026-11-21)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('batch-reads documents and restores caller order, marking missing docs', async () => {
    const project = 'getall-test-project';
    const root = FIRESTORE_ROOT(project);
    const requests: Array<{ url: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes(':batchGet')) {
        // Deliberately out of order + interleaved missing row, as the real
        // API may return. Caller order must still be restored.
        return new Response(JSON.stringify([
          { found: { name: `${root}/garages/g2`, fields: { name: { stringValue: 'Garage Two' }, credits: { integerValue: '9' } } } },
          { missing: `${root}/garages/g3` },
          { found: { name: `${root}/garages/g1`, fields: { name: { stringValue: 'Garage One' }, credits: { integerValue: '5' } } } }
        ]), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    initTestProject(project);

    const snaps = await adminDb.getAll(
      adminDb.doc('garages/g1'),
      adminDb.doc('garages/g2'),
      adminDb.doc('garages/g3')
    );

    expect(snaps).toHaveLength(3);
    expect(snaps[0].exists).toBe(true);
    expect(snaps[0].id).toBe('g1');
    expect(snaps[0].data()).toMatchObject({ name: 'Garage One', credits: 5 });
    expect(snaps[1].exists).toBe(true);
    expect(snaps[1].data()).toMatchObject({ name: 'Garage Two', credits: 9 });
    expect(snaps[2].exists).toBe(false);
    expect(snaps[2].data()).toBeUndefined();

    const batchGet = requests.find((request) => request.url.includes(':batchGet'));
    expect(JSON.parse(batchGet?.body || '{}').documents).toEqual([
      `${root}/garages/g1`,
      `${root}/garages/g2`,
      `${root}/garages/g3`
    ]);
  });

  it('returns an empty array for an empty call and throws a typed error on API failure', async () => {
    const project = 'getall-error-project';
    let failBatchGet = true;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes(':batchGet')) {
        if (failBatchGet) return new Response('{"error":{"code":500}}', { status: 500 });
        return new Response('[]', { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    initTestProject(project);

    expect(await adminDb.getAll()).toEqual([]);
    await expect(adminDb.getAll(adminDb.doc('garages/g1'))).rejects.toThrow('FIRESTORE_GET_FAILED:500');

    failBatchGet = false;
    const snaps = await adminDb.getAll(adminDb.doc('garages/g1'));
    expect(snaps).toHaveLength(1);
    expect(snaps[0].exists).toBe(false); // empty batchGet result → missing doc
  });
});

describe('FieldValue.delete (audit fix 2026-11-21)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('expresses a deleted field as updateMask entry without a written field', async () => {
    const commits: Array<{ writes: any[] }> = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes(':commit')) {
        commits.push(JSON.parse(String(init?.body || '{}')));
        return new Response('{}', { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    initTestProject('deleteop-test-project');

    // The exact production call shape: clearing a garage's per-garage price.
    await adminDb.doc('garages/g1').update({
      creditRateOverride: FieldValue.delete(),
      updatedAt: new Date('2026-11-21T00:00:00.000Z')
    });

    expect(commits).toHaveLength(1);
    const write = commits[0].writes[0];
    expect(write.currentDocument).toEqual({ exists: true });
    // The deleted field must NOT appear in the written fields…
    expect(write.update.fields).not.toHaveProperty('creditRateOverride');
    // …and MUST appear in the mask (absent-from-fields + in-mask = delete).
    expect(write.updateMask.fieldPaths).toContain('creditRateOverride');
    expect(write.updateMask.fieldPaths).toContain('updatedAt');
    expect(write.update.fields.updatedAt).toEqual({ timestampValue: '2026-11-21T00:00:00.000Z' });
  });
});

describe('FirebaseAuthRest.deleteUser (audit fix 2026-11-21)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls the Identity Toolkit accounts:delete endpoint with the uid', async () => {
    const requests: Array<{ url: string; body?: string; auth?: string }> = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      requests.push({
        url,
        body: typeof init?.body === 'string' ? init.body : undefined,
        auth: init?.headers && (init.headers as Record<string, string>).authorization
      });
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes('identitytoolkit.googleapis.com')) {
        return new Response('{}', { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    initTestProject('authdelete-test-project');

    const { adminAuth } = await import('./firebaseWorkerAdmin');
    await (adminAuth as any).deleteUser('uid-to-delete-123');

    const call = requests.find((request) => request.url.includes('identitytoolkit.googleapis.com'));
    expect(call).toBeDefined();
    expect(call?.url).toContain('/projects/authdelete-test-project/accounts:delete');
    expect(JSON.parse(call?.body || '{}')).toEqual({ localId: 'uid-to-delete-123' });
    expect(call?.auth).toBe('Bearer test-access-token');
  });

  it('throws a typed error when the API rejects the delete', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes('identitytoolkit.googleapis.com')) {
        return new Response('{"error":{"code":404}}', { status: 404 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    initTestProject('authdelete-fail-project');

    const { adminAuth } = await import('./firebaseWorkerAdmin');
    await expect((adminAuth as any).deleteUser('uid-missing')).rejects.toThrow('FIREBASE_AUTH_DELETE_FAILED:404');
  });
});

describe('transaction surface contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exposes get/set/update/delete on the transaction object', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes(':beginTransaction')) return new Response(JSON.stringify({ transaction: 't1' }), { status: 200 });
      if (url.includes(':commit')) return new Response('{}', { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    initTestProject('txsurface-test-project');

    await adminDb.runTransaction(async (transaction: any) => {
      for (const method of ['get', 'set', 'update', 'delete']) {
        expect(typeof transaction[method], `transaction.${method} must exist`).toBe('function');
      }
      return 'ok';
    });
  });
});
