import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminDb, initializeFirebaseAdmin } from './firebaseWorkerAdmin';

describe('Worker Firestore transaction adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

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
});
