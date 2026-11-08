import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarageDashboardLiveData } from './useGarageDashboardLiveData';

const serviceMocks = vi.hoisted(() => ({
  subscribeToCreditGrantLogs: vi.fn(),
  subscribeToSubscribers: vi.fn(),
}));

vi.mock('../services', () => ({
  firestoreService: serviceMocks,
  garageService: serviceMocks,
  garageDeletionService: serviceMocks,
  vehicleService: serviceMocks,
  delegateService: serviceMocks,
  adminService: serviceMocks,
  authService: serviceMocks,
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
  isCreditGrantHistoryOpen: false,
  shouldSubscribeToSubscribers: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  serviceMocks.subscribeToCreditGrantLogs.mockReset();
  serviceMocks.subscribeToSubscribers.mockReset();
  serviceMocks.subscribeToCreditGrantLogs.mockImplementation(() => vi.fn());
  serviceMocks.subscribeToSubscribers.mockImplementation(() => vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useGarageDashboardLiveData — Option 2 (modal-only credit-grant listener)', () => {
  it('does NOT subscribe to credit-grant logs while the history modal is closed (badge reads garage.lastCreditGrantAt instead)', () => {
    const { result, rerender } = renderHook(
      (options) => useGarageDashboardLiveData(options),
      { initialProps: baseOptions },
    );

    // Subscriber listener still runs (badge reads subscriber list).
    expect(serviceMocks.subscribeToSubscribers).toHaveBeenCalledTimes(1);
    // Credit-grant listener does NOT run while modal is closed.
    expect(serviceMocks.subscribeToCreditGrantLogs).not.toHaveBeenCalled();
    expect(result.current.creditGrantLogs).toEqual([]);
    expect(result.current.isCreditGrantLoading).toBe(false);

    // Re-render with the modal still closed — still no listener.
    rerender({ ...baseOptions, isCreditGrantHistoryOpen: false });
    expect(serviceMocks.subscribeToCreditGrantLogs).not.toHaveBeenCalled();
  });

  it('opens a limit-50 credit-grant listener when the history modal opens, and tears it down when the modal closes', () => {
    let rechargeCallback: ((logs: any[]) => void) | undefined;
    const unsubscribeRecharge = vi.fn();
    serviceMocks.subscribeToCreditGrantLogs.mockImplementation((_garageId, callback) => {
      rechargeCallback = callback;
      return unsubscribeRecharge;
    });

    const { result, rerender } = renderHook(
      (options) => useGarageDashboardLiveData(options),
      { initialProps: baseOptions },
    );

    // Initially closed — no listener.
    expect(serviceMocks.subscribeToCreditGrantLogs).not.toHaveBeenCalled();

    // Open the modal — listener starts at limit 50.
    rerender({ ...baseOptions, isCreditGrantHistoryOpen: true });
    expect(serviceMocks.subscribeToCreditGrantLogs).toHaveBeenCalledTimes(1);
    expect(serviceMocks.subscribeToCreditGrantLogs).toHaveBeenLastCalledWith(
      'garage-1', expect.any(Function), 50, expect.any(Function),
    );

    act(() => {
      rechargeCallback?.([createRechargeLog('recent')]);
    });
    expect(result.current.creditGrantLogs).toEqual([createRechargeLog('recent')]);

    // Close the modal — listener tears down, logs cleared.
    rerender({ ...baseOptions, isCreditGrantHistoryOpen: false });
    expect(unsubscribeRecharge).toHaveBeenCalledTimes(1);
    expect(result.current.creditGrantLogs).toEqual([]);
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

  it('does not accept callbacks from a previous garage after switching garages (subscriber path)', () => {
    const subscriberCallbacks: Array<(subscribers: any[], page: any) => void> = [];
    serviceMocks.subscribeToSubscribers.mockImplementation((_garageId, callback) => {
      subscriberCallbacks.push(callback);
      return vi.fn();
    });
    const { result, rerender, unmount } = renderHook(
      (options) => useGarageDashboardLiveData(options),
      { initialProps: baseOptions },
    );

    // Open the modal so the credit-grant listener also runs and we exercise
    // the garage-switch path for both listeners.
    rerender({ ...baseOptions, isCreditGrantHistoryOpen: true });
    rerender({ ...baseOptions, isCreditGrantHistoryOpen: true, garageId: 'garage-2' });

    act(() => {
      subscriberCallbacks[0]([createSubscriber('stale')], { lastDoc: { id: 'old-cursor' }, hasMore: true });
      subscriberCallbacks[1]([{ ...createSubscriber('current'), garageId: 'garage-2' }], {
        lastDoc: { id: 'new-cursor' },
        hasMore: false,
      });
    });

    expect(result.current.subscriberPage).toMatchObject({
      garageId: 'garage-2',
      subscribers: [{ id: 'current', garageId: 'garage-2' }],
      lastDoc: { id: 'new-cursor' },
      hasSnapshot: true,
    });
    unmount();
  });
});
