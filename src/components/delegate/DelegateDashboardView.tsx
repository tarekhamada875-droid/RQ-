import React, { useState, memo } from 'react';
import { 
  Building2, 
  Search, 
  PlusCircle, 
  LogOut, 
  Users,
  CheckCircle2,
  X,
  Loader2,
  Sun,
  Moon,
  MoreVertical,
  RefreshCw,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Garage, Delegate, Package, RechargeRequest } from '../../types';
import { getCleanPackageInfo, getDefaultDurationFilter, filterPackagesForGarage, BALANCE_PRESET_AMOUNTS } from '../../constants/packages';
import { useTheme } from '../../utils/ThemeContext';
import { generateSafePin, safeDate, getRemainingDays, normalizeArabicSearch, normalizeDigits } from '../../utils';
import { 
  calculateApprovedCommission, 
  getAvailableRequestMonths 
} from '../../utils/delegateCommissionCalculations';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { FitText } from '../ui/FitText';

interface DelegateDashboardViewProps {
  delegate: Delegate;
  allGarages: Garage[];
  onLogout: () => void;
  onRecharge: (
    garageId: string, 
    amount: number, 
    pkg?: Package, 
    discountInfo?: { discountAmount?: number }
  ) => Promise<void>;
  onRechargeBalance?: (garageId: string, amount: number) => Promise<void>;
  onCreateGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  isLoading: boolean;
  packages: Package[];
  pendingRequests: RechargeRequest[];
  delegateRequests?: RechargeRequest[];
  showToast: (message: string, type?: 'success' | 'error') => void;
  subscriptionPrices?: { weekly: number; biweekly?: number; monthly: number; weeklyDiscount?: number; biweeklyDiscount?: number; monthlyDiscount?: number };
}

