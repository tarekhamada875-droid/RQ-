import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  collection: vi.fn((...parts: unknown[]) => ({ kind: 'collection', parts })),
  query: vi.fn((...parts: unknown[]) => ({ kind: 'query', parts })),
  where: vi.fn((...parts: unknown[]) => ({ kind: 'where', parts })),
  limit: vi.fn((count: number) => ({ kind: 'limit', count })),
  doc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  startAfter: vi.fn(),
  Timestamp: { fromDate: vi.fn((date: Date) => date) }
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  onSnapshot: firestoreMocks.onSnapshot,
  doc: firestoreMocks.doc,
  getDocs: firestoreMocks.getDocs,
  orderBy: firestoreMocks.orderBy,
  limit: firestoreMocks.limit,
  startAfter: firestoreMocks.startAfter,
  Timestamp: firestoreMocks.Timestamp
}));

vi.mock('../firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' }
}));
vi.mock('../api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('../types/apiContracts', () => ({ generateIdempotencyKey: vi.fn(() => 'test-idempotency-key') }));
vi.mock('../utils', () => ({
  safeDate: (value: unknown) => value instanceof Date ? value : new Date(value as string | number)
}));

import { adminService } from './adminService';
import { listenerTracker } from '../utils/listenerTracker';

describe('adminService.subscribeToGarageRechargeLogs cleanup (FE-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.onSnapshot.mockReset();
    listenerTracker.reset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    listenerTracker.reset();
    vi.restoreAllMocks();
  });

  it('cleans up both subscriptions and ignores fallback emissions after close', () => {
    const primaryUnsub = vi.fn();
    const fallbackUnsub = vi.fn();
    const callback = vi.fn();
    let failPrimary: ((error: Error) => void) | undefined;
    let emitFallback: ((snapshot: { docs: unknown[] }) => void) | undefined;

    firestoreMocks.onSnapshot
      .mockImplementationOnce((_query, _onNext, onError) => {
        failPrimary = onError;
        return primaryUnsub;
      })
      .mockImplementationOnce((_query, onNext) => {
        emitFallback = onNext;
        return fallbackUnsub;
      });

    const unsubscribe = adminService.subscribeToGarageRechargeLogs('garage-1', callback);
    expect(listenerTracker.getActiveListenerCount()).toBe(1);

    failPrimary?.(new Error('missing composite index'));

    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(2);
    expect(firestoreMocks.limit).toHaveBeenNthCalledWith(1, 50);
    expect(firestoreMocks.limit).toHaveBeenNthCalledWith(2, 100);
    expect(listenerTracker.getActiveListenerCount()).toBe(1);

    unsubscribe();
    unsubscribe();
    emitFallback?.({ docs: [] });

    expect(primaryUnsub).toHaveBeenCalledTimes(1);
    expect(fallbackUnsub).toHaveBeenCalledTimes(1);
    expect(listenerTracker.getActiveListenerCount()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('leaves zero listeners through 20 forced-index-error open/close cycles', () => {
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const primaryUnsub = vi.fn();
      const fallbackUnsub = vi.fn();
      const callback = vi.fn();
      let failPrimary: ((error: Error) => void) | undefined;
      let emitFallback: ((snapshot: { docs: unknown[] }) => void) | undefined;

      firestoreMocks.onSnapshot
        .mockImplementationOnce((_query, _onNext, onError) => {
          failPrimary = onError;
          return primaryUnsub;
        })
        .mockImplementationOnce((_query, onNext) => {
          emitFallback = onNext;
          return fallbackUnsub;
        });

      const unsubscribe = adminService.subscribeToGarageRechargeLogs(`garage-${cycle}`, callback);
      failPrimary?.(new Error('missing composite index'));
      unsubscribe();
      emitFallback?.({ docs: [] });

      expect(primaryUnsub).toHaveBeenCalledTimes(1);
      expect(fallbackUnsub).toHaveBeenCalledTimes(1);
      expect(listenerTracker.getActiveListenerCount()).toBe(0);
      expect(callback).not.toHaveBeenCalled();
    }

    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(40);
  });

  it('unsubscribes the normal indexed listener and tracker once when cleanup is repeated', () => {
    const primaryUnsub = vi.fn();
    firestoreMocks.onSnapshot.mockImplementationOnce(() => primaryUnsub);
    const callback = vi.fn();

    const unsubscribe = adminService.subscribeToGarageRechargeLogs('garage-normal', callback);
    expect(listenerTracker.getActiveListenerCount()).toBe(1);

    unsubscribe();
    unsubscribe();

    expect(primaryUnsub).toHaveBeenCalledTimes(1);
    expect(listenerTracker.getActiveListenerCount()).toBe(0);
  });
});
