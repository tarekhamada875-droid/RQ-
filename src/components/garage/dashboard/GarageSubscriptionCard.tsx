import { memo, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown } from 'lucide-react';
import { Garage } from '../../../types';

interface GarageSubscriptionCardProps {
  garage: Garage;
}

export const GarageSubscriptionCard = memo(({ garage }: GarageSubscriptionCardProps) => {
  const totalCredits = Math.max(0, Number(garage.credits ?? 0));
  const isLowCredit = totalCredits <= 50;
  const isCriticalCredit = totalCredits <= 10;
  const previousCredits = useRef<number | null>(null);
  const [showDebitFeedback, setShowDebitFeedback] = useState(false);
  // Incremented on every debit so React remounts the arrows and the CSS
  // animation re-triggers for each confirmed balance decrease.
  const [debitNonce, setDebitNonce] = useState(0);

  // The last arrow finishes after a 1.35s fall plus a 0.24s outer-pair delay.
  // Keep the visual feedback mounted briefly afterward rather than cutting it off.
  const DEBIT_FEEDBACK_MS = 1800;

  useEffect(() => {
    if (previousCredits.current !== null && totalCredits < previousCredits.current) {
      setShowDebitFeedback(true);
      setDebitNonce((n) => n + 1);
      const timer = window.setTimeout(() => setShowDebitFeedback(false), DEBIT_FEEDBACK_MS);
      previousCredits.current = totalCredits;
      return () => window.clearTimeout(timer);
    }
    previousCredits.current = totalCredits;
  }, [totalCredits]);

  // Legacy money-balance and time-based subscription UI was retired.
  if (garage.billingModel !== 'prepaid_credits' && typeof garage.credits !== 'number') return null;

  return (
    <div className="flex gap-4 shrink-0 w-full select-none" id="persistent_balance_card">
      <div className={`flex-1 rounded-[1.75rem] border flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden bg-[#faf9f6] dark:bg-slate-900 ${showDebitFeedback ? 'border-rose-400' : isCriticalCredit ? 'border-rose-500 dark:border-rose-400' : isLowCredit ? 'border-amber-400 dark:border-amber-500' : 'border-slate-200 dark:border-slate-800'}`}>
        {isLowCredit && (
          <div
            role="status"
            data-testid="low-credit-indicator"
            className={`absolute top-3 left-4 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black ${isCriticalCredit ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {isCriticalCredit ? 'آخر رصيد' : 'رصيدك بيخلص'}
          </div>
        )}
        <div className={`relative z-10 py-1 text-4xl md:text-7xl font-black font-mono transition-colors ${showDebitFeedback ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`} aria-live="polite">
          {totalCredits.toLocaleString('en-US')}
        </div>
        {showDebitFeedback && (
          <span key={debitNonce} id="balance_arrows_container" aria-hidden="true" className="absolute inset-0 z-20 overflow-hidden pointer-events-none text-red-600 dark:text-red-400" data-testid="credit-debit-feedback">
            {/* Center starts first, followed by the inner pair and then the outer pair. */}
            {["center", "inner-left", "inner-right", "outer-left", "outer-right"].map((position) => (
              <span
                key={position}
                className={`credit-debit-arrow credit-debit-arrow-${position}`}
                data-testid="credit-debit-arrow"
              >
                <ArrowDown className="credit-debit-arrow-icon" strokeWidth={4} />
              </span>
            ))}
          </span>
        )}
        <span className="sr-only">إجمالي الرصيد {totalCredits}</span>
      </div>
    </div>
  );
});
