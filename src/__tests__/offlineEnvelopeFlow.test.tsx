import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { Garage, Vehicle } from '../types';
import { vehicleService } from '../services';
import { calculateCost } from '../utils/cost';
import { envelopeQueue } from '../services/envelopeQueue';
import { useVehicleOperations } from '../hooks/useVehicleOperations';
import { ServerTimeProvider } from '../hooks/serverTimeContext';

/**
 * OFFLINE STEP 2 flow tests: the envelope drawer end-to-end.
 *
 * offline check-in / check-out → envelope queued + optimistic notebook patch
 * (including phone-math credits, STEP 2b) → reconnect → FIFO flush with the
 * envelope's own idempotency key → bank truth applied → envelope leaves the
 * drawer. STEP 2b answer classes: network/auth-shaped failures wait
 * (pending); duplicates the bank already resolved roll the patch back and
 * leave calmly (no red chip); true business refusals park as rejected with
 * the notebook rolled back to match the bank's NO.
 */

vi.mock('../services', () => { const _svc = {
    checkInVehicle: vi.fn(),
    checkOutVehicle: vi.fn(),
    getSubscriberByPlateOnce: vi.fn(),
  }; return { firestoreService: _svc, garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc }; });

vi.mock('../utils/sounds', () => ({
  soundManager: { play: vi.fn() },
}));

const GARAGE_ID = 'garage_offline_flow';

function createGarage(overrides: Partial<Garage> = {}): Garage {
  return {
    id: GARAGE_ID,
    name: 'جراج الاختبار',
    credits: 5,
    carsInside: 0,
    todayCount: 0,
    todayRevenue: 0,
    totalVehiclesOut: 0,
    totalRevenue: 0,
    hasMonthlySubscribers: false,
    billingModel: 'prepaid_credits',
    hourlyRate: 10,
    overnightRate: 20,
    ...overrides,
  } as Garage;
}

function renderOperations(initialGarage: Garage, initialOnline = false) {
  const showToast = vi.fn();
  const hook = renderHook(() => {
    const [garage, setGarage] = useState<Garage | null>(initialGarage);
    const [isOnline, setIsOnline] = useState<boolean>(initialOnline);
    const operations = useVehicleOperations({
      garage,
      setGarage,
      currentStaff: null,
      isOnline,
      showToast,
      closeKeyboard: vi.fn(),
    });
    return { garage, isOnline, setOnline: setIsOnline, ...operations };
  }, { wrapper: ({ children }) => <ServerTimeProvider>{children}</ServerTimeProvider> });
  return { ...hook, showToast };
}

function makeInsideVehicle(): Vehicle {
  // Entry 2.5h ago → hourly cost is ceil(2.5) = 3 hours × rate 10 = 30 EGP,
  // stable against second-level drift of the hook's server-time clock
  // (ceil would only flip at an exact hour boundary).
  return {
    id: 'سجط1234',
    plateNumber: 'س ج ط 1 2 3 4',
    plateNumberRaw: 'سجط1234',
    garageId: GARAGE_ID,
    type: 'hourly',
    status: 'inside',
    entryTime: new Date(Date.now() - 2.5 * 3600_000),
  } as Vehicle;
}

