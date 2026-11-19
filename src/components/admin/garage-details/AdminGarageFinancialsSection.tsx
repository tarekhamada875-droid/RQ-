/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo } from 'react';
import { Users } from 'lucide-react';
import { Garage } from '../../../types';

interface AdminGarageFinancialsSectionProps {
  garage: Garage;
  onToggleMonthlySubscribers: () => Promise<void>;
}

/**
 * Monthly-subscribers toggle — slim variant (owner pick: Option B,
 * 2026-11-19). A single quiet row at the end of the balance zone: short
 * title, one-line truncated description, compact switch. Same toggle
 * behaviour and texts as before (title is pinned by a regression test).
 */
export const AdminGarageFinancialsSection = memo(({
  garage,
  onToggleMonthlySubscribers,
}: AdminGarageFinancialsSectionProps) => {
  return (
    <section>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center gap-3">
        <h3 className="text-[12.5px] font-black text-slate-900 dark:text-white flex items-center gap-2 shrink-0">
          <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span>{'خدمة المشتركين الشهريين / الإيواء'}</span>
        </h3>
        <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold truncate flex-1 min-w-0">
          {'إدارة المشتركين الشهريين دون رسوم اشتراك منفصلة — تُطبق قواعد الرصيد نفسها'}
        </p>
        <button
          type="button"
          onClick={onToggleMonthlySubscribers}
          className={`w-11 h-[25px] rounded-full p-[3px] relative shrink-0 cursor-pointer ${
            garage.hasMonthlySubscribers ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-800'
          }`}
          aria-label={garage.hasMonthlySubscribers ? 'تعطيل المشتركين الشهريين' : 'تفعيل المشتركين الشهريين'}
        >
          <div className={`w-[19px] h-[19px] bg-white rounded-full transform ${
            garage.hasMonthlySubscribers ? '-translate-x-[19px]' : 'translate-x-0'
          }`} />
        </button>
      </div>
    </section>
  );
});
