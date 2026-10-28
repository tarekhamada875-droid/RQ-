import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockFirestore } from '../src/__tests__/mockFirestore';
import { claimGarageDeletion, type GarageDeletionRateLimit } from './adapters/garageDeletionAdapter';

const rateLimit: GarageDeletionRateLimit = { actorKey: 'admin-uid', collection: 'rate_limits' };
const rateLimitPath = `rate_limits/${createHash('sha256').update('garage-delete:admin-uid').digest('hex')}`;

describe('garage deletion claim transaction', () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = new MockFirestore();
    db.seed('garages/garage-a', { name: 'Garage A' });
  });

  it('claims the garage and consumes its isolated limit in one 3-read/3-write transaction', async () => {
    const claim = await claimGarageDeletion(db, 'garage-a', 'admin', 'admin-uid', rateLimit);

    expect(claim.kind).toBe('claimed');
    expect(db.documentReadCount).toBe(3);
    expect(db.documentWriteCount).toBe(3);
    expect(db.records.get(rateLimitPath)).toMatchObject({ count: 1 });
  });

  it('returns the existing token for a repeated active start without another limiter read or write', async () => {
    const first = await claimGarageDeletion(db, 'garage-a', 'admin', 'admin-uid', rateLimit);
    db.resetDocumentCounts();

    const second = await claimGarageDeletion(db, 'garage-a', 'admin', 'admin-uid', rateLimit);

    expect(first.kind).toBe('claimed');
    expect(second).toMatchObject({ kind: 'claimed', claimToken: first.kind === 'claimed' ? first.claimToken : '' });
    expect(db.documentReadCount).toBe(2);
    expect(db.documentWriteCount).toBe(0);
    expect(db.records.get(rateLimitPath)).toMatchObject({ count: 1 });
  });

  it('does not spend a deletion slot or write anything when the target does not exist', async () => {
    db.resetDocumentCounts();

    await expect(claimGarageDeletion(db, 'missing-garage', 'admin', 'admin-uid', rateLimit)).resolves.toEqual({ kind: 'not_found' });

    expect(db.documentReadCount).toBe(2);
    expect(db.documentWriteCount).toBe(0);
    expect(db.records.has(rateLimitPath)).toBe(false);
  });

  it('rejects a fourth new start without writing the target garage or a deletion job', async () => {
    const now = Date.now();
    db.seed(rateLimitPath, { count: 3, resetAt: now + 60_000, expiresAt: new Date(now + 60_000) });
    db.seed('garages/garage-b', { name: 'Garage B' });
    db.resetDocumentCounts();

    const result = await claimGarageDeletion(db, 'garage-b', 'admin', 'admin-uid', rateLimit);

    expect(result.kind).toBe('rate_limited');
    expect(result).toMatchObject({ retryAfterSeconds: expect.any(Number) });
    expect(db.documentReadCount).toBe(3);
    expect(db.documentWriteCount).toBe(0);
    expect(db.records.get('garages/garage-b')).not.toHaveProperty('isDeleting');
    expect(db.records.has('garage_deletion_jobs/garage-b')).toBe(false);
  });
});
