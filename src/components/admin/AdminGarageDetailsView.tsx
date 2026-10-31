/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, memo, useRef, useEffect } from 'react';
import {
  ChevronRight,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { isHashedPin } from '../../utils';
import { Garage, Staff } from '../../types';
import { useTheme } from '../../utils/ThemeContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { useAdminGarageDetailsActions } from '../../hooks/useAdminGarageDetailsActions';
import { AdminGarageSettingsSection } from './AdminGarageSettingsSection';
import { AdminGarageHeroAndStats } from './garage-details/AdminGarageHeroAndStats';
import { AdminGarageFinancialsSection } from './garage-details/AdminGarageFinancialsSection';
import { AdminGarageModals } from './garage-details/AdminGarageModals';
import { AdminCreditGrantPanel } from './AdminCreditGrantPanel';

interface AdminGarageDetailsViewProps {
  selectedGarageForDetails: Garage;
  setView: (view: any) => void;
  setSelectedGarageForDetails: (garage: Garage | null) => void;
  setShowDeleteConfirm: (show: boolean) => void;
  staffList: Staff[];
  setStaffList: React.Dispatch<React.SetStateAction<Staff[]>>;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  onRefreshAdminLists?: () => Promise<void>;
}

export const AdminGarageDetailsView = memo(({
  selectedGarageForDetails,
  setView,
  setSelectedGarageForDetails,
  setShowDeleteConfirm,
  staffList,
  setStaffList,
  isLoading,
  setIsLoading,
  onRefreshAdminLists
}: AdminGarageDetailsViewProps) => {
  // ── UI toggle state (stays in the view) ──────────────────────────────
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [staffForm, setStaffForm] = useState({ name: '', pin: '' });
  const [showMenu, setShowMenu] = useState(false);
  const [isZone3Open, setIsZone3Open] = useState(false);
  const [showEditGaragePinModal, setShowEditGaragePinModal] = useState(false);

  // Inline staff-PIN editing state — purely visual; the actual updateStaff
  // call lives in AdminGarageSettingsSection.
  const [editingStaffPinId, setEditingStaffPinId] = useState<string | null>(null);
  const [editingStaffPinValue, setEditingStaffPinValue] = useState<string>('');
  const [isUpdatingStaffPin, setIsUpdatingStaffPin] = useState(false);

  const { adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);

  // ── Actions + business state (extracted to hook) ─────────────────────
  const actions = useAdminGarageDetailsActions({
    garage: selectedGarageForDetails,
    setSelectedGarageForDetails,
    staffList,
    setStaffList,
    isLoading,
    setIsLoading,
    onRefreshAdminLists,
  });

  // ── Menu click-outside ───────────────────────────────────────────────
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

  useBodyScrollLock(Boolean(showAddStaffModal || staffToDelete));

  const openAddStaffModal = () => {
    setStaffForm({ name: '', pin: actions.generateNewStaffPin() });
    setShowAddStaffModal(true);
  };

  // Wire delete: the hook clears the staff list; the view clears its
  // staffToDelete state to close the confirm modal.
  const handleDeleteStaff = async (staffId: string) => {
    await actions.handleDeleteStaff(staffId);
    setStaffToDelete(null);
  };

  return (
    <div
      className={`h-screen bg-[#faf9f6] dark:bg-slate-950 font-sans pb-32 custom-scrollbar-slate text-right text-slate-900 dark:text-slate-100 transition-colors ${showAddStaffModal || staffToDelete ? 'overflow-hidden' : 'overflow-y-auto'}`}
      dir="rtl"
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
              <ChevronRight className={`w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5] `} />
            </button>
            <div>
              <h1 className="text-base font-black text-slate-900 dark:text-white leading-tight">{selectedGarageForDetails.name}</h1>
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                {t('تفاصيل وإدارة الجراج')} • <span className="font-mono text-[10px]">المعرّف: {selectedGarageForDetails.id}</span>
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

                <div className={`absolute top-12 left-0 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl z-50 overflow-hidden shadow-xl p-2`}>
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
        {/* Zone 1: Status & Key Information */}
        <AdminGarageHeroAndStats
          garage={selectedGarageForDetails}
          t={t}
          isUpdatingLock={actions.isUpdatingLock}
          onToggleLock={actions.handleToggleLock}
          onOpenEditPin={() => {
            const p = selectedGarageForDetails.pin || selectedGarageForDetails.ownerPin || '';
            actions.setGaragePinInput(isHashedPin(p) ? '' : p);
            actions.setPinError('');
            setShowEditGaragePinModal(true);
          }}
        />

        {/* Zone 2: Subscription, Financials & Recharge */}
        <AdminGarageFinancialsSection
          garage={selectedGarageForDetails}
          t={t}
          onToggleMonthlySubscribers={actions.handleToggleMonthlySubscribers}
        />
        <AdminCreditGrantPanel garage={selectedGarageForDetails} />

        {/* Zone 3: Operations & Staff Management */}
        <AdminGarageSettingsSection
          t={t}
          isZone3Open={isZone3Open}
          setIsZone3Open={setIsZone3Open}
          rateCheck={actions.rateCheck}
          hourlyRateInput={actions.hourlyRateInput}
          setHourlyRateInput={actions.setHourlyRateInput}
          overnightRateInput={actions.overnightRateInput}
          setOvernightRateInput={actions.setOvernightRateInput}
          hasRateChanges={actions.hasRateChanges}
          isSavingRates={actions.isSavingRates}
          handleSaveRates={actions.handleSaveRates}
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
        isLoading={isLoading}
        showAddStaffModal={showAddStaffModal}
        setShowAddStaffModal={setShowAddStaffModal}
        staffForm={staffForm}
        setStaffForm={setStaffForm}
        onAddStaffSubmit={(e) => actions.handleAddStaffSubmit(
          e,
          staffForm,
          () => setStaffForm({ name: '', pin: '' }),
          () => setShowAddStaffModal(false),
        )}
        staffToDelete={staffToDelete}
        setStaffToDelete={setStaffToDelete}
        onDeleteStaff={handleDeleteStaff}
        showEditGaragePinModal={showEditGaragePinModal}
        setShowEditGaragePinModal={setShowEditGaragePinModal}
        garagePinInput={actions.garagePinInput}
        setGaragePinInput={actions.setGaragePinInput}
        pinError={actions.pinError}
        setPinError={actions.setPinError}
        isUpdatingGaragePin={actions.isUpdatingGaragePin}
        onSaveGaragePin={actions.handleSaveGaragePin}
      />
    </div>
  );
});
