import { useState, useRef, useCallback } from 'react';
import { Vehicle, Garage, Staff } from '../types';
import { firestoreService } from '../services';
import { soundManager } from '../utils/sounds';
import { generateIdempotencyKey } from '../types/apiContracts';
import { 
  safeDate, 
  getRawPlate, 
  formatPlateNumber, 
  calculateCost
} from '../utils';
import { getCairoDateKey } from '../domain/garage/businessDay';

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

interface UseVehicleOperationsProps {
  garage: Garage | null;
  setGarage: React.Dispatch<React.SetStateAction<Garage | null>>;
  currentStaff: Staff | null;
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  todayTransactions: Vehicle[];
  isOnline: boolean;
  now: Date;
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
  vehicles,
  setVehicles,
  todayTransactions,
  isOnline,
  now,
  showToast,
  closeKeyboard,
  onCheckOutComplete,
}: UseVehicleOperationsProps) {
  const [newPlateNumber, setNewPlateNumber] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState<boolean>(false);
  const [showCheckOutModal, setShowCheckOutModal] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingType, setLoadingType] = useState<'hourly' | 'overnight' | 'checkout' | 'delete' | 'general' | null>(null);

  const [showRecentExitWarning, setShowRecentExitWarning] = useState<boolean>(false);
  const [recentVehicle, setRecentVehicle] = useState<Vehicle | null>(null);
  const [showSubscriberWarning, setShowSubscriberWarning] = useState<boolean>(false);
  const [subscriberWarningPlate, setSubscriberWarningPlate] = useState<string>('');
  const [pendingCheckInType, setPendingCheckInType] = useState<'hourly' | 'overnight' | null>(null);

  const deletingVehicleRef = useRef<string | null>(null);

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
  const handleCheckIn = useCallback(async (type: 'hourly' | 'overnight', bypassWarning = false) => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى إعادة المحاولة عند عودة النت.', 'error');
      return;
    }
    if (!garage || !newPlateNumber || isTransactionLocked()) return;
    closeKeyboard();

    const raw = getRawPlate(newPlateNumber);
    const formatted = formatPlateNumber(newPlateNumber);
    
    const existing = vehicles.find(v => v.plateNumberRaw === raw);
    if (existing) {
      showToast('هذه السيارة موجودة بالفعل بالداخل', 'error');
      setShowCheckInModal(false);
      return;
    }

    const recentlyExited = todayTransactions
      .filter(v => v.plateNumberRaw === raw)
      .sort((a, b) => {
        const timeA = a.exitTime ? safeDate(a.exitTime).getTime() : Date.now();
        const timeB = b.exitTime ? safeDate(b.exitTime).getTime() : Date.now();
        return timeB - timeA;
      })[0];

    if (recentlyExited && !showRecentExitWarning && !bypassWarning) {
      const exitTime = recentlyExited.exitTime ? safeDate(recentlyExited.exitTime) : new Date();
      if (Date.now() - exitTime.getTime() < 3600000) {
        setRecentVehicle(recentlyExited);
        setPendingCheckInType(type);
        setShowRecentExitWarning(true);
        soundManager.play('error');
        return;
      }
    }

    let isSubscriber = false;
    
    setIsLoading(true);
    setLoadingType(type);
    acquireTransactionLock();
    // FIX #2: close the plate form immediately on submit, before the Worker
    // call. The form must not remain as a stale/competing visual state. The
    // busy/locked state (isLoading) provides the feedback that the operation
    // is in-flight.
    setShowCheckInModal(false);
    setNewPlateNumber('');

    if (garage.hasMonthlySubscribers) {
      try {
        const subData = await firestoreService.getSubscriberByPlateOnce(garage.id, raw);
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
        return;
      }
    }

    if (isSubscriber) {
      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
      setSubscriberWarningPlate(formatted);
      setShowSubscriberWarning(true);
      soundManager.play('error');
      return;
    }

    // Keep the form pending until the Worker confirms the entry. The Worker
    // response contains the vehicle, car count, daily count, and credit balance.
    const entrantEntityId = currentStaff?.id ?? garage.id;
    const entrantRole = currentStaff ? 'staff' : 'garage';

    try {
      // FIX #6: generate the idempotency key ONCE per transaction attempt.
      // If the request fails ambiguously (network timeout), the retry will
      // reuse this same key so the server can return the original committed
      // result instead of creating a duplicate transaction.
      const idempotencyKey = generateIdempotencyKey('vehicle_checkin');
      const res = await withAsyncLock(`checkin-${garage.id}-${raw}`, () =>
        firestoreService.checkInVehicle(garage.id, {
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
      const serverVehicle = serverData?.vehicle;
      const newVehicleObj: Vehicle = {
        id: raw,
        plateNumber: serverVehicle?.plateNumber || formatted,
        plateNumberRaw: serverVehicle?.plateNumberRaw || raw,
        entryTime: serverVehicle?.entryTime || new Date() as any,
        type: serverVehicle?.type || type,
        garageId: garage.id,
        status: 'inside',
        staffId: serverVehicle?.staffId ?? entrantEntityId,
        staffName: serverVehicle?.staffName || (currentStaff ? currentStaff.name : 'مدير الجراج'),
        enteredByEntityId: serverVehicle?.enteredByEntityId ?? entrantEntityId,
        enteredByRole: serverVehicle?.enteredByRole ?? entrantRole,
        enteredByUid: serverVehicle?.enteredByUid ?? null,
        isSubscriber: serverVehicle?.isSubscriber ?? isSubscriber
      };

      // FIX #3: apply vehicle + count FIRST (without credits), so the count
      // animation completes before the credit-debit arrows begin. Credits are
      // applied in a second state update after a short delay.
      setVehicles(prev => [newVehicleObj, ...prev.filter(v => v.id !== raw)]);

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
      soundManager.play('checkIn');

      // FIX #3 cont: apply credits AFTER the count animation has started.
      // The GarageSubscriptionCard triggers the 5-arrow debit animation when
      // credits decrease. By delaying the credit update, the count finishes
      // changing before the arrows begin falling.
      if (typeof serverData?.credits === 'number') {
        await new Promise<void>((resolve) => setTimeout(resolve, 600));
        setGarage(prev => prev ? {
          ...prev,
          credits: serverData.credits,
          _confirmedTransactionUntil: Date.now() + 2000,
        } : prev);
      }
    } catch (error: any) {
      if (error?.message === 'Operation already in progress') {
        return;
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

      if (
        message === 'ALREADY_INSIDE' ||
        message === 'VEHICLE_ALREADY_INSIDE' ||
        message.includes('مسجلة بالفعل') ||
        message.includes('موجودة بالفعل بالداخل') ||
        message.includes('conflicts with the current state')
      ) {
        showToast('هذه السيارة موجودة بالفعل بالداخل', 'error');
      } else if (message.includes('INSUFFICIENT_ELIGIBLE_CREDITS') || message.includes('INSUFFICIENT_PAID_CREDITS') || message.includes('رصيدك خلص')) {
        showToast('رصيدك خلص — يرجى شحن الرصيد قبل إدخال سيارات جديدة', 'error');
      } else if (message.includes('permission') || message.includes('PERMISSION_DENIED') || message === 'UNAUTHORIZED') {
        setNewPlateNumber(formatted);
        showToast('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً', 'error');
      } else if (message.includes('الحد اليومي') || message.includes('اشتراك') || message.includes('CAPACITY_LIMIT_REACHED') || message.includes('SUBSCRIPTION_EXPIRED')) {
        setNewPlateNumber(formatted);
        showToast(message, 'error');
      } else {
        setNewPlateNumber(formatted);
        showToast(message || 'حدث خطأ أثناء إدخال السيارة، يرجى المحاولة مرة أخرى', 'error');
      }
    } finally {
      // FIX #1: release the lock BEFORE setting isLoading false, so the UI
      // stays visibly disabled for the entire 3s minimum window.
      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
    }
  }, [isOnline, garage, setGarage, setVehicles, newPlateNumber, isLoading, closeKeyboard, vehicles, todayTransactions, showRecentExitWarning, currentStaff, showToast, isTransactionLocked, acquireTransactionLock, releaseTransactionLock]);

  // Check Out
  const confirmCheckOut = useCallback(async () => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى إعادة المحاولة عند عودة النت.', 'error');
      return;
    }
    if (!garage || !selectedVehicle || isTransactionLocked()) return;
    closeKeyboard();

    const vehicleToOut = selectedVehicle;
    const cost = calculateCost(vehicleToOut, garage, now);
    setIsLoading(true);
    setLoadingType('checkout');
    acquireTransactionLock();
    try {
      // FIX #6: generate the idempotency key ONCE per transaction attempt.
      // See check-in for details.
      const idempotencyKey = generateIdempotencyKey('vehicle_checkout');
      const res = await withAsyncLock(`checkout-${garage.id}-${vehicleToOut.id}`, () =>
        firestoreService.checkOutVehicle(
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

      setVehicles(prev => prev.filter(v => v.id !== vehicleToOut.id));
      const serverGaragePatch: Partial<Garage> = {};
      if (typeof res.carsInside === 'number') serverGaragePatch.carsInside = res.carsInside;
      if (typeof res.totalVehiclesOut === 'number') serverGaragePatch.totalVehiclesOut = res.totalVehiclesOut;
      if (typeof res.todayRevenue === 'number') serverGaragePatch.todayRevenue = res.todayRevenue;
      if (typeof res.totalRevenue === 'number') serverGaragePatch.totalRevenue = res.totalRevenue;
      if (typeof res.todayCount === 'number') serverGaragePatch.todayCount = res.todayCount;
      if (typeof res.lastTransactionDate === 'string') serverGaragePatch.lastTransactionDate = res.lastTransactionDate;
      if (Object.keys(serverGaragePatch).length > 0) {
        (serverGaragePatch as any)._confirmedTransactionUntil = Date.now() + 2000;
        setGarage(prev => prev ? { ...prev, ...serverGaragePatch } : prev);
      }
      setShowCheckOutModal(false);
      setSelectedVehicle(null);
      setNewPlateNumber('');
      soundManager.play('checkOut');
      // FIX #4: return to the main dashboard so the user sees the large
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
      // FIX #6: on ambiguous/network errors, keep the modal open so the user
      // can retry with the same context. Only close on definite business
      // failures (ALREADY_OUTSIDE, VEHICLE_NOT_FOUND, etc.) where retry is
      // pointless. The error classification above already extracts the
      // business error code — if we got a business error, close; if it's a
      // network/transport error, keep the modal open.
      const isBusinessError = errMsg.includes('تم تسجيل خروجها') || errMsg.includes('لم يتم العثور') || errMsg.includes('مشكلة في البيانات');
      if (isBusinessError) {
        setShowCheckOutModal(false);
        setSelectedVehicle(null);
        setNewPlateNumber('');
      }
    } finally {
      // FIX #1: release the lock BEFORE setting isLoading false, so the UI
      // stays visibly disabled for the entire 3s minimum window.
      await releaseTransactionLock();
      setIsLoading(false);
      setLoadingType(null);
    }
  }, [isOnline, garage, selectedVehicle, isLoading, closeKeyboard, currentStaff, showToast, now, setGarage, setVehicles, vehicles, isTransactionLocked, acquireTransactionLock, releaseTransactionLock, onCheckOutComplete]);

  // Delete Vehicle
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

    if (isLoading || deletingVehicleRef.current === selectedVehicle.id) {
      return;
    }

    deletingVehicleRef.current = selectedVehicle.id;
    soundManager.play('checkOut');
    setShowCheckOutModal(false);
    setIsLoading(true);
    setLoadingType('delete');

    const vehicleToDelete = selectedVehicle;
    const previousVehicles = [...vehicles];
    const previousGarage = garage ? { ...garage } : null;
    const isInside = vehicleToDelete.status === 'inside';
    
    // Optimistic deletion: instantly remove from UI and decrement counter
    setVehicles(prev => prev.filter(v => v.id !== vehicleToDelete.id));
    if (isInside) {
      setGarage(prev => prev ? {
        ...prev,
        carsInside: Math.max(0, (prev.carsInside || 0) - 1)
      } : prev);
    }
    setSelectedVehicle(null);
    setNewPlateNumber('');
    showToast('جاري حذف اللوحة...', 'info');

    try {
      const success = await firestoreService.deleteVehicle(
        garage.id,
        vehicleToDelete.id,
        todayYMD,
        currentStaff ? currentStaff.name : 'مدير الجراج',
        currentStaff ? currentStaff.id : undefined
      );
      if (success) {
        showToast('اللوحة اتمسحت بنجاح', 'success');
      } else {
        // Rollback on failure
        setVehicles(previousVehicles);
        if (previousGarage) {
          setGarage(previousGarage);
        }
        showToast('فشل في حذف السيارة، جرب تانى', 'error');
      }
    } catch (err: any) {
      // Rollback on error
      setVehicles(previousVehicles);
      if (previousGarage) {
        setGarage(previousGarage);
      }
      if (err?.message === 'reached_daily_deletion_limit' || err?.message?.includes('reached_daily_deletion_limit')) {
        showToast('وصلت للحد الأقصى للحذف اليوم (3 مرات)', 'error');
      } else {
        showToast('فشل في حذف السيارة، جرب تانى', 'error');
      }
    } finally {
      deletingVehicleRef.current = null;
      setIsLoading(false);
      setLoadingType(null);
    }
  }, [isOnline, garage, selectedVehicle, isLoading, currentStaff, showToast, vehicles, setGarage, setVehicles]);

  return {
    newPlateNumber,
    setNewPlateNumber,
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
    showRecentExitWarning,
    setShowRecentExitWarning,
    recentVehicle,
    setRecentVehicle,
    showSubscriberWarning,
    setShowSubscriberWarning,
    subscriberWarningPlate,
    setSubscriberWarningPlate,
    pendingCheckInType,
    setPendingCheckInType,
    handleCheckIn,
    confirmCheckOut,
    handleDeleteVehicle,
  };
}
