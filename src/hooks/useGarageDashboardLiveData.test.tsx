import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarageDashboardLiveData } from './useGarageDashboardLiveData';

const serviceMocks = vi.hoisted(() => ({
  subscribeToGarageRechargeLogs: vi.fn(),
  subscribeToSubscribers: vi.fn(),
}));

vi.mock('../services', () => ({
  firestoreService: serviceMocks,
}));

const createRechargeLog = (id: string) => ({
  id,
  garageId: 'garage-1',
  actionType: 'recharge',
  timestamp: new Date('2026-10-16T08:00:00.000Z'),
  amount: 100,
  details: { packageName: `Package ${id}` },
});

const createSubscriber = (id: string) => ({
  id,
  garageId: 'garage-1',
  plateNumber: `Plate ${id}`,
  endDate: '2026-10-18',
});

const baseOptions = {
  garageId: 'garage-1',
  isAuthenticated: true,
  isRechargeHistoryOpen: false,
  shouldSubscribeToSubscribers: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  serviceMocks.subscribeToGarageRechargeLogs.mockReset();
  serviceMocks.subscribeToSubscribers.mockReset();
  serviceMocks.subscribeToGarageRechargeLogs.mockImplementation(() => vi.fn());
  serviceMocks.subscribeToSubscribers.mockImplementation(() => vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useGarageDashboardLiveData', () => {
  it('shares one garage-scoped recharge and subscriber listener across dashboard and overlays', () => {
    let rechargeCallback: ((logs: any[]) => void) | undefined;
    let subscriberCallback: ((subscribers: any[], page: any) => void) | undefined;
    const unsubscribeRecharge = vi.fn();
    const unsubscribeSubscribers = vi.fn();

    serviceMocks.subscribeToGarageRechargeLogs.mockImplementation((_garageId, callback) => {
      rechargeCallback = callback;
      return unsubscribeRecharge;
    });
    serviceMocks.subscribeToSubscribers.mockImplementation((_garageId, callback) => {
      subscriberCallback = callback;
      return unsubscribeSubscribers;
    });

    const { result, rerender, unmount } = renderHook(
      (options) => useGarageDashboardLiveData(options),
      { initialProps: baseOptions },
    );

    expect(serviceMocks.subscribeToGarageRechargeLogs).toHaveBeenCalledTimes(1);
    expect(serviceMocks.subscribeToGarageRechargeLogs).toHaveBeenLastCalledWith(
      'garage-1', expect.any(Function), 1, expect.any(Function),
    );
    expect(serviceMocks.subscribeToSubscribers).toHaveBeenCalledTimes(1);

    act(() => {
      rechargeCallback?.([createRechargeLog('recent')]);
      subscriberCallback?.([createSubscriber('first')], {
        lastDoc: { id: 'cursor-50' },
        hasMore: true,
      });
    });

    expect(result.current.rechargeLogs).toEqual([createRechargeLog('recent')]);
    expect(result.current.subscriberPage).toMatchObject({
      garageId: 'garage-1',
      subscribers: [createSubscriber('first')],
      lastDoc: { id: 'cursor-50' },
      hasMore: true,
      hasSnapshot: true,
    });

    rerender({ ...baseOptions, isRechargeHistoryOpen: true });
    expect(unsubscribeRecharge).toHaveBeenCalledTimes(1);
    expect(serviceMocks.subscribeToGarageRechargeLogs).toHaveBeenCalledTimes(2);
    expect(serviceMocks.subscribeToGarageRechargeLogs).toHaveBeenLastCalledWith(
      'garage-1', expect.any(Function), 50, expect.any(Function),
    );
    expect(serviceMocks.subscribeToSubscribers).toHaveBeenCalledTimes(1);
    expect(unsubscribeSubscribers).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribeRecharge).toHaveBeenCalledTimes(2);
    expect(unsubscribeSubscribers).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the subscriber listener when the dashboard no longer needs its badge data', () => {
    const unsubscribeSubscribers = vi.fn();
    serviceMocks.subscribeToSubscribers.mockReturnValue(unsubscribeSubscribers);

    const { rerender, unmount } = renderHook(
      (options) => useGarageDashboardLiveData(options),
      { initialProps: baseOptions },
    );

    rerender({ ...baseOptions, shouldSubscribeToSubscribers: false });
    expect(unsubscribeSubscribers).toHaveBeenCalledTimes(1);
    expect(serviceMocks.subscribeToSubscribers).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribeSubscribers).toHaveBeenCalledTimes(1);
  });

  it('does not accept callbacks from a previous garage after switching garages', () => {
    const callbacks: Array<(logs: any[]) => void> = [];
    const subscriberCallbacks: Array<(subscribers: any[], page: any) => void> = [];
    serviceMocks.subscribeToGarageRechargeLogs.mockImplementation((_garageId, callback) => {
      callbacks.push(callback);
      return vi.fn();
    });
    serviceMocks.subscribeToSubscribers.mockImplementation((_garageId, callback) => {
      subscriberCallbacks.push(callback);
      return vi.fn();
    });
    const { result, rerender, unmount } = renderHook(
      (options) => useGarageDashboardLiveData(options),
      { initialProps: baseOptions },
    );

    rerender({ ...baseOptions, garageId: 'garage-2' });
    act(() => {
      callbacks[0]([createRechargeLog('stale')]);
      callbacks[1]([{ ...createRechargeLog('current'), garageId: 'garage-2' }]);
      subscriberCallbacks[0]([createSubscriber('stale')], { lastDoc: { id: 'old-cursor' }, hasMore: true });
      subscriberCallbacks[1]([{ ...createSubscriber('current'), garageId: 'garage-2' }], {
        lastDoc: { id: 'new-cursor' },
        hasMore: false,
      });
    });

    expect(result.current.rechargeLogs.map(({ id }) => id)).toEqual(['current']);
    expect(result.current.subscriberPage).toMatchObject({
      garageId: 'garage-2',
      subscribers: [{ id: 'current', garageId: 'garage-2' }],
      lastDoc: { id: 'new-cursor' },
      hasSnapshot: true,
    });
    unmount();
  });
});
