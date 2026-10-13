import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  logs: [] as any[],
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...parts: unknown[]) => parts),
  collection: vi.fn((...parts: unknown[]) => ({ kind: 'collection', parts })),
  orderBy: vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
  limit: vi.fn((count: number) => ({ kind: 'limit', count })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({ kind: 'where', field, operator, value })),
  Timestamp: { fromDate: vi.fn((date: Date) => date) }
}));

const limitedSnapshot = () => ({ docs: firestoreMocks.logs.slice(0, 200) });

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  onSnapshot: vi.fn((_query, onNext) => {
    onNext(limitedSnapshot());
    return vi.fn();
  }),
  getDocs: vi.fn(async () => limitedSnapshot()),
  orderBy: firestoreMocks.orderBy,
  limit: firestoreMocks.limit,
  Timestamp: firestoreMocks.Timestamp
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../utils/listenerTracker', () => ({ listenerTracker: { register: vi.fn(() => vi.fn()) } }));

import { vehicleService } from './vehicleService';

const makeActivityDoc = (index: number) => ({
  id: `activity-${index}`,
  data: () => ({
    garageId: 'garage-activity-limit-test',
    timestamp: new Date(),
    actionType: 'vehicle_exit',
    totalCost: index
  })
});

describe('daily activity list maximum', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.logs = Array.from({ length: 201 }, (_, index) => makeActivityDoc(index));
  });

  it('applies and returns the documented 200-record cap for both live and one-time queries', async () => {
    const liveResults: any[][] = [];
    const unsubscribe = vehicleService.subscribeToTodayTransactions('garage-activity-limit-test', (logs) => {
      liveResults.push(logs);
    });

    expect(firestoreMocks.limit).toHaveBeenCalledWith(200);
    expect(liveResults).toHaveLength(1);
    expect(liveResults[0]).toHaveLength(200);
    unsubscribe();

    const oneTimeResults = await vehicleService.getTodayTransactionsOnce('garage-activity-limit-test');
    expect(firestoreMocks.limit).toHaveBeenCalledWith(200);
    expect(oneTimeResults).toHaveLength(200);
  });
});
