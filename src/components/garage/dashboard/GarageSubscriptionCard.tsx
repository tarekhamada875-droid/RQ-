/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown } from 'lucide-react';
import { AnimatedCounter } from '../../AnimatedCounter';
import { Garage } from '../../../types';
import { firestoreService } from '../../../services';

interface GarageSubscriptionCardProps {
  garage: Garage;
  isUrgentRed: boolean;
  remainingDays: number;
  isWarningYellow: boolean;
  countdownValue: number;
  isCountdownInHours: boolean;
}

export const GarageSubscriptionCard = memo(({
  garage,
  isUrgentRed,
  remainingDays,
  isWarningYellow,
  countdownValue,
  isCountdownInHours,
}: GarageSubscriptionCardProps) => {
  const prepaidCreditsEnabled = garage.billingModel === 'prepaid_credits' || garage.creditBalance !== undefined;
  const paidCredits = Math.max(0, Number(garage.creditBalance?.paid || 0));
  const referralCredits = Math.max(0, Number(garage.creditBalance?.referral || 0));
  const trialCredits = Math.max(0, Number(garage.creditBalance?.trial || 0));
  const totalCredits = paidCredits + referralCredits + trialCredits;
  const previousCredits = useRef<number | null>(null);
  const [showDebitFeedback, setShowDebitFeedback] = useState(false);
  const [showCreditHistory, setShowCreditHistory] = useState(false);
  const [creditHistory, setCreditHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    if (previousCredits.current !== null && totalCredits < previousCredits.current) {
      setShowDebitFeedback(true);
      const timer = window.setTimeout(() => setShowDebitFeedback(false), 900);
      previousCredits.current = totalCredits;
      return () => window.clearTimeout(timer);
    }
    previousCredits.current = totalCredits;
  }, [totalCredits]);

  const hasWarning = (isUrgentRed || remainingDays <= 0) || (isWarningYellow && !isUrgentRed && remainingDays === 1);

  if (prepaidCreditsEnabled) {
    return (
      <div className="flex gap-4 shrink-0 w-full select-none" id="persistent_balance_card">
        <div className={`flex-1 rounded-[1.75rem] border flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden bg-[#faf9f6] dark:bg-slate-900 ${showDebitFeedback ? 'border-rose-400' : 'border-slate-200 dark:border-slate-800'}`}>
          <div className="text-xs md:text-sm font-bold text-slate-500 dark:text-slate-400 z-10">رصيد الدخول المتبقي</div>
          <div
            className={`relative py-1 text-4xl md:text-7xl font-black font-mono transition-colors ${showDebitFeedback ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}
            aria-live="polite"
          >
            {totalCredits.toLocaleString('en-US')}
            {showDebitFeedback && (
              <span id="balance_arrows_container" aria-hidden="true" className="absolute inset-x-0 top-0 flex justify-around text-rose-500 animate-credit-debit" data-testid="credit-debit-feedback">
                <ArrowDown className="w-5 h-5" /><ArrowDown className="w-5 h-5" /><ArrowDown className="w-5 h-5" />
              </span>
            )}
          </div>
          <span className="text-[10px] md:text-xs font-bold text-slate-500">مدفوع: {paidCredits} · إحالة: {referralCredits} · تجربة: {trialCredits}</span>
          <span className="sr-only">إجمالي الرصيد {totalCredits} رصيد دخول</span>
          <button type="button" className="mt-2 text-xs font-bold underline" onClick={async () => {
            const next = !showCreditHistory;
            setShowCreditHistory(next);
            if (next && creditHistory.length === 0) {
              setHistoryLoading(true);
              try { setCreditHistory(await firestoreService.getGarageCreditLedger(garage.id)); }
              catch { setCreditHistory([]); }
              finally { setHistoryLoading(false); }
            }
          }}>{showCreditHistory ? 'إخفاء سجل الرصيد' : 'عرض سجل الرصيد'}</button>
          {showCreditHistory && <div className="w-full max-h-36 overflow-auto mt-2 text-[10px] text-right border-t pt-2" aria-label="سجل أرصدة الدخول">
            {historyLoading ? 'جارٍ تحميل السجل…' : creditHistory.length ? creditHistory.map((entry) => <div key={entry.entryId} className="flex justify-between gap-2 py-1"><span>{entry.kind} · {entry.bucket}</span><span className="font-mono">{entry.kind?.endsWith('_debit') ? '−' : '+'}{entry.amount} · {String(entry.occurredAt || '').slice(0, 10)}</span></div>) : 'لا يوجد سجل أرصدة متاح.'}
          </div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 shrink-0 w-full select-none" id="persistent_balance_card">
      <div
        className={`flex-1 transition-all duration-300 ${
          hasWarning ? 'py-2 md:py-4 px-3 md:px-6' : 'py-2.5 md:py-6 px-4 md:px-6'
        } rounded-[1.75rem] border flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden ${
          isUrgentRed || remainingDays <= 0
            ? 'bg-rose-50/80 dark:bg-slate-900 border-rose-200 dark:border-red-500/50'
            : isWarningYellow
              ? 'bg-amber-50/80 dark:bg-slate-900 border-amber-200 dark:border-amber-500/50'
              : 'bg-[#faf9f6] dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className={`${hasWarning ? 'text-[11px] md:text-xs mb-0.5' : 'text-xs md:text-sm mb-1'} font-bold text-slate-500 dark:text-slate-400 z-10`}>
          الرصيد المتبقي
        </div>
        <div className="py-0.5 flex items-center justify-center overflow-visible z-10">
          <div className={`${hasWarning ? 'text-lg md:text-3xl gap-1.5' : 'text-2xl md:text-4xl gap-2'} font-black transition-colors duration-300 flex items-center ${isUrgentRed || remainingDays <= 0 ? 'text-rose-600 dark:text-red-500' : isWarningYellow ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
            <span className={`${hasWarning ? 'text-2xl md:text-4xl' : 'text-4xl md:text-7xl'} font-extrabold font-mono tracking-tight`}>
              <AnimatedCounter value={countdownValue} disableColorChange={true} />
            </span>
            <span className={hasWarning ? 'text-sm md:text-xl font-bold' : ''}>
              {isCountdownInHours ? (countdownValue === 1 ? 'ساعة' : countdownValue === 2 ? 'ساعتين' : countdownValue >= 3 && countdownValue <= 10 ? 'ساعات' : 'ساعة') : (countdownValue === 1 ? 'يوم' : countdownValue === 2 ? 'يومين' : countdownValue >= 3 && countdownValue <= 10 ? 'أيام' : 'يوماً')}
            </span>
          </div>
        </div>
        {(isUrgentRed || remainingDays <= 0) && (
          <div className="mt-1 bg-rose-100 dark:bg-red-500/10 border border-rose-200 dark:border-red-500/20 text-rose-700 dark:text-red-500 px-2.5 py-0.5 rounded-lg text-[9px] md:text-xs font-bold z-10 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" />
            {remainingDays <= 0 ? 'منتهي' : 'ينتهي قريباً جداً'}
          </div>
        )}
        {isWarningYellow && !isUrgentRed && remainingDays === 1 && (
          <div className="mt-1 bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-500 px-2.5 py-0.5 rounded-lg text-[9px] md:text-xs font-bold z-10 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" />
            يجب الشحن اليوم
          </div>
        )}
      </div>
    </div>
  );
});
