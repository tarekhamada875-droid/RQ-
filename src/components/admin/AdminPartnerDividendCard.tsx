import React, { useMemo, useState } from 'react';
import { Calculator, RotateCcw, TrendingUp, Wallet, Users } from 'lucide-react';

interface AdminPartnerDividendCardProps {
  currentActiveGarages: number;
}

type ProjectionInputs = {
  currentGarages: number;
  newGaragesPerMonth: number;
  carsPerDayPerGarage: number;
  workingDaysPerMonth: number;
  pricePerCredit: number;
  monthlyFixedCosts: number;
  delegateCommissionPerGarage: number;
  investorOwnership: number;
  investorCount: number;
  projectionMonths: number;
};

type ProjectionRow = {
  month: number;
  garages: number;
  newThisMonth: number;
  grossRevenue: number;
  trialDiscount: number;
  netRevenue: number;
  delegateCommission: number;
  totalCosts: number;
  operatingProfit: number;
  investorShare: number;
  founderShare: number;
};

const TRIAL_CREDITS_PER_NEW_GARAGE = 100;
const REFERRAL_CREDITS_PER_NEW_GARAGE = 20;
const ACQUISITION_DISCOUNT_PER_NEW_GARAGE = TRIAL_CREDITS_PER_NEW_GARAGE + REFERRAL_CREDITS_PER_NEW_GARAGE;

