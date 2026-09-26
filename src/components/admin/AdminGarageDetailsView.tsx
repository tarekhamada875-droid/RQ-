/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, memo, useRef, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { firestoreService } from '../../services';
import { Timestamp } from 'firebase/firestore';
import { normalizeDigits, getRemainingDays, canChangeGarageRates, isHashedPin, generateSafePin } from '../../utils';
import { getCairoDateKey } from '../../domain/garage/businessDay';
import { Garage, Staff, Package } from '../../types';
import { useTheme } from '../../utils/ThemeContext';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { soundManager } from '../../utils/sounds';
import { useAppStore } from '../../store/appStore';
import { AdminGarageSettingsSection } from './AdminGarageSettingsSection';
import { AdminGarageHeroAndStats } from './garage-details/AdminGarageHeroAndStats';
import { AdminGarageFinancialsSection } from './garage-details/AdminGarageFinancialsSection';
import { AdminGarageModals } from './garage-details/AdminGarageModals';

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
    if (!rateCheck.allowed) return;

    const hourly = Number(normalizeDigits(hourlyRateInput));
    const overnight = Number(normalizeDigits(overnightRateInput));

    if (isNaN(hourly) || isNaN(overnight)) return;

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

  const handleClearBalance = async () => {
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
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLock = async () => {
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
  };

  const handleToggleMonthlySubscribers = async () => {
    const newState = !selectedGarageForDetails.hasMonthlySubscribers;
    try {
      await firestoreService.updateGarage(selectedGarageForDetails.id, { hasMonthlySubscribers: newState });
      setSelectedGarageForDetails({ ...selectedGarageForDetails, hasMonthlySubscribers: newState });
    } catch (e) {
      console.error(e);
    }
  };

  const handleReferredByChange = async (refId: string) => {
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
  };

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
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
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await firestoreService.removeStaff(staffId);
      setStaffToDelete(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGaragePin = async (e: React.FormEvent) => {
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

  const generateNewStaffPin = useCallback(() => {
    return generateSafePin(staffList.map((staff) => staff.pin));
  }, [staffList]);

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
        {/* Zone 1: Status & Key Performance Stats */}
        <AdminGarageHeroAndStats
          garage={selectedGarageForDetails}
          t={t}
          adminLang={adminLang}
          carsInside={carsInside}
          dailyCount={dailyCount}
          dailyRevenue={dailyRevenue}
          totalCount={totalCount}
          totalRevenue={totalRevenue}
          isUpdatingLock={isUpdatingLock}
          onToggleLock={handleToggleLock}
          onOpenEditPin={() => {
            const p = selectedGarageForDetails.pin || selectedGarageForDetails.ownerPin || '';
            setGaragePinInput(isHashedPin(p) ? '' : p);
            setPinError('');
            setShowEditGaragePinModal(true);
          }}
        />

        {/* Zone 2: Subscription, Financials & Recharge */}
        <AdminGarageFinancialsSection
          garage={selectedGarageForDetails}
          t={t}
          adminLang={adminLang}
          remainingDays={remainingDays}
          showClearBalanceConfirm={showClearBalanceConfirm}
          setShowClearBalanceConfirm={setShowClearBalanceConfirm}
          isLoading={isLoading}
          onClearBalance={handleClearBalance}
          subscriberFlatFee={subscriberFlatFee}
          onToggleMonthlySubscribers={handleToggleMonthlySubscribers}
          selectedTopupAmount={selectedTopupAmount}
          setSelectedTopupAmount={setSelectedTopupAmount}
          onOpenTopupModal={() => setShowTopupModal(true)}
          allGarages={allGarages}
          onReferredByChange={handleReferredByChange}
        />

        {/* Zone 3: Operations & Staff Management */}
        <AdminGarageSettingsSection
          t={t}
          isZone3Open={isZone3Open}
          setIsZone3Open={setIsZone3Open}
          rateCheck={rateCheck}
          hourlyRateInput={hourlyRateInput}
          setHourlyRateInput={setHourlyRateInput}
          overnightRateInput={overnightRateInput}
          setOvernightRateInput={setOvernightRateInput}
          hasRateChanges={hasRateChanges}
          isSavingRates={isSavingRates}
          handleSaveRates={handleSaveRates}
          staffList={staffList}
          openAddStaffModal={openAddStaffModal}
          editingStaffPinId={editingStaffPinId}
          setEditingStaffPinId={setEditingStaffPinId}
          editingStaffPinValue={editingStaffPinValue}
          setEditingStaffPinValue={setEditingStaffPinValue}
          isUpdatingStaffPin={isUpdatingStaffPin}
          setIsUpdatingStaffPin={setIsUpdatingStaffPin}
          setStaffToDelete={setStaffToDelete}
        />
      </div>

      {/* Modals */}
      <AdminGarageModals
        garage={selectedGarageForDetails}
        t={t}
        adminLang={adminLang}
        isLoading={isLoading}
        showAddStaffModal={showAddStaffModal}
        setShowAddStaffModal={setShowAddStaffModal}
        staffForm={staffForm}
        setStaffForm={setStaffForm}
        onAddStaffSubmit={handleAddStaffSubmit}
        showTopupModal={showTopupModal}
        setShowTopupModal={setShowTopupModal}
        selectedTopupAmount={selectedTopupAmount}
        isTopupSuccess={isTopupSuccess}
        onTopupSubmit={handleTopupSubmit}
        staffToDelete={staffToDelete}
        setStaffToDelete={setStaffToDelete}
        onDeleteStaff={handleDeleteStaff}
        showEditGaragePinModal={showEditGaragePinModal}
        setShowEditGaragePinModal={setShowEditGaragePinModal}
        garagePinInput={garagePinInput}
        setGaragePinInput={setGaragePinInput}
        pinError={pinError}
        setPinError={setPinError}
        isUpdatingGaragePin={isUpdatingGaragePin}
        onSaveGaragePin={handleSaveGaragePin}
      />
    </div>
  );
});
