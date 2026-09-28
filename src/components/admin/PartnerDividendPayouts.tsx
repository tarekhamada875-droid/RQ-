import React from 'react';
import { Crown, Users, Coins, ShieldCheck } from 'lucide-react';

interface Financials {
  founderPayout: number;
  eachPartnerPayout: number;
}

interface PartnerDividendPayoutsProps {
  financials: Financials;
  partnerCount: number;
  partnerSharePercent: number;
  founderPercent: number;
  mode: 'simulation' | 'actual';
}

export const PartnerDividendPayouts: React.FC<PartnerDividendPayoutsProps> = ({
  financials,
  partnerCount,
  partnerSharePercent,
  founderPercent,
  mode
}) => {
  const periodLabel = mode === 'actual' ? 'الشهر الحالي' : 'شهر تقديري';
  const resultLabel = mode === 'actual' ? 'لهذا الشهر' : 'التقديري';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>جدول توزيع الأرباح الشهرية الصافية:</span>
        </h4>
        <span className="text-[11px] text-slate-400">إجمالي حصص الشركاء: 100%</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-500/40 p-4 rounded-2xl relative overflow-hidden">
          <div className="absolute top-2 left-2 text-amber-500/20"><Crown className="w-12 h-12" /></div>
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-black text-slate-900 dark:text-white">طارق (المؤسس والمطور)</span>
          </div>
          <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 mb-3 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>الحصة الحاكمة: {founderPercent}% (ثابتة)</span>
          </div>
          <div className="pt-2 border-t border-amber-500/20">
            <span className="text-[10px] text-slate-400 block mb-0.5">العائد الصافي {resultLabel}:</span>
            <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">
              {Math.round(financials.founderPayout).toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م / {periodLabel}</span>
            </div>
          </div>
        </div>

        {Array.from({ length: partnerCount }).map((_, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl space-y-2 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-black text-slate-900 dark:text-white">شريك {idx + 1}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">{partnerSharePercent}%</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {partnerCount === 1 ? 'حصة الشريك المساهم' : partnerCount === 2 ? 'حصة تشغيلية / تمويلية متساوية' : 'حصة شريك مساهم'}
            </p>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5">العائد الصافي {resultLabel}:</span>
              <div className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">
                {Math.round(financials.eachPartnerPayout).toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م / {periodLabel}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
