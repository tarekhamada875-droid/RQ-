/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, memo } from 'react';
import { useBackHandler } from '../../hooks/backHandler';
import { Trash2, ChevronRight, Users, Coins, Loader2 } from 'lucide-react';
import { Delegate } from '../../types';
import { delegateService } from '../../services';
import { useTheme } from '../../utils/ThemeContext';
import { AdminDelegateProfileCard } from './delegate-details/AdminDelegateProfileCard';

interface AdminDelegateDetailsViewProps {
  delegate: Delegate;
  setView: (view: any) => void;
  setSelectedDelegate: (delegate: Delegate | null) => void;
  removeDelegate: (id: string) => Promise<any>;
}

export const AdminDelegateDetailsView = memo(({
  delegate,
  setView,
  setSelectedDelegate,
  removeDelegate,
}: AdminDelegateDetailsViewProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [settledAtOverride, setSettledAtOverride] = useState<Date | null>(null);

  // ── Back-handler registrations ──────────────────────────────────────
  useBackHandler(() => { setConfirmSettle(false); return true; }, confirmSettle);
  useBackHandler(() => { setConfirmDelete(false); return true; }, confirmDelete);

  const { } = useTheme();
  

  const lifetimeCommission = Number(delegate.totalCommissionEarned || 0);
  const unsettledCommission = settledAtOverride
    ? 0
    : Number(delegate.totalRechargedAmount || 0);

  const handleSettleAccount = async () => {
    setConfirmSettle(false);
    setIsLoading(true);
    try {
      await delegateService.settleDelegateAccount(
        delegate.id,
        Number(delegate.totalRechargedAmount || 0),
        delegate.lastSettledAt
      );
      setSettledAtOverride(new Date());
      setSelectedDelegate({ ...delegate, totalRechargedAmount: 0 });
    } catch {
      // Silent — the confirm dialog just closes
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await removeDelegate(delegate.id);
      setSelectedDelegate(null);
      setView('admin_dashboard');
    } catch {
      // Silent
    }
  };

  return (
    <div className="h-screen w-full bg-[#faf9f6] dark:bg-slate-950 flex flex-col font-sans text-right" dir="rtl">
      {/* Header — minimal: back + name + delete */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedDelegate(null);
                setView('admin_dashboard');
              }}
              className="flex items-center justify-center w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl outline-none cursor-pointer shrink-0"
            >
              <ChevronRight className="w-5 h-5 stroke-[3.5]" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <h1 className="text-base font-black text-slate-900 dark:text-white">{delegate.name}</h1>
            </div>
          </div>
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 cursor-pointer"
            title={'سحب الصلاحية'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto w-full p-4 sm:p-6 pb-24">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* HERO — two commission numbers (same pattern as delegate's own view) */}
          <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 dark:border-amber-900 dark:from-amber-950/40 dark:to-slate-900">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 mb-1.5">
                  إجمالي العمولات
                </p>
                <div className="flex items-baseline justify-center gap-1 font-mono leading-none">
                  <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                    {lifetimeCommission.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-sm font-black text-amber-600 dark:text-amber-400">ج.م</span>
                </div>
              </div>
              <div className="border-r border-amber-200/60 dark:border-amber-900/60">
                <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 mb-1.5">
                  غير مُصرف
                </p>
                <div className="flex items-baseline justify-center gap-1 font-mono leading-none">
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {unsettledCommission.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">ج.م</span>
                </div>
              </div>
            </div>
          </div>

          {/* Settle button — only if there's unsettled commission */}
          {unsettledCommission > 0 && (
            <button
              type="button"
              onClick={() => setConfirmSettle(true)}
              disabled={isLoading}
              className="w-full bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 p-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Coins className="w-5 h-5" />}
              <span>صرف وتسوية العمولة</span>
            </button>
          )}

          {/* Profile card — name, phone, PIN */}
          <AdminDelegateProfileCard
            delegate={delegate}
           
            onPinUpdated={(newPin) => {
              setSelectedDelegate({ ...delegate, pin: newPin });
            }}
          />
        </div>
      </main>

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80" dir="rtl" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white text-center mb-2">سحب الصلاحية</h3>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 text-center mb-6 leading-relaxed">
              هل أنت متأكد من سحب صلاحية المندوب "{delegate.name}"؟ لن يتمكن من تسجيل الدخول مرة أخرى.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-black text-xs cursor-pointer"
              >
                تراجع
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-xs cursor-pointer"
              >
                تأكيد السحب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle confirm dialog */}
      {confirmSettle && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80" dir="rtl" onClick={() => setConfirmSettle(false)}>
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Coins className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white text-center mb-2">تصفية الحساب</h3>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 text-center mb-6 leading-relaxed">
              هل أنت متأكد من صرف {unsettledCommission.toLocaleString('en-US')} ج.م للمندوب "{delegate.name}"؟ سيتم تسجيل التسوية.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSettle(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-black text-xs cursor-pointer"
              >
                تراجع
              </button>
              <button
                onClick={handleSettleAccount}
                className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-black text-xs cursor-pointer"
              >
                تصفية الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

AdminDelegateDetailsView.displayName = 'AdminDelegateDetailsView';
