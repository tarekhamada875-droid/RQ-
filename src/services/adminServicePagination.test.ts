import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  firstPage: [] as any[],
  nextPage: [] as any[],
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...parts: unknown[]) => parts),
  collection: vi.fn((...parts: unknown[]) => ({ kind: 'collection', parts })),
  orderBy: vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
  limit: vi.fn((count: number) => ({ kind: 'limit', count })),
  startAfter: vi.fn((cursor: unknown) => ({ kind: 'startAfter', cursor })),
  where: vi.fn(),
  doc: vi.fn(),
  Timestamp: { fromDate: vi.fn((date: Date) => date) }
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  onSnapshot: vi.fn((_query, onNext) => {
    onNext({ docs: firestoreMocks.firstPage });
    return vi.fn();
  }),
  doc: firestoreMocks.doc,
  getDocs: vi.fn(async () => ({ docs: firestoreMocks.nextPage })),
  orderBy: firestoreMocks.orderBy,
  limit: firestoreMocks.limit,
  startAfter: firestoreMocks.startAfter,
  Timestamp: firestoreMocks.Timestamp
}));

vi.mock('../firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn((error) => { throw error; }),
  OperationType: { LIST: 'LIST' }
}));

vi.mock('../utils/listenerTracker', () => ({ listenerTracker: { register: vi.fn(() => vi.fn()) } }));

import { adminService } from './adminService';

const makeSubscriberDoc = (index: number) => ({
  id: `subscriber-${index}`,
  data: () => ({
    plateNumber: `plate-${index}`,
    plateNumberRaw: `plate-${index}`,
    ownerName: `Subscriber ${index}`,
    phone: `0100000${index}`,
    startDate: '2026-10-01',
    endDate: '2026-11-01',
    garageId: 'garage-pagination-test',
    createdAt: new Date(2026, 9, 13, 0, 0, 60 - index)
  })
});

describe('subscriber list cursor pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.firstPage = Array.from({ length: 51 }, (_, index) => makeSubscriberDoc(index));
    firestoreMocks.nextPage = [makeSubscriberDoc(50), makeSubscriberDoc(51)];
  });

  it('returns the first 50 from a live listener and loads subsequent records after its cursor', async () => {
    const onFirstPage = vi.fn();
    const unsubscribe = adminService.subscribeToSubscribers('garage-pagination-test', onFirstPage);

    expect(onFirstPage).toHaveBeenCalledOnce();
    const [firstPage, firstPageInfo] = onFirstPage.mock.calls[0];
    expect(firstPage).toHaveLength(50);
    expect(firstPage[0].id).toBe('subscriber-0');
    expect(firstPageInfo).toMatchObject({ lastDoc: firestoreMocks.firstPage[49], hasMore: true });
    expect(firestoreMocks.limit).toHaveBeenLastCalledWith(51);

    const nextPage = await adminService.getMoreSubscribers('garage-pagination-test', firstPageInfo.lastDoc);
    expect(firestoreMocks.startAfter).toHaveBeenCalledWith(firstPageInfo.lastDoc);
    expect(firestoreMocks.limit).toHaveBeenLastCalledWith(51);
    expect(nextPage.subscribers.map(({ id }) => id)).toEqual(['subscriber-50', 'subscriber-51']);
    expect(nextPage.hasMore).toBe(false);
    expect(nextPage.lastDoc).toBe(firestoreMocks.nextPage[1]);

    unsubscribe();
  });
});
