import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminDb, initializeFirebaseAdmin } from './firebaseWorkerAdmin';

describe('Worker Firestore transaction adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('supports collection.add with an auto-generated document ID', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes(':commit')) return new Response('{}', { status: 200 });
      throw new Error(`Unexpected Firestore request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    initializeFirebaseAdmin({
      FIREBASE_PROJECT_ID: 'collection-add-test-project',
      FIREBASE_DATABASE_ID: '(default)',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'collection-add-test-project',
        client_email: 'collection-add-test@example.invalid',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        token_uri: 'https://oauth2.googleapis.com/token'
      })
    });

    const document = await adminDb.collection('packages').add({ name: 'Test package', price: 30 });
    const commit = requests.find((request) => request.url.includes(':commit'));
    const writes = JSON.parse(commit?.body || '{}').writes;

    expect(document.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(writes[0].update.name).toContain(`/documents/packages/${document.id}`);
    expect(writes[0].update.fields).toMatchObject({ name: { stringValue: 'Test package' }, price: { integerValue: '30' } });
  });

  it('returns the transaction callback result after committing writes', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes(':beginTransaction')) {
        return new Response(JSON.stringify({ transaction: 'test-transaction' }), { status: 200 });
      }
      if (url.includes(':commit')) return new Response('{}', { status: 200 });
      throw new Error(`Unexpected Firestore request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    initializeFirebaseAdmin({
      FIREBASE_PROJECT_ID: 'transaction-test-project',
      FIREBASE_DATABASE_ID: '(default)',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'transaction-test-project',
        client_email: 'transaction-test@example.invalid',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        token_uri: 'https://oauth2.googleapis.com/token'
      })
    });

    const result = await adminDb.runTransaction(async (transaction: any) => {
      transaction.set(adminDb.doc('test_records/transaction-result'), { value: 'committed' });
      return { claimToken: 'existing-claim-token', status: 'running' };
    });

    expect(result).toEqual({ claimToken: 'existing-claim-token', status: 'running' });
    expect(urls.some((url) => url.includes(':beginTransaction'))).toBe(true);
    expect(urls.some((url) => url.includes(':commit'))).toBe(true);
  });

  it('retries a transaction after a commit conflict and reruns the callback', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    let transactionCount = 0;
    let commitCount = 0;
    let rollbackCount = 0;
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes(':beginTransaction')) {
        transactionCount += 1;
        return new Response(JSON.stringify({ transaction: `test-transaction-${transactionCount}` }), { status: 200 });
      }
      if (url.includes(':commit')) {
        commitCount += 1;
        if (commitCount === 1) {
          return new Response(JSON.stringify({ error: { code: 409, status: 'ABORTED' } }), { status: 409 });
        }
        return new Response('{}', { status: 200 });
      }
      if (url.includes(':rollback')) {
        rollbackCount += 1;
        return new Response('{}', { status: 200 });
      }
      throw new Error(`Unexpected Firestore request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    initializeFirebaseAdmin({
      FIREBASE_PROJECT_ID: 'transaction-retry-test-project',
      FIREBASE_DATABASE_ID: '(default)',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'transaction-retry-test-project',
        client_email: 'transaction-retry-test@example.invalid',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        token_uri: 'https://oauth2.googleapis.com/token'
      })
    });

    const callback = vi.fn(async (transaction: any) => {
      transaction.set(adminDb.doc('test_records/retry-result'), { value: 'committed' });
      return 'committed';
    });

    await expect(adminDb.runTransaction(callback)).resolves.toBe('committed');
    expect(callback).toHaveBeenCalledTimes(2);
    expect(transactionCount).toBe(2);
    expect(commitCount).toBe(2);
    expect(rollbackCount).toBe(1);
  });

  it('adds an existence precondition to update but not merge-set writes', async () => {
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
      throw new Error(`Unexpected Firestore request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    initializeFirebaseAdmin({
      FIREBASE_PROJECT_ID: 'strict-update-test-project',
      FIREBASE_DATABASE_ID: '(default)',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'strict-update-test-project',
        client_email: 'strict-update-test@example.invalid',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        token_uri: 'https://oauth2.googleapis.com/token'
      })
    });

    await adminDb.doc('test_records/existing').update({ value: 'strict' });
    await adminDb.doc('test_records/merge-create').set({ value: 'merge' }, { merge: true });

    expect(commits).toHaveLength(2);
    expect(commits[0].writes[0].currentDocument).toEqual({ exists: true });
    expect(commits[1].writes[0].currentDocument).toBeUndefined();
    expect(commits[0].writes[0].updateMask.fieldPaths).toEqual(['value']);
    expect(commits[1].writes[0].updateMask.fieldPaths).toEqual(['value']);
  });

  it('serializes stable timestamp and document-reference cursors for paged queries', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes(':runQuery')) return new Response(JSON.stringify([{
        document: {
          name: 'projects/cursor-test-project/databases/(default)/documents/garages/garage-a/events/event-last',
          fields: { occurredAt: { timestampValue: '2026-01-15T12:00:00.000Z' } }
        }
      }]), { status: 200 });
      throw new Error(`Unexpected Firestore request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    initializeFirebaseAdmin({
      FIREBASE_PROJECT_ID: 'cursor-test-project',
      FIREBASE_DATABASE_ID: '(default)',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'cursor-test-project',
        client_email: 'cursor-test@example.invalid',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        token_uri: 'https://oauth2.googleapis.com/token'
      })
    });

    const timestamp = new Date('2026-01-15T12:00:00.000Z');
    const reference = adminDb.doc('garages/garage-a/events/event-last');
    const pageSnapshot = await adminDb.collectionGroup('events')
      .where('occurredAt', '>=', timestamp)
      .orderBy('occurredAt', 'asc')
      .orderBy('__name__', 'asc')
      .limit(250)
      .startAfter(timestamp, reference)
      .get();
    expect(pageSnapshot.docs[0].data()?.occurredAt).toEqual(timestamp);
    expect(pageSnapshot.docs[0].data()?.occurredAt).toBeInstanceOf(Date);

    const request = requests.find((entry) => entry.url.includes(':runQuery'));
    const structuredQuery = JSON.parse(request?.body || '{}').structuredQuery;
    expect(structuredQuery.orderBy).toEqual([
      { field: { fieldPath: 'occurredAt' }, direction: 'ASCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }
    ]);
    expect(structuredQuery.startAt).toEqual({
      values: [
        { timestampValue: timestamp.toISOString() },
        { referenceValue: `projects/cursor-test-project/databases/(default)/documents/garages/garage-a/events/event-last` }
      ],
      before: false
    });
    expect(structuredQuery.limit).toBe(250);
  });
});
