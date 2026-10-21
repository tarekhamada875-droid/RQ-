import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  logs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...parts: unknown[]) => parts),
  collection: vi.fn((...parts: unknown[]) => ({ kind: 'collection', parts })),
  orderBy: vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
  limit: vi.fn((count: number) => ({ kind: 'limit', count })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({ kind: 'where', field, operator, value })),
  Timestamp: { fromDate: vi.fn((date: Date) => date) },
  primaryError: null as unknown,
  fallbackError: null as unknown
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  onSnapshot: firestoreMocks.onSnapshot,
  getDocs: firestoreMocks.getDocs,
  orderBy: firestoreMocks.orderBy,
  limit: firestoreMocks.limit,
  Timestamp: firestoreMocks.Timestamp
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../utils/listenerTracker', () => ({ listenerTracker: { register: vi.fn(() => vi.fn()) } }));

import { vehicleService } from './vehicleService';

const hasLimit = (parts: unknown[]) => parts.some((part: any) => part?.kind === 'limit');
const hasDayStartFilter = (parts: unknown[]) => parts.some((part: any) => part?.kind === 'where' && part.field === 'timestamp');
const newestActivityDocs = () => [...firestoreMocks.logs]
  .sort((a, b) => {
    const byTimestamp = (b.data().timestamp as Date).getTime() - (a.data().timestamp as Date).getTime();
    return byTimestamp || a.id.localeCompare(b.id);
  })
  .slice(0, 200);

const makeActivityDoc = (index: number, now: number) => ({
  id: `activity-${String(index).padStart(4, '0')}`,
  data: () => ({
    garageId: 'garage-activity-limit-test',
    timestamp: new Date(now - index * 1000),
    actionType: 'vehicle_exit',
    totalCost: index
  })
});

const missingIndexError = () => Object.assign(new Error('The query requires an index.'), {
  code: 'failed-precondition'
});

const queryPartsFrom = (call: unknown[]) => call[0] as unknown[];

