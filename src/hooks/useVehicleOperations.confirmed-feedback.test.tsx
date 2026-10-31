import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { Garage, Vehicle } from '../types';
import { firestoreService } from '../services';
import { useVehicleOperations } from './useVehicleOperations';

vi.mock('../services', () => ({
  firestoreService: {
    checkInVehicle: vi.fn(),
    checkOutVehicle: vi.fn(),
    getSubscriberByPlateOnce: vi.fn(),
  },
}));

vi.mock('../utils/sounds', () => ({
  soundManager: { play: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createGarage(overrides: Partial<Garage> = {}): Garage {
  return {
    id: 'garage_confirmed_feedback',
    name: 'جراج الاختبار',
    credits: 5,
    carsInside: 0,
    todayCount: 0,
    todayRevenue: 0,
    totalVehiclesOut: 0,
    totalRevenue: 0,
    hasMonthlySubscribers: false,
    billingModel: 'prepaid_credits',
    ...overrides,
  } as Garage;
}

function renderOperations(initialGarage: Garage, initialVehicles: Vehicle[] = []) {
  const showToast = vi.fn();
  const closeKeyboard = vi.fn();
  const now = new Date('2026-10-30T18:00:00.000Z');

  const hook = renderHook(() => {
    const [garage, setGarage] = useState<Garage | null>(initialGarage);
    const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
    const operations = useVehicleOperations({
      garage,
      setGarage,
      currentStaff: null,
      vehicles,
      setVehicles,
      todayTransactions: [],
      isOnline: true,
      now,
      showToast,
      closeKeyboard,
    });
    return { garage, vehicles, ...operations };
  });

  return { ...hook, showToast };
}

describe('useVehicleOperations confirmed feedback', () => {
  it('does not show check-in vehicle/count/credit changes before Worker confirmation', async () => {
    const deferred = createDeferred<any>();
    vi.mocked(firestoreService.checkInVehicle).mockReturnValue(deferred.promise);
    const plate = 'س ج ط 1 2 3 4';
    const { result } = renderOperations(createGarage());

    act(() => {
      result.current.setNewPlateNumber(plate);
      result.current.setShowCheckInModal(true);
    });

    let operation!: Promise<void>;
    act(() => {
      operation = result.current.handleCheckIn('hourly');
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.vehicles).toEqual([]);
    expect(result.current.garage?.carsInside).toBe(0);
    expect(result.current.garage?.credits).toBe(5);
    // FIX #2: the plate form closes immediately on submit (before Worker
    // confirms). The busy/locked state (isLoading) provides the feedback.
    expect(result.current.newPlateNumber).toBe('');
    expect(result.current.showCheckInModal).toBe(false);

    await act(async () => {
      deferred.resolve({
        success: true,
        data: {
          vehicle: {
            plateNumber: plate,
            plateNumberRaw: 'سجط1234',
            type: 'hourly',
            entryTime: '2026-10-30T18:00:00.000Z',
            isSubscriber: false,
          },
          carsInside: 1,
          dailyCount: 1,
          lastTransactionDate: '2026-10-30',
          credits: 4,
        },
      });
      await operation;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.vehicles).toHaveLength(1);
    expect(result.current.garage?.carsInside).toBe(1);
    expect(result.current.garage?.credits).toBe(4);
    expect(result.current.garage?.todayCount).toBe(1);
    expect(result.current.garage?.lastTransactionDate).toBe('2026-10-30');
    expect(result.current.newPlateNumber).toBe('');
    expect(result.current.showCheckInModal).toBe(false);
  });

  it('does not show checkout vehicle/count/revenue changes before Worker confirmation', async () => {
    const insideVehicle = {
      id: 'سجط1234',
      plateNumber: 'س ج ط 1 2 3 4',
      plateNumberRaw: 'سجط1234',
      garageId: 'garage_confirmed_feedback',
      type: 'hourly',
      status: 'inside',
      entryTime: new Date('2026-10-30T17:00:00.000Z'),
    } as Vehicle;
    const deferred = createDeferred<any>();
    vi.mocked(firestoreService.checkOutVehicle).mockReturnValue(deferred.promise);
    const { result } = renderOperations(
      createGarage({ carsInside: 1, todayCount: 1, todayRevenue: 10, totalVehiclesOut: 0, totalRevenue: 100 }),
      [insideVehicle],
    );

    act(() => {
      result.current.setSelectedVehicle(insideVehicle);
      result.current.setShowCheckOutModal(true);
    });

    let operation!: Promise<void>;
    act(() => {
      operation = result.current.confirmCheckOut();
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.vehicles).toEqual([insideVehicle]);
    expect(result.current.garage?.carsInside).toBe(1);
    expect(result.current.garage?.todayRevenue).toBe(10);
    expect(result.current.garage?.totalVehiclesOut).toBe(0);
    expect(result.current.garage?.totalRevenue).toBe(100);
    expect(result.current.showCheckOutModal).toBe(true);
    expect(result.current.selectedVehicle).toEqual(insideVehicle);

    await act(async () => {
      deferred.resolve({
        success: true,
        cost: 15,
        carsInside: 0,
        totalVehiclesOut: 1,
        todayRevenue: 15,
        totalRevenue: 105,
        todayCount: 0,
        lastTransactionDate: '2026-10-30',
      });
      await operation;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.vehicles).toEqual([]);
    expect(result.current.garage?.carsInside).toBe(0);
    expect(result.current.garage?.todayRevenue).toBe(15);
    expect(result.current.garage?.totalVehiclesOut).toBe(1);
    expect(result.current.garage?.totalRevenue).toBe(105);
    expect(result.current.showCheckOutModal).toBe(false);
    expect(result.current.selectedVehicle).toBeNull();
  });
});
