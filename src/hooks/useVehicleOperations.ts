import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Vehicle, Garage, Staff } from '../types';
import { adminService, vehicleService } from '../services';
// OFFLINE STEP 2: direct module import (NOT the services barrel) — the
// envelope drawer is a local store, not a remote service, and flow tests
// mock the barrel while exercising the real drawer.
import { envelopeQueue } from '../services/envelopeQueue';
import { soundManager } from '../utils/sounds';
import { useServerTimeNow } from './serverTimeContext';
import { generateIdempotencyKey } from '../types/apiContracts';
import { calculateCost } from '../utils/cost';
import { safeDate } from '../utils/dates';
import { getRawPlate, formatPlateNumber } from '../utils/plates';
import { getCairoDateKey } from '../domain/garage/businessDay';
// OFFLINE DEBUG (owner request 2026-11-24, "I can't type them"): the drawer
// narrates its whole life into the black-box recorder — queue, flush tries,
// duplicate resolutions, refusals, retries. Plates travel only as plateKey
// fingerprints; the debug file never carries plate text.
import { debugRecorder, plateKey } from '../debug/debugRecorder';

const pendingOperations = new Set<string>();
function withAsyncLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (pendingOperations.has(key)) {
    return Promise.reject(new Error('Operation already in progress'));
  }
  pendingOperations.add(key);
  return fn().finally(() => {
    pendingOperations.delete(key);
  });
}

// OFFLINE STEP 2b: ApiError codes that mean "the bank's door was locked for
// a moment" — the drawer must KEEP the envelope and retry, never park it as
// a refusal. Everything the server answers with a recognized business NO
// (credits, locked garage, scope, validation, conflicts) outside this set
// is terminal for that envelope.
const FLUSH_RETRYABLE_CODES = new Set([
  'NETWORK_ERROR', 'API_TIMEOUT',
  'UNAUTHORIZED', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'INVALID_TOKEN',
  'ADMIN_AUTH_NOT_INITIALIZED', 'SESSION_VALIDATION_UNAVAILABLE',
  'RATE_LIMIT_EXCEEDED', 'INVALID_RESPONSE',
]);

interface UseVehicleOperationsProps {
  garage: Garage | null;
  setGarage: React.Dispatch<React.SetStateAction<Garage | null>>;
  currentStaff: Staff | null;
  isOnline: boolean;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  closeKeyboard: () => void;
  /** Called after a confirmed check-out. Used by the dashboard to return to
   *  the main view so the user sees the large inside-car count decrease. */
  onCheckOutComplete?: () => void;
}

