import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, ChevronRight, Loader2 } from 'lucide-react';
import { adminIncomeService, type AdminIncomeRow } from '../../services/adminIncomeService';
import { safeDate } from '../../utils/dates';

interface AdminIncomeViewProps {
  onBack: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const formatDate = (timestamp: unknown) => safeDate(timestamp).toLocaleDateString('ar-EG', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const sourceChip = (source: string | undefined): { label: string; className: string } => {
  if (source === 'credit_request_approval') {
    return { label: 'طلب مندوب', className: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' };
  }
  if (source === 'admin_entered_grant') {
    return { label: 'إضافة يدوية', className: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' };
  }
  return { label: 'شحن رصيد', className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' };
};

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Admin Income page (الدخل) — owner feature 2026-11-23.
 *
 * Shows the lifetime money-in (EGP garages paid for credits) plus the
 * history of every paid grant, newest first, with where it came from.
 * Both loads are on-demand GETs (no listener, no polling). The lifetime
 * total reads the O(1) admin summary; the first-ever open may take a few
 * extra seconds while the Worker performs its one-time income alignment.
 *
 * Print/export lands in a follow-up PR (step 2, owner-approved plan).
 */
export const AdminIncomeView: React.FC<AdminIncomeViewProps> = ({ onBack, showToast }) => {
  const [summaryState, setSummaryState] = useState<LoadState>('loading');
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<AdminIncomeRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  const loadSummary = useCallback(async () => {
    setSummaryState('loading');
    try {
      const summary = await adminIncomeService.getIncomeSummary();
      setTotal(Number(summary.totalIncomeEgp ?? 0));
      setSummaryState('ready');
    } catch {
      setSummaryState('error');
    }
  }, []);

  const loadFirstPage = useCallback(async () => {
    setHistoryState('loading');
    try {
      const page = await adminIncomeService.getIncomeHistoryPage(null);
      setRows(page.rows);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      setHistoryState('ready');
    } catch {
      setHistoryState('error');
    }
  }, []);

  useEffect(() => {
    loadSummary();
    loadFirstPage();
  }, [loadSummary, loadFirstPage]);

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await adminIncomeService.getIncomeHistoryPage(nextCursor);
      setRows((prev) => [...prev, ...page.rows]);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch {
      showToast?.('حصلت مشكلة وإحنا بنحمّل باقي السجل.', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto font-sans" dir="rtl">
      {/* Header with back */}
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center outline-none shrink-0"
          aria-label="الرجوع"
          title="رجوع"
        >
          <ChevronRight className="w-5 h-5 stroke-[3.5]" />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white leading-none">{'الدخل'}</h1>
          <p className="mt-1.5 text-xs font-bold text-slate-400">{'الفلس اللي الجراجات دفعته مقابل الرصيد'}</p>
        </div>
      </div>

      {/* Lifetime total card */}
      {summaryState === 'loading' ? (
        <div className="h-36 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center" aria-label="بيتحمل إجمالي الدخل">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
        </div>
      ) : summaryState === 'error' ? (
        <div className="rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-5 py-6 text-center">
          <p className="font-bold text-rose-700 dark:text-rose-300">مش قادرين نجيب إجمالي الدخل دلوقتي.</p>
          <button
            type="button"
            onClick={loadSummary}
            className="mt-3 px-5 h-11 bg-rose-500 text-white font-extrabold text-xs rounded-xl cursor-pointer"
          >
            {'إعادة المحاولة'}
          </button>
        </div>
      ) : (
        <div className="rounded-3xl bg-gradient-to-bl from-emerald-500 to-emerald-600 text-white p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-40 h-40 bg-white/10 rounded-full -ml-12 -mt-12 pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <p className="text-sm font-black text-emerald-50">{'إجمالي الدخل'}</p>
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-4 text-4xl sm:text-5xl font-black font-mono leading-none relative z-10">
            {(total ?? 0).toLocaleString('ar-EG')}
            <span className="text-lg font-black font-sans mr-2">{'ج.م'}</span>
          </p>
        </div>
      )}

      {/* History */}
      <h3 className="mt-8 mb-4 text-sm font-black text-slate-900 dark:text-white">{'سجل الدخل'}</h3>
      {historyState === 'loading' ? (
        <div className="space-y-3" aria-label="بيتحمل سجل الدخل">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
          ))}
        </div>
      ) : historyState === 'error' ? (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-5 py-8 text-center">
          <p className="font-bold text-rose-700 dark:text-rose-300">مش قادرين نعرض سجل الدخل دلوقتي.</p>
          <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">جرّب تفتح الصفحة تاني.</p>
          <button
            type="button"
            onClick={loadFirstPage}
            className="mt-4 px-5 h-11 bg-rose-500 text-white font-extrabold text-xs rounded-xl cursor-pointer"
          >
            {'إعادة المحاولة'}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 px-5 py-10 text-center">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{'لسه مفيش دخل مسجل.'}</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{'أول عملية شحن رصيد هتظهر هنا.'}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((row) => {
              const chip = sourceChip(row.source);
              const egp = Number(row.paymentAmountEgp ?? 0);
              const credits = Number(row.amount ?? 0);
              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-slate-900 dark:text-white text-sm leading-none">
                      {row.garageName || 'جراج'}
                    </p>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${chip.className}`}>
                      {chip.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-slate-400 dark:text-slate-500">
                    {formatDate(row.occurredAt)}
                  </p>
                  <p className="mt-3 text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 leading-none">
                    +{egp.toLocaleString('ar-EG')}
                    <span className="text-xs font-black font-sans mr-1.5">{'ج.م'}</span>
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {'الرصيد المضاف:'} <span className="font-mono text-slate-900 dark:text-slate-100">{credits.toLocaleString('ar-EG')}</span>
                    </p>
                    {row.reason ? (
                      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 truncate max-w-[55%]" title={row.reason}>
                        {row.reason}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-8 h-12 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold text-sm rounded-2xl cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{'جاري التحميل...'}</span>
                  </>
                ) : (
                  <span>{'تحميل المزيد'}</span>
                )}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
