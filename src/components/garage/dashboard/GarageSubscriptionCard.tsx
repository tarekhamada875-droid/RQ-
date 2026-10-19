import { memo, useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { Garage } from '../../../types';

interface GarageSubscriptionCardProps {
  garage: Garage;
  isUrgentRed?: boolean;
  remainingDays?: number;
  isWarningYellow?: boolean;
  countdownValue?: number;
  isCountdownInHours?: boolean;
}

export const GarageSubscriptionCard = memo(({ garage }: GarageSubscriptionCardProps) => {
  const paidCredits = Math.max(0, Number(garage.creditBalance?.paid || 0));
  const referralCredits = Math.max(0, Number(garage.creditBalance?.referral || 0));
  const trialCredits = Math.max(0, Number(garage.creditBalance?.trial || 0));
  const totalCredits = paidCredits + referralCredits + trialCredits;
  const previousCredits = useRef<number | null>(null);
  const [showDebitFeedback, setShowDebitFeedback] = useState(false);

  useEffect(() => {
    if (previousCredits.current !== null && totalCredits < previousCredits.current) {
      setShowDebitFeedback(true);
      const timer = window.setTimeout(() => setShowDebitFeedback(false), 900);
      previousCredits.current = totalCredits;
      return () => window.clearTimeout(timer);
    }
    previousCredits.current = totalCredits;
  }, [totalCredits]);

  // Legacy money-balance and time-based subscription UI was retired.
  if (garage.billingModel !== 'prepaid_credits' && garage.creditBalance === undefined) return null;

  return (
    <div className="flex gap-4 shrink-0 w-full select-none" id="persistent_balance_card">
      <div className={`flex-1 rounded-[1.75rem] border flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden bg-[#faf9f6] dark:bg-slate-900 ${showDebitFeedback ? 'border-rose-400' : 'border-slate-200 dark:border-slate-800'}`}>
        <div className="text-xs md:text-sm font-bold text-slate-500 dark:text-slate-400 z-10">Remaining access credits</div>
        <div className={`relative py-1 text-4xl md:text-7xl font-black font-mono transition-colors ${showDebitFeedback ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`} aria-live="polite">
          {totalCredits.toLocaleString('en-US')}
          {showDebitFeedback && (
            <span id="balance_arrows_container" aria-hidden="true" className="absolute inset-x-0 top-0 flex justify-around text-rose-500 animate-credit-debit" data-testid="credit-debit-feedback">
              <ArrowDown className="w-5 h-5" /><ArrowDown className="w-5 h-5" /><ArrowDown className="w-5 h-5" />
            </span>
          )}
        </div>
        <span className="text-[10px] md:text-xs font-bold text-slate-500">Paid: {paidCredits} · Referral: {referralCredits} · Trial: {trialCredits}</span>
        <span className="sr-only">Total access credits {totalCredits}</span>
      </div>
    </div>
  );
});
