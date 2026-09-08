/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, memo } from 'react';
import { 
  DollarSign, 
  Car, 
  AlertTriangle,
  Plus,
  ShieldAlert,
  Download
} from 'lucide-react';
import { Garage, Delegate } from '../../types';
import { getRemainingDays } from '../../utils';
import { getCairoDateKey } from '../../domain/garage/businessDay';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { PlateLookupModal } from '../modals/PlateLookupModal';
import { ActivityLogExportModal } from '../modals/ActivityLogExportModal';

interface AdminOverviewViewProps {
  allGarages: Garage[];
  delegates: Delegate[];
  onSelectGarage?: (garage: Garage) => void;
  onOpenAddGarage?: () => void;
  isSupervisor?: boolean;
}

export const AdminOverviewView = memo(({ 
  allGarages, 
  delegates, 
  onSelectGarage,
  onOpenAddGarage,
  isSupervisor = false
}: AdminOverviewViewProps) => {
  const { adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);
  const config = useSystemConfig();
  const warningDaysThreshold = typeof config?.warningDaysThreshold === 'number' ? config.warningDaysThreshold : 3;

  const [showPlateLookupModal, setShowPlateLookupModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // 5-Card High Precision Metrics Calculation directly from props
  const systemMetrics = useMemo(() => {
    const totalGarages = allGarages.length;
    const activeGarages = allGarages.filter(g => !g.isLocked).length;
    const lockedGarages = allGarages.filter(g => g.isLocked).length;
    
    // Total cars currently parked inside ALL garages
    const currentCarsInside = allGarages.reduce((sum, g) => {
      const activeCarsCount = typeof g.carsInside === 'number' ? Math.max(0, g.carsInside) : (g.activePlates ? Object.keys(g.activePlates).length : 0);
      return sum + activeCarsCount;
    }, 0);

    const today = getCairoDateKey();
    const totalExitsCount = allGarages.reduce((sum, g) => sum + (g.totalVehiclesOut || 0), 0);
    const todayExitsCount = allGarages.reduce((sum, g) => {
      const isToday = g.lastTransactionDate === today;
      return sum + (isToday ? (g.todayCount || 0) : 0);
    }, 0);

    const todayRevenue = allGarages.reduce((sum, g) => {
      const isToday = g.lastTransactionDate === today;
      return sum + (isToday ? (g.todayRevenue || 0) : 0);
    }, 0);

    const totalAdminRevenue = allGarages.reduce((sum, g) => sum + (g.totalAdminRevenue || 0), 0);
    const totalGaragesRevenue = allGarages.reduce((sum, g) => sum + (g.totalRevenue || 0), 0);

    // Expiring soon garages count (<= warningDaysThreshold)
    const expiringSoonCount = allGarages.filter(g => {
      if (g.status === 'pending' || !g.balanceExpiry) return false;
      return getRemainingDays(g) <= warningDaysThreshold;
    }).length;

    return {
      totalGarages,
      activeGarages,
      lockedGarages,
      currentCarsInside,
      totalExitsCount,
      todayExitsCount,
      todayRevenue,
      totalAdminRevenue,
      totalGaragesRevenue,
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
    <div className="space-y-8 font-sans pb-16" dir={adminLang === 'en' ? 'ltr' : 'rtl'}>
      {/* Top Quick Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white leading-tight">
            {t('نظرة عامة على النظام')}
          </h2>
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {allGarages.length} {t('جراج مسجل')} • {delegates.length} {t('مندوب')}
          </p>
        </div>

        {!isSupervisor && (
          <div className="flex items-center gap-2.5">
            {/* Activity Log CSV Export Button */}
            <button
              id="btn_export_activity_logs"
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 font-black px-3.5 py-2.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
              title={t('تحميل سجل النشاط (CSV)')}
            >
              <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">{t('تحميل سجل النشاط (CSV)')}</span>
              <span className="sm:hidden">{t('تصدير CSV')}</span>
            </button>

            {/* Plate Lookup Button */}
            <button
              id="btn_open_plate_lookup"
              onClick={() => setShowPlateLookupModal(true)}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 active:scale-95 text-white font-black px-4 py-2.5 rounded-xl text-xs shadow-sm transition-all cursor-pointer"
            >
              <Car className="w-4 h-4" />
              <span>{t('استعلام عن لوحة')}</span>
            </button>

            {/* Add Garage Button */}
            {onOpenAddGarage && (
              <button
                id="btn_quick_add_garage"
                onClick={onOpenAddGarage}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black px-4 py-2.5 rounded-xl text-xs shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>{t('إضافة جراج')}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Metric Stat Grid */}
      <div className={`grid grid-cols-1 ${!isSupervisor ? 'md:grid-cols-2' : ''} gap-3`}>
        {/* Card 1: Admin Net Revenue - Hidden for Supervisors */}
        {!isSupervisor && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 rounded-2xl relative overflow-hidden flex items-center justify-between gap-3 shadow-sm hover:border-emerald-500/50 transition-all">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="text-mobile-wrap text-mobile-fluid font-black text-slate-800 dark:text-slate-200">{t('إجمالي شحن السيستم')}</span>
            </div>
            <div className="flex items-baseline gap-1 shrink-0">
              <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono leading-none tracking-tight">
                {Number(systemMetrics.totalAdminRevenue).toFixed(0)}
              </span>
              <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">{t('ج.م')}</span>
            </div>
          </div>
        )}

        {/* Card 2: Expiring Soon Alert */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 rounded-2xl relative overflow-hidden flex items-center justify-between gap-3 shadow-sm hover:border-rose-500/50 transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              systemMetrics.expiringSoonCount > 0 
                ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400' 
                : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}>
              <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="text-mobile-wrap text-mobile-fluid font-black text-slate-800 dark:text-slate-200">{t('جراجات تقترب من انتهاء الاشتراك')}</span>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className={`text-xl sm:text-2xl font-black font-mono leading-none tracking-tight ${
              systemMetrics.expiringSoonCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
            }`}>
              {systemMetrics.expiringSoonCount}
            </span>
            <span className="text-[11px] font-bold text-slate-400">{t('جراج')}</span>
          </div>
        </div>
      </div>

      {/* Expiring Soon Section */}
      {expiringGarages.length > 0 && (
        <section className="bg-rose-500/5 dark:bg-rose-500/10 border-2 border-rose-500/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-rose-900 dark:text-rose-200">
                {t('جراجات تقترب من انتهاء الاشتراك')} ({expiringGarages.length})
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {expiringGarages.map((g) => (
              <div 
                key={g.id}
                onClick={() => onSelectGarage && onSelectGarage(g)}
                className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 hover:border-rose-400 flex items-center justify-between cursor-pointer transition-all group shadow-sm"
              >
                <div className="min-w-0">
                  <h4 className="text-mobile-wrap text-xs font-black text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors leading-snug">
                    {g.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{g.phone}</p>
                </div>
                <div className={`font-mono text-xs font-black px-2.5 py-1 rounded-lg shrink-0 ${
                  g.remainingDays <= 1 
                    ? 'bg-rose-500 text-white' 
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                }`}>
                  {g.remainingDays} {t('يوم')}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Plate Lookup Modal - Admin/Owner only */}
      {!isSupervisor && showPlateLookupModal && (
        <PlateLookupModal
          allGarages={allGarages}
          onClose={() => setShowPlateLookupModal(false)}
        />
      )}

      {/* Activity Log CSV Export Modal - Admin/Owner only */}
      {!isSupervisor && showExportModal && (
        <ActivityLogExportModal
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
});
