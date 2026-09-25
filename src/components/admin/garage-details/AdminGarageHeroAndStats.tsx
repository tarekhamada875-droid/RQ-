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
  Clock, 
  CheckCircle2 
} from 'lucide-react';
import { formatDisplayPin } from '../../../utils';
import { Garage } from '../../../types';

interface AdminGarageHeroAndStatsProps {
  garage: Garage;
  t: (key: string) => string;
  adminLang: string;
  carsInside: number;
  dailyCount: number;
  dailyRevenue: number;
  totalCount: number;
  totalRevenue: number;
  isUpdatingLock: boolean;
  onToggleLock: () => Promise<void>;
  onOpenEditPin: () => void;
}

export const AdminGarageHeroAndStats = memo(({
  garage,
  t,
  adminLang: _adminLang,
  carsInside,
  dailyCount,
  dailyRevenue,
  totalCount,
  totalRevenue,
  isUpdatingLock,
  onToggleLock,
  onOpenEditPin
}: AdminGarageHeroAndStatsProps) => {
  return (
    <section className="space-y-4">
      {/* Garage Hero Identity Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 relative overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              garage.isLocked 
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60' 
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60'
            }`}>
              <Car className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                  {garage.name}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                  garage.isLocked
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                }`}>
                  {garage.isLocked ? t('معطل') : t('نشط')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-bold">
                {garage.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono text-slate-700 dark:text-slate-300">{garage.phone}</span>
                  </div>
                )}
                
                {/* Owner PIN quick view / edit */}
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <Key className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[10px] text-slate-500">{t('رمز المالك:')}</span>
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
                      className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                    >
                      {t('تعديل')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lock / Unlock Toggle Action */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <button
              disabled={isUpdatingLock}
              onClick={onToggleLock}
              className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer ${
                garage.isLocked
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  : 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
              }`}
            >
              {isUpdatingLock ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('جاري المعالجة...')}</span>
                </>
              ) : garage.isLocked ? (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>{t('تفعيل الجراج الآن')}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{t('إيقاف الخدمة فوراً')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Performance Stats Grid - Compact Single Row on Mobile & Desktop */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {/* Metric 1: Cars Inside */}
        <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-center gap-1 mb-0.5 text-slate-500 dark:text-slate-400">
            <Car className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-[11px] sm:text-xs font-black truncate">{t('بالداخل')}</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 leading-tight">
            {carsInside}
          </div>
          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 truncate">
            {t('سيارة حالياً')}
          </p>
        </div>

        {/* Metric 2: Today */}
        <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-center gap-1 mb-0.5 text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-[11px] sm:text-xs font-black truncate">{t('دخول اليوم')}</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 leading-tight">
            {dailyCount}
          </div>
          <p className="text-[9px] sm:text-[10px] font-black text-emerald-600 dark:text-emerald-400 font-mono truncate">
            {Number(dailyRevenue).toFixed(0)} {t('ج.م')}
          </p>
        </div>

        {/* Metric 3: Cumulative */}
        <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-sm flex flex-col justify-center">
          <div className="flex items-center justify-center gap-1 mb-0.5 text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span className="text-[11px] sm:text-xs font-black truncate">{t('إجمالي الخروج')}</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono my-0.5 leading-tight">
            {totalCount}
          </div>
          <p className="text-[9px] sm:text-[10px] font-black text-slate-600 dark:text-slate-300 font-mono truncate">
            {Number(totalRevenue).toFixed(0)} {t('ج.م')}
          </p>
        </div>
      </div>
    </section>
  );
});
