import React, { useState, memo, useMemo, useRef, useEffect, useCallback } from 'react';
import { useBackHandler } from '../../hooks/backHandler';
import {
  Building2,
  PlusCircle,
  LogOut,
  Users,
  Sun,
  Moon,
  Settings as SettingsIcon,
  FileText,
  Loader2,
  RefreshCw,
  Coins,
  X,
  Clock,
  XCircle
} from 'lucide-react';
import { Garage, Delegate } from '../../types';
import { useTheme } from '../../utils/ThemeContext';
import { generateSafePin } from '../../utils/pins';
import { sortGaragesNewestFirst } from '../../utils/dates';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { FitText } from '../ui/FitText';
import { TermsAndConditionsModal } from '../modals/TermsAndConditionsModal';
import { DelegateDashboardOverlays } from './DelegateDashboardOverlays';
import { delegateService, type DelegateCreditRequest } from '../../services/delegateService';
import { useDelegateDashboard } from '../../hooks/delegateDashboardContext';
import { useToast } from '../../hooks/toast';

interface DelegateDashboardViewProps {
  delegate: Delegate;
  allGarages: Garage[];
  onLogout: () => void;
  onCreateGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  isLoading: boolean;
}

export const DelegateDashboardView = memo(({
  delegate,
  allGarages,
  onLogout,
  onCreateGarage,
  isLoading,
}: DelegateDashboardViewProps) => {
  const { delegatePagination, delegateListsLoading, delegateListsError, delegateDashboardLoading, delegateDashboardError, onRetryDelegateDashboard, onLoadMoreDelegateGarages } = useDelegateDashboard();
  const { showToast } = useToast();
  const [showAddGarage, setShowAddGarage] = useState(false);
  const [newGaragePin, setNewGaragePin] = useState('');
  const [pinGenerationsRemaining, setPinGenerationsRemaining] = useState(3);
  const [showSettings, setShowSettings] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Credit requests — fetched on mount so the delegate sees pending/rejected
  // badges on their garage cards.
  const [creditRequests, setCreditRequests] = useState<DelegateCreditRequest[]>([]);
  const [showCreditRequestModal, setShowCreditRequestModal] = useState(false);
  const [creditRequestGarage, setCreditRequestGarage] = useState<Garage | null>(null);
  const [creditRequestAmount, setCreditRequestAmount] = useState('');
  const [submittingCreditRequest, setSubmittingCreditRequest] = useState(false);

  // ── Back-handler registrations ──────────────────────────────────────
  useBackHandler(() => { setShowCreditRequestModal(false); setCreditRequestGarage(null); return true; }, showCreditRequestModal);
  useBackHandler(() => { setShowAddGarage(false); return true; }, showAddGarage);
  useBackHandler(() => { setShowTermsModal(false); return true; }, showTermsModal);
  useBackHandler(() => { setShowSettings(false); return true; }, showSettings);

  const refreshCreditRequests = useCallback(async () => {
    try {
      const requests = await delegateService.listMyCreditRequests();
      setCreditRequests(requests);
    } catch {
      // Silent — badges just won't show, not a blocking error.
    }
  }, []);

  // Initial fetch + 30-second polling (only when the page is visible).
  // This keeps credit request badges fresh without requiring a manual refresh.
  useEffect(() => {
    void refreshCreditRequests();

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => void refreshCreditRequests(), 30_000);
    };
    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshCreditRequests();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === 'visible') {
      startPolling();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshCreditRequests]);

  useBodyScrollLock(Boolean(showAddGarage || showCreditRequestModal));

  const settingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Only show garages THIS delegate created — not referred ones.
  // The hook merges both lists, but per owner direction a delegate only
  // sees and manages garages they created themselves.
  const myGarages = useMemo(() => {
    return sortGaragesNewestFirst(
      (allGarages || []).filter(g => g.createdByDelegateId === delegate.id)
    );
  }, [allGarages, delegate.id]);

  const commissionValue = Number.isFinite(Number(delegate.totalCommissionEarned))
    ? Number(delegate.totalCommissionEarned)
    : 0;
  // Unsettled commission = what the admin still owes the delegate (lifetime
  // earned minus what the admin has already settled/paid). When the admin
  // settles the account, this number drops to zero.
  const unsettledCommission = Number.isFinite(Number(delegate.totalRechargedAmount))
    ? Math.max(0, Number(delegate.totalRechargedAmount))
    : 0;

  const handleOpenAddGarage = () => {
    const initialPin = generateSafePin(allGarages.map(g => g.pin));
    setNewGaragePin(initialPin);
    setPinGenerationsRemaining(3);
    setShowAddGarage(true);
  };

  const handleOpenCreditRequest = (garage: Garage) => {
    setCreditRequestGarage(garage);
    setCreditRequestAmount('');
    setShowCreditRequestModal(true);
  };

  const handleSubmitCreditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditRequestGarage || submittingCreditRequest) return;
    const amount = Number(creditRequestAmount.trim());
    if (!Number.isSafeInteger(amount) || amount < 50 || amount > 2000) return;
    setSubmittingCreditRequest(true);
    try {
      await delegateService.createCreditRequest(creditRequestGarage.id, amount);
      await refreshCreditRequests();
      setShowCreditRequestModal(false);
      setCreditRequestGarage(null);
      setCreditRequestAmount('');
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('PENDING_REQUEST_EXISTS')) {
        showToast('يوجد طلب رصيد قيد المراجعة لهذا الجراج بالفعل', 'error');
      } else {
        showToast('تعذر إرسال طلب الرصيد. حاول مرة أخرى.', 'error');
      }
    } finally {
      setSubmittingCreditRequest(false);
    }
  };

  return (
    <div className={`h-screen h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors overflow-x-hidden ${showAddGarage ? 'overflow-hidden' : 'overflow-y-auto'}`} dir="rtl">
      {/* Header — minimal: title + settings icon */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 sticky top-0 z-40 transition-colors">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-none">لوحة المندوب</h1>
          </div>

          {/* Settings dropdown (theme + terms + logout) */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all outline-none border ${showSettings ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}
              aria-label="الإعدادات"
            >
              <SettingsIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>

            {showSettings && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-slate-900/10 dark:bg-black/35"
                  onClick={() => setShowSettings(false)}
                />

                <div className="absolute top-12 left-0 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-3.5 flex flex-col gap-2">
                    <span className="font-bold text-xs text-slate-400 dark:text-slate-500 pr-1 select-none text-right">وضع الشاشة:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (theme !== 'light') toggleTheme();
                          setShowSettings(false);
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
                          setShowSettings(false);
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
                        setShowSettings(false);
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
                        setShowSettings(false);
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

      <main className="max-w-4xl mx-auto p-4 sm:p-6 w-full flex-1 flex flex-col gap-5 sm:gap-6">
        {/* HERO — two commission numbers, front and center */}
        <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 dark:border-amber-900 dark:from-amber-950/40 dark:to-slate-900">
          <div className="grid grid-cols-2 gap-4 text-center">
            {/* Lifetime commission — everything earned, ever */}
            <div>
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 mb-1.5">
                إجمالي العمولات
              </p>
              <div className="flex items-baseline justify-center gap-1 font-mono leading-none">
                <FitText minFontSize={20}>
                  {commissionValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                </FitText>
                <span className="text-sm font-black text-amber-600 dark:text-amber-400">ج.م</span>
              </div>
            </div>
            {/* Unsettled commission — what the admin still owes, hasn't paid yet */}
            <div className="border-r border-amber-200/60 dark:border-amber-900/60">
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 mb-1.5">
                غير مُصرف
              </p>
              <div className="flex items-baseline justify-center gap-1 font-mono leading-none">
                <FitText minFontSize={20}>
                  {unsettledCommission.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                </FitText>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">ج.م</span>
              </div>
            </div>
          </div>
        </div>

        {/* CREATE GARAGE — big obvious button, the delegate's main job */}
        <button
          type="button"
          onClick={handleOpenAddGarage}
          className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 p-4 rounded-2xl font-black text-base flex items-center justify-center gap-2.5 transition-all shadow-sm cursor-pointer"
        >
          <PlusCircle className="w-6 h-6" />
          <span>افتح جراج جديد</span>
        </button>

        {/* GARAGE LIST — only garages this delegate created */}
        <div className="space-y-3">
          <h2 className="px-1 text-sm font-black text-slate-700 dark:text-slate-300">جراجاتك</h2>

          {delegateDashboardLoading && myGarages.length === 0 && (
            <div role="status" aria-live="polite" className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">جارٍ تحميل جراجاتك...</p>
            </div>
          )}

          {delegateDashboardError && myGarages.length === 0 && (
            <div role="alert" className="text-center py-8 px-4 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/60">
              <p className="text-rose-600 dark:text-rose-400 font-bold text-sm mb-4">تعذر تحميل جراجاتك. تحقق من الاتصال وحاول مرة أخرى.</p>
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

          {/* Garage cards — tappable to request credits (active garages only) */}
          {myGarages.map(g => {
            const isPendingCreation = g.status === 'pending';
            // Find the latest credit request for this garage (if any)
            const latestRequest = creditRequests.find(r => r.garageId === g.id);
            const hasPendingCreditRequest = latestRequest?.status === 'pending';
            const hasRejectedCreditRequest = latestRequest?.status === 'rejected';
            return (
              <div
                key={g.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 shadow-sm ${
                  isPendingCreation
                    ? 'border-dashed border-slate-300 dark:border-slate-800 opacity-75'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black text-slate-900 dark:text-white text-base leading-snug">
                    {g.name}
                  </h3>
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>

                {isPendingCreation ? (
                  <span className="self-start text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    قيد مراجعة الإنشاء
                  </span>
                ) : (
                  <>
                    <span className="self-start text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      نشط
                    </span>

                    {/* Credit request status badges */}
                    {hasPendingCreditRequest && (
                      <div className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                        <Clock className="w-3 h-3" />
                        طلب رصيد قيد المراجعة ({latestRequest?.amount} ج.م)
                      </div>
                    )}
                    {hasRejectedCreditRequest && (
                      <div className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400">
                        <XCircle className="w-3 h-3" />
                        تم رفض طلب الرصيد
                      </div>
                    )}

                    {/* Request credits button — hidden if a pending request exists */}
                    {!hasPendingCreditRequest && (
                      <button
                        type="button"
                        onClick={() => handleOpenCreditRequest(g)}
                        className="self-start inline-flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 transition-colors cursor-pointer"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        طلب رصيد
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* Empty state — onboarding for a new delegate */}
          {myGarages.length === 0 && !delegateDashboardLoading && !delegateDashboardError && (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 dark:text-slate-500 font-bold text-sm">لسه ما فتحت أي جراج — اضغط الزر فوق</p>
            </div>
          )}

          {delegateListsError && (
            <div role="alert" className="text-center text-rose-600 dark:text-rose-400 text-xs font-bold px-3 py-2">
              تعذر تحميل المزيد من الجراجات. يمكنك المحاولة مرة أخرى.
            </div>
          )}

          {delegatePagination?.createdGarages.hasMore && onLoadMoreDelegateGarages && (
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
      </main>

      <DelegateDashboardOverlays
        showAddGarage={showAddGarage}
        setShowAddGarage={setShowAddGarage}
        onCreateGarage={onCreateGarage}
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

      {/* Credit Request Modal */}
      {showCreditRequestModal && creditRequestGarage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 overflow-y-auto" onClick={() => setShowCreditRequestModal(false)}>
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 sm:p-8 relative my-auto border border-slate-200 dark:border-slate-800"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-xl flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">طلب رصيد</h2>
                  <p className="text-xs font-bold text-slate-400">{creditRequestGarage.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreditRequestModal(false)}
                className="w-9 h-9 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex shrink-0 items-center justify-center transition-colors outline-none cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-xs font-bold leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              سيتم إرسال طلبك إلى الإدارة للمراجعة. لن يُضاف الرصيد إلا بعد الموافقة.
            </p>

            <form onSubmit={handleSubmitCreditRequest} className="space-y-4 text-right">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">قيمة الرصيد (50 إلى 2,000)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={creditRequestAmount}
                  onChange={(e) => setCreditRequestAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="100"
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold text-center outline-none focus:border-amber-500 font-mono text-lg"
                  dir="ltr"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submittingCreditRequest}
                className="w-full bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 rounded-xl py-3.5 font-black text-base hover:opacity-95 transition-all disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
              >
                {submittingCreditRequest ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    <Coins className="w-4 h-4" />
                    <span>إرسال الطلب</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

DelegateDashboardView.displayName = 'DelegateDashboardView';
