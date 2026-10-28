import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Garage, Vehicle } from '../types';
import { formatPlateNumber, getRawPlate } from '../utils';
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

describe('useVehicleOperations existing vehicle check-in', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps checkout available for an existing vehicle when the garage is locked and out of credits', async () => {
    const typedPlate = '123 أ ب ج';
    const plateNumberRaw = getRawPlate(typedPlate);
    const vehicle = {
      id: plateNumberRaw,
      plateNumber: formatPlateNumber(typedPlate),
      plateNumberRaw,
      garageId: 'garage-1',
      status: 'inside',
    } as Vehicle;
    const setGarage = vi.fn();
    const setVehicles = vi.fn();
    const showToast = vi.fn();
    const closeKeyboard = vi.fn();

    const { result } = renderHook(() => useVehicleOperations({
      garage: {
        id: 'garage-1',
        isLocked: true,
        creditBalance: { paid: 0, referral: 0, trial: 0 },
      } as Garage,
      setGarage,
      currentStaff: null,
      vehicles: [vehicle],
      setVehicles,
      todayTransactions: [],
      isOnline: true,
      now: new Date('2026-10-28T06:00:00.000Z'),
      showToast,
      closeKeyboard,
    }));

    act(() => {
      result.current.setNewPlateNumber(typedPlate);
      result.current.setShowCheckInModal(true);
    });

    await act(async () => {
      await result.current.handleCheckIn('hourly');
    });

    expect(result.current.selectedVehicle).toBe(vehicle);
    expect(result.current.showCheckInModal).toBe(false);
    expect(result.current.showCheckOutModal).toBe(true);
    expect(result.current.newPlateNumber).toBe('');
    expect(closeKeyboard).toHaveBeenCalledOnce();
    expect(setVehicles).not.toHaveBeenCalled();
    expect(setGarage).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'السيارة موجودة بالفعل بالداخل - تم فتح نافذة المغادرة',
      'info',
    );
  });
});
