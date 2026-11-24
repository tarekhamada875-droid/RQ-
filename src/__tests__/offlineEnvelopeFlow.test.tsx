import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { Garage, Vehicle } from '../types';
import { vehicleService } from '../services';
import { calculateCost } from '../utils/cost';
import { envelopeQueue } from '../services/envelopeQueue';
import { useVehicleOperations } from '../hooks/useVehicleOperations';
import { debugRecorder } from '../debug/debugRecorder';
import { getCairoDateKey } from '../domain/garage/businessDay';
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
    deleteVehicle: vi.fn(),
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

function renderOperations(initialGarage: Garage, initialOnline = false, initialSessionReady = true) {
  const showToast = vi.fn();
  const hook = renderHook(() => {
    const [garage, setGarage] = useState<Garage | null>(initialGarage);
    const [isOnline, setIsOnline] = useState<boolean>(initialOnline);
    // STEP 2c harness: default true keeps the pre-existing flush tests
    // meaningful; the session-gate test below drives it explicitly.
    const [isSessionReady, setIsSessionReady] = useState<boolean>(initialSessionReady);
    const operations = useVehicleOperations({
      garage,
      setGarage,
      currentStaff: null,
      isOnline,
      isSessionReady,
      showToast,
      closeKeyboard: vi.fn(),
    });
    return { garage, isOnline, isSessionReady, setOnline: setIsOnline, setSessionReady: setIsSessionReady, ...operations };
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

  // ── OFFLINE STEP 3: the tap times reach the bank ─────────────────────────
  it('flush sends the true entry tap time with the check-in payload', async () => {
    const tappedAtFloor = Date.now();
    const { result } = renderOperations(createGarage(), false);

    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await operation;

    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: true,
      data: { carsInside: 1, dailyCount: 1, credits: 4, lastTransactionDate: '2026-11-24' },
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });
    await waitFor(() => expect(vehicleService.checkInVehicle).toHaveBeenCalledTimes(1));

    const [, payload, idempotencyKey] = vi.mocked(vehicleService.checkInVehicle).mock.calls[0];
    expect(idempotencyKey).toMatch(/^vehicle_checkin_/);
    // The envelope's entryTimeIso rides on the flush payload — the bank
    // stamps the vehicle with the real tap, not with the flush clock.
    const entryIso = (payload as any).entryTimeIso;
    expect(typeof entryIso).toBe('string');
    const tappedAt = new Date(entryIso).getTime();
    expect(tappedAt).toBeGreaterThanOrEqual(tappedAtFloor);
    expect(tappedAt).toBeLessThanOrEqual(Date.now());
  }, 15000);

  it('flush sends the true exit tap time with the check-out payload', async () => {
    const tappedAtFloor = Date.now();
    const { result } = renderOperations(createGarage(), false);

    await act(async () => {
      result.current.setSelectedVehicle(makeInsideVehicle());
    });
    let done!: Promise<void>;
    await act(async () => {
      done = result.current.confirmCheckOut();
    });
    await done;

    vi.mocked(vehicleService.checkOutVehicle).mockResolvedValue({
      success: true,
      cost: 30,
      carsInside: 0,
      totalVehiclesOut: 1,
      todayRevenue: 30,
      totalRevenue: 30,
      todayCount: 0,
      lastTransactionDate: '2026-11-24',
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });
    await waitFor(() => expect(vehicleService.checkOutVehicle).toHaveBeenCalledTimes(1));

    const call = vi.mocked(vehicleService.checkOutVehicle).mock.calls[0];
    expect(call[1]).toBe('سجط1234');
    expect(call[5]).toMatch(/^vehicle_checkout_/);
    // The exit tap time rides as the last argument — the bank bills the
    // stay from it, not from the flush moment.
    const exitIso = call[6];
    expect(typeof exitIso).toBe('string');
    const tappedAt = new Date(exitIso as string).getTime();
    expect(tappedAt).toBeGreaterThanOrEqual(tappedAtFloor);
    expect(tappedAt).toBeLessThanOrEqual(Date.now());
  }, 15000);

  it('the recorder narrates the credit gauge story (phone debit → bank truth)', async () => {
    const narration = vi.spyOn(debugRecorder, 'envelopeEvent');
    try {
      const { result } = renderOperations(createGarage(), false);

      let operation!: Promise<string | null>;
      await act(async () => {
        operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
      });
      await operation;

      // The move the owner watches on screen: 5 → 4 (phone math).
      expect(result.current.garage?.credits).toBe(4);
      expect(narration).toHaveBeenCalledWith('phone_credit_debit', { from: 5, to: 4 });

      vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
        success: true,
        data: { carsInside: 1, dailyCount: 1, credits: 4, lastTransactionDate: '2026-11-24' },
      } as any);
      await act(async () => {
        result.current.setOnline(true);
      });
      await waitFor(() => expect(vehicleService.checkInVehicle).toHaveBeenCalledTimes(1));

      // The bank's truth lands on the same story line for the next debug file.
      expect(narration).toHaveBeenCalledWith('bank_credits_applied', { credits: 4 });
    } finally {
      narration.mockRestore();
    }
  }, 15000);

  // ── Owner debug file rq-debug-2026-11-24-13-16-36.json ──────────────────
  // The trace: a 409 duplicate arrived with NO machine code (errorCode null
  // — the deployed vehicle routes omit the field), the old code-first order
  // misfiled it as "unknown → retryable", the envelope looped forever, and
  // the four envelopes behind it starved with attempts: 0.
  it('a duplicate answered WITHOUT a code field resolves calmly and the drain keeps flowing (owner trace)', async () => {
    const { result, showToast } = renderOperations(createGarage(), false);

    // Two offline entries, two different plates.
    let first!: Promise<string | null>;
    await act(async () => {
      first = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await first;
    // The 3s transaction floor releases before the promise resolves, but
    // isLoading settles one render later — wait for it or the next tap is
    // silently swallowed by the busy guard.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let second!: Promise<string | null>;
    await act(async () => {
      second = result.current.handleCheckIn('hourly', 'س ع د 5 6 7 8');
    });
    await second;
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(2);

    // The REAL deployed shape: Arabic duplicate text, code field ABSENT.
    vi.mocked(vehicleService.checkInVehicle).mockImplementation(
      async (_garageId: string, payload: any) =>
        payload.plateNumberRaw === 'سجط1234'
          ? { success: false, error: 'هذه السيارة موجودة بالفعل بالداخل', code: undefined }
          : { success: true, data: { carsInside: 2, dailyCount: 2, credits: 3, lastTransactionDate: '2026-11-24' } },
    );

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      // BOTH envelopes left the drawer — the stuck one resolved, the
      // sibling was not starved behind it.
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
    });
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(0);
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    // The duplicate resolved calmly (no red chip), and the sibling's letter
    // really reached the bank.
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('مسجلة جوه بالفعل'),
      'info',
    );
    expect(vehicleService.checkInVehicle).toHaveBeenCalledWith(
      GARAGE_ID,
      expect.objectContaining({ plateNumberRaw: 'سعد5678' }),
      expect.any(String),
    );
    // Notebook math: 5 → A debit 4 → B debit 3 → A rollback 4 → bank B 3.
    expect(result.current.garage?.credits).toBe(3);
    expect(result.current.garage?.carsInside).toBe(2);
  }, 20000);

  it('an unclassified answer keeps its envelope pending but does not starve the siblings', async () => {
    const { result } = renderOperations(createGarage(), false);

    let first!: Promise<string | null>;
    await act(async () => {
      first = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await first;
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let second!: Promise<string | null>;
    await act(async () => {
      second = result.current.handleCheckIn('hourly', 'س ع د 5 6 7 8');
    });
    await second;
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A business-shaped answer nobody recognizes, with no code: never
    // gamble the envelope away — but its sibling still gets its own try.
    vi.mocked(vehicleService.checkInVehicle).mockImplementation(
      async (_garageId: string, payload: any) =>
        payload.plateNumberRaw === 'سجط1234'
          ? { success: false, error: 'جواب غريب من السيرفر', code: undefined }
          : { success: true, data: { carsInside: 2, dailyCount: 2, credits: 3, lastTransactionDate: '2026-11-24' } },
    );

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(1);
    });
    const stuck = envelopeQueue.list(GARAGE_ID)[0];
    expect(stuck.plateRaw).toBe('سجط1234');
    expect(stuck.status).toBe('pending');
    expect(stuck.attempts).toBeGreaterThanOrEqual(1);
    // The sibling drained even though the first envelope is stuck.
    expect(vehicleService.checkInVehicle).toHaveBeenCalledWith(
      GARAGE_ID,
      expect.objectContaining({ plateNumberRaw: 'سعد5678' }),
      expect.any(String),
    );
    expect(envelopeQueue.list(GARAGE_ID).some((item) => item.plateRaw === 'سعد5678')).toBe(false);
  }, 20000);

  it('an exit envelope waits for its own entry letter before going to the bank', async () => {
    const garage = createGarage({ carsInside: 1, todayCount: 1 });
    const { result } = renderOperations(garage, false);

    // Queue the entry offline, then the exit for the same plate.
    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await operation;
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.setSelectedVehicle(makeInsideVehicle());
      result.current.setShowCheckOutModal(true);
    });
    let exit!: Promise<void>;
    await act(async () => {
      exit = result.current.confirmCheckOut();
    });
    await exit;
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(2);

    // First drain: the line answers with a door-locked shape → the drain
    // stops at the check-in, and the exit must NOT have been attempted.
    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: false,
      error: 'تعذر الاتصال بالخادم',
      code: 'NETWORK_ERROR',
    } as any);
    vi.mocked(vehicleService.checkOutVehicle).mockResolvedValue({
      success: true,
      cost: 30,
      carsInside: 0,
      totalVehiclesOut: 1,
      todayRevenue: 30,
      totalRevenue: 130,
      todayCount: 1,
      lastTransactionDate: '2026-11-24',
    } as any);

    await act(async () => {
      result.current.setOnline(true);
    });
    await waitFor(() => {
      expect(envelopeQueue.list(GARAGE_ID)[0].attempts).toBeGreaterThanOrEqual(1);
    });
    expect(vehicleService.checkOutVehicle).not.toHaveBeenCalled();

    // Second drain: the entry lands, then its own exit goes out right after.
    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: true,
      data: { carsInside: 1, dailyCount: 2, credits: 4, lastTransactionDate: '2026-11-24' },
    } as any);
    await act(async () => {
      result.current.setOnline(false);
    });
    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
    });
    expect(vehicleService.checkOutVehicle).toHaveBeenCalledTimes(1);
    expect(vehicleService.checkOutVehicle).toHaveBeenCalledWith(
      GARAGE_ID,
      'سجط1234',
      0,
      expect.any(String),
      undefined,
      expect.any(String),
      expect.any(String),
    );
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(0);
  }, 20000);

  // STEP 2c (owner trace, seq 44 + 65): the boot flush fired ~200ms before
  // auth was ready, the bank answered 401 "session expired", and the
  // forced-logout handler kicked the operator to the PIN screen — twice in
  // three minutes. The drawer now waits for the session claim.
  it('the drawer waits for the session to be ready before it flushes', async () => {
    const { result } = renderOperations(createGarage(), false, false);

    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    await operation;
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.mocked(vehicleService.checkInVehicle).mockResolvedValue({
      success: true,
      data: { carsInside: 1, dailyCount: 1, credits: 4, lastTransactionDate: '2026-11-24' },
    } as any);

    // The line is up but the session claim has not landed yet — the flush
    // must NOT fire (no letterless envelope, no 401, no scary red toast).
    await act(async () => {
      result.current.setOnline(true);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(vehicleService.checkInVehicle).not.toHaveBeenCalled();
    expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(1);

    // The session claim lands (coordinator done) — the drawer drains now.
    await act(async () => {
      result.current.setSessionReady(true);
    });
    await waitFor(() => {
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
    });
    expect(vehicleService.checkInVehicle).toHaveBeenCalledTimes(1);
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(0);
  }, 20000);
});

