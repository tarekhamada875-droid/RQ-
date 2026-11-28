import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGarageSync } from './useGarageSync';

const serviceMocks = vi.hoisted(() => ({
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

describe('useGarageSync cache-first gate (perf audit 2026-11-28)', () => {
  let garageCallback: ((garage: any, metadata?: { fromCache: boolean }) => void) | undefined;

  beforeEach(() => {
    garageCallback = undefined;
    vi.useFakeTimers();
    serviceMocks.subscribeToGarage.mockImplementation(
      (_garageId: string, callback: (garage: any, metadata?: { fromCache: boolean }) => void) => {
        garageCallback = callback;
        return vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the gate on a CACHED snapshot (the perf win — no more waiting for fresh)', () => {
    const { result } = renderHook(
      () => useGarageSync({
        ...baseProps,
        view: 'garage',
        garage: { id: 'garage-a' } as any,
      }),
    );

    // Gate starts closed.
    expect(result.current.isInitialSyncComplete).toBe(false);

    // A CACHED snapshot arrives — the gate should open immediately.
    act(() => {
      garageCallback?.({ id: 'garage-a', name: 'My Garage', carsInside: 5 }, { fromCache: true });
    });

    expect(result.current.isInitialSyncComplete).toBe(true);
  });

  it('opens the gate on a FRESH snapshot when no cache exists (existing behavior)', () => {
    const { result } = renderHook(
      () => useGarageSync({
        ...baseProps,
        view: 'garage',
        garage: { id: 'garage-a' } as any,
      }),
    );

    expect(result.current.isInitialSyncComplete).toBe(false);

    // No cached snapshot — first snapshot is fresh from the server.
    act(() => {
      garageCallback?.({ id: 'garage-a', name: 'My Garage', carsInside: 3 }, { fromCache: false });
    });

    expect(result.current.isInitialSyncComplete).toBe(true);
  });

  it('opens the gate on a snapshot with no metadata (treated as not-from-cache)', () => {
    const { result } = renderHook(
      () => useGarageSync({
        ...baseProps,
        view: 'garage',
        garage: { id: 'garage-a' } as any,
      }),
    );

    expect(result.current.isInitialSyncComplete).toBe(false);

    // No metadata argument at all (some test/service paths skip it).
    act(() => {
      garageCallback?.({ id: 'garage-a', name: 'My Garage' });
    });

    expect(result.current.isInitialSyncComplete).toBe(true);
  });

  it('falls back to the 10s timeout when no snapshot arrives (slow network, no cache)', () => {
    const { result } = renderHook(
      () => useGarageSync({
        ...baseProps,
        view: 'garage',
        garage: { id: 'garage-a' } as any,
      }),
    );

    expect(result.current.isInitialSyncComplete).toBe(false);

    // No snapshot arrives — advance time past the 10s safety timeout.
    act(() => {
      vi.advanceTimersByTime(10_500);
    });

    expect(result.current.isInitialSyncComplete).toBe(true);
  });

  it('does NOT open the gate on a cached snapshot that says the garage is gone (cache may be stale)', () => {
    const onAccountRevoked = vi.fn();
    const { result } = renderHook(
      () => useGarageSync({
        ...baseProps,
        view: 'garage',
        garage: { id: 'garage-a' } as any,
        onAccountRevoked,
      }),
    );

    expect(result.current.isInitialSyncComplete).toBe(false);

    // Cached non-existence — must NOT open the gate or fire revoked (cache may be stale).
    act(() => {
      garageCallback?.(null, { fromCache: true });
    });

    expect(result.current.isInitialSyncComplete).toBe(false);
    expect(onAccountRevoked).not.toHaveBeenCalled();
  });

  it('fires onAccountRevoked only on FRESH non-existence, not cached', () => {
    const onAccountRevoked = vi.fn();
    const { result } = renderHook(
      () => useGarageSync({
        ...baseProps,
        view: 'garage',
        garage: { id: 'garage-a' } as any,
        onAccountRevoked,
      }),
    );

    // Cached non-existence — ignored.
    act(() => {
      garageCallback?.(null, { fromCache: true });
    });
    expect(onAccountRevoked).not.toHaveBeenCalled();

    // Fresh non-existence — fires the revoked handler.
    act(() => {
      garageCallback?.(null, { fromCache: false });
    });
    expect(onAccountRevoked).toHaveBeenCalledTimes(1);

    // Gate still closed (no valid data was ever received).
    expect(result.current.isInitialSyncComplete).toBe(false);
  });

  it('resets the gate when the garage changes (no stale data leaks between garages)', () => {
    const { result, rerender } = renderHook(
      ({ garageId }: { garageId: string }) => useGarageSync({
        ...baseProps,
        view: 'garage',
        garage: { id: garageId } as any,
      }),
      { initialProps: { garageId: 'garage-a' } }
    );

    // Open the gate for garage-a with a cached snapshot.
    act(() => {
      garageCallback?.({ id: 'garage-a', name: 'A' }, { fromCache: true });
    });
    expect(result.current.isInitialSyncComplete).toBe(true);

    // Switch to garage-b — the gate must reset.
    rerender({ garageId: 'garage-b' });

    expect(result.current.isInitialSyncComplete).toBe(false);

    // The new garage's first snapshot opens the gate again.
    act(() => {
      garageCallback?.({ id: 'garage-b', name: 'B' }, { fromCache: true });
    });
    expect(result.current.isInitialSyncComplete).toBe(true);
  });

  it('opens the gate only once even if multiple snapshots arrive', () => {
    const { result } = renderHook(
      () => useGarageSync({
        ...baseProps,
        view: 'garage',
        garage: { id: 'garage-a' } as any,
      }),
    );

    // First snapshot opens the gate.
    act(() => {
      garageCallback?.({ id: 'garage-a', carsInside: 3 }, { fromCache: true });
    });
    expect(result.current.isInitialSyncComplete).toBe(true);

    // Second snapshot doesn't break anything — gate stays open.
    act(() => {
      garageCallback?.({ id: 'garage-a', carsInside: 5 }, { fromCache: false });
    });
    expect(result.current.isInitialSyncComplete).toBe(true);
  });
});
