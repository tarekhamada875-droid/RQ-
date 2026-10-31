import React, { useState } from 'react';
import { Garage, Delegate } from '../../types';
import {
  Car,
  Users,
  Zap,
  Settings as SettingsIcon,
  Key,
  ChevronRight,
  ShieldCheck,
  Wallet,
  Download
} from 'lucide-react';
import { AdminPeopleView } from './AdminPeopleView';
import { AdminGaragesTabView } from './AdminGaragesTabView';
import { AdminRequestsView } from './AdminRequestsView';
import { AdminPinSettingsView } from './AdminPinSettingsView';
import { AdminActiveSessionsView } from './AdminActiveSessionsView';
import { AdminWalletSettingsView } from './AdminWalletSettingsView';
import { ActivityLogExportModal } from '../modals/ActivityLogExportModal';

interface AdminNavigationAndViewsProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  delegates: Delegate[];
  adminGarageHasMore?: boolean;
  adminDelegateHasMore?: boolean;
  adminListsLoading?: boolean;
  adminListsError?: boolean;
  onLoadMoreAdminGarages?: () => Promise<void>;
  onLoadMoreAdminDelegates?: () => Promise<void>;
  onRefreshAdminLists?: () => Promise<void>;
  pendingGarages: Garage[];
  approvedGarages: Garage[];
  displayedGarages: Garage[];
  adminSearch: string;
  setAdminSearch: (s: string) => void;
  onSelectGarage: (garage: Garage) => void;
  onSelectDelegate: (delegate: Delegate) => void;
  onOpenAddGarage?: () => void;
  handleApproveGarage: (g: Garage) => Promise<void>;
  handleRejectGarage: (g: Garage) => Promise<void>;
  currentAdminPin: string;
  t: (key: string) => string;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onLogout: () => void;
}

export const AdminNavigationAndViews: React.FC<AdminNavigationAndViewsProps> = ({
  activeTab,
  setActiveTab,
  delegates,
  adminGarageHasMore = false,
  adminDelegateHasMore = false,
  adminListsLoading = false,
  adminListsError = false,
  onLoadMoreAdminGarages,
  onLoadMoreAdminDelegates,
  onRefreshAdminLists,
  pendingGarages,
  approvedGarages,
  displayedGarages,
  adminSearch,
  setAdminSearch,
  onSelectGarage,
  onSelectDelegate,
  onOpenAddGarage,
  handleApproveGarage,
  handleRejectGarage,
  currentAdminPin,
  t,
  showToast,
  onLogout
}) => {
  const [showExportModal, setShowExportModal] = useState(false);

  return (
    <>
      {/* Top Navigation Bar with Horizontal Scrolling */}
      {(
        <div className="mb-5 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-hide no-scrollbar hide-scroll-bar touch-pan-x snap-x snap-mandatory">
            {/* Tab 1: Garages */}
            <button
              type="button"
              onClick={() => setActiveTab('garages')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'garages'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Car className={`w-4 h-4 ${activeTab === 'garages' ? 'text-current' : 'text-amber-500'}`} />
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
              <Zap className={`w-4 h-4 ${activeTab === 'requests' ? 'text-current' : 'text-rose-500'}`} />
              <span>{t('الطلبات والمراجعات')}</span>
              {pendingGarages.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                  activeTab === 'requests'
                    ? 'bg-amber-400 text-slate-900 dark:bg-slate-950 dark:text-amber-400'
                    : 'bg-rose-500 text-white'
                }`}>
                  {pendingGarages.length}
                </span>
              )}
            </button>

            {/* Tab 5: People (Delegates) */}
            <button
              type="button"
              onClick={() => setActiveTab('people')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                activeTab === 'people' || activeTab === 'delegates'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className={`w-4 h-4 ${(activeTab === 'people' || activeTab === 'delegates') ? 'text-current' : 'text-indigo-500'}`} />
              <span>{t('الأشخاص')}</span>
            </button>

            {/* Tab 7: Settings */}
            <button
              type="button"
              onClick={() => setActiveTab('catalog_settings')}
              className={`flex shrink-0 snap-start items-center gap-2.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                  activeTab === 'catalog_settings' || activeTab === 'admin-pin' || activeTab === 'active_sessions'
                  ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <SettingsIcon className={`w-4 h-4 ${(activeTab === 'catalog_settings' || activeTab === 'admin-pin' || activeTab === 'active_sessions' || activeTab === 'wallet_settings') ? 'text-current' : 'text-sky-500'}`} />
              <span>{t('الإعدادات')}</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'people' || activeTab === 'delegates' ? (
        <AdminPeopleView
          delegates={delegates}
          allGarages={approvedGarages}
          onSelectDelegate={onSelectDelegate}
          hasMore={adminDelegateHasMore}
          isLoading={adminListsLoading}
          hasError={adminListsError}
          onLoadMore={onLoadMoreAdminDelegates}
          onRefresh={onRefreshAdminLists}
        />
      ) : activeTab === 'catalog_settings' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5">
            {/* Export Activity Logs (CSV) */}
            <div
              id="btn_export_activity_logs"
              onClick={() => setShowExportModal(true)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 p-6 rounded-2xl cursor-pointer flex flex-col justify-between h-36 transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white text-base">{t('تصدير سجل النشاط')}</h3>
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Download className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                <span>{t('تحميل سجل النشاط بصيغة CSV')}</span>
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-emerald-500 rotate-180`} />
              </div>
            </div>

            {/* Add New Garage — removed from Settings; the Garages tab already
                has an "إضافة جراج جديد" button (AdminGaragesTabView), making
                this card redundant. */}

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
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-emerald-500 rotate-180`} />
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
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-emerald-500 rotate-180`} />
              </div>
            </div>

            {/* Payment Wallet Number */}
            <div
              onClick={() => setActiveTab('wallet_settings')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 p-6 rounded-2xl cursor-pointer flex flex-col justify-between h-36 transition-all group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white text-base">رقم محفظة الدفع</h3>
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                <span>يُعرض لأصحاب الجراجات عند نفاد الرصيد</span>
                <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-amber-500 rotate-180`} />
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'garages' ? (
        <AdminGaragesTabView
          displayedGarages={displayedGarages}
          hasMore={adminGarageHasMore}
          isLoading={adminListsLoading}
          hasError={adminListsError}
          onLoadMore={onLoadMoreAdminGarages}
          onRefresh={onRefreshAdminLists}
          adminSearch={adminSearch}
          setAdminSearch={setAdminSearch}
          onSelectGarage={onSelectGarage}
          onOpenAddGarage={onOpenAddGarage || (() => {})}
          t={t}
        />
      ) : activeTab === 'requests' ? (
        <AdminRequestsView
          pendingGarages={pendingGarages}
          handleApproveGarage={handleApproveGarage}
          handleRejectGarage={handleRejectGarage}
        />
      ) : activeTab === 'active_sessions' ? (
        <AdminActiveSessionsView onLogout={onLogout} onBack={() => setActiveTab('catalog_settings')} t={t} showToast={showToast} />
      ) : activeTab === 'wallet_settings' ? (
        <AdminWalletSettingsView onBack={() => setActiveTab('catalog_settings')} t={t} />
      ) : activeTab === 'admin-pin' ? (
        <AdminPinSettingsView
          currentAdminPin={currentAdminPin}
          onCancel={() => setActiveTab('catalog_settings')}
          t={t}
        />
      ) : null}

      {showExportModal && (
        <ActivityLogExportModal
          onClose={() => setShowExportModal(false)}
        />
      )}
    </>
  );
};
