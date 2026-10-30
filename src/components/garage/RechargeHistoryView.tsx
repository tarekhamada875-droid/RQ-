import { useEffect, useState, memo } from 'react';
import { ChevronRight, CircleDollarSign } from 'lucide-react';
import { Garage } from '../../types';
import { adminBillingService } from '../../services/adminBillingService';
import { safeDate } from '../../utils';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface RechargeHistoryViewProps {
  garage: Garage;
  onClose: () => void;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
  onToggleMenu?: () => void;
  // Kept for the overlay contract; this page intentionally reads the credit ledger
  // instead of the dashboard's general activity-log snapshot.
  sharedLogs?: unknown[];
  sharedIsLoading?: boolean;
}

interface CreditGrantRecord {
  id?: string;
  entryId?: string;
  kind?: string;
  amount?: number;
  balanceAfter?: number;
  totalBalanceAfter?: number;
  occurredAt?: unknown;
}

const formatDate = (timestamp: unknown) => safeDate(timestamp).toLocaleDateString('ar-EG', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// Time display is hidden from user-facing screens per Q89D.
// Server timestamps remain authoritative internally for billing and audit.

export const RechargeHistoryView = memo(({ garage, onClose, showToast }: RechargeHistoryViewProps) => {
  const [grants, setGrants] = useState<CreditGrantRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useBodyScrollLock();

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setHasError(false);

    adminBillingService.getGarageCreditLedger(garage.id)
      .then((entries) => {
        if (!isMounted) return;
        // paid_grant is the immutable admin-to-garage credit charge.
        // Deliberately exclude deductions, renewals, restores, referrals, and trials.
        setGrants(entries.filter((entry) => (
          entry?.kind === 'paid_grant'
          && Number.isSafeInteger(Number(entry.amount))
          && Number(entry.amount) > 0
        )) as CreditGrantRecord[]);
      })
      .catch(() => {
        if (!isMounted) return;
        setHasError(true);
        showToast?.('حصلت مشكلة وإحنا بنحمّل سجل الشحن.', 'error');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [garage.id, showToast]);

  return (
    <div className="fixed inset-0 bg-[#faf9f6] dark:bg-slate-950 z-[100] flex flex-col pt-safe px-safe overflow-hidden transition-colors" dir="rtl">
      <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 z-40 w-full shrink-0">
        <div className="max-w-2xl mx-auto flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors shadow-sm outline-none shrink-0"
            aria-label="الرجوع"
            title="رجوع"
          >
            <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">سجل شحن الرصيد</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">الرصيد اللي اتشحن للجراج من الإدارة</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto p-4 sm:p-6 pb-10 overflow-y-auto custom-scrollbar stable-scrollbar">
        <section className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#faf9f6] dark:bg-slate-900 px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">الرصيد الحالي</p>
              <p className="mt-1 text-3xl font-black font-mono text-slate-900 dark:text-slate-100">
                {Number(garage.credits ?? 0).toLocaleString('ar-EG')}
                <span className="mr-2 text-sm font-bold text-slate-500 dark:text-slate-400">رصيد</span>
              </p>
            </div>
            <CircleDollarSign className="h-9 w-9 text-amber-500" aria-hidden="true" />
          </div>
        </section>

        <div className="space-y-3">
          <h2 className="px-1 text-sm font-black text-slate-700 dark:text-slate-300">عمليات الشحن</h2>

          {isLoading ? (
            <div className="space-y-3" aria-label="جاري تحميل سجل الشحن">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-36 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
              ))}
            </div>
          ) : hasError ? (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-5 py-8 text-center">
              <p className="font-bold text-rose-700 dark:text-rose-300">مش قادرين نعرض سجل الشحن دلوقتي.</p>
              <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">جرّب تفتح الصفحة تاني.</p>
            </div>
          ) : grants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 px-5 py-10 text-center">
              <CircleDollarSign className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" aria-hidden="true" />
              <p className="mt-3 font-bold text-slate-600 dark:text-slate-300">مفيش عمليات شحن مسجلة للجراج ده لسه.</p>
            </div>
          ) : (
            grants.map((grant) => {
              const amount = Number(grant.amount || 0);
              const balanceAfter = Number(grant.totalBalanceAfter ?? grant.balanceAfter ?? 0);
              const timestamp = grant.occurredAt;

              return (
                <article
                  key={grant.id || grant.entryId}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-slate-100">شحن رصيد</h3>
                      <p className="mt-1 text-xl font-black font-mono text-emerald-600 dark:text-emerald-400" dir="rtl">+{amount.toLocaleString('ar-EG')} رصيد</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">تم الشحن</span>
                  </div>

                  <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">الرصيد بعد الشحن: <span className="font-mono text-slate-900 dark:text-slate-100">{balanceAfter.toLocaleString('ar-EG')}</span></p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-400 dark:text-slate-500">
                      <span>{formatDate(timestamp)}</span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
});
