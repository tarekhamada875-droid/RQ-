import React from 'react';
import {
  BarChart3,
  Car,
  Users,
  Zap,
  Settings as SettingsIcon,
  Wallet,
  Key,
  ClipboardList,
  ChevronRight,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { Garage, Delegate, Package, RechargeRequest, Supervisor } from '../../types';
import { AdminOverviewView } from './AdminOverviewView';
import { AdminPeopleView } from './AdminPeopleView';
import { AdminGaragesTabView } from './AdminGaragesTabView';
import { AdminRequestsView } from './AdminRequestsView';
import { AdminTrialLeadsView } from './AdminTrialLeadsView';
import { AdminPackagesView } from './AdminPackagesView';
import { garageService } from '../../services/garageService';
import { AdminFairUseView } from './AdminFairUseView';
import { AdminWalletView } from './AdminWalletView';
import { AdminAnnouncementsView } from './AdminAnnouncementsView';
import { AdminGlobalSettingsView } from './AdminGlobalSettingsView';
import { AdminPinSettingsView } from './AdminPinSettingsView';
import { AdminFinancialReportsView } from './AdminFinancialReportsView';
import { AdminActiveSessionsView } from './AdminActiveSessionsView';

interface AdminNavigationAndViewsProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  currentSupervisor: Supervisor | null;
  delegates: Delegate[];
  supervisors: Supervisor[];
  rechargeRequests: RechargeRequest[];
  pendingGarages: Garage[];
  packages: Package[];
  approvedGarages: Garage[];
  allGarages: Garage[];
  displayedGarages: Garage[];
  effectiveGarages: Garage[];
  adminSearch: string;
  setAdminSearch: (s: string) => void;
  onSelectGarage: (garage: Garage) => void;
  onSelectDelegate: (delegate: Delegate) => void;
  onOpenAddGarage?: () => void;
  handleApproveRequest: (req: RechargeRequest) => Promise<void>;
  handleRejectRequest: (id: string) => Promise<void>;
  handleApproveGarage: (g: Garage) => Promise<void>;
  handleRejectGarage: (g: Garage) => Promise<void>;
  setConfirmDialog: any;
  setPackageValidationError: any;
  currentWalletNumber: string;
  onUpdateWalletNumber: (num: string) => Promise<void>;
  currentAdminPin: string;
  adminGaragePageError: any;
  adminGarageHasMore: boolean;
  isAdminGaragePageLoading: boolean;
  loadAdminGaragePage: (reset?: boolean) => void;
  adminLang: 'ar' | 'en';
  t: (key: string) => string;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onLogout: () => void;
}

