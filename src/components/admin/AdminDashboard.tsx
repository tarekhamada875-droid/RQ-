/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { firestoreService } from '../../services';
import { deleteGarageWithRecovery, garageDeletionFailureMessage } from '../../services/garageDeletionService';
import { AppearanceSettingsModal } from '../modals/AppearanceSettingsModal';
import { soundManager } from '../../utils/sounds';
import { useBackHandler } from '../../hooks/backHandler';
import { AdminProvider } from '../../hooks/adminContext';
import { useSession } from '../../hooks/sessionContext';
import { Garage, Delegate } from '../../types';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { normalizeArabicSearch, resolveShimmerColor, isLightColor, normalizeDigits, sortGaragesNewestFirst } from '../../utils';
import { useLocalStorageState } from '../../hooks/useLocalStorage';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import '../../styles/admin-custom-theme.css';

import { AdminHeader } from './AdminHeader';
import { AdminNavigationAndViews } from './AdminNavigationAndViews';
import { AdminAddGarageModal } from './AdminAddGarageModal';
import { AdminConfirmDialog } from './AdminConfirmDialog';

interface AdminDashboardProps {
  allGarages: Garage[];
  isLoading: boolean;
  createNewGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  setView: (view: any) => void;
  setSelectedGarageForDetails: (garage: Garage | null) => void;
  setSelectedDelegateForDetails: (delegate: Delegate | null) => void;
  delegates: Delegate[];
  adminGarageHasMore?: boolean;
  adminDelegateHasMore?: boolean;
  adminListsLoading?: boolean;
  adminListsError?: boolean;
  onLoadMoreAdminGarages?: () => Promise<void>;
  onLoadMoreAdminDelegates?: () => Promise<void>;
  onRefreshAdminLists?: () => Promise<void>;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const AdminDashboard = memo(({
  allGarages,
  isLoading,
  createNewGarage,
  setView,
  setSelectedGarageForDetails,
  setSelectedDelegateForDetails,
  delegates,
  adminGarageHasMore = false,
  adminDelegateHasMore = false,
  adminListsLoading = false,
  adminListsError = false,
  onLoadMoreAdminGarages,
  onLoadMoreAdminDelegates,
  onRefreshAdminLists,
  showToast,
}: AdminDashboardProps) => {

  // Localized states to encapsulate admin view and prevent global App re-renders
  const { handleInitiateLogout, handleLogout } = useSession();
  const onLogout = handleInitiateLogout;
  const onImmediateLogout = () => handleLogout(true);
  const systemConfig = useSystemConfig();
  const [adminSearch, setAdminSearch] = React.useState<string>('');
  // `activeTab` includes retired values ('overview' | 'packages' | 'trial_leads' |
  // 'supervisors') so the redirect effect below can detect and migrate them out
  // of older browsers' localStorage. They have no UI surface.
  const [activeTab, setActiveTab] = useLocalStorageState<'overview' | 'garages' | 'packages' | 'people' | 'delegates' | 'requests' | 'trial_leads' | 'supervisors' | 'admin-pin' | 'catalog_settings' | 'active_sessions' | 'wallet_settings'>('app_admin_tab', 'garages');

  // Older browser storage may point at retired tabs. Normalize these saved values without touching user data.
  React.useEffect(() => {
    if (activeTab === 'supervisors') setActiveTab('people');
    else if (activeTab === 'trial_leads' || activeTab === 'overview') setActiveTab('garages');
    else if (activeTab === 'packages') setActiveTab('catalog_settings');
  }, [activeTab, setActiveTab]);

  const [showAddGarageModal, setShowAddGarageModal] = React.useState<boolean>(false);
  const [showExportModal, setShowExportModal] = React.useState<boolean>(false);
  // (admin back handler moved below — needs confirmDialog + showAppearanceSettings)

  const [pinInput, setPinInput] = React.useState<string>('');
  const [garageForm, setGarageForm] = React.useState<{
    name: string;
    hourlyRate: string;
    overnightRate: string;
    phone: string;
    isTrial: boolean;
    ownerPin: string;
  }>({
    name: '',
    hourlyRate: '',
    overnightRate: '',
    phone: '',
    isTrial: false,
    ownerPin: ''
  });

  const [showMenu, setShowMenu] = React.useState(false);
  const [showAppearanceSettings, setShowAppearanceSettings] = React.useState(false);
  const [localAdminColor, setLocalAdminColor] = useLocalStorageState<string>('app_admin_color', '#10b981');
  const adminColor = systemConfig?.adminColor || localAdminColor || '#10b981';

  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'success';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // ── Back-handler registrations ──────────────────────────────────────
  useBackHandler(() => { confirmDialog.onCancel?.(); setConfirmDialog((d) => ({ ...d, isOpen: false })); return true; }, confirmDialog.isOpen);
  useBackHandler(() => { setShowAppearanceSettings(false); return true; }, showAppearanceSettings);
  useBackHandler(() => { setShowAddGarageModal(false); return true; }, showAddGarageModal);
  useBackHandler(() => { setShowExportModal(false); return true; }, showExportModal);
  useBackHandler(() => { setActiveTab('catalog_settings'); return true; }, activeTab === 'admin-pin' || activeTab === 'active_sessions' || activeTab === 'wallet_settings');

  const { theme, adminLang } = useTheme();
  const resolvedAdminColor = resolveShimmerColor(adminColor, theme);
  const t = useAdminTranslation(adminLang);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const mainScrollRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  const refreshAdminListsAfterMutation = async () => {
    try {
      await onRefreshAdminLists?.();
    } catch (error) {
      // The mutation succeeded; report refresh failures separately rather than
      // implying that the saved change itself failed.
      console.error('Failed to refresh Admin lists after mutation:', error);
    }
  };

  const handleApproveGarage = async (garage: Garage) => {
    try {
      await firestoreService.updateGarage(garage.id, { status: 'approved' });
      soundManager.play('checkIn');
      showToast?.(`تم قبول وتفعيل جراج "${garage.name}" بنجاح 🚀`, 'success');
      void refreshAdminListsAfterMutation();
    } catch (error) {
      console.error('Failed to approve garage:', error);
      soundManager.play('error');
      showToast?.('حدث خطأ أثناء تفعيل الجراج', 'error');
      throw error;
    }
  };

  const handleRejectGarage = async (garage: Garage) => {
    return new Promise<void>((resolve, reject) => {
      setConfirmDialog({
        isOpen: true,
        title: 'رفض طلب إنشاء جراج',
        message: `هل أنت متأكد من رفض طلب إنشاء جراج "${garage.name}"؟ سيؤدي ذلك لحذف البيانات نهائياً.`,
        confirmText: 'نعم، ارفض واحذف',
        cancelText: 'تراجع',
        type: 'danger',
        onConfirm: async () => {
          try {
            const result = await deleteGarageWithRecovery(garage.id);
            if (result.ok === false) {
              showToast?.(garageDeletionFailureMessage(result), 'error');
              reject(new Error(result.errorCode));
              return;
            }
            await refreshAdminListsAfterMutation();
            soundManager.play('error');
            showToast?.(`تم رفض طلب إنشاء جراج "${garage.name}" وحذف البيانات`, 'success');
            resolve();
          } catch (error) {
            console.error('Failed to reject garage:', error);
            soundManager.play('error');
            showToast?.('حدث خطأ أثناء رفض الطلب', 'error');
            reject(error);
          } finally {
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          }
        },
        onCancel: () => {
          resolve();
        }
      });
    });
  };

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useBodyScrollLock(showAddGarageModal);

  const handleAddGarage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const created = await createNewGarage(e);
      if (!created) return false;
      await refreshAdminListsAfterMutation();
      setShowAddGarageModal(false);
      return true;
    } catch (err) {
      console.error('Admin garage creation failed:', err);
      showToast?.(err instanceof Error ? err.message : 'حدث خطأ أثناء إنشاء الجراج', 'error');
      return false;
    }
  };