describe('daily activity ordering, fallback, and visible cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const now = Date.now();
    // The returned fallback snapshot is deliberately unordered and much larger than the UI cap.
    firestoreMocks.logs = Array.from({ length: 1000 }, (_, index) => makeActivityDoc(index, now)).reverse();
    firestoreMocks.primaryError = null;
    firestoreMocks.fallbackError = null;

    firestoreMocks.onSnapshot.mockImplementation((parts: unknown[], onNext: (snapshot: any) => void, onError?: (error: unknown) => void) => {
      const isPrimaryQuery = hasDayStartFilter(parts);
      if (isPrimaryQuery && firestoreMocks.primaryError) {
        onError?.(firestoreMocks.primaryError);
        return vi.fn();
      }
      if (!isPrimaryQuery && firestoreMocks.fallbackError) {
        onError?.(firestoreMocks.fallbackError);
        return vi.fn();
      }
      onNext({ docs: hasLimit(parts) ? newestActivityDocs() : firestoreMocks.logs });
      return vi.fn();
    });
    firestoreMocks.getDocs.mockImplementation(async (parts: unknown[]) => {
      const isPrimaryQuery = hasDayStartFilter(parts);
      if (isPrimaryQuery && firestoreMocks.primaryError) throw firestoreMocks.primaryError;
      if (!isPrimaryQuery && firestoreMocks.fallbackError) throw firestoreMocks.fallbackError;
      return { docs: hasLimit(parts) ? newestActivityDocs() : firestoreMocks.logs };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the newest 200 from the indexed live and one-time queries', async () => {
    const liveResults: any[][] = [];
    const unsubscribe = vehicleService.subscribeToTodayTransactions('garage-activity-limit-test', (logs) => {
      liveResults.push(logs);
    });

    expect(firestoreMocks.limit).toHaveBeenCalledWith(200);
    expect(liveResults).toHaveLength(1);
    expect(liveResults[0]).toHaveLength(200);
    expect(liveResults[0][0].id).toBe('activity-0000');
    expect(liveResults[0][199].id).toBe('activity-0199');
    unsubscribe();

    const oneTimeResults = await vehicleService.getTodayTransactionsOnce('garage-activity-limit-test');
    expect(oneTimeResults).toHaveLength(200);
    expect(oneTimeResults[0].id).toBe('activity-0000');
    expect(oneTimeResults[199].id).toBe('activity-0199');
  });

  it('keeps activity history restricted to the current Cairo calendar day', () => {
    const now = Date.now();
    const todayDoc = makeActivityDoc(0, now);
    const priorDayDoc = makeActivityDoc(1, now - 36 * 60 * 60 * 1000);
    const cairoDayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
    expect(cairoDayKey(priorDayDoc.data().timestamp as Date)).not.toBe(cairoDayKey(new Date(now)));
    firestoreMocks.logs = [priorDayDoc, todayDoc];
    const liveResults: any[][] = [];

    const unsubscribe = vehicleService.subscribeToTodayTransactions('garage-activity-limit-test', (logs) => {
      liveResults.push(logs);
    });

    expect(liveResults).toHaveLength(1);
    expect(liveResults[0].map((log) => log.id)).toEqual([todayDoc.id]);
    unsubscribe();
  });

  it('breaks equal-timestamp fallback ties by document ID', () => {
    firestoreMocks.primaryError = missingIndexError();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const timestamp = new Date();
    const tiedLogs = ['z-log', 'a-log'].map((id) => ({
      id,
      data: () => ({ garageId: 'garage-activity-limit-test', timestamp, actionType: 'vehicle_exit' })
    }));
    firestoreMocks.logs = tiedLogs;
    const liveResults: any[][] = [];

    const unsubscribe = vehicleService.subscribeToTodayTransactions('garage-activity-limit-test', (logs) => {
      liveResults.push(logs);
    });

    expect(liveResults[0].map((log) => log.id)).toEqual(['a-log', 'z-log']);
    unsubscribe();
  });

  it('falls back only for a missing index and keeps the live compatibility query bounded', () => {
    firestoreMocks.primaryError = missingIndexError();
    const consoleWarning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deliveries: Array<{ logs: any[]; error?: Error }> = [];

    const unsubscribe = vehicleService.subscribeToTodayTransactions('garage-activity-limit-test', (logs, error) => {
      deliveries.push({ logs, error });
    });

    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(2);
    const fallbackParts = queryPartsFrom(firestoreMocks.onSnapshot.mock.calls[1]);
    expect(hasLimit(fallbackParts)).toBe(true);
    expect(fallbackParts.some((part: any) => part?.kind === 'orderBy' && part.field === 'timestamp' && part.direction === 'desc')).toBe(true);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].error).toBeUndefined();
    expect(deliveries[0].logs).toHaveLength(200);
    expect(deliveries[0].logs[0].id).toBe('activity-0000');
    expect(deliveries[0].logs[199].id).toBe('activity-0199');
    expect(consoleWarning).toHaveBeenCalledWith('[vehicleService] activity_logs_index_fallback', {
      event: 'activity_logs_index_fallback',
      source: 'live',
      code: 'failed-precondition'
    });
    unsubscribe();
  });

  it('uses a bounded newest-first fallback for a one-time missing-index query', async () => {
    firestoreMocks.primaryError = missingIndexError();
    const consoleWarning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logs = await vehicleService.getTodayTransactionsOnce('garage-activity-limit-test');

    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(2);
    const fallbackParts = queryPartsFrom(firestoreMocks.getDocs.mock.calls[1]);
    expect(hasLimit(fallbackParts)).toBe(true);
    expect(fallbackParts.some((part: any) => part?.kind === 'orderBy' && part.field === 'timestamp' && part.direction === 'desc')).toBe(true);
    expect(logs).toHaveLength(200);
    expect(logs[0].id).toBe('activity-0000');
    expect(logs[199].id).toBe('activity-0199');
    expect(consoleWarning).toHaveBeenCalledWith('[vehicleService] activity_logs_index_fallback', {
      event: 'activity_logs_index_fallback',
      source: 'one-shot',
      code: 'failed-precondition'
    });
  });

  it('reports an explicit unavailable error if the live compatibility query also fails', () => {
    firestoreMocks.primaryError = missingIndexError();
    firestoreMocks.fallbackError = Object.assign(new Error('permission denied'), { code: 'permission-denied' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deliveries: Array<{ logs: any[]; error?: Error & { code?: string } }> = [];

    const unsubscribe = vehicleService.subscribeToTodayTransactions('garage-activity-limit-test', (logs, error) => {
      deliveries.push({ logs, error: error as (Error & { code?: string }) | undefined });
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].logs).toEqual([]);
    expect(deliveries[0].error?.code).toBe('ACTIVITY_LOGS_UNAVAILABLE');
    unsubscribe();
  });

  it('does not treat non-index live errors as a reason to run the fallback query', () => {
    firestoreMocks.primaryError = Object.assign(new Error('permission denied'), { code: 'permission-denied' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deliveries: Array<{ logs: any[]; error?: Error & { code?: string } }> = [];

    const unsubscribe = vehicleService.subscribeToTodayTransactions('garage-activity-limit-test', (logs, error) => {
      deliveries.push({ logs, error: error as (Error & { code?: string }) | undefined });
    });

    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(1);
    expect(deliveries[0].logs).toEqual([]);
    expect(deliveries[0].error?.code).toBe('ACTIVITY_LOGS_UNAVAILABLE');
    unsubscribe();
  });

  it('rejects one-time queries explicitly when a non-index failure occurs', async () => {
    firestoreMocks.primaryError = Object.assign(new Error('permission denied'), { code: 'permission-denied' });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(vehicleService.getTodayTransactionsOnce('garage-activity-limit-test'))
      .rejects.toMatchObject({ code: 'ACTIVITY_LOGS_UNAVAILABLE' });
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(1);
  });
});
