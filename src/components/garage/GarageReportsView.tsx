import { useState, useMemo, memo, useEffect, useCallback } from 'react';
import { 
  ChevronRight, 
  RefreshCw, 
  TrendingUp, 
  CheckCircle2,
  BarChart2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Garage, Vehicle, Staff } from '../../types';
import { firestoreService } from '../../services';
import { getCairoDateKey } from '../../domain/garage/businessDay';

interface GarageReportsViewProps {
  garage: Garage;
  vehiclesInside?: Vehicle[];
  todayExitedVehicles: Vehicle[];
  staffList: Staff[];
  onClose: () => void;
  onToggleMenu?: () => void;
}

export const GarageReportsView = memo(({
  garage,
  todayExitedVehicles,
  staffList,
  onClose,
}: GarageReportsViewProps) => {
  // Manual toggle state
  const [localTodayExitedVehicles, setLocalTodayExitedVehicles] = useState<Vehicle[]>(() => todayExitedVehicles);
  const [localGarage, setLocalGarage] = useState<Garage>(() => garage);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [isStaffPerformanceCollapsed, setIsStaffPerformanceCollapsed] = useState(true);

  // Sync state whenever props update in real time
  useEffect(() => {
    setLocalTodayExitedVehicles(todayExitedVehicles);
  }, [todayExitedVehicles]);

  useEffect(() => {
    setLocalGarage(garage);
  }, [garage]);

  // Live direct refresh from Firestore
  const refreshFromFirestore = useCallback(async () => {
    if (!garage?.id) return;
    setIsRefreshing(true);
    try {
      const [freshGarage, freshExited] = await Promise.all([
        firestoreService.getGarageById(garage.id),
        firestoreService.getTodayTransactionsOnce(garage.id)
      ]);
      if (freshGarage) setLocalGarage(freshGarage);
      if (freshExited) setLocalTodayExitedVehicles(freshExited);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to refresh reports from Firestore:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [garage?.id]);

  // Always refresh fresh data on mount when opening the reports view
  useEffect(() => {
    refreshFromFirestore();
  }, [refreshFromFirestore]);

  // Manual Trigger
  const handleRefresh = () => {
    refreshFromFirestore();
  };

  const formatLastRefreshed = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'م' : 'ص';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  // Calculations based on local state
  const stats = useMemo(() => {
    const totalExited = localTodayExitedVehicles.length;
    const hourlyExited = localTodayExitedVehicles.filter(v => v.type === 'hourly').length;
    const overnightExited = localTodayExitedVehicles.filter(v => v.type === 'overnight').length;

    // Financial calculations
    const today = getCairoDateKey();
    const isTodayValid = localGarage.lastTransactionDate === today;
    const actualCalculatedTodayRevenue = localTodayExitedVehicles.reduce((sum, v) => sum + (typeof v.totalCost === 'number' ? v.totalCost : 0), 0);
    const todayRevenue = localTodayExitedVehicles.length > 0 
      ? actualCalculatedTodayRevenue 
      : (isTodayValid ? (localGarage.todayRevenue || 0) : 0);

    // Staff Performance (Grouped by completed exits today)
    const staffPerformance: Record<string, { count: number; revenue: number }> = {};
    
    // Default system users
    staffPerformance['مدير الجراج'] = { count: 0, revenue: 0 };
    staffList.forEach(s => {
      staffPerformance[s.name] = { count: 0, revenue: 0 };
    });

    localTodayExitedVehicles.forEach(v => {
      const handler = v.staffName || 'مدير الجراج';
      const fee = typeof v.totalCost === 'number' ? v.totalCost : 0;
      
      if (!staffPerformance[handler]) {
        staffPerformance[handler] = { count: 0, revenue: 0 };
      }
      staffPerformance[handler].count += 1;
      staffPerformance[handler].revenue += fee;
    });

    return {
      totalExited,
      hourlyExited,
      overnightExited,
      todayRevenue,
      staffPerformance: Object.entries(staffPerformance)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
    };
  }, [localTodayExitedVehicles, localGarage, staffList]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] dark:bg-slate-950 flex flex-col transition-colors select-none" dir="rtl">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center gap-4 bg-white dark:bg-slate-900 shrink-0 transition-colors">
        <button 
          onClick={onClose}
          className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors shadow-sm outline-none shrink-0"
          aria-label="الرجوع"
          title="رجوع"
        >
          <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">تقارير وأحصائيات الجراج</h2>
        </div>
      </div>

      {/* Modern, Compact Refresh Bar */}
      <div className="px-5 py-2.5 bg-slate-100/40 dark:bg-slate-900/40 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
            محدث: {formatLastRefreshed(lastRefreshed)}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-[10px] font-black text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'جاري التحديث...' : 'تحديث'}</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar stable-scrollbar pb-10 bg-slate-50/50 dark:bg-slate-950/20">
        
        {/* Row 1: Grid metrics */}
        <div className="grid grid-cols-2 gap-3.5">
          
          {/* Card: Revenue */}
          <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/60 rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500">إيرادات اليوم</span>
              <div className="w-7 h-7 bg-purple-50 dark:bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-600 dark:text-purple-400">
                <TrendingUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
            <p className="text-lg font-black text-slate-900 dark:text-white leading-none font-mono">
              {stats.todayRevenue} <span className="text-[10px] font-bold text-slate-400">ج.م</span>
            </p>
          </div>

          {/* Card: Departures */}
          <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/60 rounded-xl flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500">مغادرات اليوم</span>
              <div className="w-7 h-7 bg-rose-50 dark:bg-rose-950/40 rounded-lg flex items-center justify-center text-rose-500 dark:text-rose-400">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.3]" />
              </div>
            </div>
            <p className="text-lg font-black text-slate-900 dark:text-white leading-none font-mono">
              {stats.totalExited} <span className="text-[10px] font-bold text-slate-400">مغادرة</span>
            </p>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-1.5 leading-none">
              ساعة: {stats.hourlyExited} • مبيت: {stats.overnightExited}
            </span>
          </div>

        </div>

        {/* Row 2: Staff Shift Performance List */}
        <div className="bg-[#faf9f6] dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => setIsStaffPerformanceCollapsed(!isStaffPerformanceCollapsed)}
            className="w-full p-3 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-900/40 cursor-pointer select-none outline-none"
          >
            <div className="flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-purple-500" />
              <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                ورديات الموظفين اليوم
              </h3>
            </div>
            <div>
              {isStaffPerformanceCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 stroke-[3]" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 stroke-[3]" />
              )}
            </div>
          </button>
          
          {!isStaffPerformanceCollapsed && (
            <div className="p-4 py-2 divide-y divide-slate-100 dark:divide-slate-800/50">
              {stats.staffPerformance.map((staff, idx) => (
                <div key={staff.name} className="flex items-center justify-between py-2.5 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500">#{idx + 1}</span>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">{staff.name}</h4>
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">مغادر: {staff.count} سيارة</span>
                    </div>
                  </div>

                  <div className="text-left font-mono">
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {staff.revenue} ج.م
                    </span>
                  </div>
                </div>
              ))}

              {stats.staffPerformance.length === 0 && (
                <div className="text-center py-6 text-slate-400 dark:text-slate-600 font-bold text-[11px]">
                  لا يوجد معاملات بيع مسجلة لأي موظف اليوم.
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
});
