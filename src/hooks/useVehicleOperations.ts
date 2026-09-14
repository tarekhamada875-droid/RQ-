import { useState, useRef, useCallback } from 'react';
import { Vehicle, Garage, Staff } from '../types';
import { firestoreService } from '../services';
import { soundManager } from '../utils/sounds';
import { 
  safeDate, 
  getRawPlate, 
  formatPlateNumber, 
  calculateCost,
  isSubscriptionExpired,
  getEffectiveDailyCapacity,
  isUnlimitedCapacity,
  createAsyncLock
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

  const checkInLock = useRef(createAsyncLock());
  const checkOutLock = useRef(createAsyncLock());
  const deletingVehicleRef = useRef<string | null>(null);

  // Check In
  const handleCheckIn = useCallback(async (type: 'hourly' | 'overnight', bypassWarning = false) => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى إعادة المحاولة عند عودة النت.', 'error');
      return;
    }
    if (!garage || !newPlateNumber || isLoading) return;
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
        console.error("Sub check error", e);
        showToast('تعذر التحقق من حالة الاشتراك. يرجى المحاولة مرة أخرى.', 'error');
        return;
      }
    }

    if (isSubscriber) {
      setSubscriberWarningPlate(formatted);
      setShowSubscriberWarning(true);
      setShowCheckInModal(false);
      setNewPlateNumber('');
      soundManager.play('error');
      return;
    }

    if (isSubscriptionExpired(garage)) {
      showToast('عفواً، انتهى اشتراك الجراج. يرجى تجديد الاشتراك.', 'error');
      soundManager.play('error');
      return;
    }

    if (!isUnlimitedCapacity(garage)) {
      const effCap = getEffectiveDailyCapacity(garage);
      const today = getCairoDateKey();
      const isToday = garage?.lastTransactionDate === today;
      const todayCount = isToday ? (garage.todayCount || 0) : 0;
      if (todayCount >= effCap) {
        showToast(`عفواً، وصلت للحد الأقصى اليومي للباقة (${effCap} سيارة/يوم). يرجى ترقية الباقة لتسجيل المزيد.`, 'error');
        soundManager.play('error');
        return;
      }
    }

    const lockResult = await checkInLock.current(async () => {
      const previousVehicles = [...vehicles];
      const previousGarage = garage ? { ...garage } : null;
      const optimisticVehicle: Vehicle = {
        id: raw,
        plateNumber: formatted,
        plateNumberRaw: raw,
        entryTime: new Date() as any,
        type: type,
        garageId: garage.id,
        status: 'inside',
        staffId: currentStaff ? currentStaff.id : null,
        staffName: currentStaff ? currentStaff.name : 'مدير الجراج',
        isSubscriber: isSubscriber
      };
      
      setVehicles(prev => [optimisticVehicle, ...prev.filter(v => v.id !== raw)]);
      // ⚡ INSTANT 0ms OPTIMISTIC FLIP FOR COUNTERS
      setGarage(prev => prev ? {
        ...prev,
        carsInside: (prev.carsInside || 0) + 1,
        todayCount: (prev.todayCount || 0) + 1,
        lastTransactionDate: getCairoDateKey()
      } : prev);
      setNewPlateNumber('');
      setShowCheckInModal(false);
      soundManager.play('checkIn');
      
      try {
        const res = await withAsyncLock(`checkin-${garage.id}-${raw}`, () =>
          firestoreService.checkInVehicle(garage.id, {
            plateNumber: formatted,
            plateNumberRaw: raw,
            type: type,
            garageId: garage.id,
            staffId: currentStaff ? currentStaff.id : null,
            staffName: currentStaff ? currentStaff.name : 'مدير الجراج',
            isSubscriber: isSubscriber
          })
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
          staffId: serverVehicle?.staffId ?? (currentStaff ? currentStaff.id : null),
          staffName: serverVehicle?.staffName || (currentStaff ? currentStaff.name : 'مدير الجراج'),
          isSubscriber: serverVehicle?.isSubscriber ?? isSubscriber
        };
        setVehicles(prev => [newVehicleObj, ...prev.filter(v => v.id !== raw)]);

        if (typeof serverData?.carsInside === 'number' || typeof serverData?.dailyCount === 'number') {
          setGarage(prev => prev ? {
            ...prev,
            ...(typeof serverData.carsInside === 'number' ? { carsInside: serverData.carsInside } : {}),
            ...(typeof serverData.dailyCount === 'number' ? {
              todayCount: serverData.dailyCount,
              lastTransactionDate: getCairoDateKey(),
            } : {}),
          } : prev);
        }
      } catch (error: any) {
        setVehicles(previousVehicles);
        if (previousGarage) {
          setGarage(previousGarage);
        }
        if (error?.message === 'Operation already in progress') return;
        
        let message = error?.message || '';
        if (message.startsWith('{') && message.endsWith('}')) {
          try {
            const detailed = JSON.parse(message);
            message = detailed.error || message;
          } catch (e) {}
        }

        if (message === 'ALREADY_INSIDE' || message.includes('مسجلة بالفعل')) {
          showToast('هذه السيارة موجودة بالفعل بالداخل', 'error');
        } else if (message.includes('permission') || message.includes('PERMISSION_DENIED')) {
          setNewPlateNumber(formatted);
          showToast('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً', 'error');
        } else if (message.includes('الحد اليومي') || message.includes('اشتراك')) {
          setNewPlateNumber(formatted);
          showToast(message, 'error');
        } else {
          setNewPlateNumber(formatted);
          showToast(message || 'حدث خطأ أثناء الدخول، تأكد من الاتصال بالإنترنت', 'error');
        }
      }
    });

    if (lockResult === null) {
      showToast('جاري المعالجة... يرجى الانتظار', 'info');
      return;
    }
  }, [isOnline, garage, setGarage, newPlateNumber, isLoading, closeKeyboard, vehicles, todayTransactions, showRecentExitWarning, currentStaff, showToast]);

  // Check Out
  const confirmCheckOut = useCallback(async () => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى إعادة المحاولة عند عودة النت.', 'error');
      return;
    }
    if (!garage || !selectedVehicle || isLoading) return;
    closeKeyboard();

    const vehicleToOut = selectedVehicle;

    const lockResult = await checkOutLock.current(async () => {
      const previousVehicles = [...vehicles];
      const previousGarage = garage ? { ...garage } : null;
      setVehicles(prev => prev.filter(v => v.id !== vehicleToOut.id));
      const cost = calculateCost(vehicleToOut, garage, now);
      // ⚡ INSTANT 0ms OPTIMISTIC FLIP FOR CHECK-OUT
      setGarage(prev => prev ? {
        ...prev,
        carsInside: Math.max(0, (prev.carsInside || 0) - 1),
        todayRevenue: Number(((prev.todayRevenue || 0) + cost).toFixed(2)),
        totalRevenue: Number(((prev.totalRevenue || 0) + cost).toFixed(2))
      } : prev);
      setShowCheckOutModal(false);
      setSelectedVehicle(null);
      setNewPlateNumber('');
      soundManager.play('checkOut');
      
      try {
        const res = await withAsyncLock(`checkout-${garage.id}-${vehicleToOut.id}`, () =>
          firestoreService.checkOutVehicle(
            garage.id,
            vehicleToOut.id,
            cost,
            currentStaff ? currentStaff.name : 'مدير الجراج',
            currentStaff ? currentStaff.id : undefined
          )
        );

        if (!res.success) {
          throw new Error(res.error);
        }
        if (typeof res.cost === 'number' && res.cost !== cost) {
          const costDelta = res.cost - cost;
          setGarage(prev => prev ? {
            ...prev,
            todayRevenue: Number(((prev.todayRevenue || 0) + costDelta).toFixed(2)),
            totalRevenue: Number(((prev.totalRevenue || 0) + costDelta).toFixed(2)),
          } : prev);
        }
      } catch (error: any) {
        setVehicles(previousVehicles);
        if (previousGarage) {
          setGarage(previousGarage);
        }
        setSelectedVehicle(vehicleToOut);
        
        if (error?.message === 'Operation already in progress') return;
        
        console.error('CheckOut Error:', error);
        let errMsg = 'حدث خطأ أثناء الخروج';
        
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
        } catch (e) {
          errMsg = error?.message || 'حدث خطأ أثناء الخروج';
        }
        
        showToast(errMsg, 'error');
        setShowCheckOutModal(false);
        setSelectedVehicle(null);
      }
    });

    if (lockResult === null) {
      showToast('جاري المعالجة... يرجى الانتظار', 'info');
      return;
    }
  }, [isOnline, garage, selectedVehicle, isLoading, closeKeyboard, currentStaff, showToast, now]);

  // Delete Vehicle
  const handleDeleteVehicle = useCallback(async () => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى إعادة المحاولة عند عودة النت.', 'error');
      return;
    }
    if (!garage || !selectedVehicle) return;

    const isOwner = currentStaff 
      ? (typeof selectedVehicle.staffId === 'string' && selectedVehicle.staffId === currentStaff.id)
      : (selectedVehicle.staffId == null);
    if (!isOwner) {
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
      const success = await firestoreService.deleteVehicleWithRefund(
        garage.id,
        vehicleToDelete.id,
        0,
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
      console.error('Delete Vehicle Error:', err);
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
    }
  }, [isOnline, garage, selectedVehicle, currentStaff, showToast, vehicles]);

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