const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} ج.م`;
const numberValue = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const makeDefaults = (currentActiveGarages: number): ProjectionInputs => ({
  currentGarages: Math.max(0, currentActiveGarages),
  newGaragesPerMonth: 2,
  carsPerDayPerGarage: 100,
  workingDaysPerMonth: 20,
  pricePerCredit: 1,
  monthlyFixedCosts: 5000,
  delegateCommissionPerGarage: 100,
  investorOwnership: 0,
  investorCount: 0,
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
  hint?: string;
}> = ({ label, value, onChange, min = 0, max, step = 1, suffix, hint }) => {
  const [draft, setDraft] = useState(String(value));

  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = () => {
    const parsed = draft.trim() === '' ? min : numberValue(draft, min);
    const bounded = Math.max(min, max === undefined ? parsed : Math.min(max, parsed));
    setDraft(String(bounded));
    onChange(bounded);
  };

  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-label={label}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (next.trim() !== '' && Number.isFinite(Number(next))) onChange(Number(next));
          }}
          onBlur={commitDraft}
          className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-900 outline-none dark:text-white"
        />
        {suffix && <span className="text-xs font-bold text-slate-400">{suffix}</span>}
      </span>
      {hint && <span className="block text-[10px] font-bold text-slate-400">{hint}</span>}
    </label>
  );
};

export const AdminPartnerDividendCard: React.FC<AdminPartnerDividendCardProps> = ({ currentActiveGarages }) => {
  const defaults = useMemo(() => makeDefaults(currentActiveGarages), [currentActiveGarages]);
  const [inputs, setInputs] = useState<ProjectionInputs>(defaults);

  const update = <K extends keyof ProjectionInputs>(key: K, value: ProjectionInputs[K]) => {
    setInputs((previous) => ({ ...previous, [key]: value }));
  };

  const creditsPerGaragePerMonth = inputs.carsPerDayPerGarage * inputs.workingDaysPerMonth;

  const projection = useMemo(() => {
    const rows: ProjectionRow[] = [];
    for (let month = 1; month <= inputs.projectionMonths; month += 1) {
      const garages = inputs.currentGarages + (inputs.newGaragesPerMonth * (month - 1));
      const newThisMonth = month === 1 ? 0 : inputs.newGaragesPerMonth;
      const grossRevenue = garages * creditsPerGaragePerMonth * inputs.pricePerCredit;
      const trialDiscount = newThisMonth * ACQUISITION_DISCOUNT_PER_NEW_GARAGE * inputs.pricePerCredit;
      const netRevenue = Math.max(0, grossRevenue - trialDiscount);
      const delegateCommission = newThisMonth * inputs.delegateCommissionPerGarage;
      const totalCosts = inputs.monthlyFixedCosts + delegateCommission;
      const operatingProfit = netRevenue - totalCosts;
      const investorShare = operatingProfit * (inputs.investorOwnership / 100);
      rows.push({
        month,
        garages,
        newThisMonth,
        grossRevenue,
        trialDiscount,
        netRevenue,
        delegateCommission,
        totalCosts,
        operatingProfit,
        investorShare,
        founderShare: operatingProfit - investorShare,
      });
    }
    const totals = rows.reduce((summary, row) => ({
      netRevenue: summary.netRevenue + row.netRevenue,
      totalCosts: summary.totalCosts + row.totalCosts,
      operatingProfit: summary.operatingProfit + row.operatingProfit,
      investorShare: summary.investorShare + row.investorShare,
      founderShare: summary.founderShare + row.founderShare,
    }), { netRevenue: 0, totalCosts: 0, operatingProfit: 0, investorShare: 0, founderShare: 0 });
    return { rows, totals };
  }, [inputs, creditsPerGaragePerMonth]);

  const reset = () => setInputs(makeDefaults(currentActiveGarages));

  const currentMonthlyRunRate = inputs.currentGarages * creditsPerGaragePerMonth * inputs.pricePerCredit;
  const totalProfit = projection.totals.operatingProfit;
  const avgMonthlyProfit = inputs.projectionMonths > 0 ? totalProfit / inputs.projectionMonths : 0;
  const hasInvestors = inputs.investorOwnership > 0 && inputs.investorCount > 0;
  const perInvestorMonthly = hasInvestors
    ? (projection.totals.investorShare / inputs.projectionMonths) / inputs.investorCount
    : 0;

  return (
    <section className="mx-auto max-w-6xl space-y-5" aria-label="حاسبة الاستثمار">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">حاسبة الاستثمار</h3>
            <p className="text-[11px] font-bold text-slate-400">توقع الإيرادات والأرباح المستقبلية</p>
          </div>
        </div>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="إعادة القيم الافتراضية">
          <RotateCcw className="h-3.5 w-3.5" /> إعادة الافتراضيات
        </button>
      </div>

      {/* Zone 1: Current run-rate — the headline */}
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-slate-900">
        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">إيرادك الحالي الشهري</p>
        <p className="mt-1 text-3xl font-black text-emerald-600 dark:text-emerald-400">{money(currentMonthlyRunRate)}</p>
        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
          {inputs.currentGarages} جراج × {creditsPerGaragePerMonth.toLocaleString('en-US')} رصيد × {inputs.pricePerCredit} ج.م
        </p>
      </div>

      {/* Zone 2: Inputs */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="mb-3 text-sm font-black text-slate-900 dark:text-white">الافتراضات</h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InputField label="الجراجات الحالية" value={inputs.currentGarages} onChange={(value) => update('currentGarages', Math.max(0, Math.floor(value)))} suffix="جراج" />
          <InputField label="جراجات جديدة شهريًا" value={inputs.newGaragesPerMonth} onChange={(value) => update('newGaragesPerMonth', Math.max(0, Math.floor(value)))} suffix="جراج" />
          <InputField label="سيارات/يوم لكل جراج" value={inputs.carsPerDayPerGarage} onChange={(value) => update('carsPerDayPerGarage', Math.max(0, Math.floor(value)))} suffix="سيارة" />
          <InputField label="أيام عمل/شهر" value={inputs.workingDaysPerMonth} onChange={(value) => update('workingDaysPerMonth', Math.max(1, Math.floor(value)))} suffix="يوم" />
          <InputField label="سعر الفحص" value={inputs.pricePerCredit} onChange={(value) => update('pricePerCredit', Math.max(0, value))} step={0.5} suffix="ج.م" />
          <InputField label="عمولة المندوب (لكل جراج جديد)" value={inputs.delegateCommissionPerGarage} onChange={(value) => update('delegateCommissionPerGarage', Math.max(0, value))} suffix="ج.م" hint="100 ج.م ثابتة لكل إحالة" />
          <InputField label="التكاليف الثابتة الشهرية" value={inputs.monthlyFixedCosts} onChange={(value) => update('monthlyFixedCosts', Math.max(0, value))} suffix="ج.م" hint="بنية تحتية + أدوات ذكاء" />
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">مدة التوقع</span>
            <select aria-label="مدة التوقع" value={inputs.projectionMonths} onChange={(event) => update('projectionMonths', numberValue(event.target.value, 12))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
              <option value={6}>6 أشهر</option>
              <option value={12}>12 شهرًا</option>
              <option value={24}>24 شهرًا</option>
            </select>
          </label>
        </div>
        {/* Auto-calculated credits chip */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/50">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">الأرصدة المحسوبة لكل جراج شهريًا:</span>
          <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {inputs.carsPerDayPerGarage} × {inputs.workingDaysPerMonth} = {creditsPerGaragePerMonth.toLocaleString('en-US')} رصيد
          </span>
        </div>

      {/* Advanced: investor settings */}
      <details className="mt-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
        <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-slate-600 marker:hidden dark:text-slate-300">
          <span className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> إعدادات المستثمرين</span>
            <span className="text-[10px] font-bold text-slate-400">اتركها صفر إذا أنت المالك الوحيد</span>
          </span>
        </summary>
        <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-800">
          <InputField label="نسبة ملكية المستثمرين" value={inputs.investorOwnership} onChange={(value) => update('investorOwnership', Math.min(100, Math.max(0, value)))} max={100} step={1} suffix="%" />
          <InputField label="عدد المستثمرين" value={inputs.investorCount} onChange={(value) => update('investorCount', Math.max(0, Math.floor(value)))} suffix="مستثمر" />
        </div>
      </details>
      </section>

      {/* Zone 3: Results */}
      <section aria-labelledby="projection-results">
        {/* Two big profit cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">صافي الربح ({inputs.projectionMonths} شهرًا)</p>
            </div>
            <p className={`mt-2 text-3xl font-black ${totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(totalProfit)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">متوسط الربح شهريًا</p>
            </div>
            <p className={`mt-2 text-3xl font-black ${avgMonthlyProfit >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>{money(avgMonthlyProfit)}</p>
          </div>
        </div>

        {/* Investor breakdown (only if investors exist) */}
        {hasInvestors && (
          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300">إجمالي حصة المستثمرين</p>
                <p className="mt-1 text-xl font-black text-blue-600 dark:text-blue-400">{money(projection.totals.investorShare)}</p>
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300">متوسط لكل مستثمر شهريًا</p>
                <p className="mt-1 text-xl font-black text-blue-600 dark:text-blue-400">{money(perInvestorMonthly)}</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] font-bold text-blue-600 dark:text-blue-400">حصة المؤسس: {100 - inputs.investorOwnership}% — {money(projection.totals.founderShare)}</p>
          </div>
        )}

        {/* Month-by-month table — visible by default */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-3 py-3 font-black">الشهر</th>
                <th className="px-3 py-3 font-black">الجراجات</th>
                <th className="px-3 py-3 font-black">الإيراد الصافي</th>
                <th className="px-3 py-3 font-black">المصروفات</th>
                <th className="px-3 py-3 font-black">صافي الربح</th>
              </tr>
            </thead>
            <tbody>
              {projection.rows.map((row) => (
                <tr key={row.month} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 font-black text-slate-900 dark:text-white">{row.month}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{row.garages.toLocaleString('en-US')}</td>
                  <td className="px-3 py-3 font-bold text-slate-900 dark:text-white">{money(row.netRevenue)}</td>
                  <td className="px-3 py-3 font-bold text-amber-600 dark:text-amber-400">{money(row.totalCosts)}</td>
                  <td className={`px-3 py-3 font-black ${row.operatingProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(row.operatingProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Acquisition cost info */}
        <p className="mt-3 text-[10px] font-bold text-slate-400">
          يُخصم تلقائيًا {ACQUISITION_DISCOUNT_PER_NEW_GARAGE} رصيد ({money(ACQUISITION_DISCOUNT_PER_NEW_GARAGE * inputs.pricePerCredit)}) لكل جراج جديد في شهره الأول: {TRIAL_CREDITS_PER_NEW_GARAGE} رصيد تجريبي + {REFERRAL_CREDITS_PER_NEW_GARAGE} رصيد إحالة.
        </p>
      </section>
    </section>
  );
};
