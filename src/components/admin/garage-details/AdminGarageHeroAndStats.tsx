/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo } from 'react';
import {
  Car,
  Phone,
  Key,
  Loader2,
  Unlock,
  Lock,
} from 'lucide-react';
import { formatDisplayPin } from '../../../utils/pins';
import { Garage } from '../../../types';

interface AdminGarageHeroAndStatsProps {
  garage: Garage;
  isUpdatingLock: boolean;
  onToggleLock: () => Promise<void>;
  onOpenEditPin: () => void;
}

/**
 * Zone 1 identity card — slim variant (owner pick: Option B, 2026-11-19).
 * One compact row: 40px status icon, name + status badge, then phone /
 * owner-PIN chip and the compact service-lock button. On phones the
 * phone+PIN group drops to its own full-width line so the row never
 * overflows; all previous behaviour (lock toggle, PIN edit) is unchanged.
 */
export const AdminGarageHeroAndStats = memo(({
  garage,
  isUpdatingLock,
  onToggleLock,
  onOpenEditPin
}: AdminGarageHeroAndStatsProps) => {
  return (
    <section>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-y-2 gap-x-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            garage.isLocked
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60'
          }`}>
            <Car className="w-5 h-5" />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-black text-slate-900 dark:text-white leading-tight">
              {garage.name}
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
              garage.isLocked
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
            }`}>
              {garage.isLocked ? 'معطل' : 'نشط'}
            </span>
          </div>

          {/* Phone + owner PIN — full-width second row on phones, inline on desktop */}
          <div className="order-last basis-full sm:order-none sm:basis-auto sm:flex-1 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 text-xs text-slate-500 dark:text-slate-400 font-bold">
            {garage.phone && (
              <div className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono text-slate-700 dark:text-slate-300">{garage.phone}</span>
              </div>
            )}

            {/* Owner PIN quick view / edit */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <Key className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[10px] text-slate-500">{'رمز المالك:'}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                  {formatDisplayPin(garage.pin || garage.ownerPin)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onOpenEditPin();
                  }}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold cursor-pointer"
                >
                  {'تعديل'}
                </button>
              </div>
            </div>
          </div>

          {/* Compact service lock / unlock action */}
          <button
            disabled={isUpdatingLock}
            onClick={onToggleLock}
            className={`px-3.5 py-2 rounded-[10px] font-black text-[11px] flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shrink-0 ${
              garage.isLocked
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            }`}
          >
            {isUpdatingLock ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{'جاري المعالجة...'}</span>
              </>
            ) : garage.isLocked ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>{'تفعيل الجراج الآن'}</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>{'إيقاف الخدمة فوراً'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
});
