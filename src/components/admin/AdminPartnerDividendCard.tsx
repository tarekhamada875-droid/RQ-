import React, { useState, useMemo } from 'react';
import { 
  Crown, 
  Users, 
  TrendingUp, 
  Sliders, 
  ChevronDown, 
  ChevronUp, 
  Calculator, 
  Coins,
  ShieldCheck,
  Building2,
  Sparkles
} from 'lucide-react';

interface AdminPartnerDividendCardProps {
  currentSystemRevenue: number;
  currentActiveGarages: number;
}

export const AdminPartnerDividendCard: React.FC<AdminPartnerDividendCardProps> = ({
  currentSystemRevenue,
  currentActiveGarages
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [mode, setMode] = useState<'simulation' | 'actual'>('simulation');
  
  // Founder is strictly locked at 52%
  const FOUNDER_PERCENT = 52;
  const REMAINING_POOL_PERCENT = 100 - FOUNDER_PERCENT; // 48%

  // Partner settings
  const [partnerCount, setPartnerCount] = useState<number>(2); // Default to 2 partners (24% each)
  const [simulatedGarages, setSimulatedGarages] = useState<number>(Math.max(10, currentActiveGarages || 30));
  const [monthlyPackagePrice, setMonthlyPackagePrice] = useState<number>(800);
  const [operationalCostRate, setOperationalCostRate] = useState<number>(40); // 40% standard

  // Calculated equity per partner
  const partnerSharePercent = useMemo(() => {
    if (partnerCount <= 0) return 0;
    return Number((REMAINING_POOL_PERCENT / partnerCount).toFixed(2));
  }, [partnerCount, REMAINING_POOL_PERCENT]);

  // Financial calculations
  const financials = useMemo(() => {
    const isActual = mode === 'actual';
    const grossRevenue = isActual ? currentSystemRevenue : (simulatedGarages * monthlyPackagePrice);
    
    const costPool = (grossRevenue * operationalCostRate) / 100;
    const netProfitPool = Math.max(0, grossRevenue - costPool);

    const founderPayout = (netProfitPool * FOUNDER_PERCENT) / 100;
    const totalPartnersPool = (netProfitPool * REMAINING_POOL_PERCENT) / 100;
    const eachPartnerPayout = partnerCount > 0 ? totalPartnersPool / partnerCount : 0;

    return {
      grossRevenue,
      costPool,
      netProfitPool,
      founderPayout,
      totalPartnersPool,
      eachPartnerPayout
    };
  }, [mode, currentSystemRevenue, simulatedGarages, monthlyPackagePrice, operationalCostRate, partnerCount, FOUNDER_PERCENT, REMAINING_POOL_PERCENT]);

  return (
    <div className="bg-gradient-to-br from-white via-slate-50/50 to-emerald-50/20 dark:from-slate-900 dark:via-slate-900/90 dark:to-emerald-950/20 border-2 border-emerald-500/20 dark:border-emerald-500/30 rounded-3xl p-5 shadow-sm transition-all">
      {/* Header / Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                حاسبة أرباح الشركاء وتوزيع الحصص
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50">
                حصة المؤسس 52% ثابتة
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              نموذج توزيع الأرباح القياسي (40% مخصص تشغيل وتطوير / 60% صافي أرباح قابلة للتوزيع)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {/* Quick Snapshot Badges */}
          <div className="hidden md:flex items-center gap-2 text-xs font-mono font-bold bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400">صافي الأرباح:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-black">
              {Math.round(financials.netProfitPool).toLocaleString()} ج.م
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 px-3.5 py-2 rounded-2xl border border-emerald-200 dark:border-emerald-800 transition-all cursor-pointer"
          >
            <span>{isExpanded ? 'إخفاء التفاصيل' : 'فتح الحاسبة والمحاكي'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-6 animate-in fade-in duration-200">
          {/* Control Bar: Mode Toggle + Partners Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/70 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            {/* Mode Selector */}
            <div>
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-2">
                مصدر الأرقام:
              </label>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMode('simulation')}
                  className={`py-2 px-3 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'simulation'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>محاكي النمو والتفاوض</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('actual')}
                  className={`py-2 px-3 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    mode === 'actual'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>البيانات الفعلية الحالية</span>
                </button>
              </div>
            </div>

            {/* Partner Count Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                  عدد الشركاء الجدد (إلى جانب طارق):
                </label>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  حصة كل شريك: {partnerSharePercent}%
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                {[1, 2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setPartnerCount(count)}
                    className={`py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      partnerCount === count
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {count} {count === 1 ? 'شريك' : count === 2 ? 'شريكان' : 'شركاء'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Simulation Slider Controls (Visible when in simulation mode) */}
          {mode === 'simulation' && (
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                    عدد الجراجات المشتركة بالخدمة (المستهدفة):
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-mono font-black text-emerald-600 dark:text-emerald-400">
                    {simulatedGarages}
                  </span>
                  <span className="text-xs font-bold text-slate-400">جراج نشط</span>
                </div>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="5"
                max="250"
                step="5"
                value={simulatedGarages}
                onChange={(e) => setSimulatedGarages(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />

              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>5 جراجات (مرحلة تجريبية)</span>
                <span>50 جراج</span>
                <span>100 جراج</span>
                <span>250 جراج (توسع شامل)</span>
              </div>

              {/* Package & Cost Tuning Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">سعر الباقة الشهرية المفترض:</span>
                  <div className="flex items-center gap-1 font-mono">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={monthlyPackagePrice}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setMonthlyPackagePrice(Number(val) || 0);
                      }}
                      className="w-20 text-center font-black text-xs bg-slate-100 dark:bg-slate-800 rounded-lg py-1 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
                    />
                    <span className="text-xs font-bold text-slate-400">ج.م</span>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">مخصص المصروفات والاحتياطي:</span>
                  <div className="flex items-center gap-1 font-mono">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={operationalCostRate}
                      onChange={(e) => {
                        const val = Number(e.target.value.replace(/\D/g, ''));
                        setOperationalCostRate(Math.min(90, Math.max(0, val)));
                      }}
                      className="w-14 text-center font-black text-xs bg-slate-100 dark:bg-slate-800 rounded-lg py-1 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
                    />
                    <span className="text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* High-Level Financial Breakdown Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[11px] font-bold text-slate-400 block">إجمالي التحصيلات (Gross Revenue)</span>
              <div className="text-base font-black font-mono text-slate-900 dark:text-white">
                {Math.round(financials.grossRevenue).toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-400">ج.م/شهر</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-amber-500/20 space-y-1">
              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block">
                مخصص التشغيل والمناديب ({operationalCostRate}%)
              </span>
              <div className="text-base font-black font-mono text-amber-600 dark:text-amber-400">
                {Math.round(financials.costPool).toLocaleString()}{' '}
                <span className="text-xs font-normal text-amber-600/70">ج.م</span>
              </div>
            </div>

            <div className="bg-emerald-500/10 p-3.5 rounded-2xl border border-emerald-500/30 space-y-1">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 block">
                صافي الأرباح القابلة للتوزيع ({100 - operationalCostRate}%)
              </span>
              <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                {Math.round(financials.netProfitPool).toLocaleString()}{' '}
                <span className="text-xs font-normal text-emerald-600/70">ج.م/شهر</span>
              </div>
            </div>
          </div>

          {/* Cap Table & Payouts Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>جدول توزيع الأرباح الشهرية الصافية:</span>
              </h4>
              <span className="text-[11px] text-slate-400">
                إجمالي حصص الشركاء: 100%
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Founder Card (Tarek) - Fixed 52% */}
              <div className="bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-500/40 p-4 rounded-2xl relative overflow-hidden">
                <div className="absolute top-2 left-2 text-amber-500/20">
                  <Crown className="w-12 h-12" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    طارق (المؤسس والمطور)
                  </span>
                </div>
                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 mb-3 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>الحصة الحاكمة: {FOUNDER_PERCENT}% (ثابتة)</span>
                </div>
                <div className="pt-2 border-t border-amber-500/20">
                  <span className="text-[10px] text-slate-400 block mb-0.5">العائد الشهري الصافي المقدر:</span>
                  <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">
                    {Math.round(financials.founderPayout).toLocaleString()}{' '}
                    <span className="text-xs font-normal text-slate-500">ج.م / شهر</span>
                  </div>
                </div>
              </div>

              {/* Partners Dynamic Cards */}
              {Array.from({ length: partnerCount }).map((_, idx) => (
                <div 
                  key={idx}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        شريك {idx + 1}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                      {partnerSharePercent}%
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    {partnerCount === 2 ? 'حصة تشغيلية / تمويلية متساوية' : 'حصة شريك مساهم'}
                  </p>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">العائد الشهري الصافي المقدر:</span>
                    <div className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">
                      {Math.round(financials.eachPartnerPayout).toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">ج.م / شهر</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Pitch Advice Note */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 rounded-2xl flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <span className="font-black text-emerald-700 dark:text-emerald-400">نصيحة التفاوض مع الشركاء:</span>{' '}
              تم حجز نسبة <strong>40%</strong> كمخصص تشغيلي لحماية مصاريف المناديب (100 ج.م للباقة المؤهلة) وحسابات السيرفرات وصيانة الطابعات في الموقع. لا تقم بتوزيع الأرباح على إجمالي الإيراد أبداً، بل دائماً بعد خصم المخصص التشغيلي.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
