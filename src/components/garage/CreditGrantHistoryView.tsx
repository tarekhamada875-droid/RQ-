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
 * v3: cards without the summary header.
 *
 * Owner feedback after v2: "I don't like this — it will add more unnecessary
 * reads and it is already on the main screen." The summary card duplicated
 * the current balance that the dashboard already shows, and computing
 * total+count was a needless re-derivation from data the user already has.
 *
 * So: drop the summary card. Keep the per-row card structure (which the
 * owner approved visually) with the full "الرصيد بعد الشحن:" label.
 *
 * Removed (still gone — pure noise):
 *   - Section header "عمليات الشحن"
 *   - Page subtitle
 *   - Card title "شحن رصيد" on every row
 *   - Green "تم الشحن" badge (status never varies)
 *   - Summary header card (duplicated dashboard data, v2 misstep)
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
          <div className="space-y-3" aria-label="جاري تحميل سجل الشحن">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
            ))}
          </div>
        ) : hasError ? (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-5 py-8 text-center">
            <p className="font-bold text-rose-700 dark:text-rose-300">مش قادرين نعرض سجل الشحن دلوقتي.</p>
            <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">جرّب تفتح الصفحة تاني.</p>
          </div>
        ) : grants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 px-5 py-10 text-center">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">لسه مفيش شحن مسجل للجراج ده.</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">لما تطلب شحن رصيد، هيظهر هنا.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {grants.map((grant) => {
              const amount = Number(grant.amount || 0);
              const balanceAfter = Number(grant.totalBalanceAfter ?? grant.balanceAfter ?? 0);
              const timestamp = grant.occurredAt;

              return (
                <li
                  key={grant.id || grant.entryId}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 shadow-sm"
                >
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                    {formatDate(timestamp)}
                  </p>
                  <p className="mt-2 text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 leading-none">
                    +{amount.toLocaleString('ar-EG')} رصيد
                  </p>
                  <p className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-sm font-bold text-slate-700 dark:text-slate-300">
                    الرصيد بعد الشحن: <span className="font-mono text-slate-900 dark:text-slate-100">{balanceAfter.toLocaleString('ar-EG')}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
});
