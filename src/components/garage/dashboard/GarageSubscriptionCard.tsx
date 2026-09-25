/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AnimatedCounter } from '../../AnimatedCounter';
import { Garage } from '../../../types';

interface GarageSubscriptionCardProps {
  garage: Garage;
  isUrgentRed: boolean;
  remainingDays: number;
  isWarningYellow: boolean;
  countdownValue: number;
  isCountdownInHours: boolean;
  displayTodayCount: number;
  dailyCapacity: number;
  isUnlimited: boolean;
}

export const GarageSubscriptionCard = memo(({
  isUrgentRed,
  remainingDays,
  isWarningYellow,
  countdownValue,
  isCountdownInHours,
  displayTodayCount,
  dailyCapacity,
  isUnlimited,
}: GarageSubscriptionCardProps) => {
  const hasWarning = (isUrgentRed || remainingDays <= 0) || (isWarningYellow && !isUrgentRed && remainingDays === 1);

  return (
    <div className="flex gap-4 shrink-0 w-full select-none" id="persistent_balance_card">
      {/* RIGHT CARD: Subscription countdown */}
      <div
        className={`flex-1 transition-all duration-300 ${
          hasWarning ? 'py-2 md:py-4 px-3 md:px-6' : 'py-2.5 md:py-6 px-4 md:px-6'
        } rounded-[1.75rem] border flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden ${
          isUrgentRed || remainingDays <= 0
            ? 'bg-slate-900 border-red-500/50'
            : isWarningYellow
              ? 'bg-slate-900 border-amber-500/50'
              : 'bg-[#faf9f6] dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className={`${hasWarning ? 'text-[11px] md:text-xs mb-0.5' : 'text-xs md:text-sm mb-1'} font-bold text-slate-500 dark:text-slate-400 z-10`}>
          الرصيد المتبقي
        </div>

        {/* Countdown */}
        <div className="py-0.5 flex items-center justify-center overflow-visible z-10">
          <div
            className={`${
              hasWarning ? 'text-lg md:text-3xl gap-1.5' : 'text-2xl md:text-4xl gap-2'
            } font-black transition-colors duration-300 flex items-center ${
              isUrgentRed || remainingDays <= 0
                ? 'text-red-500'
                : isWarningYellow
                  ? 'text-amber-400'
                  : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            <span className={`${hasWarning ? 'text-2xl md:text-4xl' : 'text-4xl md:text-7xl'} font-extrabold font-mono tracking-tight`}>
              <AnimatedCounter value={countdownValue} disableColorChange={true} />
            </span>
            <span className={hasWarning ? 'text-sm md:text-xl font-bold' : ''}>
              {isCountdownInHours
                ? (countdownValue === 1
                    ? 'ساعة'
                    : countdownValue === 2
                      ? 'ساعتين'
                      : countdownValue >= 3 && countdownValue <= 10
                        ? 'ساعات'
                        : 'ساعة')
                : (countdownValue === 1
                    ? 'يوم'
                    : countdownValue === 2
                      ? 'يومين'
                      : countdownValue >= 3 && countdownValue <= 10
                        ? 'أيام'
                        : 'يوماً')}
            </span>
          </div>
        </div>

        {/* Subtle Footer Warning if Urgent or Very close */}
        {(isUrgentRed || remainingDays <= 0) && (
          <div className="mt-1 bg-red-500/10 border border-red-500/20 text-red-500 px-2.5 py-0.5 rounded-lg text-[9px] md:text-xs font-bold z-10 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" />
            {remainingDays <= 0 ? 'منتهي' : 'ينتهي قريباً جداً'}
          </div>
        )}
        {(isWarningYellow && !isUrgentRed && remainingDays === 1) && (
          <div className="mt-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2.5 py-0.5 rounded-lg text-[9px] md:text-xs font-bold z-10 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" />
            يجب الشحن اليوم
          </div>
        )}
      </div>

      {/* LEFT CARD: Daily cars info (For Limited Subscriptions) */}
      {!isUnlimited && (
        <div className="flex-1 transition-all duration-300 py-2.5 md:py-6 px-4 md:px-6 rounded-[1.75rem] border flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden bg-[#faf9f6] dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">العدد اليومي</span>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl md:text-6xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
              {displayTodayCount}
            </span>
            <span className="text-lg md:text-2xl font-bold text-slate-400 font-mono">
              /{dailyCapacity}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
