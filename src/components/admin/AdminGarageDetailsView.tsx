/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, memo, useRef, useEffect } from 'react';
import { useBackHandler } from '../../hooks/backHandler';
import {
  BadgeCheck,
  ChevronRight,
  Trash2,
  MoreVertical,
  Wallet,
  Settings
} from 'lucide-react';
import { Garage, Staff } from '../../types';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useAdminGarageDetailsActions } from '../../hooks/useAdminGarageDetailsActions';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useToast } from '../../hooks/toast';
import { AdminGarageSettingsSection } from './AdminGarageSettingsSection';
import { AdminGarageHeroAndStats } from './garage-details/AdminGarageHeroAndStats';
import { AdminGarageFinancialsSection } from './garage-details/AdminGarageFinancialsSection';
import { AdminGarageZoneHead } from './garage-details/AdminGarageZoneHead';
import { AdminGarageModals } from './garage-details/AdminGarageModals';
import { AdminCreditGrantPanel } from './AdminCreditGrantPanel';
import { AdminGarageCreditRateSection } from './AdminGarageCreditRateSection';

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
  onRefreshAdminLists,
}: AdminGarageDetailsViewProps) => {
  // ── UI toggle state (stays in the view) ──────────────────────────────
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [staffForm, setStaffForm] = useState({ name: '', pin: '' });
  const [showMenu, setShowMenu] = useState(false);
  const [isZone3Open, setIsZone3Open] = useState(false);
  const [showEditGaragePinModal, setShowEditGaragePinModal] = useState(false);

  // ── Back-handler registrations ──────────────────────────────────────
  useBackHandler(() => { setShowEditGaragePinModal(false); return true; }, showEditGaragePinModal);
  useBackHandler(() => { setStaffToDelete(null); return true; }, Boolean(staffToDelete));
  useBackHandler(() => { setShowAddStaffModal(false); return true; }, showAddStaffModal);
  useBackHandler(() => { setShowMenu(false); return true; }, showMenu);

  // Inline staff-PIN editing state — purely visual; the actual updateStaff
  // call lives in AdminGarageSettingsSection and runs through the shared
  // useAsyncAction save helper (same instance as the rest of this view).
  const [editingStaffPinId, setEditingStaffPinId] = useState<string | null>(null);
  const [editingStaffPinValue, setEditingStaffPinValue] = useState<string>('');
  const { isLoading: isUpdatingStaffPin, run: runStaffPinUpdate } = useAsyncAction();

  
  

  // ── Actions + business state (extracted to hook) ─────────────────────
  const { showToast } = useToast();
  const actions = useAdminGarageDetailsActions({
    garage: selectedGarageForDetails,
    setSelectedGarageForDetails,
    staffList,
    setStaffList,
    isLoading,
    setIsLoading,
    onRefreshAdminLists,
    showToast,
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
      className={`h-screen bg-[#faf9f6] dark:bg-slate-950 font-sans pb-32 custom-scrollbar-slate text-right text-slate-900 dark:text-slate-100 ${showAddStaffModal || staffToDelete ? 'overflow-hidden' : 'overflow-y-auto'}`}
      dir="rtl"
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 mb-8 ">
        <div className="max-w-5xl mx-auto flex justify-between items-center h-full">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setView('admin_dashboard');
                setSelectedGarageForDetails(null);
                setShowDeleteConfirm(false);
              }}
              className="flex items-center justify-center w-11 h-11 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl outline-none cursor-pointer shrink-0"
              title={'رجوع'}
            >
              <ChevronRight className={`w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5] `} />
            </button>
            <div>
              <h1 className="text-base font-black text-slate-900 dark:text-white leading-tight">{selectedGarageForDetails.name}</h1>
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                {'تفاصيل وإدارة الجراج'} • <span className="font-mono text-[10px]">المعرّف: {selectedGarageForDetails.id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className={`w-11 h-11 rounded-xl flex items-center justify-center outline-none border ${showMenu ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}
            >
              <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-400 stroke-[2.5]" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-slate-900/10 dark:bg-black/35"
                  onClick={() => setShowMenu(false)}
                />

                <div className={`absolute top-12 left-0 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl z-50 overflow-hidden p-2`}>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(true);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-rose-600 rounded-xl text-xs font-bold"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{'حذف الجراج'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Three scannable zones with thin divider heads (owner pick: Option B,
          2026-11-19). Order inside the billing zone follows task frequency:
          top-up first, then per-garage price, then the quiet monthly toggle. */}
      <div className="max-w-5xl mx-auto px-6 space-y-6">
        {/* Zone 1: Status & identity */}
        <section className="space-y-3">
          <AdminGarageZoneHead icon={BadgeCheck} label={'الحالة والهوية'} />
          <AdminGarageHeroAndStats
            garage={selectedGarageForDetails}
            isUpdatingLock={actions.isUpdatingLock}
            onToggleLock={actions.handleToggleLock}
            onOpenEditPin={() => {
              // Owner request 2026-11-19: the modal is connected to the PIN
              // generator — it opens with a fresh safe PIN (never the current
              // one), and the admin can regenerate or still type their own.
              // Duplicates (active or previously-used) are refused at save.
              actions.setGaragePinInput(actions.generateNewGaragePin());
              actions.setPinError('');
              setShowEditGaragePinModal(true);
            }}
          />
        </section>

        {/* Zone 2: Balance & billing */}
        <section className="space-y-3">
          <AdminGarageZoneHead icon={Wallet} label={'الرصيد والفوترة'} />
          <AdminCreditGrantPanel garage={selectedGarageForDetails} />

          {/* Per-garage credit pricing (owner decision 2026-11-18): admin-only,
              preset-only override of the global rate; renders nothing for
              subscription garages. */}
          <AdminGarageCreditRateSection garage={selectedGarageForDetails} />

          <AdminGarageFinancialsSection
            garage={selectedGarageForDetails}
            onToggleMonthlySubscribers={actions.handleToggleMonthlySubscribers}
          />
        </section>

        {/* Zone 3: Operations & staff */}
        <section className="space-y-3">
          <AdminGarageZoneHead icon={Settings} label={'التشغيل والطاقم'} />
          <AdminGarageSettingsSection
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
          setStaffList={setStaffList}
          openAddStaffModal={openAddStaffModal}
          editingStaffPinId={editingStaffPinId}
          setEditingStaffPinId={setEditingStaffPinId}
          editingStaffPinValue={editingStaffPinValue}
          setEditingStaffPinValue={setEditingStaffPinValue}
          isUpdatingStaffPin={isUpdatingStaffPin}
          runStaffPinUpdate={runStaffPinUpdate}
          setStaffToDelete={setStaffToDelete}
        />
        </section>
      </div>

      {/* Modals */}
      <AdminGarageModals
        garage={selectedGarageForDetails}
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
        onRegeneratePin={() => {
          actions.setGaragePinInput(actions.generateNewGaragePin(actions.garagePinInput));
          actions.setPinError('');
        }}
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
