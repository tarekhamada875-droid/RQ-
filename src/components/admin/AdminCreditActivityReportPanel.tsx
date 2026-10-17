import React, { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { adminService } from '../../services/adminService';
import type { FinancialReportData } from '../../services/adminService';

interface Props { adminLang: 'ar' | 'en'; }

function currentUtcMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export const AdminCreditActivityReportPanel: React.FC<Props> = ({ adminLang }) => {
  const english = adminLang === 'en';
  const [report, setReport] = useState<FinancialReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    const range = currentUtcMonthRange();
    setLoading(true);
    setError(false);
    adminService.getFinancialReport(range)
      .then((value) => { if (active) setReport(value); })
      .catch(() => { if (active) { setReport(null); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshToken]);

  const activity = report?.creditActivity;
  const format = (value: number | null | undefined) => Number(value || 0).toLocaleString(english ? 'en-GB' : 'ar-EG');
  const rows = activity ? [
    { label: english ? 'Paid credits added' : 'الأرصدة المدفوعة المضافة', value: `${format(activity.paidCreditsGranted)} ${english ? 'credits' : 'رصيد'}` },
    { label: english ? 'Referral credits awarded' : 'أرصدة الإحالة الممنوحة', value: `${format(activity.referralCreditsGranted)} ${english ? 'credits' : 'رصيد'}` },
    { label: english ? 'Trial credits converted' : 'أرصدة التجربة المحولة', value: `${format(activity.trialCreditsGranted)} ${english ? 'credits' : 'رصيد'}` },
    { label: english ? 'Regular entries paid with credits' : 'دخول عادي باستخدام الأرصدة', value: `${format(activity.regularEntryCreditsConsumed)} ${english ? 'credits' : 'رصيد'}` },
    { label: english ? 'Regular entries paid with Trial credits' : 'دخول عادي بأرصدة التجربة', value: `${format(activity.regularEntryTrialCreditsConsumed)} ${english ? 'credits' : 'رصيد'}` },
    { label: english ? 'Subscriber renewals paid with credits' : 'تجديدات المشتركين بالأرصدة', value: `${format(activity.subscriberRenewalCreditsConsumed)} ${english ? 'credits' : 'رصيد'}` },
    { label: english ? 'Credits restored after corrections' : 'أرصدة أُعيدت بعد التصحيح', value: `${format(activity.restoredCredits)} ${english ? 'credits' : 'رصيد'}` },
    { label: english ? 'Older paid credits with no saved transfer amount' : 'أرصدة قديمة لا يوجد لها مبلغ تحويل مسجل', value: `${format(activity.paidCreditsWithoutEgpRecord)} ${english ? 'credits' : 'رصيد'}` },
  ] : [];

  return <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4" aria-label={english ? 'Prepaid credit financial report' : 'تقرير مالي لأرصدة الدخول'}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="font-black flex items-center gap-2"><BarChart3 className="w-4 h-4" />{english ? 'Prepaid payments and credit activity' : 'مدفوعات وأرصدة الدخول المسبقة'}</h3>
        <p className="text-xs text-slate-500 mt-1">{english ? 'Current calendar month. Money is shown in EGP; usage is shown in credits. These are not added together.' : 'الشهر الحالي. تُعرض الأموال بالجنيه ويُعرض الاستخدام بالأرصدة؛ ولا يتم جمع الوحدتين.'}</p>
      </div>
      <button type="button" onClick={() => setRefreshToken((value) => value + 1)} className="p-2 rounded-lg border" aria-label={english ? 'Refresh report' : 'تحديث التقرير'}><RefreshCw className="w-4 h-4" /></button>
    </div>
    {loading ? <p className="text-sm text-slate-500">{english ? 'Loading report…' : 'جارٍ تحميل التقرير…'}</p>
      : error ? <p role="alert" className="text-sm text-red-600">{english ? 'Could not load the report. Please refresh.' : 'تعذر تحميل التقرير. يرجى التحديث.'}</p>
        : report && activity ? <>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-4">
            <div className="text-xs font-bold text-emerald-800 dark:text-emerald-200">{english ? 'Verified money received for prepaid credits' : 'الأموال المستلمة والمؤكدة مقابل الأرصدة'}</div>
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{format(report.prepaidCreditPaymentsEgp)} {english ? 'EGP' : 'جنيه'}</div>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rows.map((row) => <div key={row.label} className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 flex items-center justify-between gap-3"><dt className="text-xs text-slate-600 dark:text-slate-300">{row.label}</dt><dd className="font-black text-sm text-slate-900 dark:text-white">{row.value}</dd></div>)}
          </dl>
        </> : <p role="alert" className="text-sm text-amber-700">{english ? 'Credit activity is not available for a delegate-only report.' : 'لا يتوفر نشاط الأرصدة في التقرير المخصص لمندوب واحد.'}</p>}
  </section>;
};