export const AdminNavigationAndViews: React.FC<AdminNavigationAndViewsProps> = ({
  activeTab,
  setActiveTab,
  currentSupervisor,
  delegates,
  supervisors,
  rechargeRequests,
  pendingGarages,
  packages,
  approvedGarages,
  allGarages,
  displayedGarages,
  effectiveGarages,
  adminSearch,
  setAdminSearch,
  onSelectGarage,
  onSelectDelegate,
  onOpenAddGarage,
  handleApproveRequest,
  handleRejectRequest,
  handleApproveGarage,
  handleRejectGarage,
  setConfirmDialog,
  setPackageValidationError,
  currentWalletNumber,
  onUpdateWalletNumber,
  currentAdminPin,
  adminGaragePageError,
  adminGarageHasMore,
  isAdminGaragePageLoading,
  loadAdminGaragePage,
  adminLang,
  t,
  showToast,
  onLogout
}) => {
  const unlimitedGarages = React.useMemo(() => {
    return approvedGarages.filter(g => {
      if (g.status === 'pending') return false;
      const hasFU = g.unlimitedFairUse && g.unlimitedFairUse.isActive;
      const pkgName = g.activePackageName || g.lastRechargePackageName || '';
      const isUnlimitedPkg = pkgName.includes('مفتوح') || 
                             pkgName.includes('غير محدود') || 
                             pkgName.includes('unlimited') || 
                             pkgName.includes('بلا حدود');
      return Boolean(hasFU || isUnlimitedPkg);
    });
  }, [approvedGarages]);

  const trialLeadsCount = React.useMemo(() => {
    return allGarages.filter(g => g.trialDecision === 'continued' || g.trialDecision === 'declined').length;
  }, [allGarages]);

  return (
    <>
      {/* Top Navigation Bar with Horizontal Scrolling */}
      {!currentSupervisor && (
        <div className="mb-5 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-hide no-scrollbar hide-scroll-bar touch-pan-x snap-x snap-mandatory">
            {/* Tab 1: Overview */}
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'overview' || activeTab === 'menu'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>{t('نظرة عامة')}</span>
            </button>

            {/* Tab 2: Garages */}
            <button
              type="button"
              onClick={() => setActiveTab('financial_reports')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'financial_reports'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>{t('التقرير المالي')}</span>
            </button>

            {/* Tab 3: Garages */}
            <button
              type="button"
              onClick={() => setActiveTab('garages')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'garages'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Car className="w-4 h-4" />
              <span>{t('الجراجات')}</span>
            </button>

            {/* Tab 3: Requests */}
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`flex shrink-0 snap-start items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'requests'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>{t('الطلبات والمراجعات')}</span>
              {(rechargeRequests.length > 0 || pendingGarages.length > 0) && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 animate-pulse ${
                  activeTab === 'requests'
                    ? 'bg-amber-400 text-slate-900 dark:bg-slate-950 dark:text-amber-400'
                    : 'bg-rose-500 text-white'
                }`}>
                  {rechargeRequests.length + pendingGarages.length}
                </span>
              )}
            </button>

            {/* Tab: Trial Leads */}
            <button
              type="button"
              onClick={() => setActiveTab('trial_leads')}
              className={`flex shrink-0 snap-start items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'trial_leads'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>{t('متابعة التجارب')}</span>
              {trialLeadsCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                  activeTab === 'trial_leads'
                    ? 'bg-amber-400 text-slate-900 dark:bg-slate-950 dark:text-amber-400'
                    : 'bg-emerald-500 text-white'
                }`}>
                  {trialLeadsCount}
                </span>
              )}
            </button>

            {/* Tab 4: Subscription Pricing */}
            <button
              type="button"
              onClick={() => setActiveTab('packages')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'packages'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>{t('أسعار الاشتراكات')}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                activeTab === 'packages'
                  ? 'bg-amber-400 text-slate-900 dark:bg-slate-950 dark:text-amber-400'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}>
                {packages.length}
              </span>
            </button>

            {/* Tab 5: People (Delegates, Supervisors) */}
            <button
              type="button"
              onClick={() => setActiveTab('people')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'people' || activeTab === 'delegates' || activeTab === 'supervisors'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{t('الأشخاص')}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                activeTab === 'delegates' || activeTab === 'supervisors'
                  ? 'bg-amber-400 text-slate-900 dark:bg-slate-950 dark:text-amber-400'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}>
                {delegates.length + supervisors.length}
              </span>
            </button>

            {/* Tab 6: Fair-Use (الاستخدام العادل) */}
            <button
              type="button"
              onClick={() => setActiveTab('fair_use')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'fair_use'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>{t('الاستخدام العادل')}</span>
              {unlimitedGarages.length > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  activeTab === 'fair_use'
                    ? 'bg-amber-400 text-slate-900 dark:bg-slate-950 dark:text-amber-400'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {unlimitedGarages.length}
                </span>
              )}
            </button>

            {/* Tab 7: Settings */}
            <button
              type="button"
              onClick={() => setActiveTab('catalog_settings')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                  activeTab === 'catalog_settings' || activeTab === 'wallet' || activeTab === 'admin-pin' || activeTab === 'announcements' || activeTab === 'global_settings' || activeTab === 'active_sessions'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>{t('الإعدادات')}</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'overview' || activeTab === 'menu' ? (
        <AdminOverviewView
          allGarages={approvedGarages}
          delegates={delegates}
          isSupervisor={Boolean(currentSupervisor)}
          onSelectGarage={onSelectGarage}
          onOpenAddGarage={onOpenAddGarage}
        />
      ) : activeTab === 'financial_reports' ? (
        <AdminFinancialReportsView delegates={delegates} t={t} />
      ) : activeTab === 'people' || activeTab === 'delegates' || activeTab === 'supervisors' ? (
        <AdminPeopleView
          delegates={delegates}
          supervisors={supervisors}
          currentSupervisor={currentSupervisor}
          allGarages={approvedGarages}
          onSelectDelegate={onSelectDelegate}
        />
      ) : activeTab === 'fair_use' ? (
        <AdminFairUseView 
          garages={approvedGarages}
          unlimitedGarages={unlimitedGarages}
          onSelectGarage={onSelectGarage}
          t={t}
        />
      ) : activeTab === 'catalog_settings' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5">
            {/* Wallet Number */}
            <div 
              onClick={() => setActiveTab('wallet')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-6 rounded-2xl cursor-pointer flex flex-col justify-between h-36 transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white text-base">{t('رقم المحفظة الإلكترونية')}</h3>
                <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shadow-sm shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold font-mono">
                <span>{currentWalletNumber}</span>
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-emerald-500 ${adminLang === 'en' ? '' : 'rotate-180'}`} />
              </div>
            </div>

            {/* Admin PIN */}
            <div 
              onClick={() => setActiveTab('admin-pin')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-6 rounded-2xl cursor-pointer flex flex-col justify-between h-36 transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white text-base">{t('رمز دخول الآدمن')}</h3>
                <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shadow-sm shrink-0">
                  <Key className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                <span>{t('تحديث رمز الحماية السري')}</span>
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-emerald-500 ${adminLang === 'en' ? '' : 'rotate-180'}`} />
              </div>
            </div>

            {/* Announcements */}
            <div 
              onClick={() => setActiveTab('announcements')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-6 rounded-2xl cursor-pointer flex flex-col justify-between h-36 transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white text-base">{t('إعلانات المنصة')}</h3>
                <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shadow-sm shrink-0">
                  <ClipboardList className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                <span>{t('نشر وتعديل الإعلانات العامة')}</span>
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-blue-500 ${adminLang === 'en' ? '' : 'rotate-180'}`} />
              </div>
            </div>

            {/* Global Settings */}
            <div 
              onClick={() => setActiveTab('global_settings')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-6 rounded-2xl cursor-pointer flex flex-col justify-between h-36 transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white text-base">{t('الإعدادات العامة')}</h3>
                <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shadow-sm shrink-0">
                  <SettingsIcon className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                <span>{t('إعدادات النظام والعمولات')}</span>
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-purple-500 ${adminLang === 'en' ? '' : 'rotate-180'}`} />
              </div>
            </div>

            {/* Active Devices */}
            <div
              onClick={() => setActiveTab('active_sessions')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-6 rounded-2xl cursor-pointer flex flex-col justify-between h-36 transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white text-base">الأجهزة والجلسات</h3>
                <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shadow-sm shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                <span>مراجعة الأجهزة وإلغاء الجلسات</span>
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-emerald-500 ${adminLang === 'en' ? '' : 'rotate-180'}`} />
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'garages' ? (
        <AdminGaragesTabView
          displayedGarages={displayedGarages}
          effectiveGarages={effectiveGarages}
          adminSearch={adminSearch}
          setAdminSearch={setAdminSearch}
          currentSupervisor={currentSupervisor}
          onSelectGarage={onSelectGarage}
          onOpenAddGarage={onOpenAddGarage || (() => {})}
          adminGaragePageError={adminGaragePageError}
          adminGarageHasMore={adminGarageHasMore}
          isAdminGaragePageLoading={isAdminGaragePageLoading}
          loadAdminGaragePage={loadAdminGaragePage}
          adminLang={adminLang}
          t={t}
        />
      ) : activeTab === 'requests' ? (
        <AdminRequestsView
          rechargeRequests={rechargeRequests}
          pendingGarages={pendingGarages}
          handleApproveRequest={handleApproveRequest}
          handleRejectRequest={handleRejectRequest}
          handleApproveGarage={handleApproveGarage}
          handleRejectGarage={handleRejectGarage}
          adminLang={adminLang}
          t={t}
        />
      ) : activeTab === 'trial_leads' ? (
        <AdminTrialLeadsView
          garages={allGarages}
          onSelectGarage={onSelectGarage}
          onDeleteGarage={(garageId, garageName) => {
            setConfirmDialog({
              isOpen: true,
              title: `حذف الجراج (${garageName})`,
              message: `هل أنت متأكد من حذف الجراج (${garageName}) وكافة بياناته نهائياً؟ هذا الإجراء غير قابل للتراجع.`,
              onConfirm: async () => {
                try {
                  await garageService.deleteGarage(garageId);
                  showToast?.('تم حذف الجراج بنجاح', 'success');
                } catch (err: any) {
                  showToast?.(`حدث خطأ أثناء حذف الجراج: ${err.message || err}`, 'error');
                }
              }
            });
          }}
          onRechargeGarage={(garage) => {
            onSelectGarage(garage);
          }}
          showToast={showToast}
        />
      ) : activeTab === 'packages' ? (
        <AdminPackagesView
          packages={packages}
          setConfirmDialog={setConfirmDialog}
          setPackageValidationError={setPackageValidationError}
          t={t}
        />
      ) : activeTab === 'wallet' ? (
        <AdminWalletView
          currentWalletNumber={currentWalletNumber}
          onUpdateWalletNumber={onUpdateWalletNumber}
          onCancel={() => setActiveTab('menu')}
          t={t}
        />
      ) : activeTab === 'announcements' ? (
        <AdminAnnouncementsView allGarages={allGarages} />
      ) : activeTab === 'global_settings' ? (
        <AdminGlobalSettingsView />
      ) : activeTab === 'active_sessions' ? (
        <AdminActiveSessionsView onLogout={onLogout} onBack={() => setActiveTab('catalog_settings')} t={t} showToast={showToast} />
      ) : activeTab === 'admin-pin' ? (
        <AdminPinSettingsView
          currentAdminPin={currentAdminPin}
          onCancel={() => setActiveTab('menu')}
          t={t}
        />
      ) : null}
    </>
  );
};
