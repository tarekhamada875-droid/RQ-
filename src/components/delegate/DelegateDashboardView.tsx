import React, { useState, memo, useMemo, useRef, useEffect } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { Garage, Delegate } from '../../types';
import { useTheme } from '../../utils/ThemeContext';
import { generateSafePin, sortGaragesNewestFirst } from '../../utils';
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
  const [showAddGarage, setShowAddGarage] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [newGaragePin, setNewGaragePin] = useState('');
  const [pinGenerationsRemaining, setPinGenerationsRemaining] = useState(3);
  const [showSettings, setShowSettings] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useBodyScrollLock(Boolean(showAddGarage));

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

  const handleOpenAddGarage = () => {
    const initialPin = generateSafePin(allGarages.map(g => g.pin));
    setNewGaragePin(initialPin);
    setPinGenerationsRemaining(3);
    setShowAddGarage(true);
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
        {/* HERO — commission number, front and center */}
        <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 dark:border-amber-900 dark:from-amber-950/40 dark:to-slate-900 text-center">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-2">
            عمولاتك
          </p>
          <div className="flex items-baseline justify-center gap-1.5 font-mono leading-none">
            <FitText minFontSize={28}>
              {commissionValue.toLocaleString('en-US', { maximumFractionDigits: 1 })}
            </FitText>
            <span className="text-lg font-black text-amber-600 dark:text-amber-400">ج.م</span>
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

          {/* Garage cards — display only (div, not button) */}
          {myGarages.map(g => {
            const isPending = g.status === 'pending';
            return (
              <div
                key={g.id}
                role="presentation"
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 shadow-sm ${
                  isPending
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

                {isPending ? (
                  <span className="self-start text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    قيد مراجعة الإنشاء
                  </span>
                ) : (
                  <span className="self-start text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    نشط
                  </span>
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
