import React, { useState, memo } from 'react';
import {
  Building2,
  Search,
  PlusCircle,
  LogOut,
  Users,
  Sun,
  Moon,
  MoreVertical,
  BarChart3,
  FileText,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Garage, Delegate } from '../../types';
import { useTheme } from '../../utils/ThemeContext';
import { generateSafePin, normalizeArabicSearch, normalizeDigits, sortGaragesNewestFirst } from '../../utils';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { FitText } from '../ui/FitText';
import { TermsAndConditionsModal } from '../modals/TermsAndConditionsModal';
import { DelegateDashboardOverlays } from './DelegateDashboardOverlays';

interface DelegateDashboardViewProps {
  delegate: Delegate;
  allGarages: Garage[];
  onLogout: () => void;
  onCreateGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  isLoading: boolean;
  delegatePagination?: Record<'createdGarages' | 'referredGarages', { hasMore: boolean; nextCursor: string | null }>;
  delegateListsLoading?: boolean;
  delegateListsError?: boolean;
  delegateDashboardLoading?: boolean;
  delegateDashboardError?: boolean;
  onRetryDelegateDashboard?: () => void;
  onLoadMoreDelegateGarages?: () => void;
}

export const DelegateDashboardView = memo(({ 
  delegate,
  allGarages,
  onLogout,
  onCreateGarage,
  isLoading,
  delegatePagination,
  delegateListsLoading = false,
  delegateListsError = false,
  delegateDashboardLoading = false,
  delegateDashboardError = false,
  onRetryDelegateDashboard,
  onLoadMoreDelegateGarages
}: DelegateDashboardViewProps) => {
  const [activeTab, setActiveTab] = useState<'garages' | 'performance'>('garages');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddGarage, setShowAddGarage] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [newGaragePin, setNewGaragePin] = useState('');
  const [pinGenerationsRemaining, setPinGenerationsRemaining] = useState(3);
  const [showMenu, setShowMenu] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const { theme, toggleTheme } = useTheme();


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

  useBodyScrollLock(Boolean(showAddGarage));

  const filteredGarages = React.useMemo(() => {
    const rawSearch = searchTerm.trim();
    if (!rawSearch) return sortGaragesNewestFirst(allGarages || []);
    const normSearch = normalizeArabicSearch(rawSearch);
    const digitSearch = normalizeDigits(rawSearch);

    const filtered = (allGarages || []).filter(g => {
      const normName = normalizeArabicSearch(g.name || '');
      const nameMatch = normName.includes(normSearch);
      const rawPhone = g.phone || '';
      const normPhone = normalizeDigits(rawPhone);
      const phoneMatch = rawPhone.includes(rawSearch) || (digitSearch ? normPhone.includes(digitSearch) : false);
      return nameMatch || phoneMatch;
    });

    return sortGaragesNewestFirst(filtered);
  }, [allGarages, searchTerm]);

  // Approved garages count (excluding pending or rejected review garages)
  const approvedGarages = React.useMemo(() => {
    return sortGaragesNewestFirst((allGarages || []).filter(g => g.status !== 'pending' && g.status !== 'rejected'));
  }, [allGarages]);

  // Request-level performance history is retired; show only the aggregate recorded on the delegate profile.
  const pendingGarageApplicationsCount = React.useMemo(
    () => (allGarages || []).filter((garage) => garage.status === 'pending').length,
    [allGarages]
  );
  const commissionValue = Number.isFinite(Number(delegate.totalCommissionEarned))
    ? Number(delegate.totalCommissionEarned)
    : 0;

  const handleOpenAddGarage = () => {
    const initialPin = generateSafePin(allGarages.map(g => g.pin));
    setNewGaragePin(initialPin);
    setPinGenerationsRemaining(3);
    setShowAddGarage(true);
  };


  return (
    <div className={`h-screen h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors overflow-x-hidden ${showAddGarage ? 'overflow-hidden' : 'overflow-y-auto'}`} dir="rtl">
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
                      type="button"
                      onClick={() => {
                        setShowTermsModal(true);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 rounded-xl transition-colors font-bold text-xs cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>الشروط والأحكام</span>
                    </button>
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
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 block mb-1">طلبات تسجيل معلقة</span>
                <span className="text-xl sm:text-2xl font-black text-amber-500 font-mono leading-none">
                  {pendingGarageApplicationsCount}
                </span>
              </div>

              <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-sm">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 block mb-1">إجمالي العمولات المسجلة</span>
                <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono leading-none flex items-baseline justify-center gap-0.5">
                  <FitText minFontSize={12}>
                    {commissionValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                  </FitText>
                  <span className="text-[10px] font-bold">ج.م</span>
                </div>
              </div>
            </div>

            {/* 4.b) Add Garage Button (Clear in-page action) */}
            <button
              type="button"
              onClick={handleOpenAddGarage}
              className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 p-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-5 h-5" />
              <span>طلب إنشاء جراج</span>
            </button>

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

                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 cursor-pointer flex flex-col justify-between min-h-[120px] transition-all shadow-sm hover:shadow-md text-right w-full ${
                      isPending 
                        ? 'border-dashed border-slate-300 dark:border-slate-800 opacity-75' 
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
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          نشط
                        </span>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                          {g.hourlyRate} ج.ساعة
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {delegateDashboardLoading && allGarages.length === 0 && (
              <div role="status" aria-live="polite" className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">جارٍ تحميل بيانات الجراجات...</p>
              </div>
            )}
            {delegateDashboardError && allGarages.length === 0 && (
              <div role="alert" className="text-center py-8 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/60">
                <p className="text-rose-600 dark:text-rose-400 font-bold text-sm mb-4">تعذر تحميل بيانات الجراجات. تحقق من الاتصال وحاول مرة أخرى.</p>
                {onRetryDelegateDashboard && (
                  <button
                    type="button"
                    onClick={onRetryDelegateDashboard}
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    إعادة المحاولة
                  </button>
                )}
              </div>
            )}
            {filteredGarages.length === 0 && !delegateDashboardLoading && !delegateDashboardError && (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 dark:text-slate-500 font-bold text-sm">لا توجد جراجات مطابقة للبحث</p>
              </div>
            )}
            {delegateListsError && (
              <div role="alert" className="text-center text-rose-600 dark:text-rose-400 text-xs font-bold px-3 py-2">
                تعذر تحميل المزيد من الجراجات. يمكنك المحاولة مرة أخرى.
              </div>
            )}
            {(delegatePagination?.createdGarages.hasMore || delegatePagination?.referredGarages.hasMore) && onLoadMoreDelegateGarages && (
              <button
                type="button"
                onClick={onLoadMoreDelegateGarages}
                disabled={delegateListsLoading}
                className="w-full min-h-[44px] mt-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {delegateListsLoading ? 'جارٍ تحميل المزيد...' : 'عرض المزيد من الجراجات'}
              </button>
            )}
          </div>
        ) : (
          /* 5) Aggregate Performance View */
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
              <span className="mb-2 block text-xs font-bold text-slate-400 dark:text-slate-500">إجمالي العمولات المسجلة على الحساب</span>
              <div className="flex items-baseline gap-1.5 font-mono text-2xl font-black leading-none text-amber-500 dark:text-amber-400 sm:text-3xl">
                <span>{commissionValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                <span className="text-sm font-bold text-slate-400">ج.م</span>
              </div>
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs font-medium leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
                يعرض هذا الرقم الإجمالي المحفوظ في حساب المندوب فقط؛ سجل طلبات الشحن والتجديد لم يعد متاحاً داخل التطبيق.
              </p>
            </div>
          </div>
        )}
      </main>

      <DelegateDashboardOverlays
        showAddGarage={showAddGarage}
        setShowAddGarage={setShowAddGarage}
        onCreateGarage={onCreateGarage}
        isTrial={isTrial}
        setIsTrial={setIsTrial}
        newGaragePin={newGaragePin}
        pinGenerationsRemaining={pinGenerationsRemaining}
        allGarages={allGarages}
        setNewGaragePin={setNewGaragePin}
        setPinGenerationsRemaining={setPinGenerationsRemaining}
        isLoading={isLoading}
      />
      {showTermsModal && (
        <TermsAndConditionsModal 
          onClose={() => setShowTermsModal(false)}
        />
      )}
    </div>
  );
});

DelegateDashboardView.displayName = 'DelegateDashboardView';