export const DelegateDashboardView = memo(({ 
  delegate, 
  allGarages, 
  onLogout,
  onRecharge,
  onRechargeBalance,
  onCreateGarage,
  isLoading,
  packages,
  pendingRequests,
  delegateRequests = [],
  showToast,
  subscriptionPrices: _subscriptionPrices = { weekly: 800, biweekly: 1500, monthly: 3000 }
}: DelegateDashboardViewProps) => {
  const config = useSystemConfig();
  const warningDaysThreshold = typeof config?.warningDaysThreshold === 'number' ? config.warningDaysThreshold : 3;
  const trialDays = typeof config?.defaultTrialDays === 'number' && config.defaultTrialDays > 0 ? config.defaultTrialDays : 15;
  const [selectedDurationFilter, setSelectedDurationFilter] = useState<number>(() => getDefaultDurationFilter(packages));
  const [activeTab, setActiveTab] = useState<'garages' | 'performance'>('garages');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGarage, setSelectedGarage] = useState<Garage | null>(null);
  const [selectedTopupAmount, setSelectedTopupAmount] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showAddGarage, setShowAddGarage] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [newGaragePin, setNewGaragePin] = useState('');
  const [pinGenerationsRemaining, setPinGenerationsRemaining] = useState(3);
  const [showMenu, setShowMenu] = useState(false);
  const [showAllOperations, setShowAllOperations] = useState(false);
  const { theme, toggleTheme } = useTheme();

  React.useEffect(() => {
    if (packages && packages.length > 0) {
      const validPackages = filterPackagesForGarage(packages, !!selectedGarage?.hasMonthlySubscribers);
      const validDurations = validPackages.map(p => getCleanPackageInfo(p).durationDays);
      if (!validDurations.includes(selectedDurationFilter)) {
        setSelectedDurationFilter(getDefaultDurationFilter(packages, !!selectedGarage?.hasMonthlySubscribers));
      }
    }
  }, [packages, selectedDurationFilter, selectedGarage?.hasMonthlySubscribers]);

  const menuRef = React.useRef<HTMLDivElement>(null);

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
    if (showAddGarage || selectedGarage) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showAddGarage, selectedGarage]);

  const filteredGarages = React.useMemo(() => {
    const rawSearch = searchTerm.trim();
    if (!rawSearch) return allGarages;
    const normSearch = normalizeArabicSearch(rawSearch);
    const digitSearch = normalizeDigits(rawSearch);

    return allGarages.filter(g => {
      const normName = normalizeArabicSearch(g.name || '');
      const nameMatch = normName.includes(normSearch);
      const rawPhone = g.phone || '';
      const normPhone = normalizeDigits(rawPhone);
      const phoneMatch = rawPhone.includes(rawSearch) || (digitSearch ? normPhone.includes(digitSearch) : false);
      return nameMatch || phoneMatch;
    });
  }, [allGarages, searchTerm]);

  const handleTopupSubmit = async () => {
    if (!selectedGarage || !selectedTopupAmount || selectedTopupAmount <= 0) return;
    setIsProcessing(true);
    try {
      if (onRechargeBalance) {
        await onRechargeBalance(selectedGarage.id, selectedTopupAmount);
      } else {
        await onRecharge(selectedGarage.id, selectedTopupAmount);
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSelectedGarage(null);
        setSelectedTopupAmount(null);
      }, 2000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Approved garages count (excluding pending or rejected review garages)
  const approvedGarages = React.useMemo(() => {
    return (allGarages || []).filter(g => g.status !== 'pending' && g.status !== 'rejected');
  }, [allGarages]);

  // Performance and statistics calculations
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedPerformanceMonth, setSelectedPerformanceMonth] = useState<string>('current');

  const formatDelegateMonthName = (key: string) => {
    if (key === 'all') return 'جميع الأوقات';
    if (!key) return '';
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const d = new Date(year, month, 1);
    if (isNaN(d.getTime())) return key;
    return d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  };

  const availablePerformanceMonths = React.useMemo(() => {
    return getAvailableRequestMonths(delegateRequests, currentMonthKey);
  }, [delegateRequests, currentMonthKey]);

  const activePerfMonthKey = selectedPerformanceMonth === 'current' ? currentMonthKey : selectedPerformanceMonth;

  const currentMonthCommissionValue = React.useMemo(() => {
    return calculateApprovedCommission(delegateRequests, currentMonthKey);
  }, [delegateRequests, currentMonthKey]);

  const commissionValue = React.useMemo(() => {
    if (activePerfMonthKey === 'all') {
      const requestsCommission = calculateApprovedCommission(delegateRequests, 'all');
      return requestsCommission > 0 ? requestsCommission : (delegate.totalCommissionEarned || 0);
    }
    return calculateApprovedCommission(delegateRequests, activePerfMonthKey);
  }, [delegateRequests, activePerfMonthKey, delegate.totalCommissionEarned]);

  const pendingRequestsCount = delegateRequests.filter(r => r.status === 'pending').length;

  const sortedRequests = React.useMemo(() => {
    return [...delegateRequests].sort((a, b) => {
      return safeDate(b.createdAt).getTime() - safeDate(a.createdAt).getTime();
    });
  }, [delegateRequests]);

  const formatRequestDate = (createdAt: any) => {
    if (!createdAt) return 'مؤخراً';
    const d = safeDate(createdAt);
    if (isNaN(d.getTime())) return 'مؤخراً';
    return d.toLocaleString('ar-EG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleOpenAddGarage = () => {
    const initialPin = generateSafePin(allGarages.map(g => g.pin));
    setNewGaragePin(initialPin);
    setPinGenerationsRemaining(3);
    setShowAddGarage(true);
  };

  const recentRequests = sortedRequests.slice(0, 3);
  const displayedRequests = showAllOperations ? sortedRequests : recentRequests;

  return (
    <div className={`h-screen h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors overflow-x-hidden ${showAddGarage || selectedGarage ? 'overflow-hidden' : 'overflow-y-auto'}`} dir="rtl">
      {/* 2) Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 sticky top-0 z-40 transition-colors">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-none">لوحة المندوب</h1>
          </div>

          <div className="flex items-center gap-2 relative" ref={menuRef}>
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all outline-none border ${showMenu ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}
              aria-label="القائمة"
            >
              <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>

            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-slate-900/10 dark:bg-black/35" 
                  onClick={() => setShowMenu(false)}
                />
                
                <div className="absolute top-12 left-0 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-3.5 flex flex-col gap-2">
                    <span className="font-bold text-xs text-slate-400 dark:text-slate-500 pr-1 select-none text-right">وضع الشاشة:</span>
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => {
                          if (theme !== 'light') toggleTheme();
                          setShowMenu(false);
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border transition-all outline-none font-bold text-xs ${
                          theme === 'light'
                            ? 'bg-amber-500 border-amber-500 text-slate-950 font-black'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span>النهاري</span>
                      </button>

                      <button 
                        type="button"
                        onClick={() => {
                          if (theme !== 'dark') toggleTheme();
                          setShowMenu(false);
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border transition-all outline-none font-bold text-xs ${
                          theme === 'dark'
                            ? 'bg-amber-500 border-amber-500 text-slate-950 font-black'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>الليلي</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                    <button 
                      onClick={() => {
                        onLogout();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-right hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl transition-colors font-bold text-xs"
                    >
                      <LogOut className="w-4 h-4 rotate-180" />
                      <span>تسجيل الخروج</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 w-full flex-1 flex flex-col gap-4 sm:gap-6">
        {/* 3) Tab Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full">
          <button 
            type="button"
            onClick={() => setActiveTab('garages')} 
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all focus:outline-none ${
              activeTab === 'garages'
                ? 'bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 shadow-sm font-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>جراجاتي</span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('performance')} 
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all focus:outline-none ${
              activeTab === 'performance'
                ? 'bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 shadow-sm font-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>تقرير الأداء</span>
          </button>
        </div>

        {activeTab === 'garages' ? (
          <div className="space-y-4">
            {/* 4.a) Top 3-Indicators Summary */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 block mb-1">جراجاتي</span>
                <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono leading-none">
                  {approvedGarages.length}
                </span>
              </div>

              <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 block mb-1">طلبات معلقة</span>
                <span className="text-xl sm:text-2xl font-black text-amber-500 font-mono leading-none">
                  {pendingRequestsCount}
                </span>
              </div>

              <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 block mb-1">عمولتي هذا الشهر</span>
                <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono leading-none flex items-baseline justify-center gap-0.5">
                  <FitText minFontSize={12}>
                    {currentMonthCommissionValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                  </FitText>
                  <span className="text-[10px] font-bold">ج.م</span>
                </div>
              </div>
            </div>

            {/* 4.b) Add Garage Button (Clear in-page action) */}
            {delegate.canCreateGarage && (
              <button
                type="button"
                onClick={handleOpenAddGarage}
                className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 p-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all shadow-sm cursor-pointer"
              >
                <PlusCircle className="w-5 h-5" />
                <span>إضافة جراج جديد</span>
              </button>
            )}

            {/* 4.c) Search Bar */}
            <div className="relative w-full">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="ابحث عن جراج..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-11 pl-4 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* 4.d) Garage List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {filteredGarages.map(g => {
                const isPending = g.status === 'pending';
                const hasPending = pendingRequests.some(r => r.garageId === g.id);
                const remDays = getRemainingDays(g);
                const isExpiringSoon = !isPending && !hasPending && remDays <= warningDaysThreshold && remDays > 0;
                const isExpired = !isPending && !hasPending && remDays <= 0;

                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      if (isPending) {
                        showToast('عذراً، هذا الجراج قيد المراجعة والإنشاء من قبل الإدارة. يرجى الانتظار حتى تتم الموافقة عليه.', 'error');
                        return;
                      }
                      if (hasPending) {
                        showToast('هناك طلب شحن معلق بالفعل لم يتم تفعيله بعد من قبل الإدارة', 'error');
                        return;
                      }
                      setSelectedGarage(g);
                    }}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 cursor-pointer flex flex-col justify-between min-h-[120px] transition-all shadow-sm hover:shadow-md text-right w-full ${
                      isPending 
                        ? 'border-dashed border-slate-300 dark:border-slate-800 opacity-75' 
                        : isExpired
                        ? 'border-red-300 dark:border-red-900/60'
                        : isExpiringSoon
                        ? 'border-amber-300 dark:border-amber-900/60'
                        : 'border-slate-200 dark:border-slate-800 hover:border-amber-500'
                    }`}
                  >
                    {/* Top: Garage Name */}
                    <div className="flex items-center justify-between gap-3 w-full">
                      <h3 className="font-black text-slate-900 dark:text-white text-base leading-snug">
                        {g.name}
                      </h3>
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Bottom: Single Clear Status Badge */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between w-full">
                      {isPending ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          قيد مراجعة الإنشاء
                        </span>
                      ) : hasPending ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          طلب شحن معلق
                        </span>
                      ) : isExpired ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
                          منتهي الاشتراك
                        </span>
                      ) : isExpiringSoon ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          ينتهي خلال {remDays} {remDays === 1 ? 'يوم' : remDays === 2 ? 'يومين' : 'أيام'}
                        </span>
                      ) : g.isTrial ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          تجريبي ({remDays} يوم)
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          نشط ({remDays} يوم)
                        </span>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 font-mono">
                          الرصيد: {g.balance || 0} ج.م
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                          {g.hourlyRate} ج.ساعة
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {filteredGarages.length === 0 && (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 dark:text-slate-500 font-bold text-sm">لا توجد جراجات مطابقة للبحث</p>
              </div>
            )}
          </div>
        ) : (
          /* 5) Performance Report View */
          <div className="space-y-4">
            {/* 5.a) Period Selector */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                اختر الفترة التي تريد مراجعتها:
              </span>

              <select
                value={selectedPerformanceMonth}
                onChange={(e) => setSelectedPerformanceMonth(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-xs px-3 py-2 rounded-xl outline-none focus:border-amber-500 transition-colors cursor-pointer"
              >
                <option value="current">
                  الشهر الحالي ({formatDelegateMonthName(currentMonthKey)})
                </option>
                {availablePerformanceMonths.filter(m => m !== currentMonthKey).map(m => (
                  <option key={m} value={m}>
                    {formatDelegateMonthName(m)}
                  </option>
                ))}
                <option value="all">
                  جميع الأوقات (التاريخ الكلي)
                </option>
              </select>
            </div>

            {/* 5.b) Focused Performance Summary Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block mb-1">
                    {activePerfMonthKey === 'all' ? 'إجمالي العمولة المكتسبة (التاريخ الكلي)' : 'العمولة المكتسبة في هذه الفترة'}
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-amber-500 dark:text-amber-400 font-mono leading-none flex items-baseline gap-1.5">
                    <span>{commissionValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    <span className="text-sm font-bold text-slate-400">ج.م</span>
                  </div>
                </div>

                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* 5.c) Operations History */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-black text-sm">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <span>سجل العمليات</span>
                </div>
                <span className="text-xs font-bold text-slate-400 font-mono">
                  ({sortedRequests.length})
                </span>
              </div>

              <div className="space-y-2.5">
                {displayedRequests.map((req) => (
                  <div 
                    key={req.id} 
                    className="p-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-xl flex items-center justify-between gap-3 text-right"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {req.garageName}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
                        <span>باقة {req.packageName}</span>
                        <span>•</span>
                        <span className="font-mono text-[10px]">{formatRequestDate(req.createdAt)}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                        {req.revenueAmount || req.amount} ج.م
                      </span>

                      {req.status === 'pending' && (
                        <span className="text-[10px] font-bold px-2 py-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-lg">
                          في الانتظار
                        </span>
                      )}
                      {req.status === 'approved' && (
                        <span className="text-[10px] font-bold px-2 py-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-lg">
                          تم القبول
                        </span>
                      )}
                      {req.status === 'rejected' && (
                        <span className="text-[10px] font-bold px-2 py-1 bg-red-500/15 text-red-600 dark:text-red-400 rounded-lg">
                          مرفوض
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {sortedRequests.length === 0 && (
                  <div className="py-8 text-center text-slate-400 font-bold text-xs">
                    لا توجد عمليات بعد
                  </div>
                )}
              </div>

              {sortedRequests.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllOperations(prev => !prev)}
                  className="mt-3 w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 rounded-xl font-bold text-xs text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{showAllOperations ? 'إخفاء العمليات القديمة' : 'عرض كل العمليات'}</span>
                  {showAllOperations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 6) Add Garage Modal */}
      {showAddGarage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 overflow-y-auto" onClick={() => setShowAddGarage(false)}>
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 sm:p-8 relative my-auto border border-slate-200 dark:border-slate-800 transition-colors" 
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-xl flex items-center justify-center">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">إضافة جراج جديد</h2>
              </div>
              <button 
                type="button"
                onClick={() => setShowAddGarage(false)}
                className="w-9 h-9 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex shrink-0 items-center justify-center transition-colors outline-none cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={async (e) => {
                await onCreateGarage(e);
                setShowAddGarage(false);
              }}
              className="space-y-4 text-right"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">اسم الجراج</label>
                <input name="name" placeholder="جراج التوفيق" required className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold outline-none focus:border-amber-500 transition-all placeholder:text-slate-400" dir="rtl" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">سعر الساعة</label>
                  <div className="relative">
                    <input 
                      name="hourlyRate" 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      placeholder="10" 
                      required 
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold text-center outline-none focus:border-amber-500 font-mono text-lg" 
                      dir="ltr" 
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">ج.م</span>
                  </div>
                </div>
                <div className="space-y-1.5 text-center">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">سعر المبيت</label>
                  <div className="relative">
                    <input 
                      name="overnightRate" 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      placeholder="50" 
                      required 
                      className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold text-center outline-none focus:border-amber-500 font-mono text-lg" 
                      dir="ltr" 
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">ج.م</span>
                  </div>
                </div>
              </div>

              <input type="hidden" name="billingModel" value="subscription" />

              {/* Free Trial Toggle */}
              <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5 text-right">
                  <label className="text-xs font-black text-slate-900 dark:text-emerald-300 block">تفعيل فترة تجريبية مجانية ({trialDays} يوم)</label>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">صلاحية مجانية لمدة {trialDays} يوماً للجراج الجديد</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    name="isTrial" 
                    checked={isTrial} 
                    onChange={(e) => setIsTrial(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <input type="hidden" name="isTrial_hidden" value={isTrial ? 'true' : 'false'} />
                  <input type="hidden" name="trialDays" value={trialDays} />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">رقم الموبايل (اختياري)</label>
                <input 
                  name="phone" 
                  type="tel"
                  inputMode="numeric"
                  placeholder="01xxxxxxxxx" 
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold font-mono outline-none focus:border-amber-500 transition-all placeholder:text-slate-400" 
                  dir="ltr" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">رمز الدخول (PIN)</label>
                <div className="relative">
                  <input 
                    name="pin" 
                    type="text" 
                    value={newGaragePin}
                    readOnly
                    required 
                    className="w-full p-3.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold font-mono outline-none cursor-not-allowed text-center pl-12" 
                    dir="ltr" 
                  />
                  {pinGenerationsRemaining > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextPin = generateSafePin(allGarages.map(g => g.pin));
                        setNewGaragePin(nextPin);
                        setPinGenerationsRemaining(prev => prev - 1);
                      }}
                      className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:text-slate-900 dark:hover:text-white transition-colors"
                      title="توليد رقم سري عشوائي"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 rounded-xl py-3.5 font-black text-base hover:opacity-95 transition-all disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>تأكيد الإضافة</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6) Wallet Balance Top-Up Modal */}
      {selectedGarage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps"
          onClick={() => {
            if (!isProcessing) {
              setSelectedGarage(null);
              setSelectedTopupAmount(null);
            }
          }}
        >
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 relative overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors animate-popup-30fps"
            onClick={e => e.stopPropagation()}
          >
            {success ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white mb-3 shadow-lg shadow-emerald-600/20">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">تم إرسال طلب الشحن!</h2>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-xs mt-1">سيتم إضافة الرصيد إلى محفظة {selectedGarage.name} فور اعتماد المدير</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900 dark:text-white">شحن رصيد المحفظة</h2>
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-0.5">{selectedGarage.name}</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      if (!isProcessing) {
                        setSelectedGarage(null);
                        setSelectedTopupAmount(null);
                      }
                    }}
                    className="w-9 h-9 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex shrink-0 items-center justify-center transition-colors outline-none cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Garage Wallet & Subscription Status */}
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  <div className="bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block mb-0.5">رصيد المحفظة الحالي</span>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
                        {selectedGarage.balance || 0}
                      </span>
                      <span className="text-[10px] font-bold text-amber-600/70">ج.م</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold text-slate-400 block mb-0.5">الاشتراك الحالي</span>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                        {getRemainingDays(selectedGarage)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">يوم متبقي</span>
                    </div>
                  </div>
                </div>

                {/* Preset Balance Amounts (No custom input allowed) */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      اختر فئة الشحن المطلوبة:
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      فئات ثابتة
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {BALANCE_PRESET_AMOUNTS.map((amt) => {
                      const isSelected = selectedTopupAmount === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => setSelectedTopupAmount(amt)}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-md ring-2 ring-amber-500/30'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-800 dark:text-slate-200 hover:border-amber-400/50'
                          }`}
                        >
                          <span className="text-lg sm:text-xl font-black font-mono leading-tight">{amt}</span>
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">ج.م رصيد</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selection Summary */}
                {selectedTopupAmount ? (
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 mb-4 border border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-bold">المبلغ المطلوب شحنه:</span>
                      <span className="font-black text-slate-900 dark:text-white font-mono">{selectedTopupAmount} ج.م</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                      <span className="text-slate-500 dark:text-slate-400 font-bold">الرصيد بعد الاعتماد:</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {(selectedGarage.balance || 0) + selectedTopupAmount} ج.م
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={isProcessing || pendingRequests.some(r => r.garageId === selectedGarage.id) || !selectedTopupAmount}
                    onClick={handleTopupSubmit}
                    className="w-full min-h-[48px] px-4 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-slate-950 py-3.5 rounded-xl font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 whitespace-nowrap"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                        <span>جاري إرسال الطلب...</span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        {pendingRequests.some(r => r.garageId === selectedGarage.id) ? (
                          'يوجد طلب شحن معلق قيد المراجعة...'
                        ) : selectedTopupAmount ? (
                          <>
                            <span>إرسال طلب شحن</span>
                            <span className="opacity-50">•</span>
                            <span className="font-mono">{selectedTopupAmount}</span>
                            <span>ج.م للمدير</span>
                          </>
                        ) : (
                          'يرجى اختيار مبلغ الشحن'
                        )}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setSelectedGarage(null);
                      setSelectedTopupAmount(null);
                    }}
                    className="w-full py-2.5 rounded-xl text-slate-500 dark:text-slate-400 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

DelegateDashboardView.displayName = 'DelegateDashboardView';