  const approvedGarages = React.useMemo(() => {
    return sortGaragesNewestFirst(allGarages.filter(g => g.status !== 'pending'));
  }, [allGarages]);

  const pendingGarages = React.useMemo(() => {
    return sortGaragesNewestFirst(allGarages.filter(g => g.status === 'pending'));
  }, [allGarages]);

  // Pre-normalize search fields once when the garage list changes, not on
  // every keystroke. Filters out pending garages (never searchable) so the
  // search loop below only touches approved rows.
  const searchableGarages = React.useMemo(() => {
    return allGarages
      .filter(garage => garage && garage.status !== 'pending')
      .map(garage => ({
        garage,
        normalizedName: normalizeArabicSearch(garage.name || ''),
        rawPhone: garage.phone || '',
        normalizedPhone: normalizeDigits(garage.phone || ''),
      }));
  }, [allGarages]);

  const displayedGarages = React.useMemo(() => {
    const rawSearch = adminSearch.trim();
    if (!rawSearch) return approvedGarages;

    const q = normalizeArabicSearch(rawSearch);
    const digitQuery = normalizeDigits(rawSearch);

    const filtered = searchableGarages
      .filter(({ normalizedName, rawPhone, normalizedPhone }) => {
        const phoneMatch = rawPhone.includes(rawSearch) || (digitQuery ? normalizedPhone.includes(digitQuery) : false);
        return normalizedName.includes(q) || phoneMatch;
      })
      .map(({ garage }) => garage);

    return sortGaragesNewestFirst(filtered);
  }, [searchableGarages, approvedGarages, adminSearch]);

