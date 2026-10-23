/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { Garage, Delegate, Package, Supervisor } from '../../types';
import { firestoreService } from '../../services';
import { deleteGarageWithRecovery, garageDeletionFailureMessage } from '../../services/garageDeletionService';
import { AppearanceSettingsModal } from '../modals/AppearanceSettingsModal';
import { soundManager } from '../../utils/sounds';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { normalizeArabicSearch, resolveShimmerColor, isLightColor, normalizeDigits, sortGaragesNewestFirst } from '../../utils';
import { useLocalStorageState } from '../../hooks/useLocalStorage';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

import { AdminGarageList } from './AdminGarageList';
import { AdminHeader } from './AdminHeader';
import { AdminNavigationAndViews } from './AdminNavigationAndViews';
import { AdminAddGarageModal } from './AdminAddGarageModal';
import { AdminConfirmDialog } from './AdminConfirmDialog';

export { AdminGarageList };

interface AdminDashboardProps {
  allGarages: Garage[];
  isLoading: boolean;
  createNewGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  setView: (view: any) => void;
  setSelectedGarageForDetails: (garage: Garage | null) => void;
  setSelectedDelegateForDetails: (delegate: Delegate | null) => void;
  delegates: Delegate[];
  addDelegate?: (data: Omit<Delegate, 'id'>) => Promise<any>;
  packages: Package[];
  onLogout: () => void;
  adminGarageHasMore?: boolean;
  adminDelegateHasMore?: boolean;
  adminListsLoading?: boolean;
  adminListsError?: boolean;
  onLoadMoreAdminGarages?: () => Promise<void>;
  onLoadMoreAdminDelegates?: () => Promise<void>;
  onRefreshAdminLists?: () => Promise<void>;
  // Retained only to constrain stale legacy Supervisor client state.
  currentSupervisor?: Supervisor | null;
  currentAdminPin: string;
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
  addDelegate: _addDelegate,
  packages,
  onLogout,
  adminGarageHasMore = false,
  adminDelegateHasMore = false,
  adminListsLoading = false,
  adminListsError = false,
  onLoadMoreAdminGarages,
  onLoadMoreAdminDelegates,
  onRefreshAdminLists,
  currentSupervisor = null,
  currentAdminPin,
  showToast
}: AdminDashboardProps) => {

  // Localized states to encapsulate admin view and prevent global App re-renders
  const systemConfig = useSystemConfig();
  const [adminSearch, setAdminSearch] = React.useState<string>('');
  const [activeTab, setActiveTab] = useLocalStorageState<'overview' | 'garages' | 'packages' | 'people' | 'delegates' | 'requests' | 'trial_leads' | 'supervisors' | 'admin-pin' | 'announcements' | 'catalog_settings' | 'active_sessions' | 'partners_calculator'>('app_admin_tab', 'overview');

  // Older browser storage may point at retired tabs. Normalize these saved values without touching user data.
  React.useEffect(() => {
    if (activeTab === 'supervisors') setActiveTab('people');
    else if (activeTab === 'trial_leads') setActiveTab('overview');
  }, [activeTab, setActiveTab]);

  // Keep any stale legacy Supervisor state on the Delegates-only People view.
  React.useEffect(() => {
    if (currentSupervisor && (activeTab !== 'people' && activeTab !== 'delegates' && activeTab !== 'supervisors')) {
      setActiveTab('people');
    }
  }, [currentSupervisor, activeTab, setActiveTab]);

  const [showOverview, setShowOverview] = React.useState<boolean>(false);
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
  const { theme, adminLang, setAdminLang } = useTheme();
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
      await refreshAdminListsAfterMutation();
      soundManager.play('checkIn');
      showToast?.(`تم قبول وتفعيل جراج "${garage.name}" بنجاح 🚀`, 'success');
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
              showToast?.(garageDeletionFailureMessage(result, adminLang), 'error');
              reject(new Error(result.errorCode));
              return;
            }
            await refreshAdminListsAfterMutation();
            soundManager.play('error');
            showToast?.(adminLang === 'en'
              ? `Garage request for "${garage.name}" was rejected and its data was deleted.`
              : `تم رفض طلب إنشاء جراج "${garage.name}" وحذف البيانات`, 'success');
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

  useBodyScrollLock(showOverview);

  const handleAddGarage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentSupervisor) {
      showToast?.('غير مصرح للمشرف بإضافة جراجات', 'error');
      return false;
    }
    try {
      const created = await createNewGarage(e);
      if (!created) return false;
      await refreshAdminListsAfterMutation();
      setShowOverview(false);
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

  const effectiveGarages = React.useMemo(() => {
    return sortGaragesNewestFirst(allGarages);
  }, [allGarages]);

  const displayedGarages = React.useMemo(() => {
    const rawSearch = adminSearch.trim();
    if (!rawSearch) {
      return sortGaragesNewestFirst(effectiveGarages.filter(garage => garage?.status !== 'pending'));
    }
    const q = normalizeArabicSearch(rawSearch);
    const digitQuery = normalizeDigits(rawSearch);

    // Search across both loaded page rows and global pool to ensure complete 1000-garage coverage
    const pool = Array.from(new Map([...allGarages, ...effectiveGarages].map(g => [g.id, g])).values());

    const filtered = pool.filter(garage => {
      if (!garage || garage.status === 'pending') return false;

      const normalizedName = normalizeArabicSearch(garage.name || '');
      const rawPhone = garage.phone || '';
      const normalizedPhone = normalizeDigits(rawPhone);
      const phoneMatch = rawPhone.includes(rawSearch) || (digitQuery ? normalizedPhone.includes(digitQuery) : false);
      return normalizedName.includes(q) || phoneMatch;
    });

    return sortGaragesNewestFirst(filtered);
  }, [effectiveGarages, allGarages, adminSearch]);

  return (
    <div className={`admin-custom-theme h-screen h-[100dvh] w-full bg-[#faf9f6] dark:bg-slate-950 font-sans relative text-slate-900 dark:text-slate-100 transition-colors overflow-hidden flex flex-col`} dir={adminLang === 'en' ? 'ltr' : 'rtl'}>
      <style>{`
        .admin-custom-theme .text-emerald-500,
        .admin-custom-theme .text-emerald-500,
        .admin-custom-theme .text-emerald-600,
        .admin-custom-theme .text-emerald-700,
        .admin-custom-theme .dark\\:text-emerald-400,
        .admin-custom-theme .text-emerald-450 {
          color: ${resolvedAdminColor} !important;
        }
        .admin-custom-theme .bg-emerald-600,
        .admin-custom-theme .bg-emerald-500,
        .admin-custom-theme .dark\\:bg-emerald-600,
        .admin-custom-theme .dark\\:bg-emerald-500 {
          background-color: ${resolvedAdminColor} !important;
          color: ${isLightColor(resolvedAdminColor) ? '#0f172a' : '#ffffff'} !important;
        }
        .admin-custom-theme .bg-emerald-600 *,
        .admin-custom-theme .bg-emerald-500 *,
        .admin-custom-theme .dark\\:bg-emerald-600 *,
        .admin-custom-theme .dark\\:bg-emerald-500 * {
          color: ${isLightColor(resolvedAdminColor) ? '#0f172a' : 'inherit'} !important;
        }
        .admin-custom-theme .hover\\:bg-emerald-700:hover,
        .admin-custom-theme .bg-emerald-600:hover,
        .admin-custom-theme .bg-emerald-500:hover,
        .admin-custom-theme .dark\\:bg-emerald-600:hover,
        .admin-custom-theme .dark\\:bg-emerald-500:hover {
          background-color: ${resolvedAdminColor}e6 !important;
          opacity: 0.95;
        }
        .admin-custom-theme .bg-emerald-50,
        .admin-custom-theme .bg-emerald-50\\/30,
        .admin-custom-theme .bg-emerald-50\\/50,
        .admin-custom-theme .bg-emerald-100,
        .admin-custom-theme .dark\\:bg-emerald-950\\/40,
        .admin-custom-theme .dark\\:bg-emerald-950\\/45,
        .admin-custom-theme .dark\\:bg-emerald-950\\/10 {
          background-color: ${resolvedAdminColor}15 !important;
        }
        .admin-custom-theme .bg-emerald-400\\/10,
        .admin-custom-theme .dark\\:bg-emerald-400\\/5,
        .admin-custom-theme .bg-emerald-50\\/50 {
          background-color: ${resolvedAdminColor}1a !important;
        }
        .admin-custom-theme .border-emerald-500,
        .admin-custom-theme .border-emerald-600,
        .admin-custom-theme .border-emerald-400,
        .admin-custom-theme .border-emerald-300,
        .admin-custom-theme .border-emerald-100,
        .admin-custom-theme .dark\\:border-emerald-700\\/80,
        .admin-custom-theme .dark\\:border-emerald-900\\/50 {
          border-color: ${resolvedAdminColor}80 !important;
        }
        .admin-custom-theme .border-emerald-500\\/20,
        .admin-custom-theme .border-emerald-400\\/10 {
          border-color: ${resolvedAdminColor}20 !important;
        }
        .admin-custom-theme .focus\\:border-emerald-500:focus,
        .admin-custom-theme .focus\\:border-emerald-400:focus {
          border-color: ${resolvedAdminColor} !important;
        }
        .admin-custom-theme .focus\\:ring-emerald-500:focus,
        .admin-custom-theme .focus\\:ring-emerald-400:focus,
        .admin-custom-theme .dark\\:focus\\:ring-emerald-500:focus {
          --tw-ring-color: ${resolvedAdminColor} !important;
          border-color: ${resolvedAdminColor} !important;
        }
        .admin-custom-theme .shadow-emerald-500\\/5 {
          --tw-shadow-color: ${resolvedAdminColor}1a !important;
          --tw-shadow: 0 4px 6px -1px var(--tw-shadow-color), 0 2px 4px -1px var(--tw-shadow-color) !important;
        }
        .admin-custom-theme .from-emerald-500\\/5 {
          --tw-gradient-from: ${resolvedAdminColor}0d !important;
          --tw-gradient-to: transparent !important;
          --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
        }
        .admin-custom-theme .dark\\:from-emerald-500\\/5 {
          --tw-gradient-from: ${resolvedAdminColor}0d !important;
          --tw-gradient-to: transparent !important;
          --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
        }
      `}</style>
      
      {/* Header */}
      <AdminHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        currentSupervisor={currentSupervisor}
        adminLang={adminLang}
        setAdminLang={setAdminLang}
        onOpenAppearanceSettings={() => setShowAppearanceSettings(true)}
        onLogout={onLogout}
        menuRef={menuRef}
        t={t}
      />

      {/* Main Workspace Body */}
      <main 
        ref={mainScrollRef} 
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 flex-1 w-full ${showOverview ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        <AdminNavigationAndViews
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentSupervisor={currentSupervisor}
          delegates={delegates}
          pendingGarages={pendingGarages}
          packages={packages}
          approvedGarages={approvedGarages}
          allGarages={allGarages}
          displayedGarages={displayedGarages}
          adminSearch={adminSearch}
          setAdminSearch={setAdminSearch}
          onSelectGarage={(g) => {
            if (currentSupervisor) return;
            setSelectedGarageForDetails(g);
            setView('admin_garage_details');
          }}
          onSelectDelegate={(d) => {
            if (currentSupervisor) return;
            setSelectedDelegateForDetails(d);
            setView('admin_delegate_details');
          }}
          onOpenAddGarage={!currentSupervisor ? () => {
            setPinInput('');
            setShowOverview(true);
          } : undefined}
          adminGarageHasMore={adminGarageHasMore}
          adminDelegateHasMore={adminDelegateHasMore}
          adminListsLoading={adminListsLoading}
          adminListsError={adminListsError}
          onLoadMoreAdminGarages={onLoadMoreAdminGarages}
          onLoadMoreAdminDelegates={onLoadMoreAdminDelegates}
          onRefreshAdminLists={onRefreshAdminLists}
          handleApproveGarage={handleApproveGarage}
          handleRejectGarage={handleRejectGarage}
          setConfirmDialog={setConfirmDialog}
          currentAdminPin={currentAdminPin}
          adminLang={adminLang}
          t={t}
          showToast={showToast}
          onLogout={onLogout}
        />
      </main>

      {/* Add Garage Modal */}
      <AdminAddGarageModal
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
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
