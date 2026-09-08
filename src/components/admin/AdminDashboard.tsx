/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { Garage, Delegate, Package, RechargeRequest, Supervisor } from '../../types';
import { firestoreService } from '../../services';
import { AppearanceSettingsModal } from '../modals/AppearanceSettingsModal';
import { soundManager } from '../../utils/sounds';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { normalizeArabicSearch, resolveShimmerColor, isLightColor, normalizeDigits } from '../../utils';
import { useLocalStorageState } from '../../hooks/useLocalStorage';
import { useSystemConfig } from '../../hooks/useSystemConfig';

import { AdminGarageList } from './AdminGarageList';
import { AdminHeader } from './AdminHeader';
import { AdminNavigationAndViews } from './AdminNavigationAndViews';
import { AdminPlansModal } from './AdminPlansModal';
import { AdminAddGarageModal } from './AdminAddGarageModal';
import { PackageValidationErrorModal } from './PackageValidationErrorModal';
import { AdminConfirmDialog } from './AdminConfirmDialog';

export { AdminGarageList };

interface AdminDashboardProps {
  allGarages: Garage[];
  isLoading: boolean;
  createNewGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  setView: (view: any) => void;
  setSelectedGarageForDetails: (garage: Garage | null) => void;
  setSelectedDelegateForDetails: (delegate: Delegate | null) => void;
  delegates: Delegate[];
  addDelegate?: (data: Omit<Delegate, 'id'>) => Promise<any>;
  packages: Package[];
  onLogout: () => void;
  rechargeRequests: RechargeRequest[];
  // Supervisor addition
  currentSupervisor?: Supervisor | null;
  supervisors?: Supervisor[];
  currentAdminPin: string;
  currentWalletNumber: string;
  onUpdateWalletNumber: (wallet: string) => Promise<void>;
  subscriptionPrices?: { weekly: number; biweekly?: number; monthly: number; weeklyDiscount?: number; biweeklyDiscount?: number; monthlyDiscount?: number };
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
  rechargeRequests,
  currentSupervisor = null,
  supervisors = [],
  currentAdminPin,
  currentWalletNumber,
  onUpdateWalletNumber,
  subscriptionPrices: _subscriptionPrices = { weekly: 800, biweekly: 1500, monthly: 3000 },
  showToast
}: AdminDashboardProps) => {

  // Localized states to encapsulate admin view and prevent global App re-renders
  const systemConfig = useSystemConfig();
  const [adminSearch, setAdminSearch] = React.useState<string>('');
  const [activeTab, setActiveTab] = useLocalStorageState<'overview' | 'menu' | 'garages' | 'packages' | 'people' | 'delegates' | 'requests' | 'supervisors' | 'wallet' | 'admin-pin' | 'announcements' | 'global_settings' | 'catalog_settings'>('app_admin_tab', 'overview');

  // Ensure supervisor is restricted to delegates view
  React.useEffect(() => {
    if (currentSupervisor && (activeTab !== 'people' && activeTab !== 'delegates' && activeTab !== 'supervisors')) {
      setActiveTab('people');
    }
  }, [currentSupervisor, activeTab, setActiveTab]);

  const ADMIN_GARAGES_PER_PAGE = 50;
  const [adminGarageRows, setAdminGarageRows] = React.useState<Garage[]>([]);
  const [adminGarageHasMore, setAdminGarageHasMore] = React.useState(true);
  const [isAdminGaragePageLoading, setIsAdminGaragePageLoading] = React.useState(false);
  const [adminGaragePageError, setAdminGaragePageError] = React.useState(false);
  const adminGarageLastDocRef = React.useRef<any>(null);
  const adminGarageHasMoreRef = React.useRef(true);
  const isAdminGaragePageLoadingRef = React.useRef(false);
  const adminGarageTabOpenedRef = React.useRef(false);

  const loadAdminGaragePage = React.useCallback(async (reset = false) => {
    if (isAdminGaragePageLoadingRef.current || (!reset && !adminGarageHasMoreRef.current)) return;

    isAdminGaragePageLoadingRef.current = true;
    setIsAdminGaragePageLoading(true);
    setAdminGaragePageError(false);

    try {
      const page = await firestoreService.getAdminGaragesPage(
        ADMIN_GARAGES_PER_PAGE,
        reset ? null : adminGarageLastDocRef.current
      );

      setAdminGarageRows(previousRows => {
        const rows = reset ? page.garages : [...previousRows, ...page.garages];
        return Array.from(new Map(rows.map(garage => [garage.id, garage])).values());
      });
      adminGarageLastDocRef.current = page.lastDoc;
      adminGarageHasMoreRef.current = page.hasMore;
      setAdminGarageHasMore(page.hasMore);
    } catch (error) {
      console.error('Failed to load admin garage page:', error);
      setAdminGaragePageError(true);
    } finally {
      isAdminGaragePageLoadingRef.current = false;
      setIsAdminGaragePageLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab !== 'garages') {
      adminGarageTabOpenedRef.current = false;
      return;
    }

    if (!adminGarageTabOpenedRef.current) {
      adminGarageTabOpenedRef.current = true;
      void loadAdminGaragePage(true);
    }
  }, [activeTab, loadAdminGaragePage]);

  const [showPlansModal, setShowPlansModal] = React.useState<boolean>(false);
  const [showOverview, setShowOverview] = React.useState<boolean>(false);
  const [pinInput, setPinInput] = React.useState<string>('');
  const [garageForm, setGarageForm] = React.useState<{
    name: string;
    hourlyRate: string;
    overnightRate: string;
    phone: string;
    initialPackageId: string;
    hasMonthlySubscribers: boolean;
    isTrial: boolean;
    ownerPin: string;
  }>({
    name: '',
    hourlyRate: '',
    overnightRate: '',
    phone: '',
    initialPackageId: '',
    hasMonthlySubscribers: false,
    isTrial: false,
    ownerPin: ''
  });

  const [showMenu, setShowMenu] = React.useState(false);
  const [showAppearanceSettings, setShowAppearanceSettings] = React.useState(false);
  const [localAdminColor, setLocalAdminColor] = useLocalStorageState<string>('app_admin_color', '#10b981');
  const adminColor = systemConfig?.adminColor || localAdminColor || '#10b981';

  const [packageValidationError, setPackageValidationError] = React.useState<{
    isOpen: boolean;
    conflictingPackageName: string;
    message: string;
    suggestions: string[];
  } | null>(null);

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

  const handleApproveRequest = async (request: RechargeRequest) => {
    setConfirmDialog({
      isOpen: true,
      title: 'تفعيل الشحن',
      message: `هل أنت متأكد من تفعيل تجديد اشتراك جراج "${request.garageName || 'الجراج'}"؟`,
      confirmText: 'تفعيل الآن',
      cancelText: 'تراجع',
      type: 'success',
      onConfirm: async () => {
        try {
          const result = await firestoreService.approveRechargeRequest(request);
          if (result.success) {
            soundManager.play('checkIn');
            showToast?.('تم تفعيل اشتراك الجراج بنجاح', 'success');
          } else {
            soundManager.play('error');
            showToast?.(result.error || 'تعذر تفعيل الاشتراك', 'error');
          }
        } catch (error: any) {
          console.error('Failed to approve request:', error);
          soundManager.play('error');
          showToast?.(error?.message || 'حدث خطأ أثناء تفعيل الطلب', 'error');
        } finally {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleRejectRequest = async (requestId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: t('رفض طلب الشحن'),
      message: 'هل أنت متأكد من رفض هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.',
      confirmText: 'نعم، ارفض الطلب',
      cancelText: 'إلغاء',
      type: 'danger',
      onConfirm: async () => {
        try {
          await firestoreService.rejectRechargeRequest(requestId);
          showToast?.('تم رفض طلب الشحن', 'error');
        } catch (error: any) {
          console.error('Failed to reject request:', error);
          showToast?.(error?.message || 'حدث خطأ أثناء رفض الطلب', 'error');
        } finally {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleApproveGarage = async (garage: Garage) => {
    try {
      await firestoreService.updateGarage(garage.id, { status: 'approved' });
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
            await firestoreService.deleteGarage(garage.id);
            soundManager.play('error');
            showToast?.(`تم رفض طلب إنشاء جراج "${garage.name}" وحذف البيانات`, 'error');
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

  React.useEffect(() => {
    if (showPlansModal || showOverview) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showPlansModal, showOverview]);

  const handleAddGarage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentSupervisor) {
      showToast?.('غير مصرح للمشرف بإضافة جراجات', 'error');
      setShowOverview(false);
      return;
    }
    await createNewGarage(e);
    setShowOverview(false);
  };

  const approvedGarages = React.useMemo(() => {
    return allGarages.filter(g => g.status !== 'pending');
  }, [allGarages]);

  const pendingGarages = React.useMemo(() => {
    return allGarages.filter(g => g.status === 'pending');
  }, [allGarages]);

  const effectiveGarages = React.useMemo(() => {
    if (activeTab === 'garages' && adminGarageRows.length > 0) {
      return adminGarageRows;
    }
    return allGarages;
  }, [activeTab, adminGarageRows, allGarages]);

  const displayedGarages = React.useMemo(() => {
    const rawSearch = adminSearch.trim();
    if (!rawSearch) {
      return effectiveGarages.filter(garage => garage?.status !== 'pending');
    }
    const q = normalizeArabicSearch(rawSearch);
    const digitQuery = normalizeDigits(rawSearch);

    // Search across both loaded page rows and global pool to ensure complete 1000-garage coverage
    const pool = Array.from(new Map([...allGarages, ...effectiveGarages].map(g => [g.id, g])).values());

    return pool.filter(garage => {
      if (!garage || garage.status === 'pending') return false;

      const normalizedName = normalizeArabicSearch(garage.name || '');
      const rawPhone = garage.phone || '';
      const normalizedPhone = normalizeDigits(rawPhone);
      const phoneMatch = rawPhone.includes(rawSearch) || (digitQuery ? normalizedPhone.includes(digitQuery) : false);
      return normalizedName.includes(q) || phoneMatch;
    });
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
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 flex-1 w-full ${showPlansModal || showOverview ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        <AdminNavigationAndViews
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentSupervisor={currentSupervisor}
          delegates={delegates}
          supervisors={supervisors}
          rechargeRequests={rechargeRequests}
          pendingGarages={pendingGarages}
          packages={packages}
          approvedGarages={approvedGarages}
          allGarages={allGarages}
          displayedGarages={displayedGarages}
          effectiveGarages={effectiveGarages}
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
          handleApproveRequest={handleApproveRequest}
          handleRejectRequest={handleRejectRequest}
          handleApproveGarage={handleApproveGarage}
          handleRejectGarage={handleRejectGarage}
          setConfirmDialog={setConfirmDialog}
          setPackageValidationError={setPackageValidationError}
          currentWalletNumber={currentWalletNumber}
          onUpdateWalletNumber={onUpdateWalletNumber}
          currentAdminPin={currentAdminPin}
          adminGaragePageError={adminGaragePageError}
          adminGarageHasMore={adminGarageHasMore}
          isAdminGaragePageLoading={isAdminGaragePageLoading}
          loadAdminGaragePage={loadAdminGaragePage}
          adminLang={adminLang}
          t={t}
        />
      </main>

      {/* Plans Management Modal */}
      <AdminPlansModal
        isOpen={showPlansModal}
        onClose={() => setShowPlansModal(false)}
        packages={packages}
        setConfirmDialog={setConfirmDialog}
        adminLang={adminLang}
        t={t}
      />

      {/* Add Garage Modal */}
      <AdminAddGarageModal
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
        garageForm={garageForm}
        setGarageForm={setGarageForm}
        pinInput={pinInput}
        setPinInput={setPinInput}
        packages={packages}
        allGarages={allGarages}
        isLoading={isLoading}
        trialDays={systemConfig?.defaultTrialDays ?? 15}
        subscriberFlatFee={systemConfig?.monthlySubscribersFlatFee ?? 500}
        onSubmit={handleAddGarage}
        t={t}
      />

      {/* Package Validation Modal */}
      <PackageValidationErrorModal
        isOpen={Boolean(packageValidationError?.isOpen)}
        message={packageValidationError?.message || ''}
        suggestions={packageValidationError?.suggestions || []}
        onClose={() => setPackageValidationError(null)}
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
