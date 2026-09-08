import { adminDb } from './firebaseAdmin';

export interface IdempotencyRecord {
  result: any;
  endpoint: string;
  actorUid?: string;
  createdAt: any;
}

/**
 * Reads an idempotency record inside a transaction.
 * Returns cached result if present, or null if key hasn't been processed yet.
 */
export async function checkIdempotencyInTransaction(
  t: any,
  idempotencyKey: string | null
): Promise<{ isDuplicate: boolean; cachedResult?: any }> {
  if (!idempotencyKey || !adminDb) {
    return { isDuplicate: false };
  }

  const keyRef = adminDb.doc(`idempotency_records/${idempotencyKey}`);
  const keySnap = await t.get(keyRef);

  if (keySnap.exists) {
    const data = keySnap.data() || {};
    return {
      isDuplicate: true,
      cachedResult: data.result
    };
  }

  return { isDuplicate: false };
}

/**
 * Stores the idempotency record inside the transaction.
 */
export function storeIdempotencyInTransaction(
  t: any,
  idempotencyKey: string | null,
  result: any,
  endpoint: string,
  actorUid?: string
): void {
  if (!idempotencyKey || !adminDb) return;

  const keyRef = adminDb.doc(`idempotency_records/${idempotencyKey}`);
  t.set(keyRef, {
    result,
    endpoint,
    actorUid: actorUid || 'system',
    createdAt: new Date()
  });
}
