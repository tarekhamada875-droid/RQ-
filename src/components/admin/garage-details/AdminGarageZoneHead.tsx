/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LucideIcon } from 'lucide-react';

/**
 * Thin zone divider header for the garage details page (owner pick:
 * Option B, 2026-11-19). A tiny amber icon chip + 11px label + hairline
 * that stretches to the card edge — groups the page into three scannable
 * zones (الحالة والهوية / الرصيد والفوترة / التشغيل والطاقم) without
 * adding card noise.
 */
export const AdminGarageZoneHead = ({ icon: Icon, label }: { icon: LucideIcon; label: string }) => (
  <div className="flex items-center gap-2 h-[18px]">
    <span className="w-[18px] h-[18px] rounded-md bg-amber-400/15 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0">
      <Icon className="w-3 h-3" />
    </span>
    <span className="text-[11px] font-black text-slate-400 dark:text-slate-400 tracking-wide">{label}</span>
    <span className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
  </div>
);
