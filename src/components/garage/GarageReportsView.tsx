import { useState, useMemo, memo, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Calendar,
  CalendarDays,
  TrendingUp,
} from 'lucide-react';
import { Garage, Vehicle, Staff } from '../../types';
import { garageService, vehicleService, GarageDashboardSummary, isFreshGarageDashboardSummary } from '../../services';
import { formatArabicDigits } from '../../utils/plates';
import { GarageReportStatCard } from './reports/GarageReportStatCard';
import { GarageStaffPerformanceCard } from './reports/GarageStaffPerformanceCard';
import {
  type GarageReportRecord,
  buildGarageReportStats,
  pickReportsNoticeState,
} from './reports/garageReportStats';

type ReportViewMode = 'initial' | 'daily' | 'monthly';

interface GarageReportsViewProps {
  garage: Garage;
  vehiclesInside?: Vehicle[];
  todayExitedVehicles?: GarageReportRecord[];
  staffList: Staff[];
  onClose: () => void;
  onToggleMenu?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const GarageReportsView = memo(({
  garage,
  staffList,
  onClose,
  showToast,
}: GarageReportsViewProps) => {
  // ── View mode: 'initial' shows buttons, 'daily' shows today's report,
  //    'monthly' shows 30-day total revenue. ──────────────────────────
  const [viewMode, setViewMode] = useState<ReportViewMode>('initial');

  // ── Daily report state (existing) ──────────────────────────────────
  const [localTodayExitedVehicles, setLocalTodayExitedVehicles] = useState<GarageReportRecord[]>([]);
  const [localGarage, setLocalGarage] = useState<Garage>(() => garage);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [dashboardSummary, setDashboardSummary] = useState<GarageDashboardSummary | null>(null);
  const [isStaffPerformanceCollapsed, setIsStaffPerformanceCollapsed] = useState(false);

  // ── Monthly report state (new) ─────────────────────────────────────
  const [monthlyRevenue, setMonthlyRevenue] = useState<number | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState(false);
  const [monthlyDaysWithData, setMonthlyDaysWithData] = useState(0);

  useEffect(() => {
    setLocalGarage(garage);
  }, [garage]);

  // ── Daily report: start on-demand listener + fetch server summary ──
  // Only runs when viewMode === 'daily'. Stops when user navigates back.
  // This replaces the always-on listener that was in useGarageSync (which
  // cost ~50 reads/garage/day even when nobody was looking at reports).
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

  useEffect(() => {
    if (viewMode !== 'daily' || !garage?.id) return;
    let active = true;
    setIsInitialLoad(true);
    // Start the on-demand listener for today's transactions (activity logs)
    const unsub = vehicleService.subscribeToTodayTransactions(garage.id, (transactions, error) => {
      if (!active) return;
      if (error) {
        showToast?.('تعذر تحديث سجل حركة اليوم.', 'error');
        return;
      }
      setLocalTodayExitedVehicles(transactions);
    });
    // Also fetch the server-side summary (revenue, exits, staff performance)
    refreshFromFirestore();
    return () => {
      active = false;
      unsub();
    };
  }, [viewMode, garage?.id, refreshFromFirestore, showToast]);

  // ── Monthly report: fetch 30-day revenue from daily_stats ──────────
  useEffect(() => {
    if (viewMode !== 'monthly' || !garage?.id) return;
    let active = true;
    setMonthlyLoading(true);
    setMonthlyError(false);
    vehicleService.getMonthlyRevenue(garage.id)
      .then((result) => {
        if (!active) return;
        setMonthlyRevenue(result.totalRevenue);
        setMonthlyDaysWithData(result.daysWithData);
      })
      .catch(() => {
        if (!active) return;
        setMonthlyError(true);
      })
      .finally(() => {
        if (active) setMonthlyLoading(false);
      });
    return () => { active = false; };
  }, [viewMode, garage?.id]);

  // ── Back button: daily/monthly → initial, initial → close ─────────
  const handleBack = () => {
    if (viewMode !== 'initial') {
      setViewMode('initial');
    } else {
      onClose();
    }
  };

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

  // ── Daily stats computation (existing, unchanged) ───────────────────
  const stats = useMemo(() => {
    const localStats = buildGarageReportStats(localTodayExitedVehicles, staffList, localGarage);

    const freshSummaryIsUsable = isFreshGarageDashboardSummary(dashboardSummary);
    const reportAggregate = freshSummaryIsUsable ? dashboardSummary.report : undefined;
    const effectiveTotalExited = freshSummaryIsUsable ? dashboardSummary.exitsToday : localStats.totalExited;
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

  // ────────────────────────────────────────────────────────────────────
  //  RENDER
  // ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] dark:bg-slate-950 flex flex-col pt-safe px-safe overflow-hidden select-none" dir="rtl">
      {/* Header */}
      <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 z-40 w-full shrink-0">
        <div className="max-w-2xl mx-auto flex items-center gap-3 w-full">
          <button
            onClick={handleBack}
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

      {/* ── INITIAL: two buttons in the middle ──────────────────────── */}
      {viewMode === 'initial' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <button
            onClick={() => setViewMode('daily')}
            className="w-full max-w-sm flex items-center gap-4 p-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl hover:border-emerald-500 dark:hover:border-emerald-500 transition-all outline-none cursor-pointer active:scale-[0.98]"
          >
            <div className="w-12 h-12 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="text-right flex-1">
              <p className="font-black text-slate-900 dark:text-white text-base">تقرير اليوم</p>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">إيرادات وحركات النهارده</p>
            </div>
          </button>

          <button
            onClick={() => setViewMode('monthly')}
            className="w-full max-w-sm flex items-center gap-4 p-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl hover:border-amber-500 dark:hover:border-amber-500 transition-all outline-none cursor-pointer active:scale-[0.98]"
          >
            <div className="w-12 h-12 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div className="text-right flex-1">
              <p className="font-black text-slate-900 dark:text-white text-base">تقرير شهري</p>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">إجمالي إيرادات آخر ٣٠ يوم</p>
            </div>
          </button>
        </div>
      )}

      {/* ── MONTHLY: one big revenue number ────────────────────────── */}
      {viewMode === 'monthly' && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
          {monthlyLoading ? (
            <div className="flex flex-col items-center gap-4" role="status">
              <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">بيتجمّع التقرير الشهري...</p>
            </div>
          ) : monthlyError ? (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-5 py-8 text-center max-w-sm">
              <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" aria-hidden="true" />
              <p className="mt-3 font-bold text-rose-700 dark:text-rose-300">مش قادرين نحمّل التقرير الشهري.</p>
              <button
                onClick={() => setViewMode('initial')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-black text-white cursor-pointer"
              >
                حاول تاني
              </button>
            </div>
          ) : monthlyDaysWithData === 0 ? (
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="font-black text-slate-500 dark:text-slate-400 text-base mb-1">مفيش بيانات كافية</p>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">التقرير الشهري بيظهر لما يكون عندك حركات على الأقل يوم واحد خلال آخر ٣٠ يوم.</p>
            </div>
          ) : (
            <div className="text-center w-full max-w-sm">
              <div className="w-16 h-16 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-2">إجمالي الإيرادات — آخر ٣٠ يوم</p>
              <div className="flex items-baseline justify-center gap-2 font-mono leading-none mb-4">
                <span className="text-5xl sm:text-6xl font-black text-slate-900 dark:text-white">
                  {formatArabicDigits(monthlyRevenue ?? 0)}
                </span>
                <span className="text-lg font-black text-slate-400">ج.م</span>
              </div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500">
                بيانات من {formatArabicDigits(monthlyDaysWithData)} يوم خلال آخر ٣٠ يوم
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── DAILY: the existing reports UI (revenue, departures, staff) ── */}
      {viewMode === 'daily' && (
        <>
          {/* Refresh Bar */}
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
              <span>{isRefreshing ? 'بيتحدّث...' : 'تحديث'}</span>
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar stable-scrollbar pb-10 bg-slate-50/50 dark:bg-slate-950/20">
            {isInitialLoad ? (
              <div className="space-y-4" aria-label="بيتحمل التقرير">
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
                  {isRefreshing ? 'بيتحدّث...' : 'حاول تاني'}
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
                        الإحصائيات بتاعه النهارده بتعتمد على حد أقصى ٢٠٠ حركة؛ لو زاد العدد عن كده، ممكن ماتبقاش شاملة كل الحركات.
                      </p>
                    );
                  }
                  return (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                      عرض مباشر لحركات النهارده من السجل. الملخص الموثوق مش متاح دلوقتي.
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
        </>
      )}
    </div>
  );
});