export function useVehicleOperations({
  garage,
  setGarage,
  currentStaff,
  isOnline,
  showToast,
  closeKeyboard,
  onCheckOutComplete,
}: UseVehicleOperationsProps) {
  const now = useServerTimeNow();
  // PR-U: newPlateNumber state removed — moved to RegistrationCard local state.
  // The draft no longer lives in this hook (a context bucket), so every
  // keystroke only re-renders RegistrationCard, not the whole app.
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showCheckInModal, _setShowCheckInModal] = useState<boolean>(false);
  const [showCheckOutModal, _setShowCheckOutModal] = useState<boolean>(false);

  // Audit D6 (Phase 7, 2026-11-06): close all overlays before opening a
  // new one. Previously, 4 independent booleans could be true simultaneously,
  // causing two modals to render on top of each other. Now each setter
  // closes all others first — "two modals open" becomes impossible.
  const closeAllOverlays = () => {
    _setShowCheckInModal(false);
    _setShowCheckOutModal(false);
    setShowSubscriberWarning(false);
  };
  const setShowCheckInModal = (val: boolean) => {
    if (val) closeAllOverlays();
    _setShowCheckInModal(val);
  };
  const setShowCheckOutModal = (val: boolean) => {
    if (val) closeAllOverlays();
    _setShowCheckOutModal(val);
  };
  const setShowSubscriberWarning = (val: boolean) => {
    if (val) closeAllOverlays();
    _setShowSubscriberWarning(val);
  };
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingType, setLoadingType] = useState<'hourly' | 'overnight' | 'checkout' | 'delete' | 'general' | null>(null);
  // Tracks whether the last checkout succeeded. The dashboard watches this
  // (via isLoading ) to decide whether to return to the main tab
  // (success) or stay on the active-vehicles list (failure).
  const [checkoutJustSucceeded, setCheckoutJustSucceeded] = useState<boolean>(false);

  const [showSubscriberWarning, _setShowSubscriberWarning] = useState<boolean>(false);
  const [subscriberWarningPlate, setSubscriberWarningPlate] = useState<string>('');

  const deletingVehicleRef = useRef<string | null>(null);

  // ── OFFLINE STEP 2: shared confirmation writers ────────────────────────
  // Both the live Worker paths and the offline envelope flush apply the
  // server's numbers through these two writers — one patch shape, one
  // writer, no drift between online and flushed truth.
  const applyCheckInConfirmation = useCallback((serverData: any) => {
    const countPatch: Partial<Garage> = {};
    if (typeof serverData?.carsInside === 'number') countPatch.carsInside = serverData.carsInside;
    if (typeof serverData?.dailyCount === 'number') {
      countPatch.todayCount = serverData.dailyCount;
      countPatch.lastTransactionDate = typeof serverData.lastTransactionDate === 'string'
        ? serverData.lastTransactionDate
        : getCairoDateKey();
    }
    if (Object.keys(countPatch).length > 0) {
      (countPatch as any)._confirmedTransactionUntil = Date.now() + 2000;
      setGarage(prev => prev ? { ...prev, ...countPatch } : prev);
    }
    // Credits land with the count — the bank's debit is the truth the gauge
    // shows (see the live path comment below for the simultaneity history).
    if (typeof serverData?.credits === 'number') {
      setGarage(prev => prev ? {
        ...prev,
        credits: serverData.credits,
        _confirmedTransactionUntil: Date.now() + 2000,
      } : prev);
    }
  }, [setGarage]);

  const applyCheckOutConfirmation = useCallback((res: any) => {
    const serverGaragePatch: Partial<Garage> = {};
    if (typeof res?.carsInside === 'number') serverGaragePatch.carsInside = res.carsInside;
    if (typeof res?.totalVehiclesOut === 'number') serverGaragePatch.totalVehiclesOut = res.totalVehiclesOut;
    if (typeof res?.todayRevenue === 'number') serverGaragePatch.todayRevenue = res.todayRevenue;
    if (typeof res?.totalRevenue === 'number') serverGaragePatch.totalRevenue = res.totalRevenue;
    if (typeof res?.todayCount === 'number') serverGaragePatch.todayCount = res.todayCount;
    if (typeof res?.lastTransactionDate === 'string') serverGaragePatch.lastTransactionDate = res.lastTransactionDate;
    if (Object.keys(serverGaragePatch).length > 0) {
      (serverGaragePatch as any)._confirmedTransactionUntil = Date.now() + 2000;
      setGarage(prev => prev ? { ...prev, ...serverGaragePatch } : prev);
    }
  }, [setGarage]);

  // ── OFFLINE STEP 2b: notebook rollbacks ─────────────────────────────────
  // The optimistic offline patch is provisional. When the bank answers with
  // anything other than a commit — a resolved duplicate or a true refusal —
  // the notebook must go back to where it was: the bank's NO means the debit
  // never happened, so phone math must not keep showing the entry/exit/fee.
  // The next fresh Firestore snapshot re-affirms bank truth either way; the
  // rollback just keeps the notebook honest in the seconds before it lands.
  const rollbackCheckInPatch = useCallback(() => {
    setGarage(prev => prev ? {
      ...prev,
      carsInside: Math.max(0, (prev.carsInside || 0) - 1),
      todayCount: Math.max(0, (prev.todayCount || 0) - 1),
      credits: typeof prev.credits === 'number' ? prev.credits + 1 : prev.credits,
      _confirmedTransactionUntil: Date.now() + 2000,
    } : prev);
  }, [setGarage]);

  const rollbackCheckOutPatch = useCallback((phoneCost: number) => {
    setGarage(prev => prev ? {
      ...prev,
      carsInside: (prev.carsInside || 0) + 1,
      todayRevenue: Math.max(0, (prev.todayRevenue || 0) - phoneCost),
      totalRevenue: Math.max(0, (prev.totalRevenue || 0) - phoneCost),
      totalVehiclesOut: Math.max(0, (prev.totalVehiclesOut || 0) - 1),
      _confirmedTransactionUntil: Date.now() + 2000,
    } : prev);
  }, [setGarage]);

  // ── Transaction lock (Manus reliability model) ──────────────────────────
  // A shared, per-garage transaction lock that prevents overlapping check-in
  // and check-out. The lock has a 3-second minimum floor from submission —
  // even if the Worker responds instantly, controls stay disabled (isLoading
  // stays true) until the feedback animation has had time to complete. A slow
  // request extends the lock; the timer does NOT cancel or expire the request.
  //
  // IMPORTANT: isLoading must stay true for the ENTIRE lock window, not just
  // the request. The finally block must release the lock BEFORE setting
  // isLoading false, so the UI stays visibly disabled until the 3s floor ends.
  const MIN_LOCK_MS = 3000;
  const transactionLockUntilRef = useRef<number>(0);

  /** Returns true if a transaction is currently locked (in-flight or within
   *  the minimum feedback window). Checked synchronously by both check-in
   *  and check-out guards. */
  const isTransactionLocked = useCallback(() => {
    return Date.now() < transactionLockUntilRef.current || isLoading;
  }, [isLoading]);

  /** Acquires the lock. Called at the start of check-in / check-out / delete.
   *  Sets the minimum floor; the request itself may extend it. */
  const acquireTransactionLock = useCallback(() => {
    transactionLockUntilRef.current = Date.now() + MIN_LOCK_MS;
  }, []);

  /** Releases the lock, but not before the minimum floor has elapsed. Resolves
   *  immediately if the floor has passed, otherwise waits the remainder.
   *  MUST be awaited BEFORE setting isLoading false, so the UI stays visibly
   *  disabled for the entire 3s window. */
  const releaseTransactionLock = useCallback(async () => {
    const remaining = transactionLockUntilRef.current - Date.now();
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
    transactionLockUntilRef.current = 0;
  }, []);

  // Check In
  // PR-U: handleCheckIn now takes plateValue as a parameter (the draft
  // no longer lives in this hook's state). Returns the formatted plate
  // string when the caller should restore it (on error), or null on
  // success / no-restore-needed.
  const handleCheckIn = useCallback(async (type: 'hourly' | 'overnight', plateValue: string): Promise<string | null> => {
    if (!isOnline) {
      // ── OFFLINE STEP 2 (2026-11-24, owner-approved envelope drawer) ────
      // The operation lands on the phone's notebook first; the bank gets it
      // when the line returns (flush effect below). Same endpoint, same
      // idempotency rules — and the bank still owns the money: it
      // re-derives subscriber status (isSubscriberAuthoritative) and
      // re-validates credits when the envelope arrives.
      if (!garage || !plateValue || isTransactionLocked()) return null;
      closeKeyboard();

      const raw = getRawPlate(plateValue);
      const formatted = formatPlateNumber(plateValue);

      // Notebook duplicate guard: this phone already holds a pending
      // check-in envelope for this plate — the server-side ALREADY_INSIDE
      // check is not reachable offline, so the drawer is the backstop.
      if (envelopeQueue.findPendingCheckIn(garage.id, raw)) {
        showToast('هذه السيارة موجودة بالفعل بالداخل', 'error');
        return null; // clear the plate — same UX as the online duplicate path
      }

      // Subscriber status from the notebook (cached Firestore read — the
      // persistent cache answers offline). If the read itself fails we
      // refuse: never guess subscriber status for money. The bank would
      // still re-derive it on flush, but the phone must not promise a free
      // entry it cannot see.
      let isSubscriber = false;
      if (garage.hasMonthlySubscribers) {
        try {
          const subData = await adminService.getSubscriberByPlateOnce(garage.id, raw);
          if (subData && subData.endDate) {
            const end = safeDate(subData.endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (end.getTime() >= today.getTime()) {
              isSubscriber = true;
            }
          }
        } catch {
          showToast('تعذر التحقق من حالة الاشتراك أوفلاين. جرب مرة أخرى أو انتظر عودة النت.', 'error');
          return formatted;
        }
      }

      if (isSubscriber) {
        setSubscriberWarningPlate(formatted);
        setShowSubscriberWarning(true);
        soundManager.play('error');
        return formatted; // restore plate so user sees what triggered the warning
      }

      setIsLoading(true);
      setLoadingType(type);
      acquireTransactionLock();

      // The envelope: exact Worker payload + its own idempotency key that
      // stays with it for life (replays return the committed result).
      const envelope = envelopeQueue.enqueue({
        id: generateIdempotencyKey('vehicle_checkin'),
        garageId: garage.id,
        kind: 'checkin',
        plateNumber: formatted,
        plateRaw: raw,
        vehicleType: type,
        entryTimeIso: new Date(now).toISOString(),
        staffName: currentStaff ? currentStaff.name : 'مدير الجراج',
        staffId: currentStaff ? currentStaff.id : null,
        isSubscriber: false,
        createdAt: Date.now(),
      });
      debugRecorder.envelopeEvent('checkin_queued', {
        envId: envelope.id,
        garageId: garage.id,
        type,
        plateKey: plateKey(raw),
      });

      // Optimistic notebook patch — the same fields the Worker response
      // would confirm, guarded against stale snapshots the same way.
      // Daily counters roll over on the Cairo business-day key.
      //
      // OFFLINE STEP 2b (owner bug report 2026-11-24: "the credit doesn't
      // decrease when I'm offline"): the credit gauge is part of the
      // notebook math. Each paid entry the phone queues is -1 on the gauge,
      // floored at 0 (the app never goes minus — the same rule as the live
      // debit). Bank truth overwrites it on flush: applyCheckInConfirmation
      // on commit, rollbackCheckInPatch when the bank resolves/refuses.
      // Cached garage snapshots never clobber it while offline (the
      // useGarageSync cached-snapshot rule preserves local credits).
      const todayKey = getCairoDateKey();
      setGarage(prev => prev ? {
        ...prev,
        carsInside: (prev.carsInside || 0) + 1,
        todayCount: (prev.lastTransactionDate === todayKey ? (prev.todayCount || 0) : 0) + 1,
        lastTransactionDate: todayKey,
        credits: typeof prev.credits === 'number' ? Math.max(0, prev.credits - 1) : prev.credits,
        _confirmedTransactionUntil: Date.now() + 2000,
      } : prev);
      soundManager.play('checkIn');
      showToast('اتسجل أوفلاين — هتتبعت للسيرفر أول ما النت يرجع', 'info');

      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
      return null; // success on this phone — RegistrationCard clears the plate
    }
    if (!garage || !plateValue || isTransactionLocked()) return null;
    closeKeyboard();

    const raw = getRawPlate(plateValue);
    const formatted = formatPlateNumber(plateValue);


    // PR-E cache fix: removed client-side "already inside" check.
    // Pre-fix: vehicles.find(v => v.plateNumberRaw === raw) checked the
    // local vehicles array. But PR-E's persistent IDB cache serves stale
    // vehicle data from previous sessions on app reopen, causing false
    // "already inside" errors for cars that have since left. The server
    // already checks for duplicates and returns ALREADY_INSIDE — let it
    // be the source of truth.
    //
    // Recent-exit warning removed (2026-11-15, owner decision): the popup
    // that warned about quick re-entries was removed because it required
    // an always-on Firestore listener (subscribeToTodayTransactions) that
    // cost ~50 reads/garage/day. The server-side VEHICLE_ALREADY_INSIDE
    // check still catches real duplicates.

    let isSubscriber = false;

    setIsLoading(true);
    setLoadingType(type);
    acquireTransactionLock();
    // close the plate form immediately on submit, before the Worker
    // call. The form must not remain as a stale/competing visual state. The
    // busy/locked state (isLoading) provides the feedback that the operation
    // is in-flight.
    setShowCheckInModal(false);
    // PR-U: setNewPlateNumber('') removed — RegistrationCard owns the draft
    // now. UX (owner report 2026-11-12): it clears the draft at submit
    // START (before this await) and restores it when this returns a plate,
    // so the in-flight window can never flip the action area to the red
    // already-inside checkout button.

    if (garage.hasMonthlySubscribers) {
      try {
        const subData = await adminService.getSubscriberByPlateOnce(garage.id, raw);
        if (subData && subData.endDate) {
          const end = safeDate(subData.endDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (end.getTime() >= today.getTime()) {
            isSubscriber = true;
          }
        }
      } catch (e) {
        await releaseTransactionLock();
        setIsLoading(false);
        setLoadingType(null);
        showToast('تعذر التحقق من حالة الاشتراك. يرجى المحاولة مرة أخرى.', 'error');
        return formatted; // PR-U: restore plate on error
      }
    }

    if (isSubscriber) {
      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
      setSubscriberWarningPlate(formatted);
      setShowSubscriberWarning(true);
      soundManager.play('error');
      return formatted; // PR-U: restore plate so user sees what triggered the warning
    }

    // Keep the form pending until the Worker confirms the entry. The Worker
    // response contains the car count, daily count, and credit balance.
    // READS (PR2 2026-11-23): the optimistic `setVehicles(...)` cache insert
    // was removed — nothing consumes a local vehicles cache anymore (the
    // list is retired and RegistrationCard looks up plates server-side),
    // so there is nothing to optimistically update here.

    try {
      // generate the idempotency key ONCE per transaction attempt.
      // If the request fails ambiguously (network timeout), the retry will
      // reuse this same key so the server can return the original committed
      // result instead of creating a duplicate transaction.
      const idempotencyKey = generateIdempotencyKey('vehicle_checkin');
      const res = await withAsyncLock(`checkin-${garage.id}-${raw}`, () =>
        vehicleService.checkInVehicle(garage.id, {
          plateNumber: formatted,
          plateNumberRaw: raw,
          type: type,
          garageId: garage.id,
          staffId: currentStaff ? currentStaff.id : null,
          staffName: currentStaff ? currentStaff.name : 'مدير الجراج',
          isSubscriber: isSubscriber
        }, idempotencyKey)
      );

      if (!res.success) {
        throw new Error(res.error);
      }

      const serverData = (res as any).data;

      // Apply the bank's numbers through the shared writer (same patches
      // the offline flush uses — one writer, no drift).
      applyCheckInConfirmation(serverData);
      soundManager.play('checkIn');

      return null; // success — RegistrationCard clears the plate
    } catch (error: any) {
      if (error?.message === 'Operation already in progress') {
        return null;
      }

      let message = error?.message || '';
      if (message.startsWith('{') && message.endsWith('}')) {
        try {
          const detailed = JSON.parse(message);
          message = detailed.error || message;
        } catch {
          // Keep the original error message when the server detail is malformed.
        }
      }

      // PR-U: on error, return formatted so RegistrationCard restores the plate.
      // Exception: "already inside" returns null (clears the plate) because
      // the user can't retry the same plate — they need to type a new one.
      if (
        message === 'ALREADY_INSIDE' ||
        message === 'VEHICLE_ALREADY_INSIDE' ||
        message.includes('مسجلة بالفعل') ||
        message.includes('موجودة بالفعل بالداخل') ||
        message.includes('conflicts with the current state')
      ) {
        showToast('هذه السيارة موجودة بالفعل بالداخل', 'error');
        return null; // clear the plate — user needs to type a different one
      } else if (message.includes('INSUFFICIENT_ELIGIBLE_CREDITS') || message.includes('INSUFFICIENT_PAID_CREDITS') || message.includes('رصيدك خلص')) {
        showToast('رصيدك خلص — يرجى شحن الرصيد قبل إدخال سيارات جديدة', 'error');
        return formatted;
      } else if (message.includes('permission') || message.includes('PERMISSION_DENIED') || message === 'UNAUTHORIZED') {
        showToast('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً', 'error');
        return formatted;
      } else if (message.includes('الحد اليومي') || message.includes('اشتراك') || message.includes('CAPACITY_LIMIT_REACHED') || message.includes('SUBSCRIPTION_EXPIRED')) {
        showToast(message, 'error');
        return formatted;
      } else {
        showToast(message || 'حدث خطأ أثناء إدخال السيارة، يرجى المحاولة مرة أخرى', 'error');
        return formatted;
      }
    } finally {
      // release the lock BEFORE setting isLoading false, so the UI
      // stays visibly disabled for the entire 3s minimum window.
      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
    }
  }, [isOnline, garage, setGarage, isLoading, closeKeyboard, currentStaff, showToast, isTransactionLocked, acquireTransactionLock, releaseTransactionLock, applyCheckInConfirmation, now]);
  // PR-U: removed newPlateNumber from deps — it's now a parameter, not state.
  // PR2 (2026-11-23): vehicles/setVehicles removed from deps — the local
  // vehicles cache is gone.

  // Check Out
  const confirmCheckOut = useCallback(async () => {
    if (!isOnline) {
      // ── OFFLINE STEP 2 (owner-approved envelope drawer) ───────────
      // The receipt prints from the phone's math (the same calculateCost
      // preview the live flow shows). The bank re-computes the
      // authoritative fee from the vehicle doc when the envelope lands
      // (calculateVehicleCost server-side) and the flush applies the
      // server truth — the printed receipt is provisional, the bank's
      // number always wins.
      if (!garage || !selectedVehicle || isTransactionLocked()) return;
      closeKeyboard();

      const vehicleToOut = selectedVehicle;
      const cost = calculateCost(vehicleToOut, garage, now);

      setIsLoading(true);
      setLoadingType('checkout');
      acquireTransactionLock();
      setCheckoutJustSucceeded(false);

      const checkoutEnvelope = envelopeQueue.enqueue({
        id: generateIdempotencyKey('vehicle_checkout'),
        garageId: garage.id,
        kind: 'checkout',
        plateNumber: vehicleToOut.plateNumber,
        // The vehicle doc ID IS the normalized plate raw (see
        // vehicleService.getVehicleDocOnce) — so a queued checkout always
        // finds its vehicle on the server, whether the entry came from
        // Firestore or from a queued check-in envelope flushed first.
        plateRaw: vehicleToOut.id,
        vehicleType: vehicleToOut.type === 'overnight' ? 'overnight' : 'hourly',
        entryTimeIso: safeDate(vehicleToOut.entryTime).toISOString(),
        staffName: currentStaff ? currentStaff.name : 'مدير الجراج',
        staffId: currentStaff ? currentStaff.id : null,
        isSubscriber: Boolean((vehicleToOut as any)?.isSubscriber),
        // OFFLINE STEP 2b: the provisional phone cost rides on the envelope
        // so the flush can roll the revenue counters back if the bank
        // resolves (duplicate exit) or refuses instead of committing.
        phoneCost: cost,
        createdAt: Date.now(),
      });
      debugRecorder.envelopeEvent('checkout_queued', {
        envId: checkoutEnvelope.id,
        garageId: garage.id,
        plateKey: plateKey(vehicleToOut.id),
        phoneCost: cost,
      });

      // Optimistic notebook patch. todayCount stays untouched — it counts
      // entries, not exits (the server's flush response re-affirms it).
      setGarage(prev => prev ? {
        ...prev,
        carsInside: Math.max(0, (prev.carsInside || 0) - 1),
        todayRevenue: (prev.todayRevenue || 0) + cost,
        totalRevenue: (prev.totalRevenue || 0) + cost,
        totalVehiclesOut: (prev.totalVehiclesOut || 0) + 1,
        _confirmedTransactionUntil: Date.now() + 2000,
      } : prev);

      setShowCheckOutModal(false);
      setSelectedVehicle(null);
      soundManager.play('checkOut');
      setCheckoutJustSucceeded(true);
      // return to the main dashboard so the user sees the large
      // inside-car count decrease (same as the live success path).
      onCheckOutComplete?.();
      showToast('الفاتورة اتصدرت أوفلاين — هتتبعت أول ما النت يرجع', 'info');

      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
      return;
    }
    if (!garage || !selectedVehicle || isTransactionLocked()) return;
    closeKeyboard();

    const vehicleToOut = selectedVehicle;
    const cost = calculateCost(vehicleToOut, garage, now);
    setIsLoading(true);
    setLoadingType('checkout');
    acquireTransactionLock();
    setCheckoutJustSucceeded(false); // reset before attempt
    try {
      // generate the idempotency key ONCE per transaction attempt.
      // See check-in for details.
      const idempotencyKey = generateIdempotencyKey('vehicle_checkout');
      const res = await withAsyncLock(`checkout-${garage.id}-${vehicleToOut.id}`, () =>
        vehicleService.checkOutVehicle(
          garage.id,
          vehicleToOut.id,
          cost,
          currentStaff ? currentStaff.name : 'مدير الجراج',
          currentStaff ? currentStaff.id : undefined,
          idempotencyKey
        )
      );

      if (!res.success) {
        throw new Error(res.error);
      }

      // Apply the bank's numbers through the shared writer (same patches
      // the offline flush uses — one writer, no drift).
      applyCheckOutConfirmation(res);
      setShowCheckOutModal(false);
      setSelectedVehicle(null);
      // PR-U: setNewPlateNumber('') removed — RegistrationCard owns the draft.
      soundManager.play('checkOut');
      setCheckoutJustSucceeded(true);
      // return to the main dashboard so the user sees the large
      // inside-car count decrease. Without this, the active-vehicles list
      // stays on screen after checkout.
      onCheckOutComplete?.();
    } catch (error: any) {
      if (error?.message === 'Operation already in progress') {
        return;
      }
      
      let errMsg: string;
      
      try {
        const message = error?.message || '';
        if (message.startsWith('{') && message.endsWith('}')) {
          const parsed = JSON.parse(message);
          const rawErr = parsed.error;
          if (rawErr === 'ALREADY_OUTSIDE') {
            errMsg = 'هذه السيارة تم تسجيل خروجها بالفعل (من جهاز آخر)';
          } else if (rawErr === 'VEHICLE_NOT_FOUND') {
            errMsg = 'لم يتم العثور على بيانات السيارة';
          } else if (rawErr === 'GARAGE_NOT_FOUND') {
            errMsg = 'لم يتم العثور على الجراج';
          } else {
            errMsg = rawErr || 'مشكلة في البيانات، حاول مرة أخرى';
          }
        } else {
          errMsg = message || 'حدث خطأ أثناء الخروج';
        }
      } catch {
        errMsg = error?.message || 'حدث خطأ أثناء الخروج';
      }
      
      showToast(errMsg, 'error');
      // on ambiguous/network errors, keep the modal open so the user
      // can retry with the same context. Only close on definite business
      // failures (ALREADY_OUTSIDE, VEHICLE_NOT_FOUND, etc.) where retry is
      // pointless. The error classification above already extracts the
      // business error code — if we got a business error, close; if it's a
      // network/transport error, keep the modal open.
      const isBusinessError = errMsg.includes('تم تسجيل خروجها') || errMsg.includes('لم يتم العثور') || errMsg.includes('مشكلة في البيانات');
      if (isBusinessError) {
        setShowCheckOutModal(false);
        setSelectedVehicle(null);
        // PR-U: setNewPlateNumber('') removed — RegistrationCard owns the draft.
      }
    } finally {
      // release the lock BEFORE setting isLoading false, so the UI
      // stays visibly disabled for the entire 3s minimum window.
      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
    }
  }, [isOnline, garage, selectedVehicle, isLoading, closeKeyboard, currentStaff, showToast, now, setGarage, isTransactionLocked, acquireTransactionLock, releaseTransactionLock, onCheckOutComplete, applyCheckOutConfirmation]);

  // Delete Vehicle — receipt-mode (mirrors check-in/check-out).
  //
  // The vehicle stays visible in the list (with the surrounding UI dimmed via
  // isLoading) until the Worker confirms the deletion. On success we apply the
  // patch locally and tag it with `_confirmedTransactionUntil` so a stale
  // Firestore snapshot can't resurrect the deleted vehicle for ~2s. On failure
  // nothing is mutated, so no rollback path is needed — the user just sees an
  // error toast and can retry.
  //
  // Delete is brought under the SAME transaction lock as check-in/check-out so
  // a delete can't overlap an in-flight check-in or check-out (previously the
  // `isTransactionLocked()` guard in those flows did not see delete as locked).
  const handleDeleteVehicle = useCallback(async () => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى إعادة المحاولة عند عودة النت.', 'error');
      return;
    }
    if (!garage || !selectedVehicle) return;

    const entrantEntityId = currentStaff?.id ?? garage.id;
    const entrantRole = currentStaff ? 'staff' : 'garage';
    const isEntrant = selectedVehicle.enteredByEntityId === entrantEntityId && selectedVehicle.enteredByRole === entrantRole;
    if (!isEntrant) {
      showToast('يمكن فقط لمسجّل هذه السيارة حذفها', 'error');
      return;
    }

    const todayYMD = getCairoDateKey();
    if (garage.lastDeletionDate === todayYMD && (garage.dailyDeletionCount ?? 0) >= 3) {
      showToast('وصلت للحد الأقصى للحذف اليوم (3 مرات)', 'error');
      return;
    }

    if (isTransactionLocked() || deletingVehicleRef.current === selectedVehicle.id) {
      return;
    }

    const vehicleToDelete = selectedVehicle;
    const isInside = vehicleToDelete.status === 'inside';

    deletingVehicleRef.current = vehicleToDelete.id;
    soundManager.play('checkOut');
    // Close the checkout modal immediately on submit (same as check-in pattern).
    // The busy/locked state provides the feedback that the operation is in-flight.
    setShowCheckOutModal(false);
    setSelectedVehicle(null);
    // PR-U: setNewPlateNumber('') removed — RegistrationCard owns the draft.
    setIsLoading(true);
    setLoadingType('delete');
    acquireTransactionLock();
    showToast('جاري حذف اللوحة...', 'info');

    try {
      const success = await vehicleService.deleteVehicle(
        garage.id,
        vehicleToDelete.id,
        todayYMD,
        currentStaff ? currentStaff.name : 'مدير الجراج',
        currentStaff ? currentStaff.id : undefined
      );

      if (!success) {
        throw new Error('DELETE returned false');
      }

      // Receipt-mode: apply the confirmed patch locally now that the Worker has
      // committed. The 2-second `_confirmedTransactionUntil` guard prevents a
      // stale Firestore snapshot from reverting the change before it catches up.
      if (isInside) {
        // Credit refund: the Worker restores 1 credit on authorized vehicle
        // deletion. Without this optimistic update, the stale-snapshot guard
        // in useGarageSync.ts preserves the OLD credits value (pre-delete),
        // so the user never sees the credit go back up. By optimistically
        // adding the refund here, the guard preserves the CORRECT value.
        const creditRefundAmount = (vehicleToDelete as any)?.creditDebit?.amount ?? 0;
        setGarage(prev => prev ? {
          ...prev,
          carsInside: Math.max(0, (prev.carsInside || 0) - 1),
          ...(creditRefundAmount > 0 && typeof prev.credits === 'number'
            ? { credits: prev.credits + creditRefundAmount }
            : {}),
          _confirmedTransactionUntil: Date.now() + 2000,
        } : prev);
      }
      showToast('اللوحة اتمسحت بنجاح', 'success');
    } catch (err: any) {
      if (err?.message === 'reached_daily_deletion_limit' || err?.message?.includes('reached_daily_deletion_limit')) {
        showToast('وصلت للحد الأقصى للحذف اليوم (3 مرات)', 'error');
      } else {
        showToast('فشل في حذف السيارة، جرب تانى', 'error');
      }
      // No rollback needed — nothing was mutated before the Worker confirmed.
      // The vehicle remains in the list and the user can retry.
    } finally {
      deletingVehicleRef.current = null;
      // Release the lock BEFORE clearing isLoading so the UI stays visibly
      // disabled for the entire 3s minimum window (matches check-in/check-out).
      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
    }
  }, [isOnline, garage, selectedVehicle, currentStaff, showToast, setGarage, isTransactionLocked, acquireTransactionLock, releaseTransactionLock]);

  // ── OFFLINE STEP 2: the drawer flush ─────────────────────────────────────
  // When the line is back (and on every garage mount, e.g. envelopes queued
  // before a crash), drain the drawer FIFO. Order matters: a queued check-in
  // lands before its own queued check-out, so the server computes the exit
  // fee from the entry time it just created. Every envelope keeps ONE
  // idempotency key for its whole life — replays return the originally
  // committed result instead of duplicating the transaction.
  //
  // OFFLINE STEP 2b (2026-11-24, owner bug report: "when I came back online
  // they got rejected"): the bank's answers land in three classes —
  //   1. COMMITTED (res.success) → apply bank truth; the envelope leaves
  //      the drawer.
  //   2. RESOLVED DUPLICATE → the bank already had the car in that state and
  //      its duplicate guards run BEFORE the credit debit, so NO money moved:
  //        check-in  → "هذه السيارة موجودة بالفعل بالداخل"  (ALREADY_INSIDE)
  //        check-out → "تم تسجيل خروج هذه السيارة بالفعل"  (ALREADY_OUTSIDE)
  //                    "السيارة غير موجودة بالداخل"       (never entered)
  //      Roll the optimistic notebook patch back (the notebook must match
  //      the bank), remove the envelope, calm info toast. NEVER a red chip —
  //      nothing needs admin review. This is the exact hole the owner hit:
  //      offline re-entries of cars already inside surfaced as red
  //      "اترفضت من السيرفر" chips, because the phone cannot always tell
  //      which cars the bank already has inside (Worker writes bypass the
  //      Firestore cache, so the cached plate lookup can be stale/empty).
  //   3. TRUE REFUSAL → a known business NO from the bank (credits, locked
  //      garage, scope, validation). Park the envelope 'rejected' (red chip)
  //      + roll the optimistic patch back so the notebook mirrors the bank's
  //      refusal. The reason stays on the envelope for the review UI.
  //   EVERYTHING ELSE — network shapes (NETWORK_ERROR/API_TIMEOUT), auth
  //      hiccups (UNAUTHORIZED/SESSION_*/INVALID_TOKEN), server 5xx,
  //      rate limits, unknown codes — keeps the envelope 'pending' and waits
  //      for the next trigger. The bank's door being locked for a moment is
  //      NOT the bank saying no to the money; parking those as rejected was
  //      the classification bug behind the owner's red chips.
  const flushEnvelopes = useCallback(async () => {
    if (!garage?.id) return;
    // The server's conflict family shares one generic code ('CONFLICT'), so
    // resolved-duplicates are recognized by their Arabic answer text (see
    // server/routes/helpers.ts mapDomainErrorToStatus).
    const isResolvedDuplicateAnswer = (text?: string) =>
      typeof text === 'string' && (
        text.includes('موجودة بالفعل بالداخل') ||
        text.includes('تم تسجيل خروج هذه السيارة بالفعل') ||
        text.includes('السيارة غير موجودة بالداخل'));
    const isRetryableFlushFailure = (code: unknown) => {
      if (typeof code === 'string' && FLUSH_RETRYABLE_CODES.has(code)) return true;
      // Unknown/missing classification: never gamble a money letter on an
      // unclassified answer — keep it in the drawer for the next trigger.
      return typeof code !== 'string' || code.length === 0;
    };

    // OFFLINE STEP 2b heal: envelopes parked 'rejected' by the previous build
    // for what are actually resolved-duplicate answers are not refusals —
    // the bank had already resolved the car's state and no money moved (and
    // the old build never applied phone-math debits, so there is nothing to
    // roll back). Sweep them quietly so the red chip doesn't stick forever
    // on phones that ran the old build.
    const staleRejected = envelopeQueue.list(garage.id)
      .filter((item) => item.status === 'rejected' && isResolvedDuplicateAnswer(item.lastError));
    staleRejected.forEach((item) => envelopeQueue.remove(item.id));
    if (staleRejected.length > 0) {
      debugRecorder.envelopeEvent('stale_rejected_swept', { count: staleRejected.length });
    }

    const queue = envelopeQueue.list(garage.id).filter((item) => item.status === 'pending');
    debugRecorder.envelopeEvent('flush_start', {
      count: queue.length,
      online: typeof navigator === 'undefined' ? null : navigator.onLine,
    });
    for (const envelope of queue) {
      try {
        if (envelope.kind === 'checkin') {
          const res = await vehicleService.checkInVehicle(envelope.garageId, {
            plateNumber: envelope.plateNumber,
            plateNumberRaw: envelope.plateRaw,
            type: envelope.vehicleType,
            garageId: envelope.garageId,
            staffId: envelope.staffId,
            staffName: envelope.staffName,
            isSubscriber: envelope.isSubscriber,
          }, envelope.id);
          if (!res.success) {
            const code = (res as any).code;
            const errorText = res.error || 'flush failed';
            if (isRetryableFlushFailure(code)) {
              envelopeQueue.markFailed(envelope.id, errorText, false);
              debugRecorder.envelopeEvent('flush_retry', { envId: envelope.id, code: code ?? null, text: String(errorText).slice(0, 160) });
              return; // door locked for a moment — wait for the next trigger
            }
            if (isResolvedDuplicateAnswer(errorText)) {
              // The bank already had the car inside — no debit happened.
              rollbackCheckInPatch();
              envelopeQueue.remove(envelope.id);
              debugRecorder.envelopeEvent('flush_duplicate_resolved', { envId: envelope.id, text: String(errorText).slice(0, 160) });
              showToast('العربية كانت مسجلة جوه بالفعل — البنك منع التكرار ومفيش خصم', 'info');
              continue;
            }
            // True refusal: the bank said no to the money.
            rollbackCheckInPatch();
            envelopeQueue.markFailed(envelope.id, errorText, true);
            debugRecorder.envelopeEvent('flush_refused', { envId: envelope.id, text: String(errorText).slice(0, 160) });
            showToast('السيرفر رفض تسجيل سيارة معلقة: ' + errorText, 'error');
            continue;
          }
          applyCheckInConfirmation((res as any).data);
        } else {
          const res = await vehicleService.checkOutVehicle(
            envelope.garageId,
            envelope.plateRaw,
            0, // the server re-computes the fee from the vehicle doc
            envelope.staffName,
            envelope.staffId ?? undefined,
            envelope.id,
          );
          if (!res.success) {
            const code = (res as any).code;
            const errorText = res.error || 'flush failed';
            if (isRetryableFlushFailure(code)) {
              envelopeQueue.markFailed(envelope.id, errorText, false);
              debugRecorder.envelopeEvent('flush_retry', { envId: envelope.id, code: code ?? null, text: String(errorText).slice(0, 160) });
              return;
            }
            if (isResolvedDuplicateAnswer(errorText)) {
              // The car already left (or never entered) at the bank — no
              // fee happened. Put the provisional receipt numbers back.
              rollbackCheckOutPatch(envelope.phoneCost ?? 0);
              envelopeQueue.remove(envelope.id);
              debugRecorder.envelopeEvent('flush_duplicate_resolved', { envId: envelope.id, text: String(errorText).slice(0, 160) });
              showToast('فاتورة الخروج دي كانت متسجلة من قبل — البنك عدلها ومفيش فلوس اتخصمت', 'info');
              continue;
            }
            rollbackCheckOutPatch(envelope.phoneCost ?? 0);
            envelopeQueue.markFailed(envelope.id, errorText, true);
            debugRecorder.envelopeEvent('flush_refused', { envId: envelope.id, text: String(errorText).slice(0, 160) });
            showToast('السيرفر رفض فاتورة خروج معلقة: ' + errorText, 'error');
            continue;
          }
          applyCheckOutConfirmation(res);
        }
        envelopeQueue.remove(envelope.id);
        debugRecorder.envelopeEvent('flush_committed', { envId: envelope.id });
      } catch (error) {
        // Unexpected shape (parse error, missing field) — treat as
        // retryable and stop the drain so FIFO order stays intact.
        envelopeQueue.markFailed(
          envelope.id,
          error instanceof Error ? error.message : String(error),
          false,
        );
        debugRecorder.envelopeEvent('flush_retry', {
          envId: envelope.id,
          code: 'UNEXPECTED_SHAPE',
          text: String(error instanceof Error ? error.message : error).slice(0, 160),
        });
        return;
      }
    }
  }, [garage?.id, showToast, applyCheckInConfirmation, applyCheckOutConfirmation, rollbackCheckInPatch, rollbackCheckOutPatch]);

  useEffect(() => {
    if (!isOnline || !garage?.id) return;
    void flushEnvelopes();
  }, [isOnline, garage?.id, flushEnvelopes]);

  // OFFLINE STEP 2b: self-healing drain. The reconnect trigger can race a
  // not-yet-ready line (the browser flips navigator.onLine before DNS/TLS
  // are actually usable), so the first flush try can fail with NETWORK_ERROR
  // and — without this backstop — nothing re-fires until the next online
  // toggle or remount. While envelopes are pending and the line is up,
  // retry gently every 30 seconds. Local timer only: no Firestore observers,
  // no extra reads when the drawer is empty (the common case).
  useEffect(() => {
    if (!isOnline || !garage?.id) return;
    const timer = setInterval(() => {
      if (envelopeQueue.pendingCount(garage.id) > 0) void flushEnvelopes();
    }, 30000);
    return () => clearInterval(timer);
  }, [isOnline, garage?.id, flushEnvelopes]);

  // PR-H2: memoize the return value. Previously exempted in PR-H with
  // incorrect React logic ("useCallback handlers are stable so consumers
  // don't re-render"). That's wrong — React.Context compares the value
  // prop by Object.is; a new object reference re-renders ALL consumers
  // regardless of inner callback stability. The 3 PR-H memoizations
  // (navigationUi, garageData, session) were correct; this one was skipped
  // with bad justification. Now memoized with all 24 values as deps.
  // PR-U: newPlateNumber/setNewPlateNumber removed — moved to RegistrationCard.
  return useMemo(() => ({
    selectedVehicle,
    setSelectedVehicle,
    showCheckInModal,
    setShowCheckInModal,
    showCheckOutModal,
    setShowCheckOutModal,
    isLoading,
    setIsLoading,
    loadingType,
    setLoadingType,
    checkoutJustSucceeded,
    showSubscriberWarning,
    setShowSubscriberWarning,
    subscriberWarningPlate,
    setSubscriberWarningPlate,
    handleCheckIn,
    confirmCheckOut,
    handleDeleteVehicle,
  }), [
    selectedVehicle,
    setSelectedVehicle,
    showCheckInModal,
    setShowCheckInModal,
    showCheckOutModal,
    setShowCheckOutModal,
    isLoading,
    setIsLoading,
    loadingType,
    setLoadingType,
    checkoutJustSucceeded,
    showSubscriberWarning,
    setShowSubscriberWarning,
    subscriberWarningPlate,
    setSubscriberWarningPlate,
    handleCheckIn,
    confirmCheckOut,
    handleDeleteVehicle,
  ]);
}
