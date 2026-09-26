/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, memo } from 'react';
import { 
  Car, 
  Plus,
  ShieldAlert,
  Download,
  Phone
} from 'lucide-react';
import { Garage, Delegate } from '../../types';
import { getRemainingDays } from '../../utils';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { PlateLookupModal } from '../modals/PlateLookupModal';
import { ActivityLogExportModal } from '../modals/ActivityLogExportModal';

interface AdminOverviewViewProps {
  allGarages: Garage[];
  delegates: Delegate[];
  onSelectGarage?: (garage: Garage) => void;
  onOpenAddGarage?: () => void;
  setActiveTab?: (tab: any) => void;
  isSupervisor?: boolean;
}

export const AdminOverviewView = memo(({ 
  allGarages, 
  delegates, 
  onSelectGarage,
  onOpenAddGarage,
  isSupervisor = false
}: AdminOverviewViewProps) => {
  const config = useSystemConfig();
  const warningDaysThreshold = typeof config?.warningDaysThreshold === 'number' ? config.warningDaysThreshold : 3;

  const [showPlateLookupModal, setShowPlateLookupModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const systemMetrics = useMemo(() => {
    const totalGarages = allGarages.length;
    const activeGarages = allGarages.filter(g => !g.isLocked && g.status !== 'pending').length;
    const lockedGarages = allGarages.filter(g => g.isLocked).length;
    
    // Total cars currently parked inside ALL garages
    const currentCarsInside = allGarages.reduce((sum, g) => {
      const activeCarsCount = typeof g.carsInside === 'number' ? Math.max(0, g.carsInside) : (g.activePlates ? Object.keys(g.activePlates).length : 0);
      return sum + activeCarsCount;
    }, 0);

    const totalAdminRevenue = allGarages.reduce((sum, g) => sum + (g.totalAdminRevenue || 0), 0);

    // Expiring soon garages count
    const expiringSoonCount = allGarages.filter(g => {
      if (g.status === 'pending' || !g.balanceExpiry) return false;
      return getRemainingDays(g) <= warningDaysThreshold;
    }).length;

    return {
      totalGarages,
      activeGarages,
      lockedGarages,
      currentCarsInside,
      totalAdminRevenue,
      expiringSoonCount
    };
  }, [allGarages, warningDaysThreshold]);

  const expiringGarages = useMemo(() => {
    return allGarages
      .filter(g => g.status !== 'pending' && g.balanceExpiry)
      .map(g => ({
        ...g,
        remainingDays: getRemainingDays(g)
      }))
      .filter(g => g.remainingDays <= warningDaysThreshold)
      .sort((a, b) => a.remainingDays - b.remainingDays);
  }, [allGarages, warningDaysThreshold]);

  return (
    <div className="space-y-6 dir-rtl text-right font-sans max-w-6xl mx-auto px-2 sm:px-4 pb-12">
      {/* Sleek Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
            لوحة قيادة النظام
          </h2>
          <p className="text-xs font-bold text-slate-400 mt-0.5">
            {allGarages.length} جراج مسجل • {delegates.length} مندوب معتمد
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

      {/* 3 High-Impact Compact Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Metric 3: Total Cars Parked Currently */}
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-purple-500/50 p-4 rounded-3xl transition-all shadow-sm flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-slate-400 block">السيارات بالداخل الآن</span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400">سيارات متواجدة حالياً</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0 font-mono font-black text-xl">
            {systemMetrics.currentCarsInside}
          </div>
        </div>
      </div>

      {/* Expiring Soon Section */}
      {expiringGarages.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border-2 border-rose-500/30 rounded-3xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  جراجات تقترب من انتهاء الاشتراك ({expiringGarages.length})
                </h3>
                <p className="text-xs font-bold text-slate-400">تنبيه المتابعة لإعادة الشحن والتجديد</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {expiringGarages.map((g) => (
              <div 
                key={g.id}
                className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-rose-200 dark:border-rose-900/40 flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="min-w-0 space-y-1">
                  <button
                    type="button"
                    onClick={() => onSelectGarage && onSelectGarage(g)}
                    className="font-black text-sm text-slate-900 dark:text-white hover:text-rose-600 dark:hover:text-rose-400 transition-colors text-right block truncate cursor-pointer"
                  >
                    {g.name}
                  </button>
                  {g.phone && (
                    <a
                      href={`tel:${g.phone}`}
                      className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-500 hover:text-emerald-600 transition-colors"
                    >
                      <Phone className="w-3 h-3 text-emerald-500" />
                      <span>{g.phone}</span>
                    </a>
                  )}
                </div>

                <span className={`font-mono text-xs font-black px-3 py-1 rounded-xl shrink-0 ${
                  g.remainingDays <= 1 
                    ? 'bg-rose-600 text-white shadow-xs' 
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                }`}>
                  {g.remainingDays} {g.remainingDays === 1 ? 'يوم' : 'أيام'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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