describe('offline envelope drawer flow', () => {
  beforeEach(() => {
    localStorage.removeItem('app_offline_envelopes');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.removeItem('app_offline_envelopes');
  });

  it('offline check-in queues an envelope (no Worker call) and applies the optimistic patch', async () => {
    const { result, showToast } = renderOperations(createGarage(), false);

    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    const restore = await operation;

    // Success on this phone — the plate is cleared, not restored.
    expect(restore).toBeNull();
    // Exactly one envelope, holding the full Worker payload + its own key.
    const envelopes = envelopeQueue.list(GARAGE_ID);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].kind).toBe('checkin');
    expect(envelopes[0].plateRaw).toBe('سجط1234');
    // The envelope carries the app's display format (letter group : digits).
    expect(envelopes[0].plateNumber).toBe('س ج ط : 1234');
    expect(envelopes[0].vehicleType).toBe('hourly');
    expect(envelopes[0].status).toBe('pending');
    expect(envelopes[0].id).toMatch(/^vehicle_checkin_/);
    // The Worker was never called offline.
    expect(vehicleService.checkInVehicle).not.toHaveBeenCalled();
    // Optimistic notebook patch (the same fields the flush will re-confirm).
    expect(result.current.garage?.carsInside).toBe(1);
    expect(result.current.garage?.todayCount).toBe(1);
    // STEP 2b: the credit gauge is notebook math too — one paid entry queued
    // offline is -1 on the phone (5 → 4) until the bank confirms.
    expect(result.current.garage?.credits).toBe(4);
    // Owner-visible pending toast fired (no error toast).
    const toastTypes = showToast.mock.calls.map((call) => call[1]);
    expect(toastTypes).not.toContain('error');
  }, 15000);

  it('phone-math credits floor at zero — the app never goes minus', async () => {
    const { result } = renderOperations(createGarage({ credits: 0 }), false);

    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    expect(await operation).toBeNull();

    // The envelope is still queued (the bank re-validates on flush), but the
    // gauge stays at 0 instead of showing a negative balance.
    expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(1);
    expect(result.current.garage?.credits).toBe(0);
  }, 15000);

  it('the drawer mirror refuses a second check-in for a plate already pending', async () => {
    // Pre-seed the drawer (avoids the 3s transaction-lock floor of a real op).
    envelopeQueue.enqueue({
      id: 'vehicle_checkin_seeded',
      garageId: GARAGE_ID,
      kind: 'checkin',
      plateNumber: 'س ج ط 1 2 3 4',
      plateRaw: 'سجط1234',
      vehicleType: 'hourly',
      entryTimeIso: new Date().toISOString(),
      staffName: 'مدير الجراج',
      staffId: null,
      isSubscriber: false,
      createdAt: Date.now(),
    });

    const { result, showToast } = renderOperations(createGarage(), false);
    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    // Same UX as the online ALREADY_INSIDE path: plate cleared (null), no
    // second envelope, no Worker call, counters untouched.
    expect(await operation).toBeNull();
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(1);
    expect(vehicleService.checkInVehicle).not.toHaveBeenCalled();
    expect(result.current.garage?.carsInside).toBe(0);
    expect(showToast).toHaveBeenCalledWith('هذه السيارة موجودة بالفعل بالداخل', 'error');
  }, 15000);

  it('offline check-out queues an envelope and applies the optimistic counters', async () => {
    const garage = createGarage({
      carsInside: 1,
      todayCount: 1,
      todayRevenue: 10,
      totalRevenue: 100,
      totalVehiclesOut: 0,
    });
    const { result, showToast } = renderOperations(garage, false);
    const vehicle = makeInsideVehicle();

    act(() => {
      result.current.setSelectedVehicle(vehicle);
      result.current.setShowCheckOutModal(true);
    });
    let operation!: Promise<void>;
    await act(async () => {
      operation = result.current.confirmCheckOut();
    });
    await operation;

    // Exactly one checkout envelope; the vehicle doc ID is the plate raw.
    const envelopes = envelopeQueue.list(GARAGE_ID);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].kind).toBe('checkout');
    expect(envelopes[0].plateRaw).toBe('سجط1234');
    expect(envelopes[0].vehicleType).toBe('hourly');
    expect(envelopes[0].status).toBe('pending');
    expect(vehicleService.checkOutVehicle).not.toHaveBeenCalled();

    // The receipt preview cost drives the optimistic revenue counters —
    // the bank recomputes the authoritative fee on flush.
    const expectedCost = calculateCost(vehicle, garage, new Date());
    expect(expectedCost).toBeGreaterThan(0);
    expect(result.current.garage?.carsInside).toBe(0);
    expect(result.current.garage?.todayRevenue).toBe(10 + expectedCost);
    expect(result.current.garage?.totalRevenue).toBe(100 + expectedCost);
    expect(result.current.garage?.totalVehiclesOut).toBe(1);
    // todayCount counts entries, not exits.
    expect(result.current.garage?.todayCount).toBe(1);
    // Modal closed, checkout treated as a success for the dashboard flow.
    expect(result.current.showCheckOutModal).toBe(false);
    expect(result.current.selectedVehicle).toBeNull();
    expect(result.current.checkoutJustSucceeded).toBe(true);
    const toastTypes = showToast.mock.calls.map((call) => call[1]);
    expect(toastTypes).not.toContain('error');
  }, 15000);

  it('flushes FIFO on reconnect with the envelope idempotency key and applies bank truth', async () => {
    const { result } = renderOperations(createGarage(), false);

    // Queue the entry offline.
    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await operation;
    const envelope = envelopeQueue.list(GARAGE_ID)[0];

    // The line returns — the bank confirms and answers its own numbers.
    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: true,
      data: { carsInside: 1, dailyCount: 1, lastTransactionDate: '2026-11-24', credits: 4 },
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });

    // The envelope left the drawer and its OWN idempotency key reached the
    // same Worker endpoint a live call would use.
    await waitFor(() => {
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
    });
    expect(vehicleService.checkInVehicle).toHaveBeenCalledTimes(1);
    expect(vehicleService.checkInVehicle).toHaveBeenCalledWith(
      GARAGE_ID,
      expect.objectContaining({ plateNumberRaw: 'سجط1234', type: 'hourly' }),
      envelope.id,
    );
    // Bank truth overwrote the optimistic counters (credits debited).
    expect(result.current.garage?.credits).toBe(4);
    expect(result.current.garage?.carsInside).toBe(1);
  }, 20000);

  it('keeps the envelope pending when the line drops mid-flush (NETWORK_ERROR)', async () => {
    const { result } = renderOperations(createGarage(), false);

    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await operation;

    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: false,
      error: 'تعذر الاتصال بالخادم',
      code: 'NETWORK_ERROR',
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      // The flush tried once (attempts recorded)…
      expect(envelopeQueue.list(GARAGE_ID)[0].attempts).toBe(1);
    });
    // …but the envelope stays pending for the next trigger.
    expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(1);
    expect(envelopeQueue.list(GARAGE_ID)[0].status).toBe('pending');
    expect(envelopeQueue.list(GARAGE_ID)[0].lastError).toContain('تعذر الاتصال');
  }, 20000);

  it('parks the envelope as rejected when the bank refuses it (no credits) and rolls the notebook back', async () => {
    const { result, showToast } = renderOperations(createGarage(), false);

    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await operation;

    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: false,
      error: 'رصيد غير كافٍ لإتمام هذه العملية',
      code: 'INSUFFICIENT_CREDITS',
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(1);
    });
    // Never silently dropped: rejected, with the reason, and a toast.
    const rejected = envelopeQueue.list(GARAGE_ID)[0];
    expect(rejected.status).toBe('rejected');
    expect(rejected.lastError).toBe('رصيد غير كافٍ لإتمام هذه العملية');
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('رصيد غير كافٍ'),
      'error',
    );
    // STEP 2b: the notebook mirrors the bank's NO — the provisional entry
    // (car count + phone-math credit debit) is rolled back.
    expect(result.current.garage?.carsInside).toBe(0);
    expect(result.current.garage?.credits).toBe(5);
  }, 20000);

  it('resolves a duplicate check-in calmly — the bank already had the car inside', async () => {
    const { result, showToast } = renderOperations(createGarage(), false);

    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await operation;

    // The server answers 409 CONFLICT with its Arabic duplicate text (the
    // same shape the live check-in path gets from mapDomainErrorToStatus).
    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: false,
      error: 'هذه السيارة موجودة بالفعل بالداخل',
      code: 'CONFLICT',
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
    });
    // Resolved, not refused: nothing is parked as rejected, the envelope
    // leaves the drawer, the notebook rolls back to the bank's state, and
    // the operator hears a calm info toast — never the red chip.
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(0);
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    expect(result.current.garage?.carsInside).toBe(0);
    expect(result.current.garage?.credits).toBe(5);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('مسجلة جوه بالفعل'),
      'info',
    );
  }, 20000);

  it('keeps the envelope pending on auth hiccups (UNAUTHORIZED) — a locked bank door is not a NO', async () => {
    const { result } = renderOperations(createGarage(), false);

    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await operation;

    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: false,
      error: 'انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً',
      code: 'UNAUTHORIZED',
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.list(GARAGE_ID)[0].attempts).toBe(1);
    });
    // STEP 2b: auth hiccups used to park envelopes as rejected (the owner's
    // red chips). They are retryable — pending, not rejected.
    expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(1);
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(0);
  }, 20000);

  it('resolves a duplicate checkout calmly and rolls the provisional revenue back', async () => {
    const garage = createGarage({
      carsInside: 1,
      todayCount: 1,
      todayRevenue: 10,
      totalRevenue: 100,
      totalVehiclesOut: 0,
    });
    const { result, showToast } = renderOperations(garage, false);
    const vehicle = makeInsideVehicle();

    act(() => {
      result.current.setSelectedVehicle(vehicle);
      result.current.setShowCheckOutModal(true);
    });
    await act(async () => {
      await result.current.confirmCheckOut();
    });
    const provisionalCost = calculateCost(vehicle, garage, new Date());
    expect(result.current.garage?.todayRevenue).toBe(10 + provisionalCost);

    // The bank says the car already left (checked out from another device).
    vi.mocked(vehicleService.checkOutVehicle).mockResolvedValue({
      success: false,
      error: 'تم تسجيل خروج هذه السيارة بالفعل',
      code: 'CONFLICT',
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
    });
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(0);
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    // The provisional receipt numbers are rolled back to the pre-exit state.
    expect(result.current.garage?.carsInside).toBe(1);
    expect(result.current.garage?.todayRevenue).toBe(10);
    expect(result.current.garage?.totalRevenue).toBe(100);
    expect(result.current.garage?.totalVehiclesOut).toBe(0);
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('متسجلة من قبل'),
      'info',
    );
  }, 20000);

  it('sweeps stale rejected duplicates parked by the previous build', async () => {
    // The owner's phone after the first offline test run: two envelopes the
    // old build parked as rejected for what are actually duplicate answers.
    envelopeQueue.enqueue({
      id: 'vehicle_checkin_stale1',
      garageId: GARAGE_ID,
      kind: 'checkin',
      plateNumber: 'س ج ط 1 1 1 1',
      plateRaw: 'سجط1111',
      vehicleType: 'hourly',
      entryTimeIso: new Date().toISOString(),
      staffName: 'مدير الجراج',
      staffId: null,
      isSubscriber: false,
      createdAt: Date.now(),
    });
    envelopeQueue.enqueue({
      id: 'vehicle_checkin_stale2',
      garageId: GARAGE_ID,
      kind: 'checkin',
      plateNumber: 'س ج ط 2 2 2 2',
      plateRaw: 'سجط2222',
      vehicleType: 'hourly',
      entryTimeIso: new Date().toISOString(),
      staffName: 'مدير الجراج',
      staffId: null,
      isSubscriber: false,
      createdAt: Date.now(),
    });
    envelopeQueue.markFailed('vehicle_checkin_stale1', 'هذه السيارة موجودة بالفعل بالداخل', true);
    envelopeQueue.markFailed('vehicle_checkin_stale2', 'هذه السيارة موجودة بالفعل بالداخل', true);

    const { result } = renderOperations(createGarage(), false);
    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    });
    // The red chip clears — these were resolved duplicates, not refusals.
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(0);
  }, 20000);
});
