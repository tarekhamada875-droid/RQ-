import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarageSync } from './useGarageSync';

const serviceMocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
  getDashboardDataPage: vi.fn(),
  getAdminGaragesPage: vi.fn(),
  getAdminDelegatesPage: vi.fn(),
  // Anti-regression spies: the sync hook must never restore recharge-request history reads.
  getAdminRechargeRequestsPage: vi.fn(),
  getAdminSummary: vi.fn(),
  subscribeToPackages: vi.fn(),
  subscribeToActiveVehicles: vi.fn(),
  subscribeToTodayTransactions: vi.fn(),
  subscribeToPendingRechargeRequests: vi.fn()
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
  pagination: {
    createdGarages: { hasMore: false, nextCursor: null },
    referredGarages: { hasMore: false, nextCursor: null },
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  serviceMocks.getDashboardData.mockReset();
  serviceMocks.getDashboardDataPage.mockReset();
  serviceMocks.getAdminGaragesPage.mockReset();
  serviceMocks.getAdminDelegatesPage.mockReset();
  serviceMocks.getAdminRechargeRequestsPage.mockReset().mockResolvedValue({ requests: [], lastDoc: null, hasMore: false });
  serviceMocks.getAdminSummary.mockReset();
  serviceMocks.subscribeToPackages.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToActiveVehicles.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToTodayTransactions.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToPendingRechargeRequests.mockReset().mockReturnValue(() => {});
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

  it('loads only created and referred garage continuations when requested', async () => {
    vi.useRealTimers();
    const initial = {
      delegate: { id: 'delegate-1', name: 'Delegate' },
      garages: [{ id: 'garage-1' }],
      pagination: {
        createdGarages: { hasMore: true, nextCursor: 'created-cursor' },
        referredGarages: { hasMore: true, nextCursor: 'referred-cursor' }
      }
    };
    serviceMocks.getDashboardData.mockResolvedValue(initial);
    serviceMocks.getDashboardDataPage.mockImplementation(async (_id: string, section: string) => ({
      items: [{ id: `${section}-garage-2` }],
      hasMore: false,
      nextCursor: null
    }));

    const { result, unmount } = renderHook(() => useGarageSync({
      ...createBaseProps(),
      delegate: initial.delegate
    }));
    await waitFor(() => expect(result.current.allGarages).toEqual(initial.garages));
    expect(serviceMocks.getDashboardDataPage).not.toHaveBeenCalled();

    act(() => { void result.current.loadMoreDelegateGarages(); });
    await waitFor(() => expect(result.current.allGarages).toHaveLength(3));
    expect(serviceMocks.getDashboardDataPage).toHaveBeenNthCalledWith(1, 'delegate-1', 'createdGarages', 'created-cursor');
    expect(serviceMocks.getDashboardDataPage).toHaveBeenNthCalledWith(2, 'delegate-1', 'referredGarages', 'referred-cursor');
    expect(result.current.allGarages.map((garage: any) => garage.id)).toEqual(['garage-1', 'createdGarages-garage-2', 'referredGarages-garage-2']);
    expect(result.current.delegatePagination.createdGarages.hasMore).toBe(false);
    expect(serviceMocks.getDashboardDataPage.mock.calls.every(([, section]) => section !== 'requests')).toBe(true);
    unmount();
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

  it('loads bounded Admin garage and delegate pages without reading recharge-request history', async () => {
    vi.useRealTimers();
    serviceMocks.getAdminGaragesPage
      .mockResolvedValueOnce({ garages: [{ id: 'garage-1' }], lastDoc: 'garage-cursor', hasMore: true })
      .mockResolvedValueOnce({ garages: [{ id: 'garage-2' }], lastDoc: null, hasMore: false });
    serviceMocks.getAdminDelegatesPage.mockResolvedValue({ delegates: [{ id: 'delegate-1' }], lastDoc: null, hasMore: false });
    serviceMocks.getAdminSummary.mockResolvedValue({ totalGarages: 2, activeGarages: 2, lockedGarages: 0, totalDelegates: 1, totalAdminRevenue: 0 });

    const { result, unmount } = renderHook(() => useGarageSync({
      ...createBaseProps(),
      isSessionReady: true,
      view: 'admin_dashboard'
    }));

    await waitFor(() => expect(result.current.allGarages).toEqual([{ id: 'garage-1' }]));
    expect(serviceMocks.getAdminGaragesPage).toHaveBeenCalledWith(50, null);
    expect(serviceMocks.getAdminDelegatesPage).toHaveBeenCalledWith(50, null);
    expect(serviceMocks.getAdminSummary).toHaveBeenCalledOnce();
    expect(serviceMocks.getAdminRechargeRequestsPage).not.toHaveBeenCalled();
    expect(serviceMocks.subscribeToPendingRechargeRequests).not.toHaveBeenCalled();
    expect(result.current.adminGarageHasMore).toBe(true);

    act(() => { void result.current.loadMoreAdminGarages(); });
    await waitFor(() => expect(result.current.allGarages).toHaveLength(2));
    expect(serviceMocks.getAdminGaragesPage).toHaveBeenLastCalledWith(50, 'garage-cursor');
    expect(result.current.allGarages).toEqual([{ id: 'garage-1' }, { id: 'garage-2' }]);
    expect(result.current.adminGarageHasMore).toBe(false);
    unmount();
  });
});
