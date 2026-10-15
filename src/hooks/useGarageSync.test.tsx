import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarageSync } from './useGarageSync';

const serviceMocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
  subscribeToPackages: vi.fn(),
  subscribeToActiveVehicles: vi.fn(),
  subscribeToTodayTransactions: vi.fn()
}));

vi.mock('../services', () => ({
  firestoreService: serviceMocks
}));

vi.mock('../utils', () => ({
  throttleSnapshot: (callback: (...args: any[]) => void) => callback
}));

const createBaseProps = () => ({
  isSessionReady: false,
  isAuthReady: true,
  user: { uid: 'delegate-user' },
  view: 'delegate_dashboard',
  garage: null,
  setGarage: vi.fn(),
  delegate: null,
  setDelegate: vi.fn(),
  selectedGarageForDetails: null,
  setSelectedGarageForDetails: vi.fn(),
  setVehicles: vi.fn(),
  setTodayTransactions: vi.fn(),
  showToast: vi.fn(),
  garageRef: { current: null },
  lastHealTimeRef: { current: {} }
});

const dashboardResponse = (delegate: { id: string; name: string }) => ({
  delegate,
  garages: [],
  requests: []
});

beforeEach(() => {
  vi.useFakeTimers();
  serviceMocks.getDashboardData.mockReset();
  serviceMocks.subscribeToPackages.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToActiveVehicles.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToTodayTransactions.mockReset().mockReturnValue(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useGarageSync Delegate dashboard polling (FE-003)', () => {
  it('does not reload when a response replaces the delegate object but keeps the same ID', async () => {
    const refreshedDelegate = { id: 'delegate-1', name: 'Refreshed delegate' };
    serviceMocks.getDashboardData
      .mockResolvedValueOnce(dashboardResponse(refreshedDelegate))
      .mockImplementationOnce(() => new Promise(() => {}));

    const baseProps = createBaseProps();
    const { result, unmount } = renderHook(() => {
      const [delegate, setDelegate] = useState({ id: 'delegate-1', name: 'Initial delegate' });
      const sync = useGarageSync({ ...baseProps, delegate, setDelegate });
      return { delegate, sync };
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.delegate).toBe(refreshedDelegate);
    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('loads initially and at most four times per minute, then polls only the new delegate ID after a switch', async () => {
    const responses = {
      'delegate-1': { id: 'delegate-1', name: 'First delegate from server' },
      'delegate-2': { id: 'delegate-2', name: 'Second delegate from server' }
    };
    serviceMocks.getDashboardData.mockImplementation(async (delegateId: keyof typeof responses) =>
      dashboardResponse(responses[delegateId])
    );

    const baseProps = createBaseProps();
    const { result, unmount } = renderHook(() => {
      const [delegate, setDelegate] = useState({ id: 'delegate-1', name: 'Initial delegate' });
      const sync = useGarageSync({ ...baseProps, delegate, setDelegate });
      return { delegate, setDelegate, sync };
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(5);
    expect(serviceMocks.getDashboardData.mock.calls.every(([delegateId]) => delegateId === 'delegate-1')).toBe(true);

    act(() => result.current.setDelegate({ id: 'delegate-2', name: 'Switched delegate' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(6);
    expect(serviceMocks.getDashboardData.mock.calls[5][0]).toBe('delegate-2');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(7);
    expect(serviceMocks.getDashboardData.mock.calls.filter(([delegateId]) => delegateId === 'delegate-1')).toHaveLength(5);
    expect(serviceMocks.getDashboardData.mock.calls.filter(([delegateId]) => delegateId === 'delegate-2')).toHaveLength(2);
    unmount();
  });

  it('ignores a dashboard response that resolves after unmount', async () => {
    let resolveDashboard: (value: ReturnType<typeof dashboardResponse>) => void = () => {};
    serviceMocks.getDashboardData.mockImplementation(() => new Promise((resolve) => {
      resolveDashboard = resolve;
    }));

    const baseProps = createBaseProps();
    const setDelegate = vi.fn();
    const { unmount } = renderHook(() => useGarageSync({
      ...baseProps,
      delegate: { id: 'delegate-1', name: 'Initial delegate' },
      setDelegate
    }));

    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      resolveDashboard(dashboardResponse({ id: 'delegate-1', name: 'Late response' }));
      await Promise.resolve();
    });

    expect(setDelegate).not.toHaveBeenCalled();
  });

  it('warns when activity history is unavailable and keeps the last displayed records', () => {
    const previousTransactions = [{ id: 'last-known-transaction' }];
    const showToast = vi.fn();
    serviceMocks.subscribeToTodayTransactions.mockImplementation((_garageId: string, callback: (logs: any[], error?: Error) => void) => {
      callback([], Object.assign(new Error('ACTIVITY_LOGS_UNAVAILABLE'), { code: 'ACTIVITY_LOGS_UNAVAILABLE' }));
      return () => {};
    });

    const { result, unmount } = renderHook(() => {
      const [todayTransactions, setTodayTransactions] = useState(previousTransactions as any[]);
      useGarageSync({
        ...createBaseProps(),
        isSessionReady: true,
        user: null,
        garage: { id: 'garage-1' } as any,
        setTodayTransactions,
        showToast
      });
      return todayTransactions;
    });

    expect(result.current).toEqual(previousTransactions);
    expect(showToast).toHaveBeenCalledWith(
      'تعذر تحديث سجل حركة اليوم. قد تكون البيانات المعروضة قديمة.',
      'error'
    );
    unmount();
  });
});
