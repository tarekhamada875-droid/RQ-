import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarageSync } from './useGarageSync';

const serviceMocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
  getDashboardDataPage: vi.fn(),
  getAdminGaragesPage: vi.fn(),
  getAdminDelegatesPage: vi.fn(),
  getStaffByGarageOnce: vi.fn(),
  getGarageById: vi.fn(),
  // Anti-regression spies: the sync hook must never restore recharge-request history reads.
  getAdminRechargeRequestsPage: vi.fn(),
  subscribeToPackages: vi.fn(),
  subscribeToActiveVehicles: vi.fn(),
  subscribeToTodayTransactions: vi.fn(),
  subscribeToGarage: vi.fn(),
  subscribeToPendingRechargeRequests: vi.fn(),
  throttleCancels: [] as ReturnType<typeof vi.fn>[]
}));

vi.mock('../services', () => ({
  firestoreService: serviceMocks
}));

vi.mock('../utils', () => ({
  throttleSnapshot: (callback: (...args: any[]) => void) => {
    const throttled = callback as typeof callback & { cancel: ReturnType<typeof vi.fn> };
    throttled.cancel = vi.fn();
    serviceMocks.throttleCancels.push(throttled.cancel);
    return throttled;
  }
}));

const createBaseProps = () => ({
  isSessionReady: false,
  isAuthReady: true,
  user: { uid: 'delegate-user' },
  view: 'delegate_dashboard',
  garage: null,
  setGarage: vi.fn(),
  delegate: null,
  currentStaff: null,
  currentSupervisor: null,
  setDelegate: vi.fn(),
  selectedGarageForDetails: null,
  setSelectedGarageForDetails: vi.fn(),
  setVehicles: vi.fn(),
  setTodayTransactions: vi.fn(),
  showToast: vi.fn()
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
  serviceMocks.getAdminGaragesPage.mockReset().mockResolvedValue({ garages: [], lastDoc: null, hasMore: false });
  serviceMocks.getAdminDelegatesPage.mockReset().mockResolvedValue({ delegates: [], lastDoc: null, hasMore: false });
  serviceMocks.getStaffByGarageOnce.mockReset().mockResolvedValue([]);
  serviceMocks.getGarageById.mockReset().mockResolvedValue(null);
  serviceMocks.getAdminRechargeRequestsPage.mockReset().mockResolvedValue({ requests: [], lastDoc: null, hasMore: false });
  serviceMocks.subscribeToPackages.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToActiveVehicles.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToTodayTransactions.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToGarage.mockReset().mockReturnValue(() => {});
  serviceMocks.subscribeToPendingRechargeRequests.mockReset().mockReturnValue(() => {});
  serviceMocks.throttleCancels.length = 0;
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

  it('does not overlap dashboard polls while an earlier request is still pending', async () => {
    let resolveInitial!: (value: ReturnType<typeof dashboardResponse>) => void;
    serviceMocks.getDashboardData
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveInitial = resolve;
      }))
      .mockResolvedValue(dashboardResponse({ id: 'delegate-1', name: 'Latest delegate' }));

    const { unmount } = renderHook(() => useGarageSync({
      ...createBaseProps(),
      delegate: { id: 'delegate-1', name: 'Initial delegate' }
    }));

    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitial(dashboardResponse({ id: 'delegate-1', name: 'Initial response' }));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('ignores a pagination response from an earlier dashboard generation after switching away and back', async () => {
    const firstDelegateResponse = {
      ...dashboardResponse({ id: 'delegate-1', name: 'First delegate' }),
      garages: [{ id: 'first-delegate-garage' }],
      pagination: {
        createdGarages: { hasMore: true, nextCursor: 'created-cursor' },
        referredGarages: { hasMore: false, nextCursor: null }
      }
    };
    serviceMocks.getDashboardData.mockImplementation(async (delegateId: string) =>
      delegateId === 'delegate-1'
        ? firstDelegateResponse
        : dashboardResponse({ id: delegateId, name: 'Other delegate' })
    );

    let resolveOldPage!: (value: { items: any[]; hasMore: boolean; nextCursor: string | null }) => void;
    serviceMocks.getDashboardDataPage.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOldPage = resolve;
    }));

    const baseProps = createBaseProps();
    const { result, unmount } = renderHook(() => {
      const [delegate, setDelegate] = useState({ id: 'delegate-1', name: 'First delegate' });
      const sync = useGarageSync({ ...baseProps, delegate, setDelegate });
      return { delegate, setDelegate, sync };
    });

    await act(async () => {
      await Promise.resolve();
    });
    let loadingPromise!: Promise<void>;
    act(() => {
      loadingPromise = result.current.sync.loadMoreDelegateGarages();
    });
    expect(serviceMocks.getDashboardDataPage).toHaveBeenCalledTimes(1);

    act(() => result.current.setDelegate({ id: 'delegate-2', name: 'Other delegate' }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.setDelegate({ id: 'delegate-1', name: 'First delegate again' }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      resolveOldPage({
        items: [{ id: 'stale-page-garage' }],
        hasMore: false,
        nextCursor: null
      });
      await loadingPromise;
    });

    expect(result.current.sync.allGarages.map((garage: any) => garage.id)).toEqual(['first-delegate-garage']);
    expect(serviceMocks.getDashboardDataPage).toHaveBeenCalledTimes(1);
    unmount();
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

    const { result, unmount } = renderHook(() => useGarageSync({
      ...createBaseProps(),
      isSessionReady: true,
      view: 'admin_dashboard'
    }));

    await waitFor(() => expect(result.current.allGarages).toEqual([{ id: 'garage-1' }]));
    expect(serviceMocks.getAdminGaragesPage).toHaveBeenCalledWith(50, null);
    expect(serviceMocks.getAdminDelegatesPage).toHaveBeenCalledWith(50, null);
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

  it('ignores an older admin page when a refresh resets pagination during an in-flight request', async () => {
    vi.useRealTimers();
    let resolveOldPage!: (page: { garages: any[]; lastDoc: string; hasMore: boolean }) => void;
    const oldPage = new Promise<{ garages: any[]; lastDoc: string; hasMore: boolean }>((resolve) => {
      resolveOldPage = resolve;
    });
    let firstPageCall = 0;
    serviceMocks.getAdminGaragesPage.mockImplementation((_limit: number, cursor: unknown) => {
      if (cursor === null) {
        firstPageCall += 1;
        return Promise.resolve(firstPageCall === 1
          ? { garages: [{ id: 'garage-before-refresh' }], lastDoc: 'cursor-before-refresh', hasMore: true }
          : { garages: [{ id: 'garage-after-refresh' }], lastDoc: 'cursor-after-refresh', hasMore: true });
      }
      if (cursor === 'cursor-before-refresh') return oldPage;
      if (cursor === 'cursor-after-refresh') {
        return Promise.resolve({ garages: [{ id: 'garage-next-page' }], lastDoc: null, hasMore: false });
      }
      return Promise.resolve({ garages: [], lastDoc: null, hasMore: false });
    });
    serviceMocks.getAdminDelegatesPage.mockResolvedValue({ delegates: [], lastDoc: null, hasMore: false });

    const { result, unmount } = renderHook(() => useGarageSync({
      ...createBaseProps(),
      isSessionReady: true,
      view: 'admin_dashboard',
    }));

    await waitFor(() => expect(result.current.allGarages).toEqual([{ id: 'garage-before-refresh' }]));
    act(() => { void result.current.loadMoreAdminGarages(); });
    await waitFor(() => expect(serviceMocks.getAdminGaragesPage).toHaveBeenCalledWith(50, 'cursor-before-refresh'));

    await act(async () => {
      await result.current.refreshAdminLists();
    });
    expect(result.current.allGarages).toEqual([{ id: 'garage-after-refresh' }]);

    await act(async () => {
      resolveOldPage({ garages: [{ id: 'garage-stale-page' }], lastDoc: 'stale-cursor', hasMore: true });
      await oldPage;
    });
    expect(result.current.allGarages).toEqual([{ id: 'garage-after-refresh' }]);

    act(() => { void result.current.loadMoreAdminGarages(); });
    await waitFor(() => expect(serviceMocks.getAdminGaragesPage).toHaveBeenCalledWith(50, 'cursor-after-refresh'));
    await waitFor(() => expect(result.current.allGarages).toEqual([
      { id: 'garage-after-refresh' },
      { id: 'garage-next-page' },
    ]));
    unmount();
  });

  it('unsubscribes all garage-sync Firestore listeners on unmount and does not accumulate them after remount', () => {
    const subscriptions: Array<{ key: string; active: boolean; unsubscribe: ReturnType<typeof vi.fn> }> = [];
    const register = (key: string) => {
      const subscription = { key, active: true, unsubscribe: vi.fn() };
      subscription.unsubscribe.mockImplementation(() => { subscription.active = false; });
      subscriptions.push(subscription);
      return subscription.unsubscribe;
    };
    serviceMocks.subscribeToPackages.mockImplementation(() => register('packages'));
    serviceMocks.subscribeToActiveVehicles.mockImplementation(() => register('active-vehicles'));
    serviceMocks.subscribeToTodayTransactions.mockImplementation(() => register('today-transactions'));
    serviceMocks.subscribeToGarage.mockImplementation(() => register('current-garage'));

    const props = {
      ...createBaseProps(),
      isSessionReady: true,
      view: 'garage',
      garage: { id: 'garage-1' } as any,
      user: { uid: 'garage-user' },
    };
    const activeSubscriptions = () => subscriptions.filter(({ active }) => active);

    const firstMount = renderHook(() => useGarageSync(props));
    expect(activeSubscriptions().map(({ key }) => key).sort()).toEqual([
      'active-vehicles', 'current-garage', 'packages', 'today-transactions',
    ]);
    const firstSubscriptions = subscriptions.slice();

    firstMount.unmount();
    expect(activeSubscriptions()).toHaveLength(0);
    firstSubscriptions.forEach(({ unsubscribe }) => expect(unsubscribe).toHaveBeenCalledOnce());

    const secondMount = renderHook(() => useGarageSync(props));
    expect(activeSubscriptions()).toHaveLength(4);
    const secondSubscriptions = subscriptions.slice(firstSubscriptions.length);

    secondMount.unmount();
    expect(activeSubscriptions()).toHaveLength(0);
    secondSubscriptions.forEach(({ unsubscribe }) => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(subscriptions).toHaveLength(8);
  });

  it('cancels the active-vehicle trailing update when the garage listener is removed', () => {
    const { unmount } = renderHook(() => useGarageSync({
      ...createBaseProps(),
      isSessionReady: true,
      view: 'garage',
      garage: { id: 'garage-1' } as any,
    }));

    expect(serviceMocks.throttleCancels).toHaveLength(1);
    unmount();
    expect(serviceMocks.throttleCancels[0]).toHaveBeenCalledOnce();
  });

  it('ignores a garage-detail response for the previously selected garage', async () => {
    vi.useRealTimers();
    let resolveGarageA: (garage: any) => void = () => {};
    let resolveGarageB: (garage: any) => void = () => {};
    serviceMocks.getGarageById
      .mockImplementationOnce(() => new Promise((resolve) => { resolveGarageA = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveGarageB = resolve; }));

    const baseProps = createBaseProps();
    const setSelectedGarageForDetails = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ selectedGarageForDetails }) => useGarageSync({
        ...baseProps,
        isSessionReady: true,
        view: 'admin_garage_details',
        selectedGarageForDetails,
        setSelectedGarageForDetails,
      }),
      { initialProps: { selectedGarageForDetails: { id: 'garage-a' } as any } }
    );

    await act(async () => {
      rerender({ selectedGarageForDetails: { id: 'garage-b' } as any });
      await Promise.resolve();
    });
    expect(serviceMocks.getGarageById).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveGarageB({ id: 'garage-b', name: 'Garage B' });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      resolveGarageA({ id: 'garage-a', name: 'Garage A' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setSelectedGarageForDetails).toHaveBeenCalledTimes(1);
    expect(setSelectedGarageForDetails).toHaveBeenCalledWith({ id: 'garage-b', name: 'Garage B' });
    unmount();
  });
});
