import crypto from 'crypto';
import { adminDb } from './firebaseAdmin';

export interface IdempotencyRecord {
  result: any;
  endpoint: string;
  actorUid?: string;
  requestFingerprint?: string;
  createdAt: any;
  expiresAt: any;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stableValue(value[key]);
      return out;
    }, {} as Record<string, any>);
  }
  return value;
}

export function createRequestFingerprint(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

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
  actorUid?: string,
  requestFingerprint?: string
): Promise<{ isDuplicate: boolean; cachedResult?: any }> {
  if (!idempotencyKey || !adminDb) {
    return { isDuplicate: false };
  }

  const docId = scopedKey(idempotencyKey, endpoint, actorUid);
  const keyRef = adminDb.doc(`idempotency_records/${docId}`);
  const keySnap = await t.get(keyRef);

  if (keySnap.exists) {
    const data = keySnap.data() || {};
    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt || 0);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      t.delete(keyRef);
      return { isDuplicate: false };
    }
    if (requestFingerprint && data.requestFingerprint && data.requestFingerprint !== requestFingerprint) {
      throw new Error('IDEMPOTENCY_KEY_REUSE');
    }
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
  actorUid?: string,
  requestFingerprint?: string
): void {
  if (!idempotencyKey || !adminDb) return;

  const docId = scopedKey(idempotencyKey, endpoint, actorUid);
  const keyRef = adminDb.doc(`idempotency_records/${docId}`);
  const now = Date.now();
  t.set(keyRef, {
    result,
    endpoint,
    actorUid: actorUid || 'system',
    requestFingerprint: requestFingerprint || null,
    createdAt: new Date(),
    expiresAt: new Date(now + IDEMPOTENCY_TTL_MS)
  });
}
