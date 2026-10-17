import { describe, expect, it } from 'vitest';
import { buildFirestorePage, encodeFirestorePageCursor, parseFirestorePageRequest } from './firestorePagination';

describe('Worker Firestore page tokens', () => {
  it('uses the default limit and clamps oversized limits to the maximum', () => {
    expect(parseFirestorePageRequest(undefined, undefined, 'route').pageSize).toBe(50);
    expect(parseFirestorePageRequest('1000', undefined, 'route').pageSize).toBe(100);
    expect(() => parseFirestorePageRequest('0', undefined, 'route')).toThrow('INVALID_PAGE_SIZE');
    expect(() => parseFirestorePageRequest('10.5', undefined, 'route')).toThrow('INVALID_PAGE_SIZE');
  });

  it('round-trips a timestamp cursor bound to its route scope', () => {
    const now = 1_800_000_000_000;
    const token = encodeFirestorePageCursor('admin-garages:admin-1', new Date('2026-10-17T06:00:00.000Z'), 'garage-7', now);
    const page = parseFirestorePageRequest('2', token, 'admin-garages:admin-1', now + 1);
    expect(page.pageSize).toBe(2);
    expect(page.cursor).toEqual({ orderValue: new Date('2026-10-17T06:00:00.000Z'), documentId: 'garage-7' });
    expect(() => parseFirestorePageRequest(undefined, token, 'admin-garages:admin-2', now + 1)).toThrow('INVALID_PAGE_CURSOR');
    expect(() => parseFirestorePageRequest(undefined, token, 'admin-garages:admin-1', now + 30 * 60 * 1000 + 1)).toThrow('INVALID_PAGE_CURSOR');
  });

  it('rejects malformed and oversized cursors', () => {
    expect(() => parseFirestorePageRequest(undefined, 'not-a-token', 'route')).toThrow('INVALID_PAGE_CURSOR');
    expect(() => parseFirestorePageRequest(undefined, 'a'.repeat(5000), 'route')).toThrow('INVALID_PAGE_CURSOR');
  });

  it('returns no cursor unless the sentinel proves another page exists', () => {
    const request = parseFirestorePageRequest('2', undefined, 'route');
    const docs = [
      { id: 'a', data: () => ({ createdAt: new Date('2026-10-17T00:00:00Z') }) },
      { id: 'b', data: () => ({ createdAt: new Date('2026-10-16T00:00:00Z') }) },
      { id: 'c', data: () => ({ createdAt: new Date('2026-10-15T00:00:00Z') }) }
    ];
    const page = buildFirestorePage(docs, request, 'createdAt');
    expect(page.documents.map((doc) => doc.id)).toEqual(['a', 'b']);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
    const final = buildFirestorePage(docs.slice(0, 2), request, 'createdAt');
    expect(final.hasMore).toBe(false);
    expect(final.nextCursor).toBeNull();
  });
});
