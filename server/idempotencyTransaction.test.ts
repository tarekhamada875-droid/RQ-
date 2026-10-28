import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ records: new Map<string, any>() }));

vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    doc: (path: string) => ({ path }),
  },
}));

import { checkIdempotencyInTransaction, storeIdempotencyInTransaction } from './idempotency';

function createTransaction() {
  const writes = new Map<string, any>();
  return {
    writes,
    async get(ref: { path: string }) {
      const value = state.records.get(ref.path);
      return { exists: value !== undefined, data: () => value };
    },
    set(ref: { path: string }, value: any) {
      writes.set(ref.path, value);
    },
    commit() {
      for (const [path, value] of writes) state.records.set(path, value);
    },
  };
}

beforeEach(() => state.records.clear());

describe('transaction idempotency protection', () => {
  it('commits one projection-side operation and treats a retry as a duplicate', async () => {
    const first = createTransaction();
    const firstCheck = await checkIdempotencyInTransaction(first, 'retry-key', '/api/vehicles/check-in', 'user-1', 'fingerprint-a');
    expect(firstCheck.isDuplicate).toBe(false);
    storeIdempotencyInTransaction(first, 'retry-key', { success: true, operationId: 'op-1' }, '/api/vehicles/check-in', 'user-1', 'fingerprint-a');
    expect(first.writes).toHaveLength(1);
    first.commit();

    const retry = createTransaction();
    const retryCheck = await checkIdempotencyInTransaction(retry, 'retry-key', '/api/vehicles/check-in', 'user-1', 'fingerprint-a');
    expect(retryCheck).toEqual({ isDuplicate: true, cachedResult: { success: true, operationId: 'op-1' } });
    expect(retry.writes).toHaveLength(0);
  });

  it('does not commit an idempotency record from an aborted transaction attempt', async () => {
    const aborted = createTransaction();
    expect((await checkIdempotencyInTransaction(aborted, 'retry-key', '/api/vehicles/check-in', 'user-1', 'fingerprint-a')).isDuplicate).toBe(false);
    storeIdempotencyInTransaction(aborted, 'retry-key', { success: true }, '/api/vehicles/check-in', 'user-1', 'fingerprint-a');
    expect(aborted.writes).toHaveLength(1);

    const retried = createTransaction();
    expect((await checkIdempotencyInTransaction(retried, 'retry-key', '/api/vehicles/check-in', 'user-1', 'fingerprint-a')).isDuplicate).toBe(false);
    storeIdempotencyInTransaction(retried, 'retry-key', { success: true }, '/api/vehicles/check-in', 'user-1', 'fingerprint-a');
    retried.commit();

    const finalRetry = createTransaction();
    expect((await checkIdempotencyInTransaction(finalRetry, 'retry-key', '/api/vehicles/check-in', 'user-1', 'fingerprint-a')).isDuplicate).toBe(true);
  });

  it('treats an expired key as new without writing during the transaction read phase', async () => {
    const initial = createTransaction();
    storeIdempotencyInTransaction(initial, 'expired-key', { success: true, operationId: 'old-op' }, '/api/vehicles/check-in', 'user-1', 'fingerprint-a');
    initial.commit();
    const recordPath = [...initial.writes.keys()][0];
    state.records.set(recordPath, { ...state.records.get(recordPath), expiresAt: new Date(Date.now() - 1000) });

    const replacement = createTransaction();
    expect(await checkIdempotencyInTransaction(replacement, 'expired-key', '/api/vehicles/check-in', 'user-1', 'fingerprint-a'))
      .toEqual({ isDuplicate: false });
    expect(replacement.writes.size).toBe(0);

    storeIdempotencyInTransaction(replacement, 'expired-key', { success: true, operationId: 'new-op' }, '/api/vehicles/check-in', 'user-1', 'fingerprint-a');
    replacement.commit();
    const retry = createTransaction();
    expect(await checkIdempotencyInTransaction(retry, 'expired-key', '/api/vehicles/check-in', 'user-1', 'fingerprint-a'))
      .toEqual({ isDuplicate: true, cachedResult: { success: true, operationId: 'new-op' } });
  });
});
