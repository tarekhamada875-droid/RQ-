import { useState, useMemo, memo, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { Garage, Vehicle, Staff } from '../../types';
import { garageService, GarageDashboardSummary, isFreshGarageDashboardSummary } from '../../services';
import { formatArabicDigits } from '../../utils/plates';
import { GarageReportStatCard } from './reports/GarageReportStatCard';
import { GarageStaffPerformanceCard } from './reports/GarageStaffPerformanceCard';
import {
  type GarageReportRecord,
  buildGarageReportStats,
  pickReportsNoticeState,
} from './reports/garageReportStats';

interface GarageReportsViewProps {
  garage: Garage;
  vehiclesInside?: Vehicle[];
  todayExitedVehicles: GarageReportRecord[];
  staffList: Staff[];
  onClose: () => void;
  onToggleMenu?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const GarageReportsView = memo(({
  garage,
  todayExitedVehicles,
  staffList,
  onClose,
  showToast,
}: GarageReportsViewProps) => {
  // Manual toggle state
  const [localTodayExitedVehicles, setLocalTodayExitedVehicles] = useState<GarageReportRecord[]>(() => todayExitedVehicles || []);
  const [localGarage, setLocalGarage] = useState<Garage>(() => garage);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [dashboardSummary, setDashboardSummary] = useState<GarageDashboardSummary | null>(null);
  const [isStaffPerformanceCollapsed, setIsStaffPerformanceCollapsed] = useState(false);

  useEffect(() => {
    setLocalTodayExitedVehicles(todayExitedVehicles || []);
  }, [todayExitedVehicles]);

  useEffect(() => {
    setLocalGarage(garage);
  }, [garage]);

  // Live direct refresh from Firestore. Errors are surfaced to the user via
  // a toast + an inline error card (mirrors CreditGrantHistoryView's pattern).
  // Previously the catch was silently swallowed, leaving the user looking at
  // stale data with no signal that anything had gone wrong.
  const refreshFromFirestore = useCallback(async () => {
    if (!garage?.id) return;
    setIsRefreshing(true);
    setHasError(false);
    try {
      const [freshGarage, freshSummary] = await Promise.all([
        garageService.getGarageById(garage.id),
        garageService.getDashboardSummary(garage.id).catch(() => null)
      ]);
      if (freshGarage) setLocalGarage(freshGarage);
      setDashboardSummary(freshSummary);
      setLastRefreshed(new Date());
    } catch {
      setHasError(true);
      showToast?.('تعذر تحديث بيانات التقارير. حاول مرة أخرى.', 'error');
    } finally {
      setIsRefreshing(false);
      setIsInitialLoad(false);
    }
  }, [garage?.id, showToast]);

  // Always refresh fresh data on mount when opening the reports view
  useEffect(() => {
    refreshFromFirestore();
  }, [refreshFromFirestore]);

  // Manual Trigger
  const handleRefresh = () => {
    refreshFromFirestore();
  };

  const handleStaffPerformanceToggle = () => {
    setIsStaffPerformanceCollapsed((collapsed) => !collapsed);
  };

  const formatLastRefreshed = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'م' : 'ص';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  // Calculations based on the activity-log feed and the server summary.
  const stats = useMemo(() => {
    const localStats = buildGarageReportStats(localTodayExitedVehicles, staffList, localGarage);

    // Financial calculations
    const freshSummaryIsUsable = isFreshGarageDashboardSummary(dashboardSummary);
    const reportAggregate = freshSummaryIsUsable ? dashboardSummary.report : undefined;
    const effectiveTotalExited = freshSummaryIsUsable ? dashboardSummary.exitsToday : localStats.totalExited;
    // The garage-doc `todayRevenue` counter is a mixed-purpose accumulator that
    // subscriber renewals also bump, and the check-in path doesn't reset it on
    // a new day — so it can carry yesterday's revenue into a fresh day and
    // disagree with the departures count shown next to it. When the
    // authoritative server summary is unavailable, derive today's revenue
    // strictly from the visible checkout activity log so the two numbers
    // always agree (0 exits → 0 revenue).
    const todayRevenue = freshSummaryIsUsable
      ? dashboardSummary.netRevenue
      : localStats.actualCalculatedTodayRevenue;

    return {
      totalExited: effectiveTotalExited,
      hourlyExited: reportAggregate?.hourlyExited ?? localStats.hourlyExited,
      overnightExited: reportAggregate?.overnightExited ?? localStats.overnightExited,
      todayRevenue,
      staffPerformance: reportAggregate
        ? Object.values(reportAggregate.staffPerformance).sort((a, b) => b.revenue - a.revenue)
        : localStats.staffPerformance
    };
  }, [dashboardSummary, localTodayExitedVehicles, localGarage, staffList]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] dark:bg-slate-950 flex flex-col pt-safe px-safe overflow-hidden select-none" dir="rtl">
      {/* Header */}
      <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 z-40 w-full shrink-0">
        <div className="max-w-2xl mx-auto flex items-center gap-3 w-full">
          <button
            onClick={onClose}
            className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center outline-none shrink-0"
            aria-label="الرجوع"
            title="رجوع"
          >
            <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">تقارير وإحصائيات الجراج</h1>
          </div>
        </div>
      </header>

      {/* Modern, Compact Refresh Bar */}
      <div className="px-5 py-2.5 bg-slate-100/40 dark:bg-slate-900/40 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
            محدث: {formatLastRefreshed(lastRefreshed)}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-[10px] font-black text-purple-600 dark:text-purple-400 disabled:opacity-40 cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'جاري التحديث...' : 'تحديث'}</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar stable-scrollbar pb-10 bg-slate-50/50 dark:bg-slate-950/20">
        {/* Initial-load skeleton — shown only on the very first refresh after
            opening the reports view, so the user doesn't see zeros flash
            before the Worker confirms the dashboard summary. */}
        {isInitialLoad ? (
          <div className="space-y-4" aria-label="جاري تحميل التقارير">
            <div className="h-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
            <div className="grid grid-cols-2 gap-3.5">
              <div className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
              <div className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
            </div>
            <div className="h-32 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
          </div>
        ) : hasError ? (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-5 py-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" aria-hidden="true" />
            <p className="mt-3 font-bold text-rose-700 dark:text-rose-300">مش قادرين نحمّل التقارير دلوقتي.</p>
            <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">جرّب تحديث الصفحة تاني.</p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'جاري التحديث...' : 'إعادة المحاولة'}
            </button>
          </div>
        ) : (
          <>
            {(() => {
              const freshSummaryAvailable = isFreshGarageDashboardSummary(dashboardSummary) && !!dashboardSummary.report;
              const noticeState = pickReportsNoticeState(freshSummaryAvailable, stats.totalExited);
              if (noticeState === 'fresh_summary') {
                return (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-relaxed text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                    الإحصاءات اليومية محسوبة من ملخص موثوق ومحدث مباشرة مع كل عملية خروج.
                  </p>
                );
              }
              if (noticeState === 'live_may_be_truncated') {
                return (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                    الإحصاءات اليومية تعتمد على ما يصل إلى 200 سجل من حركات اليوم؛ إذا تجاوز العدد ذلك، فقد لا تشمل كل الحركات.
                  </p>
                );
              }
              return (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                  عرض مباشر لحركات اليوم من سجل النشاط. الملخص الموثوق غير متاح مؤقتاً.
                </p>
              );
            })()}

            {/* Row 1: Grid metrics — two presentational tiles. */}
            <div className="grid grid-cols-2 gap-3.5">
              <GarageReportStatCard
                variant="revenue"
                value={stats.todayRevenue}
              />
              <GarageReportStatCard
                variant="departures"
                value={stats.totalExited}
                sublabel={
                  <>ساعة: {formatArabicDigits(stats.hourlyExited)} • مبيت: {formatArabicDigits(stats.overnightExited)}</>
                }
              />
            </div>

            {/* Row 2: Staff Shift Performance List */}
            <GarageStaffPerformanceCard
              staffPerformance={stats.staffPerformance}
              isCollapsed={isStaffPerformanceCollapsed}
              onToggle={handleStaffPerformanceToggle}
            />
          </>
        )}

      </div>
    </div>
  );
});
