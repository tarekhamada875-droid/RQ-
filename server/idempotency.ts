import crypto from 'crypto';
import { adminDb } from './firebaseAdmin';

export interface IdempotencyRecord {
  result: any;
  endpoint: string;
  actorUid?: string;
  createdAt: any;
  expiresAt: any;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Composite key so the same raw client key can never collide across
// endpoints or actors.
function scopedKey(idempotencyKey: string, endpoint: string, actorUid?: string): string {
  const raw = `${endpoint}:${actorUid || 'system'}:${idempotencyKey}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Reads an idempotency record inside a transaction.
 * Returns cached result if present, or null if key hasn't been processed yet.
 */
export async function checkIdempotencyInTransaction(
  t: any,
  idempotencyKey: string | null,
  endpoint: string,
  actorUid?: string
): Promise<{ isDuplicate: boolean; cachedResult?: any }> {
  if (!idempotencyKey || !adminDb) {
    return { isDuplicate: false };
  }

  const docId = scopedKey(idempotencyKey, endpoint, actorUid);
  const keyRef = adminDb.doc(`idempotency_records/${docId}`);
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

  const docId = scopedKey(idempotencyKey, endpoint, actorUid);
  const keyRef = adminDb.doc(`idempotency_records/${docId}`);
  const now = Date.now();
  t.set(keyRef, {
    result,
    endpoint,
    actorUid: actorUid || 'system',
    createdAt: new Date(),
    expiresAt: new Date(now + IDEMPOTENCY_TTL_MS)
  });
}