/**
 * OFFLINE MISTAKE RULE (owner request 2026-11-24): "exiting a car that just
 * entered shows 0 to pay — it must not; only delete the car because it is a
 * mistake (respecting the 3 a day mistakes)" — and the delete must work
 * OFFLINE exactly like online (offline UX = online UX).
 */
describe('offline mistake rule: just-entered delete', () => {
  beforeEach(() => {
    localStorage.removeItem('app_offline_envelopes');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.removeItem('app_offline_envelopes');
  });

  /** A car that entered 2 minutes ago — inside the 5-minute window. */
  function makeJustEnteredVehicle(): Vehicle {
    return {
      id: 'سجط1234',
      plateNumber: 'س ج ط 1 2 3 4',
      plateNumberRaw: 'سجط1234',
      garageId: GARAGE_ID,
      type: 'hourly',
      status: 'inside',
      entryTime: new Date(Date.now() - 2 * 60_000),
      enteredByEntityId: GARAGE_ID,
      enteredByRole: 'garage',
      creditDebit: { amount: 1 },
    } as unknown as Vehicle;
  }

  it('offline check-out refuses a just-entered car — no 0-EGP exit letter', async () => {
    const garage = createGarage({ carsInside: 1, todayCount: 1 });
    const { result, showToast } = renderOperations(garage, false);
    const vehicle = makeJustEnteredVehicle();

    act(() => {
      result.current.setSelectedVehicle(vehicle);
      result.current.setShowCheckOutModal(true);
    });
    let operation!: Promise<void>;
    await act(async () => {
      operation = result.current.confirmCheckOut();
    });
    await operation;

    // No exit letter, no notebook change, no Worker call — the operator is
    // told to wait out the window or delete the entry as a mistake.
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    expect(vehicleService.checkOutVehicle).not.toHaveBeenCalled();
    expect(result.current.garage?.carsInside).toBe(1);
    expect(result.current.garage?.todayRevenue).toBe(0);
    expect(result.current.garage?.totalVehiclesOut).toBe(0);
    expect(showToast).toHaveBeenCalledWith(
      'العربية لسه داخلية — استنى ٥ دقايق من دخولها أو امسحها لو دخول غلط',
      'info',
    );
  }, 15000);

  it('offline delete tears up a pending check-in the bank never saw (no budget at the bank, slot charged locally)', async () => {
    const { result, showToast } = renderOperations(createGarage(), false);

    // Check the car in offline first: envelope queued, phone math applied.
    let operation!: Promise<string | null>;
    await act(async () => {
      operation = result.current.handleCheckIn('hourly', 'س ج ط 1 2 3 4');
    });
    expect(await operation).toBeNull();
    expect(result.current.garage?.credits).toBe(4);
    expect(result.current.garage?.carsInside).toBe(1);

    // Now delete the mistake offline.
    act(() => {
      result.current.setSelectedVehicle(makeJustEnteredVehicle());
      result.current.setShowCheckOutModal(true);
    });
    await act(async () => {
      await result.current.handleDeleteVehicle();
    });

    // The pending check-in envelope is gone — nothing for the bank to see.
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    // The notebook is back where it started…
    expect(result.current.garage?.credits).toBe(5);
    expect(result.current.garage?.carsInside).toBe(0);
    expect(result.current.garage?.todayCount).toBe(0);
    // …and one slot of the 3/day mistake budget is spent on this phone.
    expect(result.current.garage?.dailyDeletionCount).toBe(1);
    expect(typeof result.current.garage?.lastDeletionDate).toBe('string');
    // No Worker call happened offline.
    expect(vehicleService.deleteVehicle).not.toHaveBeenCalled();
    const toastTypes = showToast.mock.calls.map((call) => call[1]);
    expect(toastTypes).not.toContain('error');
  }, 15000);

  it('offline delete of a bank-known car queues a delete envelope and applies the optimistic patch', async () => {
    const garage = createGarage({ carsInside: 1, todayCount: 1, credits: 5 });
    const { result } = renderOperations(garage, false);
    const vehicle = makeJustEnteredVehicle();

    act(() => {
      result.current.setSelectedVehicle(vehicle);
      result.current.setShowCheckOutModal(true);
    });
    await act(async () => {
      await result.current.handleDeleteVehicle();
    });

    const envelopes = envelopeQueue.list(GARAGE_ID);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].kind).toBe('delete');
    expect(envelopes[0].plateRaw).toBe('سجط1234');
    expect(envelopes[0].refundAmount).toBe(1);
    expect(typeof envelopes[0].deleteDayKey).toBe('string');
    expect(envelopes[0].status).toBe('pending');
    expect(vehicleService.deleteVehicle).not.toHaveBeenCalled();
    // Optimistic notebook: the car left, the credit came back, the budget
    // slot is charged.
    expect(result.current.garage?.carsInside).toBe(0);
    expect(result.current.garage?.credits).toBe(6);
    expect(result.current.garage?.dailyDeletionCount).toBe(1);
  }, 15000);

  it('offline delete respects the 3/day mistake budget', async () => {
    const garage = createGarage({
      carsInside: 1,
      credits: 5,
      dailyDeletionCount: 3,
      lastDeletionDate: getCairoDateKey(),
    });
    const { result, showToast } = renderOperations(garage, false);

    act(() => {
      result.current.setSelectedVehicle(makeJustEnteredVehicle());
      result.current.setShowCheckOutModal(true);
    });
    await act(async () => {
      await result.current.handleDeleteVehicle();
    });

    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    expect(result.current.garage?.carsInside).toBe(1);
    expect(result.current.garage?.credits).toBe(5);
    expect(showToast).toHaveBeenCalledWith('وصلت للحد الأقصى للحذف اليوم (3 مرات)', 'error');
  }, 15000);

  it('flush commits the delete letter through the same Worker endpoint and key', async () => {
    const garage = createGarage({ carsInside: 1, credits: 5 });
    const { result } = renderOperations(garage, false);

    act(() => {
      result.current.setSelectedVehicle(makeJustEnteredVehicle());
      result.current.setShowCheckOutModal(true);
    });
    await act(async () => {
      await result.current.handleDeleteVehicle();
    });
    const envelope = envelopeQueue.list(GARAGE_ID)[0];

    vi.mocked(vehicleService.deleteVehicle).mockResolvedValue(undefined as any);

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
    });
    expect(vehicleService.deleteVehicle).toHaveBeenCalledTimes(1);
    // The SAME road a live delete uses, with the envelope's own key.
    expect(vehicleService.deleteVehicle).toHaveBeenCalledWith(
      GARAGE_ID,
      'سجط1234',
      undefined,
      'مدير الجراج',
      undefined,
      envelope.id,
    );
    // The optimistic patch stands (the bank's snapshot re-affirms it).
    expect(result.current.garage?.carsInside).toBe(0);
    expect(result.current.garage?.credits).toBe(6);
    expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(0);
  }, 20000);

  it('flush rolls the notebook back when the bank says the mistake budget is spent', async () => {
    const garage = createGarage({ carsInside: 1, credits: 5 });
    const { result, showToast } = renderOperations(garage, false);

    act(() => {
      result.current.setSelectedVehicle(makeJustEnteredVehicle());
      result.current.setShowCheckOutModal(true);
    });
    await act(async () => {
      await result.current.handleDeleteVehicle();
    });
    expect(result.current.garage?.credits).toBe(6);
    expect(result.current.garage?.carsInside).toBe(0);

    vi.mocked(vehicleService.deleteVehicle).mockRejectedValue(
      new Error('reached_daily_deletion_limit'),
    );

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.rejectedCount(GARAGE_ID)).toBe(1);
    });
    // The car is still inside at the bank — the notebook mirrors that NO.
    expect(result.current.garage?.carsInside).toBe(1);
    expect(result.current.garage?.credits).toBe(5);
    expect(result.current.garage?.dailyDeletionCount).toBe(0);
    expect(showToast).toHaveBeenCalledWith(
      'وصلت للحد الأقصى للحذف اليوم (3 مرات) — العربية فضلت داخلية',
      'error',
    );
  }, 20000);

  it('flush resolves a car-not-inside answer calmly — rollback, no red chip', async () => {
    const garage = createGarage({ carsInside: 1, credits: 5 });
    const { result, showToast } = renderOperations(garage, false);

    act(() => {
      result.current.setSelectedVehicle(makeJustEnteredVehicle());
      result.current.setShowCheckOutModal(true);
    });
    await act(async () => {
      await result.current.handleDeleteVehicle();
    });

    vi.mocked(vehicleService.deleteVehicle).mockRejectedValue(
      Object.assign(new Error('السيارة غير موجودة بالداخل'), { code: 'NOT_FOUND' }),
    );

    await act(async () => {
      result.current.setOnline(true);
    });

    await waitFor(() => {
      expect(envelopeQueue.pendingCount(GARAGE_ID)).toBe(0);
    });
    // Resolved duplicate: envelope dropped, notebook back to bank truth.
    expect(envelopeQueue.list(GARAGE_ID)).toHaveLength(0);
    expect(result.current.garage?.carsInside).toBe(1);
    expect(result.current.garage?.credits).toBe(5);
    expect(result.current.garage?.dailyDeletionCount).toBe(0);
    const toastTypes = showToast.mock.calls.map((call) => call[1]);
    expect(toastTypes).not.toContain('error');
  }, 20000);
});
