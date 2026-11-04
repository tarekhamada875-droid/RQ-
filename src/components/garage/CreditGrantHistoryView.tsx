import { useEffect, useState, memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Garage } from '../../types';
import { adminBillingService } from '../../services/adminBillingService';
import { safeDate } from '../../utils/dates';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface CreditGrantHistoryViewProps {
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

/**
 * Bank-statement layout — one row per grant.
 *
 * Each row carries 3 facts and nothing else:
 *   [date small]   [+amount رصيد large green]   [balance-after small]
 *
 * Removed as redundant:
 *   - Section header "عمليات الشحن" (the list is obviously operations)
 *   - Page subtitle (title alone is self-explanatory)
 *   - Card title "شحن رصيد" (every row IS a recharge)
 *   - Green "تم الشحن" badge (every entry is filtered to kind=paid_grant;
 *     status never varies, so the badge adds zero information)
 *   - "الرصيد بعد الشحن:" verbose label (position + tiny "بعد" prefix carries it)
 */
export const CreditGrantHistoryView = memo(({ garage, onClose, showToast }: CreditGrantHistoryViewProps) => {
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

  const currentBalance = Number(garage.credits ?? 0);

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
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">سجل شحن الرصيد</h1>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto p-4 sm:p-6 pb-10 overflow-y-auto custom-scrollbar stable-scrollbar">
        {isLoading ? (
          <div className="space-y-2" aria-label="جاري تحميل سجل الشحن">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse" />
            ))}
          </div>
        ) : hasError ? (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-5 py-8 text-center">
            <p className="font-bold text-rose-700 dark:text-rose-300">مش قادرين نعرض سجل الشحن دلوقتي.</p>
            <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">جرّب تفتح الصفحة تاني.</p>
          </div>
        ) : grants.length === 0 ? (
          <div className="px-1 py-12 text-center">
            <p className="text-4xl font-black font-mono text-slate-900 dark:text-slate-100">
              {currentBalance.toLocaleString('ar-EG')}
            </p>
            <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">الرصيد الحالي</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-600">لسه مفيش شحن مسجل</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {grants.map((grant) => {
              const amount = Number(grant.amount || 0);
              const balanceAfter = Number(grant.totalBalanceAfter ?? grant.balanceAfter ?? 0);
              const timestamp = grant.occurredAt;

              return (
                <li
                  key={grant.id || grant.entryId}
                  className="flex items-baseline gap-3 py-3.5"
                >
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0">
                    {formatDate(timestamp)}
                  </span>
                  <span className="flex-1 text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 leading-none">
                    +{amount.toLocaleString('ar-EG')} رصيد
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    بعد {balanceAfter.toLocaleString('ar-EG')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
});
