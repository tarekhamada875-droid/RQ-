import React, { memo } from 'react';
import { Wallet, Percent, RotateCw } from 'lucide-react';
import { useAdminTranslation } from '../../../utils/adminTranslations';

interface AdminDelegateStatsGridProps {
  selectedMonthKey: string;
  setSelectedMonthKey: (key: string) => void;
  currentMonthKey: string;
  activeMonthKey: string;
  availableMonths: string[];
  formatMonthName: (key: string) => string;
  totalRecharged: number;
  allTimeTotal: number;
  commissionValue: number;
  allTimeCommission: number;
  unsettledCycleTotal: number;
  effectiveLastSettledAt: Date | null;
  onSettleAccount: () => void;
  adminLang: 'ar' | 'en';
}

export const AdminDelegateStatsGrid: React.FC<AdminDelegateStatsGridProps> = memo(({
  selectedMonthKey,
  setSelectedMonthKey,
  currentMonthKey,
  activeMonthKey,
  availableMonths,
  formatMonthName,
  totalRecharged,
  allTimeTotal,
  commissionValue,
  allTimeCommission,
  unsettledCycleTotal,
  effectiveLastSettledAt,
  onSettleAccount,
  adminLang
}) => {
  const t = useAdminTranslation(adminLang);

  const formatCurrency = (val: number) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Automatic Monthly Filter Header */}
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <h3 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>{t('تجميع إحصائيات الشحن والعمولات شهرياً')}</span>
          </h3>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-400 shrink-0">{t('الفترة:')}</span>
          <select
            value={selectedMonthKey}
            onChange={(e) => setSelectedMonthKey(e.target.value)}
            className="flex-1 sm:flex-initial bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-black text-xs px-3 py-2 rounded-xl outline-none focus:border-amber-400 transition-colors cursor-pointer"
          >
            <option value="current">
              {t('الشهر الحالي')} ({formatMonthName(currentMonthKey)})
            </option>
            {availableMonths.filter(m => m !== currentMonthKey).map(m => (
              <option key={m} value={m}>
                {formatMonthName(m)}
              </option>
            ))}
            <option value="all">
              {t('جميع الأوقات (التاريخ الكلي)')}
            </option>
          </select>
        </div>
      </div>

      {/* Commission & Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Gross Sales Card */}
        <div className="bg-slate-900 dark:bg-slate-900 rounded-2xl p-6 text-white space-y-4 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/10 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
                  {t('إجمالي مبيعات المندوب')}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold">
                  {selectedMonthKey === 'current' ? t('الشهر الحالي') : formatMonthName(activeMonthKey)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2" dir="ltr">
              <span className="text-3xl font-black font-sans tracking-tight text-white">
                {formatCurrency(totalRecharged)}
              </span>
              <span className="text-sm font-bold text-slate-400">{t('ج.م')}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 text-[11px] text-slate-400">
            <span>{t('إجمالي التاريخ الكلي:')} </span>
            <strong className="text-white font-mono">{formatCurrency(allTimeTotal)} {t('ج.م')}</strong>
          </div>
        </div>

        {/* 2. Delegate Commission Card */}
        <div className="bg-slate-900 dark:bg-slate-900 rounded-2xl p-6 text-white space-y-4 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <Percent className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
                  {t('عمولة المندوب المستحقة')}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold">
                  {selectedMonthKey === 'current' ? t('الشهر الحالي') : formatMonthName(activeMonthKey)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2" dir="ltr">
              <span className="text-3xl font-black font-sans tracking-tight text-amber-400">
                {formatCurrency(commissionValue)}
              </span>
              <span className="text-sm font-bold text-slate-400">{t('ج.م')}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 text-[11px] text-slate-400">
            <span>{t('العمولات التاريخية:')} </span>
            <strong className="text-amber-400 font-mono">{formatCurrency(allTimeCommission)} {t('ج.م')}</strong>
          </div>
        </div>

        {/* 3. Company Net Revenue Card */}
        <div className="bg-slate-900 dark:bg-slate-900 rounded-2xl p-6 text-white space-y-4 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  {t('صافي دخل الشركة')}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold">
                  {selectedMonthKey === 'current' ? t('الشهر الحالي') : formatMonthName(activeMonthKey)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-2" dir="ltr">
              <span className="text-3xl font-black font-sans tracking-tight text-emerald-400">
                {formatCurrency(Math.max(0, totalRecharged - commissionValue))}
              </span>
              <span className="text-sm font-bold text-slate-400">{t('ج.م')}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 space-y-1 text-[11px]">
            <div className="flex items-center justify-between">
              <div className="text-slate-400">
                <span>{t('الصافي التاريخي:')} </span>
                <strong className="text-emerald-400 font-mono">{formatCurrency(Math.max(0, allTimeTotal - allTimeCommission))} {t('ج.م')}</strong>
              </div>

              <button
                onClick={onSettleAccount}
                className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 active:scale-[0.98] text-amber-400 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all outline-none leading-none border border-amber-500/30 cursor-pointer"
                title={t('صرف عمولة المندوب وتسوية حسابه')}
              >
                <RotateCw className="w-3.5 h-3.5 stroke-[3]" />
                <span>{t('صرف / تسوية العمولة')}</span>
              </button>
            </div>
            {effectiveLastSettledAt && (
              <p className="text-[10px] text-slate-400">
                {t('عمولة غير مسبوق صرفها:')} <strong className="text-amber-400 font-mono">{formatCurrency(unsettledCycleTotal)} {t('ج.م')}</strong>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

AdminDelegateStatsGrid.displayName = 'AdminDelegateStatsGrid';
