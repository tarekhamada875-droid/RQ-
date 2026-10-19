/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, memo } from 'react';
import { 
  Car, 
  Plus,
  Download,
} from 'lucide-react';
import { Garage, Delegate } from '../../types';
import { PlateLookupModal } from '../modals/PlateLookupModal';
import { ActivityLogExportModal } from '../modals/ActivityLogExportModal';

interface AdminOverviewViewProps {
  allGarages: Garage[];
  delegates: Delegate[];
  adminSummary?: {
    totalGarages: number;
    activeGarages: number;
    lockedGarages: number;
    totalDelegates: number;
    totalAdminRevenue: number;
  } | null;
  onSelectGarage?: (garage: Garage) => void;
  onOpenAddGarage?: () => void;
  setActiveTab?: (tab: any) => void;
  isSupervisor?: boolean;
}

export const AdminOverviewView = memo(({ 
  allGarages, 
  delegates, 
  adminSummary = null,
  onOpenAddGarage,
  isSupervisor = false
}: AdminOverviewViewProps) => {
  const [showPlateLookupModal, setShowPlateLookupModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const systemMetrics = useMemo(() => {
    const totalGarages = adminSummary?.totalGarages ?? allGarages.length;
    const activeGarages = adminSummary?.activeGarages ?? allGarages.filter(g => !g.isLocked && g.status !== 'pending').length;
    const lockedGarages = adminSummary?.lockedGarages ?? allGarages.filter(g => g.isLocked).length;
    
    const totalAdminRevenue = adminSummary?.totalAdminRevenue ?? allGarages.reduce((sum, g) => sum + (g.totalAdminRevenue || 0), 0);

    return {
      totalGarages,
      activeGarages,
      lockedGarages,
      totalAdminRevenue
    };
  }, [adminSummary, allGarages]);

  return (
    <div className="space-y-6 dir-rtl text-right font-sans max-w-6xl mx-auto px-2 sm:px-4 pb-12">
      {/* Sleek Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
            لوحة قيادة النظام
          </h2>
          <p className="text-xs font-bold text-slate-400 mt-0.5">
            {systemMetrics.totalGarages} جراج مسجل • {adminSummary?.totalDelegates ?? delegates.length} مندوب معتمد
          </p>
        </div>

        {!isSupervisor && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn_open_plate_lookup"
              onClick={() => setShowPlateLookupModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black px-4 py-2.5 rounded-2xl text-xs border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-98"
            >
              <Car className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>استعلام عن لوحة</span>
            </button>

            <button
              id="btn_export_activity_logs"
              onClick={() => setShowExportModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black px-4 py-2.5 rounded-2xl text-xs border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-98"
              title="تحميل سجل النشاط"
            >
              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>تصدير CSV</span>
            </button>

            {onOpenAddGarage && (
              <button
                id="btn_quick_add_garage"
                onClick={onOpenAddGarage}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-2xl text-xs transition-all shadow-sm cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>إضافة جراج جديد</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* High-Impact Metric Cards */}
      <div className={`grid grid-cols-1 ${!isSupervisor ? 'sm:grid-cols-2' : 'sm:grid-cols-1'} gap-4`}>
        {/* Metric 1: System Net Revenue */}
        {!isSupervisor && (
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 p-4 rounded-3xl transition-all shadow-sm flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-400 block">إجمالي شحن السيستم</span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">بالجنيه المصري (ج.م)</span>
            </div>
            <div className="px-3 py-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 font-mono font-black text-lg">
              {Number(systemMetrics.totalAdminRevenue).toLocaleString()}
            </div>
          </div>
        )}

        {/* Metric 2: Active vs Locked Garages */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500/50 p-4 rounded-3xl transition-all shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-slate-400 block">الجراجات النشطة بالمشروع</span>
            <span className="text-xs font-bold text-slate-500">{systemMetrics.lockedGarages} جراجات مقفلة</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0 font-mono font-black text-xl">
            {systemMetrics.activeGarages}
          </div>
        </div>
      </div>
      {/* Modals */}
      {!isSupervisor && showPlateLookupModal && (
        <PlateLookupModal
          allGarages={allGarages}
          onClose={() => setShowPlateLookupModal(false)}
        />
      )}

      {!isSupervisor && showExportModal && (
        <ActivityLogExportModal
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
});

export default AdminOverviewView;
