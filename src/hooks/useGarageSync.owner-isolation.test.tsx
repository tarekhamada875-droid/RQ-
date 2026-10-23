import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGarageSync } from './useGarageSync';

const serviceMocks = vi.hoisted(() => ({
  subscribeToPackages: vi.fn(() => () => {}),
  subscribeToActiveVehicles: vi.fn((_garageId: string, _callback: (vehicles: any[]) => void) => () => {}),
  subscribeToTodayTransactions: vi.fn(() => () => {}),
  subscribeToGarage: vi.fn(() => () => {}),
  getStaffByGarageOnce: vi.fn(async () => []),
  getGarageById: vi.fn(async () => null),
  getDashboardData: vi.fn(),
  getDashboardDataPage: vi.fn(),
  getAdminGaragesPage: vi.fn(async () => ({ garages: [], lastDoc: null, hasMore: false })),
  getAdminDelegatesPage: vi.fn(async () => ({ delegates: [], lastDoc: null, hasMore: false }))
}));

vi.mock('../services', () => ({ firestoreService: serviceMocks }));
vi.mock('../utils', () => ({
  throttleSnapshot: (callback: (...args: any[]) => void) =>
    Object.assign(callback, { cancel: vi.fn() })
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
  currentStaff: null,
  currentSupervisor: null,
  setDelegate: vi.fn(),
  selectedGarageForDetails: null,
  setSelectedGarageForDetails: vi.fn(),
  showToast: vi.fn()
};

describe('useGarageSync owner data isolation', () => {
  it('clears the previous garage vehicles and transactions before the next garage is shown', async () => {
    const { result, rerender } = renderHook(
      ({ garage }: { garage: { id: string } | null }) => {
        const [vehicles, setVehicles] = useState<any[]>([]);
        const [transactions, setTransactions] = useState<any[]>([]);
        useGarageSync({
          ...baseProps,
          view: 'garage',
          garage: garage as any,
          setVehicles,
          setTodayTransactions: setTransactions
        });
        return { vehicles, transactions, setVehicles, setTransactions };
      },
      { initialProps: { garage: { id: 'garage-a' } as { id: string } | null } }
    );

    act(() => {
      result.current.setVehicles([{ id: 'vehicle-from-garage-a' }]);
      result.current.setTransactions([{ id: 'transaction-from-garage-a' }]);
    });
    expect(result.current.vehicles).toHaveLength(1);
    expect(result.current.transactions).toHaveLength(1);

    rerender({ garage: { id: 'garage-b' } });

    expect(result.current.vehicles).toEqual([]);
    expect(result.current.transactions).toEqual([]);
  });

  it('ignores a queued vehicle snapshot from the previous garage after switching garages', () => {
    const callbacks: Record<string, (vehicles: any[]) => void> = {};
    serviceMocks.subscribeToActiveVehicles.mockImplementation((garageId: string, callback: (vehicles: any[]) => void) => {
      callbacks[garageId] = callback;
      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ garage }: { garage: { id: string } | null }) => {
        const [vehicles, setVehicles] = useState<any[]>([]);
        const [transactions, setTransactions] = useState<any[]>([]);
        useGarageSync({
          ...baseProps,
          view: 'garage',
          garage: garage as any,
          setVehicles,
          setTodayTransactions: setTransactions
        });
        return { vehicles, transactions };
      },
      { initialProps: { garage: { id: 'garage-a' } as { id: string } | null } }
    );

    act(() => callbacks['garage-a']([{ id: 'vehicle-from-garage-a' }]));
    expect(result.current.vehicles).toEqual([{ id: 'vehicle-from-garage-a' }]);

    rerender({ garage: { id: 'garage-b' } });
    expect(result.current.vehicles).toEqual([]);

    // Simulate a Firestore callback that was queued before unsubscribe but delivered
    // after the new garage became active.
    act(() => callbacks['garage-a']([{ id: 'late-vehicle-from-garage-a' }]));
    expect(result.current.vehicles).toEqual([]);

    act(() => callbacks['garage-b']([{ id: 'vehicle-from-garage-b' }]));
    expect(result.current.vehicles).toEqual([{ id: 'vehicle-from-garage-b' }]);
  });

  it('clears garage-scoped records when logging out of the garage view', async () => {
    const { result, rerender } = renderHook(
      ({ garage, view }: { garage: { id: string } | null; view: string }) => {
        const [vehicles, setVehicles] = useState<any[]>([]);
        const [transactions, setTransactions] = useState<any[]>([]);
        useGarageSync({
          ...baseProps,
          view,
          garage: garage as any,
          setVehicles,
          setTodayTransactions: setTransactions
        });
        return { vehicles, transactions, setVehicles, setTransactions };
      },
      { initialProps: { garage: { id: 'garage-a' } as { id: string } | null, view: 'garage' } }
    );

    act(() => {
      result.current.setVehicles([{ id: 'vehicle-from-garage-a' }]);
      result.current.setTransactions([{ id: 'transaction-from-garage-a' }]);
    });

    rerender({ garage: null, view: 'login' });

    expect(result.current.vehicles).toEqual([]);
    expect(result.current.transactions).toEqual([]);
  });
});
