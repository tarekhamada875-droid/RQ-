import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGarageSync } from './useGarageSync';

const serviceMocks = vi.hoisted(() => ({
  subscribeToPackages: vi.fn(() => () => {}),
  subscribeToTodayTransactions: vi.fn((_garageId: string, _callback: (transactions: any[], error?: unknown) => void) => () => {}),
  subscribeToGarage: vi.fn((_garageId: string, _callback: (garage: any, metadata?: { fromCache: boolean }) => void) => () => {}),
  getStaffByGarageOnce: vi.fn(async () => []),
  getGarageById: vi.fn(async () => null),
  getDashboardData: vi.fn(),
  getDashboardDataPage: vi.fn(),
  getAdminGaragesPage: vi.fn(async () => ({ garages: [], lastDoc: null, hasMore: false })),
  getAdminDelegatesPage: vi.fn(async () => ({ delegates: [], lastDoc: null, hasMore: false }))
}));

vi.mock('../services', () => ({
  garageService: serviceMocks,
  garageDeletionService: serviceMocks,
  vehicleService: serviceMocks,
  delegateService: serviceMocks,
  adminService: serviceMocks,
  authService: serviceMocks,
}));

// setVehicles/setTodayTransactions + subscribeToActiveVehicles mocks removed
// (PR2, 2026-11-23): the always-on active-vehicles stream was retired and the
// vehicles/todayTransactions state no longer exists. The reports view manages
// its own on-demand today-transactions listener.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseProps = {
  isSessionReady: true,
  isAuthReady: true,
  user: { uid: 'user-1' },
  setGarage: vi.fn(),
  delegate: null,
  setDelegate: vi.fn(),
  selectedGarageForDetails: null,
  setSelectedGarageForDetails: vi.fn(),
  showToast: vi.fn()
};

describe('useGarageSync owner data isolation', () => {
  it('ignores a queued garage snapshot from the previous garage after switching garages', () => {
    const callbacks: Record<string, (garage: any, metadata?: { fromCache: boolean }) => void> = {};
    serviceMocks.subscribeToGarage.mockImplementation((garageId: string, callback: (garage: any, metadata?: { fromCache: boolean }) => void) => {
      callbacks[garageId] = callback;
      return vi.fn();
    });
    const setGarage = vi.fn();

    const { rerender } = renderHook(
      ({ garage }: { garage: { id: string } | null }) => {
        useGarageSync({
          ...baseProps,
          setGarage,
          view: 'garage',
          garage: garage as any,
        });
        return null;
      },
      { initialProps: { garage: { id: 'garage-a' } as { id: string } | null } }
    );

    act(() => callbacks['garage-a']({ id: 'garage-a', name: 'A' }));
    // setGarage receives an updater — evaluate it the way React would.
    expect(setGarage).toHaveBeenCalledTimes(1);
    expect(setGarage.mock.calls[0][0](null)).toEqual({ id: 'garage-a', name: 'A' });
    setGarage.mockClear();

    rerender({ garage: { id: 'garage-b' } });

    // Simulate a Firestore callback that was queued before unsubscribe but delivered
    // after the new garage became active — the stale-guard must drop it.
    act(() => callbacks['garage-a']({ id: 'garage-a', name: 'stale' }));
    expect(setGarage).not.toHaveBeenCalled();

    act(() => callbacks['garage-b']({ id: 'garage-b', name: 'B' }));
    expect(setGarage.mock.calls[0][0](null)).toEqual({ id: 'garage-b', name: 'B' });
  });

  // Test removed (2026-11-15): the subscribeToTodayTransactions listener was
  // removed from useGarageSync. The reports view now manages its own on-demand
  // listener. This test verified that stale transaction snapshots from the
  // previous garage were ignored — that concern no longer exists in useGarageSync.
  //
  // Tests removed (PR2, 2026-11-23): the active-vehicles listener and the
  // vehicles/todayTransactions state were retired together with the
  // cars-inside list. The "clears vehicles on owner change" and "ignores a
  // queued vehicle snapshot" contracts moved to the garage document listener
  // above (same guard pattern, same teardown semantics).

  it('attaches before the claim and keeps same-identity data across a session-ready flip', () => {
    let garageCallback: ((garage: any, metadata?: { fromCache: boolean }) => void) | undefined;
    serviceMocks.subscribeToGarage.mockImplementation((_garageId: string, callback: (garage: any, metadata?: { fromCache: boolean }) => void) => {
      garageCallback = callback;
      return vi.fn();
    });
    const setGarage = vi.fn();

    const { rerender } = renderHook(
      ({ isSessionReady }: { isSessionReady: boolean }) => {
        useGarageSync({
          ...baseProps,
          isSessionReady,
          setGarage,
          view: 'garage',
          garage: { id: 'garage-a' } as any,
        });
        return null;
      },
      { initialProps: { isSessionReady: false } }
    );

    // Early-attach contract (stale-tab reopen audit 2026-11-17): the garage
    // listener starts as soon as the identity is known, while the server
    // session claim is still in flight.
    expect(serviceMocks.subscribeToGarage).toHaveBeenCalledWith('garage-a', expect.any(Function));

    // A fresh snapshot delivered while the claim is in flight lands in state.
    act(() => garageCallback?.({ id: 'garage-a', carsInside: 7 }));
    // setGarage receives an updater — evaluate it the way React would.
    expect(setGarage).toHaveBeenCalledTimes(1);
    expect(setGarage.mock.calls[0][0](null)).toEqual({ id: 'garage-a', carsInside: 7 });

    // The claim completing for the SAME identity must not wipe the data the
    // early listener already delivered (the old ready/unready owner key did).
    rerender({ isSessionReady: true });

    // The listener was never torn down by the flip and keeps streaming.
    act(() => garageCallback?.({ id: 'garage-a', carsInside: 8 }));
    expect(setGarage.mock.calls.at(-1)![0](null)).toEqual({ id: 'garage-a', carsInside: 8 });
  });

});
