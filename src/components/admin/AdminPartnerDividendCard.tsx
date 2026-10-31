import React, { useMemo, useState } from 'react';
import { Calculator, RotateCcw, Users, Info } from 'lucide-react';

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

  const totalProfit = projection.totals.operatingProfit;
  const avgMonthlyProfit = inputs.projectionMonths > 0 ? totalProfit / inputs.projectionMonths : 0;
  const hasInvestors = inputs.investorOwnership > 0 && inputs.investorCount > 0;
  const perInvestorMonthly = hasInvestors
    ? (projection.totals.investorShare / inputs.projectionMonths) / inputs.investorCount
    : 0;
  const endOfMonthGarages = projection.rows.length > 0
    ? projection.rows[projection.rows.length - 1].garages
    : inputs.currentGarages;

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

      {/* Two-column layout: assumptions on the left, hero + explanation on the right.
          Stacks on mobile (assumptions first, then hero). */}
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* LEFT COLUMN — ASSUMPTIONS (vertical stack) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h4 className="mb-3 text-sm font-black text-slate-900 dark:text-white">الافتراضات</h4>
          <div className="space-y-3.5">
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

          {/* Investor settings — discrete link-style disclosure */}
          <details className="mt-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-black text-slate-600 marker:hidden dark:text-slate-300">
              <span className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> إعدادات المستثمرين
                <span className="text-[10px] font-bold text-slate-400">(اتركها صفر إذا أنت المالك الوحيد)</span>
              </span>
            </summary>
            <div className="space-y-3.5 border-t border-slate-200 p-4 dark:border-slate-800">
              <InputField label="نسبة ملكية المستثمرين" value={inputs.investorOwnership} onChange={(value) => update('investorOwnership', Math.min(100, Math.max(0, value)))} max={100} step={1} suffix="%" />
              <InputField label="عدد المستثمرين" value={inputs.investorCount} onChange={(value) => update('investorCount', Math.max(0, Math.floor(value)))} suffix="مستثمر" />
            </div>
          </details>
        </section>

        {/* RIGHT COLUMN — HERO + HOW IT'S CALCULATED */}
        <div className="space-y-5">
          {/* Hero — the punchline */}
          <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-slate-900">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              صافي الربح خلال {inputs.projectionMonths} شهرًا
            </p>
            <p
              data-testid="hero-total-profit"
              className={`mt-2 text-4xl sm:text-5xl font-black tracking-tight ${totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
            >
              {money(totalProfit)}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span>
                متوسط شهريًا:{' '}
                <span className={avgMonthlyProfit >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}>
                  {money(avgMonthlyProfit)}
                </span>
              </span>
              <span>
                جراجات نهاية الفترة:{' '}
                <span className="text-slate-900 dark:text-white">{endOfMonthGarages.toLocaleString('en-US')}</span>
              </span>
            </div>

            {/* Investor breakdown — inline under hero, only when investors exist */}
            {hasInvestors && (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-emerald-200/60 pt-4 text-xs font-bold dark:border-emerald-900/60">
                <span className="text-blue-700 dark:text-blue-300">
                  حصة المستثمرين ({inputs.investorOwnership}%):{' '}
                  <span className="text-blue-600 dark:text-blue-400">{money(projection.totals.investorShare)}</span>
                </span>
                <span className="text-blue-700 dark:text-blue-300">
                  متوسط لكل مستثمر شهريًا:{' '}
                  <span className="text-blue-600 dark:text-blue-400">{money(perInvestorMonthly)}</span>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  حصة المؤسس ({100 - inputs.investorOwnership}%):{' '}
                  <span className="text-slate-900 dark:text-white">{money(projection.totals.founderShare)}</span>
                </span>
              </div>
            )}
          </div>

          {/* How it's calculated — disclosure */}
          <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <summary className="cursor-pointer list-none marker:hidden">
              <span className="flex items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-300">
                <Info className="h-3.5 w-3.5" /> كيف تُحسب هذه الأرقام؟
              </span>
            </summary>
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-[11px] font-bold leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <p>
                <span className="text-slate-700 dark:text-slate-200">الإيراد الشهري للجراج:</span>{' '}
                {inputs.carsPerDayPerGarage} سيارة × {inputs.workingDaysPerMonth} يوم × {inputs.pricePerCredit} ج.م ={' '}
                <span className="text-slate-900 dark:text-white">{money(creditsPerGaragePerMonth * inputs.pricePerCredit)}</span>
              </p>
              <p>
                <span className="text-slate-700 dark:text-slate-200">عمولة المندوب:</span>{' '}
                {money(inputs.delegateCommissionPerGarage)} ثابتة لكل جراج جديد يُضاف عبر الإحالة.
              </p>
              <p>
                <span className="text-slate-700 dark:text-slate-200">تكلفة اكتساب كل جراج جديد:</span>{' '}
                {ACQUISITION_DISCOUNT_PER_NEW_GARAGE} رصيد ({money(ACQUISITION_DISCOUNT_PER_NEW_GARAGE * inputs.pricePerCredit)}) —
                {TRIAL_CREDITS_PER_NEW_GARAGE} رصيد تجريبي + {REFERRAL_CREDITS_PER_NEW_GARAGE} رصيد إحالة،
                تُخصم من إيراد شهره الأول فقط.
              </p>
              <p>
                <span className="text-slate-700 dark:text-slate-200">التكاليف الثابتة:</span>{' '}
                {money(inputs.monthlyFixedCosts)} شهريًا (بنية تحتية + أدوات ذكاء).
              </p>
              <p>
                <span className="text-slate-700 dark:text-slate-200">صافي الربح =</span>{' '}
                الإيراد الصافي − عمولة المندوب − التكاليف الثابتة.
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
};
