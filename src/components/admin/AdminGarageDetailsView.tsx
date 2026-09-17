/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, memo, useRef, useEffect } from 'react';
import { 
  Shield,
  ChevronRight, 
  CheckCircle2,
  Trash2, 
  Settings, 
  Users, 
  Car, 
  Plus, 
  Phone, 
  Loader2, 
  MoreVertical, 
  Check, 
  Gift, 
  ChevronDown,
  Key,
  Calendar,
  Lock,
  Unlock,
  Clock,
  Wallet
} from 'lucide-react';
import { firestoreService } from '../../services';
import { Timestamp } from 'firebase/firestore';
import { normalizeDigits, safeDate, getRemainingDays, canChangeGarageRates, formatDisplayPin, isHashedPin, generateSafePin } from '../../utils';
import { getCairoDateKey } from '../../domain/garage/businessDay';
import { Garage, Staff, Package } from '../../types';
import { BALANCE_PRESET_AMOUNTS } from '../../constants/packages';
import { useTheme } from '../../utils/ThemeContext';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { soundManager } from '../../utils/sounds';
import { useAppStore } from '../../store/appStore';

interface AdminGarageDetailsViewProps {
  selectedGarageForDetails: Garage;
  setView: (view: any) => void;
  setSelectedGarageForDetails: (garage: Garage | null) => void;
  setShowDeleteConfirm: (show: boolean) => void;
  updateGarageRate: (garage: Garage, field: keyof Garage, value: number) => Promise<void>;
  staffList: Staff[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  packages?: Package[];
  subscriptionPrices?: { weekly?: number; biweekly?: number; monthly?: number; referralFee?: number; weeklyDiscount?: number; biweeklyDiscount?: number; monthlyDiscount?: number };
  allGarages?: Garage[];
}

export const AdminGarageDetailsView = memo(({
  selectedGarageForDetails,
  setView,
  setSelectedGarageForDetails,
  setShowDeleteConfirm,
  updateGarageRate: _updateGarageRate,
  staffList,
  isLoading,
  setIsLoading,
  packages: _packages,
  subscriptionPrices: _subscriptionPrices = { weekly: 800, biweekly: 1500, monthly: 3000, referralFee: 50 },
  allGarages = []
}: AdminGarageDetailsViewProps) => {
  const [showClearBalanceConfirm, setShowClearBalanceConfirm] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [staffForm, setStaffForm] = useState({ name: '', pin: '' });
  const [selectedTopupAmount, setSelectedTopupAmount] = useState<number | null>(500);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [isTopupSuccess, setIsTopupSuccess] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);

  // Accordion state for Zone 3
  const [isZone3Open, setIsZone3Open] = useState(false);

  const [showEditGaragePinModal, setShowEditGaragePinModal] = useState(false);
  const [garagePinInput, setGaragePinInput] = useState(selectedGarageForDetails.pin || '');
  const [isUpdatingGaragePin, setIsUpdatingGaragePin] = useState(false);
  const [pinError, setPinError] = useState('');

  const [editingStaffPinId, setEditingStaffPinId] = useState<string | null>(null);
  const [editingStaffPinValue, setEditingStaffPinValue] = useState<string>('');
  const [isUpdatingStaffPin, setIsUpdatingStaffPin] = useState(false);

  const [hourlyRateInput, setHourlyRateInput] = useState<string>(String(selectedGarageForDetails.hourlyRate || 0));
  const [overnightRateInput, setOvernightRateInput] = useState<string>(String(selectedGarageForDetails.overnightRate || 0));
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [isUpdatingLock, setIsUpdatingLock] = useState(false);
  const config = useSystemConfig();
  const subscriberFlatFee = Number(config?.monthlySubscribersFlatFee) || 500;

  useEffect(() => {
    setHourlyRateInput(String(selectedGarageForDetails.hourlyRate || 0));
    setOvernightRateInput(String(selectedGarageForDetails.overnightRate || 0));
  }, [selectedGarageForDetails.id, selectedGarageForDetails.hourlyRate, selectedGarageForDetails.overnightRate]);

  useEffect(() => {
    setGaragePinInput(selectedGarageForDetails.pin || '');
  }, [selectedGarageForDetails.id, selectedGarageForDetails.pin]);

  const hasRateChanges = 
    hourlyRateInput !== String(selectedGarageForDetails.hourlyRate || 0) ||
    overnightRateInput !== String(selectedGarageForDetails.overnightRate || 0);

  const rateCheck = canChangeGarageRates(selectedGarageForDetails);

  const handleSaveRates = async () => {
    if (!rateCheck.allowed) {
      return;
    }

    const hourly = Number(normalizeDigits(hourlyRateInput));
    const overnight = Number(normalizeDigits(overnightRateInput));

    if (isNaN(hourly) || isNaN(overnight)) {
      return;
    }

    setIsSavingRates(true);
    try {
      const now = new Date();
      await firestoreService.updateGarage(selectedGarageForDetails.id, {
        hourlyRate: hourly,
        overnightRate: overnight,
        lastRateChangeDate: now,
      });
      selectedGarageForDetails.hourlyRate = hourly;
      selectedGarageForDetails.overnightRate = overnight;
      selectedGarageForDetails.lastRateChangeDate = now;
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingRates(false);
    }
  };

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTopupSubmit = async () => {
    if (!selectedTopupAmount || selectedTopupAmount <= 0) return;
    setIsLoading(true);
    const { showToast } = useAppStore.getState();
    try {
      await firestoreService.adminTopupGarageBalance(
        selectedGarageForDetails.id,
        selectedTopupAmount
      );
      
      try {
        soundManager.play("checkIn");
      } catch (err) {
        console.error("Sound error", err);
      }
      
      showToast?.(
        adminLang === 'en'
          ? `Successfully added ${selectedTopupAmount} EGP to balance`
          : `تم إضافة ${selectedTopupAmount} ج.م للرصيد بنجاح`,
        'success'
      );
      
      setIsTopupSuccess(true);
      
      // Refresh garage details in state if updater is provided
      if (typeof setSelectedGarageForDetails === 'function') {
        const updated = await firestoreService.getGarageById(selectedGarageForDetails.id);
        if (updated) {
          setSelectedGarageForDetails(updated);
        }
      }
      setTimeout(() => {
        setShowTopupModal(false);
        setIsTopupSuccess(false);
      }, 1400);
    } catch (e: any) { 
      console.error('Balance top-up failed:', e);
      alert(
        adminLang === 'en'
          ? `Top-up failed: ${e?.message || 'Unknown error'}`
          : `فشل شحن الرصيد: ${e?.message || 'خطأ غير معروف'}`
      );
    } finally { 
      setIsLoading(false); 
    }
  };

  useEffect(() => {
    if (showAddStaffModal || staffToDelete) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showAddStaffModal, staffToDelete]);

  const today = getCairoDateKey();
  const isTodayValid = selectedGarageForDetails.lastTransactionDate === today;
  
  const dailyCount = isTodayValid ? (selectedGarageForDetails.todayCount || 0) : 0;
  const dailyRevenue = isTodayValid ? (selectedGarageForDetails.todayRevenue || 0) : 0;
  
  const totalCount = selectedGarageForDetails.totalVehiclesOut || 0;
  const totalRevenue = selectedGarageForDetails.totalRevenue || 0;
  const remainingDays = getRemainingDays(selectedGarageForDetails);
  const carsInside = typeof selectedGarageForDetails.carsInside === 'number'
    ? Math.max(0, selectedGarageForDetails.carsInside)
    : (selectedGarageForDetails.activePlates ? Object.keys(selectedGarageForDetails.activePlates).length : 0);

  const generateNewStaffPin = () => generateSafePin(staffList.map((staff) => staff.pin));

  const openAddStaffModal = () => {
    setStaffForm({ name: '', pin: generateNewStaffPin() });
    setShowAddStaffModal(true);
  };

  return (
    <div 
      className={`h-screen bg-[#faf9f6] dark:bg-slate-950 font-sans pb-32 custom-scrollbar-slate text-slate-900 dark:text-slate-100 transition-colors ${adminLang === 'en' ? 'text-left' : 'text-right'} ${showAddStaffModal || staffToDelete ? 'overflow-hidden' : 'overflow-y-auto'}`} 
      dir={adminLang === 'en' ? 'ltr' : 'rtl'}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 mb-8 shadow-sm">
        <div className="max-w-5xl mx-auto flex justify-between items-center h-full">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setView('admin_dashboard');
                setSelectedGarageForDetails(null);
                setShowDeleteConfirm(false);
              }}
              className="flex items-center justify-center w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl hover:bg-slate-800 dark:hover:bg-amber-500 outline-none cursor-pointer transition-colors shadow-sm shrink-0"
              title={t('رجوع')}
            >
              <ChevronRight className={`w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5] ${adminLang === 'en' ? 'rotate-180' : ''}`} />
            </button>
            <div>
              <h1 className="text-base font-black text-slate-900 dark:text-white leading-tight">{selectedGarageForDetails.name}</h1>
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                {t('تفاصيل وإدارة الجراج')} • <span className="font-mono text-[10px]">ID: {selectedGarageForDetails.id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 relative" ref={menuRef}>
            <button 
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all outline-none border ${showMenu ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}
            >
              <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-400 stroke-[2.5]" />
            </button>

            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-slate-900/10 dark:bg-black/35" 
                  onClick={() => setShowMenu(false)}
                />
                
                <div className={`absolute top-12 ${adminLang === 'en' ? 'right-0' : 'left-0'} w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl z-50 overflow-hidden shadow-xl p-2`}>
                  <button 
                    onClick={() => {
                      setShowDeleteConfirm(true);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-xl transition-colors text-xs font-bold"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t('حذف الجراج')}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 space-y-8">
        
        {/* ================= ZONE 1: STATUS & KEY PERFORMANCE STATS ================= */}
        <section className="space-y-4">
          {/* Garage Hero Identity Banner */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 relative overflow-hidden shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                  selectedGarageForDetails.isLocked 
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60' 
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60'
                }`}>
                  <Car className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                      {selectedGarageForDetails.name}
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                      selectedGarageForDetails.isLocked
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                    }`}>
                      {selectedGarageForDetails.isLocked ? t('معطل') : t('نشط')}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-bold">
                    {selectedGarageForDetails.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-slate-700 dark:text-slate-300">{selectedGarageForDetails.phone}</span>
                      </div>
                    )}
                    
                    {/* Owner PIN quick view / edit */}
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Key className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[10px] text-slate-500">{t('رمز المالك:')}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                          {formatDisplayPin(selectedGarageForDetails.pin || selectedGarageForDetails.ownerPin)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const p = selectedGarageForDetails.pin || selectedGarageForDetails.ownerPin || '';
                            setGaragePinInput(isHashedPin(p) ? '' : p);
                            setPinError('');
                            setShowEditGaragePinModal(true);
                          }}
                          className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                        >
                          {t('تعديل')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lock / Unlock Toggle Action */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <button
                  disabled={isUpdatingLock}
                  onClick={async () => {
                    if (isUpdatingLock) return;
                    setIsUpdatingLock(true);
                    try {
                      const newLocked = !selectedGarageForDetails.isLocked;
                      await firestoreService.updateGarage(selectedGarageForDetails.id, { 
                        isLocked: newLocked,
                        isSuspended: newLocked 
                      });
                      setSelectedGarageForDetails({ 
                        ...selectedGarageForDetails, 
                        isLocked: newLocked,
                        isSuspended: newLocked
                      });
                    } catch (err) {
                      console.error('Failed to toggle garage lock:', err);
                    } finally {
                      setIsUpdatingLock(false);
                    }
                  }}
                  className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer ${
                    selectedGarageForDetails.isLocked
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                  }`}
                >
                  {isUpdatingLock ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('جاري المعالجة...')}</span>
                    </>
                  ) : selectedGarageForDetails.isLocked ? (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>{t('تفعيل الجراج الآن')}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>{t('إيقاف الخدمة فوراً')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Performance Stats Grid - Compact Single Row on Mobile & Desktop */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {/* Metric 1: Cars Inside */}
            <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm flex flex-col justify-center">
              <div className="flex items-center justify-center gap-1 mb-0.5 text-slate-500 dark:text-slate-400">
                <Car className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-black truncate">{t('بالداخل')}</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 leading-tight">
                {carsInside}
              </div>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 truncate">
                {t('سيارة حالياً')}
              </p>
            </div>

            {/* Metric 2: Today */}
            <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm flex flex-col justify-center">
              <div className="flex items-center justify-center gap-1 mb-0.5 text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-black truncate">{t('دخول اليوم')}</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 leading-tight">
                {dailyCount}
              </div>
              <p className="text-[9px] sm:text-[10px] font-black text-emerald-600 dark:text-emerald-400 font-mono truncate">
                {Number(dailyRevenue).toFixed(0)} {t('ج.م')}
              </p>
            </div>

            {/* Metric 3: Cumulative */}
            <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm flex flex-col justify-center">
              <div className="flex items-center justify-center gap-1 mb-0.5 text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                <span className="text-[11px] sm:text-xs font-black truncate">{t('إجمالي الخروج')}</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 leading-tight">
                {totalCount}
              </div>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-600 dark:text-slate-300 font-mono truncate">
                {Number(totalRevenue).toFixed(0)} {t('ج.م')}
              </p>
            </div>
          </div>
        </section>

        {/* ================= ZONE 2: SUBSCRIPTION, FINANCIALS & RECHARGE ================= */}
        <section className="space-y-6">
          {/* Subscription & Wallet Hero Card */}
          <div className="bg-slate-900 dark:bg-slate-900/90 text-white rounded-3xl border border-slate-800 p-6 sm:p-8 relative overflow-hidden shadow-md">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Wallet Balance Hero */}
              <div className="lg:col-span-6 bg-slate-800/50 border border-slate-700/60 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-slate-300 text-xs font-black uppercase tracking-wider block">
                      {t('رصيد المحفظة الحالي')}
                    </span>
                    <span className="text-[11px] text-slate-400 font-bold">
                      {t('رصيد الدفع المسبق')}
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline gap-1.5 font-mono shrink-0">
                  <span className="text-4xl sm:text-5xl font-black tracking-tight text-amber-400">
                    {(selectedGarageForDetails.balance || 0).toLocaleString('en-US')}
                  </span>
                  <span className="text-base font-bold text-amber-300/80">{t('ج.م')}</span>
                </div>
              </div>

              {/* Subscription Remaining */}
              <div className="lg:col-span-6 bg-slate-800/30 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="text-slate-400 text-xs font-black uppercase tracking-wider block mb-1">
                      {t('الاشتراك المتبقي للجراج')}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>
                        {t('تاريخ انتهاء الاشتراك:')} {(() => {
                          const expiry = selectedGarageForDetails.balanceExpiry;
                          if (!expiry) return '-';
                          const expiryDate = safeDate(expiry);
                          return expiryDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                        })()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1.5 font-mono shrink-0">
                    <span className={`text-4xl sm:text-5xl font-black tracking-tight ${
                      remainingDays <= 0 ? 'text-rose-400' : remainingDays <= 3 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {remainingDays}
                    </span>
                    <span className="text-base font-bold text-slate-400">{t('يوم')}</span>
                  </div>
                </div>

                {/* Zero Balance / Clear Wallet Action */}
                <div className="pt-2 border-t border-slate-700/40 flex justify-end">
                  {!showClearBalanceConfirm ? (
                    <button 
                      onClick={() => setShowClearBalanceConfirm(true)}
                      className="w-full sm:w-auto px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 rounded-xl font-bold text-xs border border-rose-500/20 transition-all cursor-pointer"
                    >
                      {t('تصفير المحفظة وإنهاء الاشتراك')}
                    </button>
                  ) : (
                    <div className="flex gap-2 p-1.5 bg-slate-800/90 rounded-xl border border-slate-700">
                      <button 
                        disabled={isLoading}
                        onClick={async () => {
                          if (isLoading) return;
                          setIsLoading(true);
                          try { 
                            const updateFields: any = { balance: 0, isLocked: true, balanceExpiry: Timestamp.fromDate(new Date()) };
                            await firestoreService.updateGarage(selectedGarageForDetails.id, updateFields); 
                            setShowClearBalanceConfirm(false); 
                            if (typeof setSelectedGarageForDetails === 'function') {
                              const updated = await firestoreService.getGarageById(selectedGarageForDetails.id);
                              if (updated) setSelectedGarageForDetails(updated);
                            }
                          } 
                          catch (error) { console.error(error); } finally { setIsLoading(false); }
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        <span>{isLoading ? t('جاري التصفير...') : t('تأكيد')}</span>
                      </button>
                      <button 
                        disabled={isLoading}
                        onClick={() => setShowClearBalanceConfirm(false)} 
                        className="px-3 py-1.5 text-slate-400 hover:text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
                      >
                        {t('إلغاء')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Monthly Subscribers Surcharge Toggle */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>{t('خدمة المشتركين الشهريين / الإيواء')}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
                {t('عند تفعيل هذا الخيار تضاف')} {subscriberFlatFee} {t('ج.م ثابتة تلقائياً على قيمة أية باقة أو اشتراك بالجراج.')}
              </p>
            </div>
            <button 
              type="button"
              onClick={async () => {
                const newState = !selectedGarageForDetails.hasMonthlySubscribers;
                try {
                  await firestoreService.updateGarage(selectedGarageForDetails.id, { hasMonthlySubscribers: newState });
                  setSelectedGarageForDetails({ ...selectedGarageForDetails, hasMonthlySubscribers: newState });
                } catch (e) {
                  console.error(e);
                }
              }}
              className={`w-14 h-8 rounded-full p-1 transition-all duration-300 relative shrink-0 cursor-pointer ${
                selectedGarageForDetails.hasMonthlySubscribers ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            >
              <div className={`w-6 h-6 bg-white rounded-full transition-all duration-300 transform ${
                selectedGarageForDetails.hasMonthlySubscribers ? (adminLang === 'en' ? 'translate-x-6' : '-translate-x-6') : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Direct Wallet Balance Top-Up Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  {t('شحن رصيد المحفظة')}
                </h3>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {BALANCE_PRESET_AMOUNTS.map((amt) => {
                const isSelected = selectedTopupAmount === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSelectedTopupAmount(amt)}
                    className={`py-3.5 px-3 rounded-2xl font-black transition-all flex flex-col items-center justify-center gap-1 border-2 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md scale-[1.03]'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700/60 hover:border-amber-400 dark:hover:border-amber-500/60'
                    }`}
                  >
                    <span className="text-xl font-mono leading-none">
                      {amt.toLocaleString('en-US')}
                    </span>
                    <span className={`text-[10px] font-bold ${isSelected ? 'text-slate-900' : 'text-slate-400'}`}>
                      {t('ج.م')}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Summary & Submit Action */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                <div>
                  <span className="text-slate-400 block text-[10px]">{t('الرصيد الحالي')}:</span>
                  <span className="font-mono text-sm font-black text-slate-900 dark:text-white">
                    {(selectedGarageForDetails.balance || 0).toLocaleString('en-US')} {t('ج.م')}
                  </span>
                </div>
                {selectedTopupAmount ? (
                  <>
                    <span className="text-slate-400 font-black">+</span>
                    <div>
                      <span className="text-amber-600 dark:text-amber-400 block text-[10px]">{t('المبلغ المضاف')}:</span>
                      <span className="font-mono text-sm font-black text-amber-600 dark:text-amber-400">
                        {selectedTopupAmount.toLocaleString('en-US')} {t('ج.م')}
                      </span>
                    </div>
                    <span className="text-slate-400 font-black">=</span>
                    <div>
                      <span className="text-emerald-600 dark:text-emerald-400 block text-[10px]">{t('الرصيد الجديد')}:</span>
                      <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {((selectedGarageForDetails.balance || 0) + selectedTopupAmount).toLocaleString('en-US')} {t('ج.م')}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              <button
                type="button"
                disabled={!selectedTopupAmount || isLoading}
                onClick={() => setShowTopupModal(true)}
                className="w-full sm:w-auto min-h-[48px] px-5 sm:px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
              >
                <Shield className="w-4 h-4 shrink-0" />
                {selectedTopupAmount ? (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span>{t('شحن الرصيد الآن')}</span>
                    <span className="opacity-40">•</span>
                    <span className="font-mono">{selectedTopupAmount.toLocaleString('en-US')}</span>
                    <span>{t('ج.م')}</span>
                  </span>
                ) : (
                  <span className="whitespace-nowrap">{t('اختر مبلغ الشحن')}</span>
                )}
              </button>
            </div>
          </div>

          {/* Referral System Box */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-500" />
                <span>{t('نظام مكافآت الإحالة')}</span>
              </h3>
              <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
                {t('أيام المكافآت:')} {selectedGarageForDetails.totalReferralRewardDays || 0} {t('يوم')}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Who referred this garage */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('تم ترشيح هذا الجراج بواسطة:')}
                </label>
                <select
                  value={selectedGarageForDetails.referredByGarageId || ''}
                  onChange={async (e) => {
                    const refId = e.target.value;
                    const refGarage = allGarages.find(g => g.id === refId);
                    try {
                      await firestoreService.updateGarage(selectedGarageForDetails.id, {
                        referredByGarageId: refId || null,
                        referredByGarageName: refGarage ? refGarage.name : null
                      });
                      setSelectedGarageForDetails({
                        ...selectedGarageForDetails,
                        referredByGarageId: refId || undefined,
                        referredByGarageName: refGarage ? refGarage.name : undefined
                      });
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                >
                  <option value="">{t('غير مُرشَّح من جراج آخر (مباشر)')}</option>
                  {allGarages
                    .filter(g => g.id !== selectedGarageForDetails.id && g.status !== 'pending')
                    .map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.phone || 'بدون هاتف'})
                      </option>
                    ))}
                </select>
              </div>

              {/* Garages referred by this garage */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {t('الجراجات التي رشحها هذا الجراج:')}
                  </span>
                  <span className="text-xs font-black text-emerald-600 font-mono">
                    {allGarages.filter(g => g.referredByGarageId === selectedGarageForDetails.id).length} {t('جراج')}
                  </span>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1.5 custom-scrollbar-slate">
                  {allGarages.filter(g => g.referredByGarageId === selectedGarageForDetails.id).map(rg => (
                    <div key={rg.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white dark:bg-slate-900">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{rg.name}</span>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                        {t('مُسجّل بالترشيح')}
                      </span>
                    </div>
                  ))}
                  {allGarages.filter(g => g.referredByGarageId === selectedGarageForDetails.id).length === 0 && (
                    <p className="text-[11px] text-slate-400 text-center py-2">{t('لا توجد إحالات مسجلة')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= ZONE 3: SETTINGS & STAFF (COLLAPSIBLE ACCORDION) ================= */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          {/* Accordion Header */}
          <button
            onClick={() => setIsZone3Open(!isZone3Open)}
            className="w-full p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center justify-center font-black">
                <Settings className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {t('الإعدادات والتعريفة وطاقم العمل')}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">
                {isZone3Open ? t('إخفاء') : t('عرض')}
              </span>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isZone3Open ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {/* Accordion Content */}
          {isZone3Open && (
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 space-y-6 animate-in fade-in duration-200">
              {/* Pricing Rates Configuration */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-4">
                <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-emerald-600" />
                  <span>{t('تعريفة أسعار الركنة')}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-600 dark:text-slate-400 text-center">
                      {t('سعر الساعة (ج.م)')}
                    </label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      disabled={!rateCheck.allowed}
                      value={hourlyRateInput}
                      onChange={(e) => setHourlyRateInput(e.target.value.replace(/\D/g, ''))}
                      className={`w-full bg-white dark:bg-slate-800 border-2 rounded-xl px-4 py-3 text-lg font-black text-slate-900 dark:text-white text-center transition-all outline-none font-mono ${
                        !rateCheck.allowed 
                          ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900' 
                          : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-600 dark:text-slate-400 text-center">
                      {t('سعر المبيت (ج.م)')}
                    </label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      disabled={!rateCheck.allowed}
                      value={overnightRateInput}
                      onChange={(e) => setOvernightRateInput(e.target.value.replace(/\D/g, ''))}
                      className={`w-full bg-white dark:bg-slate-800 border-2 rounded-xl px-4 py-3 text-lg font-black text-slate-900 dark:text-white text-center transition-all outline-none font-mono ${
                        !rateCheck.allowed 
                          ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900' 
                          : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                  </div>
                </div>

                {!rateCheck.allowed ? (
                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-bold">
                    <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      {t('تعديل التعريفة مقفل: مسموح بتعديل السعر مرة واحدة كل 30 يوماً. متبقي')} <strong className="font-mono text-amber-900 dark:text-amber-100 px-1">{rateCheck.daysRemaining}</strong> {t('يوم للإتاحة القادمة.')}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 text-center">
                    {t('ملاحظة: السعر الجديد يُطبق على جميع العمليات فوراً، وتُقفل إمكانية التعديل لمدة 30 يوماً.')}
                  </p>
                )}

                <button 
                  type="button"
                  disabled={!rateCheck.allowed || !hasRateChanges || isSavingRates}
                  onClick={handleSaveRates}
                  className={`w-full py-3.5 text-center rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all ${
                    rateCheck.allowed && hasRateChanges 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-98 cursor-pointer' 
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {isSavingRates ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('جاري حفظ التعديل...')}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t('حفظ تعديل التعريفة')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Staff Management Section */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>{t('طاقم عمل الجراج (الموظفين)')}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 font-mono">
                      {staffList.length}
                    </span>
                  </h4>
                  <button 
                    onClick={openAddStaffModal}
                    className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-black text-xs transition-all shadow-sm cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('إضافة موظف')}</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar-slate">
                  {staffList.map(s => (
                    <div key={s.id} className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center text-xs font-black">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 dark:text-white">{s.name}</p>
                          
                          {editingStaffPinId === s.id ? (
                            <div className="flex items-center gap-1 mt-1">
                              <input
                                type="tel"
                                inputMode="numeric"
                                value={editingStaffPinValue}
                                minLength={8}
                                maxLength={8}
                                pattern="[0-9]{8}"
                                onChange={(e) => setEditingStaffPinValue(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8))}
                                className="w-14 text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded px-1 text-center font-mono font-black"
                                placeholder="••••"
                                autoFocus
                              />
                              <button
                                onClick={async () => {
                                  if (!/^\d{8}$/.test(editingStaffPinValue)) return;
                                  setIsUpdatingStaffPin(true);
                                  try {
                                    const pinCheck = await firestoreService.isPinTaken(editingStaffPinValue, s.id);
                                    if (pinCheck.taken) {
                                      setIsUpdatingStaffPin(false);
                                      return;
                                    }
                                    await firestoreService.updateStaff(s.id, { pin: editingStaffPinValue });
                                    s.pin = editingStaffPinValue;
                                    setEditingStaffPinId(null);
                                  } catch (err) {
                                    console.error(err);
                                  } finally {
                                    setIsUpdatingStaffPin(false);
                                  }
                                }}
                                disabled={isUpdatingStaffPin}
                                className="w-5 h-5 bg-emerald-600 text-white rounded flex items-center justify-center"
                              >
                                {isUpdatingStaffPin ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[3]" />}
                              </button>
                              <button
                                onClick={() => setEditingStaffPinId(null)}
                                className="text-[10px] text-slate-400 hover:underline px-0.5"
                              >
                                {t('إلغاء')}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-400">{t('الرمز:')}</span>
                              <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-md text-[10px] font-mono font-black">
                                {formatDisplayPin(s.pin)}
                              </span>
                              <button 
                                onClick={() => {
                                  setEditingStaffPinId(s.id);
                                  setEditingStaffPinValue(s.pin && s.pin.length === 64 ? '' : (s.pin || ''));
                                }}
                                className="text-[10px] text-emerald-600 hover:underline font-bold"
                              >
                                {t('تعديل')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <button 
                        onClick={() => setStaffToDelete(s)} 
                        className="w-8 h-8 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-100 transition-colors cursor-pointer"
                        title={t('حذف الموظف')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {staffList.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400 font-bold">
                      {t('لا يوجد موظفين مسجلين لهذا الجراج')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Add Staff Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl p-6 animate-popup-30fps">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">{t('إضافة موظف جديد')}</h3>
            <p className="text-xs text-slate-400 font-bold mb-5">{t('أدخل اسم الموظف وسيتم استخدام الرمز الظاهر لتسجيل الدخول.')}</p>
            
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                if (!staffForm.name || !staffForm.pin) return;
                setIsLoading(true);
                try {
                  const pinCheck = await firestoreService.isPinTaken(staffForm.pin);
                  if (pinCheck.taken) {
                    setIsLoading(false);
                    return;
                  }
                  await firestoreService.addStaff({ 
                    name: staffForm.name, 
                    pin: staffForm.pin, 
                    garageId: selectedGarageForDetails.id, 
                    role: 'staff' 
                  });
                  setShowAddStaffModal(false);
                } catch (e) { 
                  console.error(e);
                } finally { 
                  setIsLoading(false); 
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300">{t('اسم الموظف')}</label>
                <input 
                  placeholder={t('مثال: أحمد محمد')} 
                  value={staffForm.name}
                  autoFocus
                  onChange={e => setStaffForm(prev => ({ ...prev, name: e.target.value.replace(/[0-9]/g, '') }))}
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-base font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 text-center transition-all" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300">{t('الرمز السري (PIN)')}</label>
                <div className="w-full p-4 bg-slate-900 rounded-xl text-center border border-slate-800">
                  <span className="text-3xl font-black text-emerald-400 tracking-[0.25em] font-mono">{staffForm.pin}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  disabled={isLoading || !staffForm.name} 
                  className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl font-black text-sm hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{t('جاري الإضافة...')}</span>
                    </>
                  ) : (
                    <span>{t('تأكيد الإضافة')}</span>
                  )}
                </button>
                <button 
                  type="button" 
                  disabled={isLoading}
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-black text-sm hover:bg-slate-200 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {t('إلغاء')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top-up Balance Confirmation Modal */}
      {showTopupModal && selectedTopupAmount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl p-6 sm:p-8 animate-popup-30fps">
            {isTopupSuccess ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-3 shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {t('تم شحن الرصيد بنجاح')}
                </h3>
                <p className="text-xs font-bold text-slate-400 mt-1">
                  {selectedGarageForDetails.name}
                </p>
                <div className="mt-4 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-mono font-black text-base">
                  + {selectedTopupAmount.toLocaleString('en-US')} {t('ج.م')}
                </div>
              </div>
            ) : (
              <>
                <div className="text-center mb-5">
                  <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3 text-amber-500">
                    <Wallet className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    {t('تأكيد شحن الرصيد للجراج؟')}
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    {t('أنت على وشك إضافة رصيد بمقدار')} <span className="text-slate-900 dark:text-white font-black">{selectedTopupAmount.toLocaleString('en-US')} {t('ج.م')}</span> {t('لمحفظة الجراج')}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 mb-5 space-y-2 border border-slate-100 dark:border-slate-800/80 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-500">{t('الرصيد الحالي')}:</span>
                    <span className="font-black font-mono text-slate-900 dark:text-white">
                      {(selectedGarageForDetails.balance || 0).toLocaleString('en-US')} {t('ج.م')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                    <span className="font-bold">{t('المبلغ المضاف')}:</span>
                    <span className="font-black font-mono">
                      + {selectedTopupAmount.toLocaleString('en-US')} {t('ج.م')}
                    </span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                    <span className="font-black">{t('الرصيد بعد الشحن')}:</span>
                    <span className="font-black font-mono text-sm">
                      {((selectedGarageForDetails.balance || 0) + selectedTopupAmount).toLocaleString('en-US')} {t('ج.م')}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    disabled={isLoading}
                    onClick={handleTopupSubmit}
                    className="flex-1 h-14 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] whitespace-nowrap"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{t('جاري شحن الرصيد...')}</span>
                      </>
                    ) : (
                      <span>{t('تأكيد الشحن')}</span>
                    )}
                  </button>
                  <button
                    disabled={isLoading}
                    onClick={() => setShowTopupModal(false)}
                    className="flex-1 h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm hover:bg-slate-200 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center whitespace-nowrap"
                  >
                    {t('إلغاء')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Staff Delete Confirmation Modal */}
      {staffToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-center animate-popup-30fps">
            <div className="w-14 h-14 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mb-2">{t('حذف الموظف؟')}</h3>
            <p className="text-xs text-slate-400 font-bold mb-6">
              {t('هل أنت متأكد من حذف الموظف')} <span className="text-slate-900 dark:text-white font-black">"{staffToDelete.name}"</span>؟
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={async () => {
                  if (isLoading) return;
                  setIsLoading(true);
                  try {
                    await firestoreService.removeStaff(staffToDelete.id);
                    setStaffToDelete(null);
                  } catch (e) { 
                    console.error(e);
                  } finally { 
                    setIsLoading(false); 
                  }
                }}
                disabled={isLoading}
                className="flex-1 h-14 bg-rose-600 text-white rounded-2xl font-black text-sm hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{t('جاري الحذف...')}</span>
                  </>
                ) : (
                  <span>{t('تأكيد الحذف')}</span>
                )}
              </button>
              <button 
                disabled={isLoading}
                onClick={() => setStaffToDelete(null)}
                className="flex-1 h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm hover:bg-slate-200 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center"
              >
                {t('إلغاء')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Owner PIN Modal */}
      {showEditGaragePinModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps" 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEditGaragePinModal(false);
            }
          }}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-right animate-popup-30fps"
            onClick={(e) => e.stopPropagation()}
            dir={adminLang === 'en' ? 'ltr' : 'rtl'}
          >
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-emerald-900/60">
              <Key className="w-6 h-6 stroke-[2.5]" />
            </div>

            <h3 className="text-lg font-black text-slate-900 dark:text-white text-center mb-1">
              {t('تعديل رمز المالك')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center font-bold mb-6">
              {selectedGarageForDetails.name}
            </p>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!/^\d{8}$/.test(garagePinInput)) {
                setPinError(adminLang === 'en' ? 'PIN must be exactly 8 digits' : 'يجب أن يكون الرمز 8 أرقام بالضبط');
                return;
              }
              setIsUpdatingGaragePin(true);
              setPinError('');
              try {
                const pinCheck = await firestoreService.isPinTaken(garagePinInput, selectedGarageForDetails.id);
                if (pinCheck.taken) {
                  setPinError(adminLang === 'en' 
                    ? `PIN used by ${pinCheck.name}` 
                    : `الرمز مستخدم بالفعل لدى (${pinCheck.name})`);
                  setIsUpdatingGaragePin(false);
                  return;
                }
                await firestoreService.updateGarage(selectedGarageForDetails.id, { pin: garagePinInput, ownerPin: garagePinInput });
                selectedGarageForDetails.pin = garagePinInput;
                selectedGarageForDetails.ownerPin = garagePinInput;
                if (typeof setSelectedGarageForDetails === 'function') {
                  setSelectedGarageForDetails({ ...selectedGarageForDetails, pin: garagePinInput, ownerPin: garagePinInput });
                }
                setShowEditGaragePinModal(false);
              } catch (err: any) {
                setPinError(err?.message || 'فشل تحديث الرمز');
              } finally {
                setIsUpdatingGaragePin(false);
              }
            }}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                    {t('رمز الدخول الجديد (8 أرقام):')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{8}"
                    minLength={8}
                    maxLength={8}
                    value={garagePinInput}
                    onChange={(e) => {
                      setGaragePinInput(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8));
                      setPinError('');
                    }}
                    placeholder="••••"
                    autoFocus
                    className="w-full text-center text-xl font-mono font-black tracking-widest py-3 px-4 bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl text-slate-900 dark:text-white outline-none transition-all"
                  />
                  {pinError && (
                    <p className="text-xs font-bold text-rose-500 text-center mt-2 animate-shake">
                      {pinError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isUpdatingGaragePin || !/^\d{8}$/.test(garagePinInput)}
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs sm:text-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  {isUpdatingGaragePin ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{t('جاري الحفظ...')}</span>
                    </>
                  ) : (
                    <span>{t('حفظ الرمز')}</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isUpdatingGaragePin}
                  onClick={() => setShowEditGaragePinModal(false)}
                  className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-xs sm:text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center"
                >
                  {t('إلغاء')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
