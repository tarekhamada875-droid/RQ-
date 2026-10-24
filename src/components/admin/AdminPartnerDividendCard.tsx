import React, { useMemo, useState } from 'react';
import { Calculator, RotateCcw, TrendingUp, WalletCards } from 'lucide-react';

interface AdminPartnerDividendCardProps {
  currentActiveGarages: number;
}

type ProjectionInputs = {
  currentGarages: number;
  newGaragesPerMonth: number;
  paidCreditsPerGarage: number;
  pricePerCredit: number;
  monthlyOperatingCosts: number;
  delegateCommissionRate: number;
  paymentFeeRate: number;
  otherMonthlyCosts: number;
  investorOwnership: number;
  investorCount: number;
  projectionMonths: number;
};

type ProjectionRow = ProjectionInputs & {
  month: number;
  garages: number;
  credits: number;
  revenue: number;
  delegateCommission: number;
  paymentFees: number;
  totalCosts: number;
  operatingProfit: number;
  investorShare: number;
  founderShare: number;
};

const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} ج.م`;
const numberValue = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const makeDefaults = (currentActiveGarages: number): ProjectionInputs => ({
  currentGarages: Math.max(0, currentActiveGarages),
  newGaragesPerMonth: 2,
  paidCreditsPerGarage: 400,
  pricePerCredit: 1,
  monthlyOperatingCosts: 5000,
  delegateCommissionRate: 0,
  paymentFeeRate: 0,
  otherMonthlyCosts: 0,
  investorOwnership: 25,
  investorCount: 1,
  projectionMonths: 12,
});

const InputField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}> = ({ label, value, onChange, min = 0, max, step = 1, suffix }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
    <span className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(numberValue(event.target.value, value))}
        className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-900 outline-none dark:text-white"
      />
      {suffix && <span className="text-xs font-bold text-slate-400">{suffix}</span>}
    </span>
  </label>
);

export const AdminPartnerDividendCard: React.FC<AdminPartnerDividendCardProps> = ({ currentActiveGarages }) => {
  const defaults = useMemo(() => makeDefaults(currentActiveGarages), [currentActiveGarages]);
  const [inputs, setInputs] = useState<ProjectionInputs>(defaults);

  const update = <K extends keyof ProjectionInputs>(key: K, value: ProjectionInputs[K]) => {
    setInputs((previous) => ({ ...previous, [key]: value }));
  };

  const projection = useMemo(() => {
    const rows: ProjectionRow[] = [];
    for (let month = 1; month <= inputs.projectionMonths; month += 1) {
      const garages = inputs.currentGarages + (inputs.newGaragesPerMonth * (month - 1));
      const credits = garages * inputs.paidCreditsPerGarage;
      const revenue = credits * inputs.pricePerCredit;
      const delegateCommission = revenue * (inputs.delegateCommissionRate / 100);
      const paymentFees = revenue * (inputs.paymentFeeRate / 100);
      const totalCosts = inputs.monthlyOperatingCosts + inputs.otherMonthlyCosts + delegateCommission + paymentFees;
      const operatingProfit = revenue - totalCosts;
      const investorShare = operatingProfit * (inputs.investorOwnership / 100);
      rows.push({
        ...inputs,
        month,
        garages,
        credits,
        revenue,
        delegateCommission,
        paymentFees,
        totalCosts,
        operatingProfit,
        investorShare,
        founderShare: operatingProfit - investorShare,
      });
    }
    const totals = rows.reduce((summary, row) => ({
      revenue: summary.revenue + row.revenue,
      totalCosts: summary.totalCosts + row.totalCosts,
      operatingProfit: summary.operatingProfit + row.operatingProfit,
      investorShare: summary.investorShare + row.investorShare,
      founderShare: summary.founderShare + row.founderShare,
    }), { revenue: 0, totalCosts: 0, operatingProfit: 0, investorShare: 0, founderShare: 0 });
    return { rows, totals };
  }, [inputs]);

  const reset = () => setInputs(makeDefaults(currentActiveGarages));
  const averageInvestorPayout = inputs.projectionMonths > 0
    ? projection.totals.investorShare / inputs.projectionMonths
    : 0;

  return (
    <section className="mx-auto max-w-6xl space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6" aria-label="حاسبة الاستثمار">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Calculator className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">حاسبة الاستثمار والتوقعات</h2>
            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">نموذج تخطيطي قابل للتعديل لاستخدامه في مناقشات الاستثمار، وليس تقريرًا محاسبيًا.</p>
          </div>
        </div>
        <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300" aria-label="إعادة القيم الافتراضية">
          <RotateCcw className="h-3.5 w-3.5" /> إعادة الافتراضيات
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40" aria-labelledby="projection-assumptions">
        <div className="mb-4 flex items-center gap-2"><WalletCards className="h-4 w-4 text-emerald-600" /><h3 id="projection-assumptions" className="text-sm font-black text-slate-900 dark:text-white">1. الافتراضات</h3></div>
        <p className="mb-4 text-xs leading-6 text-slate-500 dark:text-slate-400">غيّر الأرقام الأساسية فقط؛ ستُحدَّث النتائج تلقائيًا. القيم الإضافية موجودة في الإعدادات المتقدمة.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InputField label="الجراجات الحالية" value={inputs.currentGarages} onChange={(value) => update('currentGarages', Math.max(0, Math.floor(value)))} suffix="جراج" />
          <InputField label="جراجات جديدة كل شهر" value={inputs.newGaragesPerMonth} onChange={(value) => update('newGaragesPerMonth', Math.max(0, Math.floor(value)))} suffix="جراج" />
          <InputField label="الأرصدة المدفوعة لكل جراج شهريًا" value={inputs.paidCreditsPerGarage} onChange={(value) => update('paidCreditsPerGarage', Math.max(0, Math.floor(value)))} suffix="رصيد" />
          <InputField label="سعر الرصيد" value={inputs.pricePerCredit} onChange={(value) => update('pricePerCredit', Math.max(0, value))} step={0.01} suffix="ج.م" />
          <InputField label="المصاريف التشغيلية الشهرية" value={inputs.monthlyOperatingCosts} onChange={(value) => update('monthlyOperatingCosts', Math.max(0, value))} suffix="ج.م" />
          <InputField label="نسبة المستثمرين من الربح التشغيلي" value={inputs.investorOwnership} onChange={(value) => update('investorOwnership', Math.min(100, Math.max(0, value)))} max={100} step={0.1} suffix="%" />
          <InputField label="عدد المستثمرين" value={inputs.investorCount} onChange={(value) => update('investorCount', Math.max(1, Math.floor(value)))} suffix="مستثمر" />
          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">مدة التوقع</span><select aria-label="مدة التوقع" value={inputs.projectionMonths} onChange={(event) => update('projectionMonths', numberValue(event.target.value, 12))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value={6}>6 أشهر</option><option value={12}>12 شهرًا</option><option value={24}>24 شهرًا</option></select></label>
        </div>
        <details className="mt-4 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-slate-700 marker:hidden dark:text-slate-200">
            <span className="flex items-center justify-between gap-3"><span>إعدادات متقدمة</span><span className="text-xs font-bold text-slate-400">اختيارية</span></span>
          </summary>
          <p className="px-4 pb-3 text-xs leading-5 text-slate-500 dark:text-slate-400">اترك القيم صفرًا إذا لم تكن لديك تقديرات لهذه التكاليف. لا تتغير طريقة الحساب عند إخفاء هذه الإعدادات.</p>
          <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800">
            <InputField label="عمولة المندوبين" value={inputs.delegateCommissionRate} onChange={(value) => update('delegateCommissionRate', Math.min(100, Math.max(0, value)))} max={100} step={0.1} suffix="%" />
            <InputField label="رسوم الدفع والتحويل" value={inputs.paymentFeeRate} onChange={(value) => update('paymentFeeRate', Math.min(100, Math.max(0, value)))} max={100} step={0.1} suffix="%" />
            <InputField label="مصاريف شهرية أخرى" value={inputs.otherMonthlyCosts} onChange={(value) => update('otherMonthlyCosts', Math.max(0, value))} suffix="ج.م" />
          </div>
        </details>
      </section>

      <section aria-labelledby="projection-results">
        <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /><h3 id="projection-results" className="text-sm font-black text-slate-900 dark:text-white">2. النتائج المتوقعة</h3></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['إجمالي الإيرادات', projection.totals.revenue, 'text-slate-900 dark:text-white'],
            ['إجمالي المصروفات', projection.totals.totalCosts, 'text-amber-600 dark:text-amber-400'],
            ['صافي الربح التشغيلي', projection.totals.operatingProfit, 'text-emerald-600 dark:text-emerald-400'],
            ['متوسط حصة المستثمر شهريًا', averageInvestorPayout / Math.max(1, inputs.investorCount), 'text-blue-600 dark:text-blue-400'],
          ].map(([label, value, color]) => <div key={label as string} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><p className="text-xs font-bold text-slate-400">{label}</p><p className={`mt-2 text-xl font-black ${color}`}>{money(value as number)}</p></div>)}
        </div>
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">إجمالي حصة المستثمرين خلال فترة التوقع: {money(projection.totals.investorShare)} — حصة المؤسس: {100 - inputs.investorOwnership}%</div>
      </section>

      <details className="rounded-2xl border border-slate-200 dark:border-slate-800" aria-labelledby="projection-table">
        <summary className="cursor-pointer list-none rounded-2xl bg-slate-50 px-4 py-4 dark:bg-slate-950/50">
          <span className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><Calculator className="h-4 w-4 text-emerald-600" /><h3 id="projection-table" className="text-sm font-black text-slate-900 dark:text-white">3. الجدول الشهري</h3></span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">عرض التفاصيل</span>
          </span>
        </summary>
        <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-right text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th className="px-3 py-3 font-black">الشهر</th><th className="px-3 py-3 font-black">الجراجات</th><th className="px-3 py-3 font-black">الأرصدة</th><th className="px-3 py-3 font-black">الإيرادات</th><th className="px-3 py-3 font-black">المصروفات</th><th className="px-3 py-3 font-black">صافي التشغيل</th></tr></thead><tbody>{projection.rows.map((row) => <tr key={row.month} className="border-t border-slate-100 dark:border-slate-800"><td className="px-3 py-3 font-black text-slate-900 dark:text-white">{row.month}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{row.garages.toLocaleString('en-US')}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{row.credits.toLocaleString('en-US')}</td><td className="px-3 py-3 font-bold text-slate-900 dark:text-white">{money(row.revenue)}</td><td className="px-3 py-3 font-bold text-amber-600 dark:text-amber-400">{money(row.totalCosts)}</td><td className={`px-3 py-3 font-black ${row.operatingProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(row.operatingProfit)}</td></tr>)}</tbody></table>
        </div>
      </details>
    </section>
  );
};