  return (
    <div
      className={`admin-custom-theme h-screen h-[100dvh] w-full bg-[#faf9f6] dark:bg-slate-950 font-sans relative text-slate-900 dark:text-slate-100 transition-colors overflow-hidden flex flex-col`}
      dir="rtl"
      style={{ '--admin-color': resolvedAdminColor, '--admin-color-text': isLightColor(resolvedAdminColor) ? '#0f172a' : '#ffffff' } as React.CSSProperties}
    >
      
      {/* Header */}
      <AdminHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        onOpenAppearanceSettings={() => setShowAppearanceSettings(true)}
        onLogout={onLogout}
        menuRef={menuRef}
        t={t}
      />

      {/* Main Workspace Body */}
      <main 
        ref={mainScrollRef} 
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 flex-1 w-full ${showAddGarageModal ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        <AdminProvider value={{
          adminGarageHasMore,
          adminDelegateHasMore,
          adminListsLoading,
          adminListsError,
          onLoadMoreAdminGarages: onLoadMoreAdminGarages ?? (() => Promise.resolve()),
          onLoadMoreAdminDelegates: onLoadMoreAdminDelegates ?? (() => Promise.resolve()),
          onRefreshAdminLists: onRefreshAdminLists ?? (() => Promise.resolve()),
          setSelectedGarageForDetails,
          setSelectedDelegateForDetails,
        }}>
        <AdminNavigationAndViews
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          delegates={delegates}
          pendingGarages={pendingGarages}
          approvedGarages={approvedGarages}
          displayedGarages={displayedGarages}
          adminSearch={adminSearch}
          setAdminSearch={setAdminSearch}
          onSelectGarage={(g) => {
            setSelectedGarageForDetails(g);
            setView('admin_garage_details');
          }}
          onSelectDelegate={(d) => {
            setSelectedDelegateForDetails(d);
            setView('admin_delegate_details');
          }}
          onOpenAddGarage={() => {
            setPinInput('');
            setShowAddGarageModal(true);
          }}
          handleApproveGarage={handleApproveGarage}
          handleRejectGarage={handleRejectGarage}
          t={t}
          showToast={showToast}
          onLogout={onLogout}
          onImmediateLogout={onImmediateLogout}
          showExportModal={showExportModal}
          setShowExportModal={setShowExportModal}
        />
        </AdminProvider>
      </main>

      {/* Add Garage Modal */}
      <AdminAddGarageModal
        isOpen={showAddGarageModal}
        onClose={() => setShowAddGarageModal(false)}
        garageForm={garageForm}
        setGarageForm={setGarageForm}
        pinInput={pinInput}
        setPinInput={setPinInput}
        allGarages={allGarages}
        isLoading={isLoading}
        onSubmit={handleAddGarage}
        t={t}
      />

      {/* Custom Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => {
          confirmDialog.onCancel?.();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        type={confirmDialog.type}
      />

      {/* Appearance Settings Modal */}
      {showAppearanceSettings && (
        <AppearanceSettingsModal 
          onClose={() => setShowAppearanceSettings(false)}
          adminColor={adminColor}
          onUpdateAdminColor={async (color) => {
            setLocalAdminColor(color);
            try {
              await firestoreService.updateSystemConfig({ adminColor: color });
            } catch (err) {
              console.warn('Failed to save adminColor to Firestore:', err);
            }
          }}
        />
      )}
    </div>
  );
});
