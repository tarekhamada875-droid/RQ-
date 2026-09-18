import React from 'react';
import { BarChart3, CalendarDays, RefreshCw, Wallet, Users, TrendingDown } from 'lucide-react';
import { Delegate } from '../../types';
import { adminService, FinancialReportData } from '../../services/adminService';

interface Props {
  delegates: Delegate[];
  t: (key: string) => string;
}

const money = (value: number) => `${Number(value || 0).toLocaleString('ar-EG')} ج.م`;

function endOfSelectedDay(value: string): string | undefined {
  if (!value) return undefined;
  const end = new Date(`${value}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString();
}

export const AdminFinancialReportsView: React.FC<Props> = ({ delegates, t }) => {
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [delegateId, setDelegateId] = React.useState('');
  const [report, setReport] = React.useState<FinancialReportData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const loadReport = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminService.getFinancialReport({
        start: start ? `${start}T00:00:00.000Z` : undefined,
        end: endOfSelectedDay(end),
        delegateId: delegateId || undefined
      });
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل التقرير المالي');
    } finally {
      setLoading(false);
    }
  }, [delegateId, end, start]);

  React.useEffect(() => { void loadReport(); }, [loadReport]);

  const cards = report ? [
    { label: 'إجمالي الاشتراكات', value: report.grossRechargeTotal, icon: Wallet, color: 'text-blue-500' },
    { label: 'العمولات', value: report.commissionTotal, icon: Users, color: 'text-amber-500' },
    { label: 'المبالغ المستردة', value: report.refundTotal, icon: TrendingDown, color: 'text-rose-500' },
    { label: 'صافي إيراد الشركة', value: report.companyNetRevenue, icon: BarChart3, color: 'text-emerald-500' }
  ] : [];

  return (
    <section className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t('التقرير المالي')}</h2>
          <p className="text-sm font-bold text-slate-500 mt-1">تقارير مبنية على سجل العمليات والتسويات المعتمد</p>
        </div>
        <button type="button" onClick={() => void loadReport()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white dark:bg-amber-400 dark:text-slate-950 px-4 py-2.5 text-sm font-black disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث التقرير
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <label className="text-xs font-black text-slate-500">من تاريخ<input type="date" value={start} onChange={e => setStart(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm font-bold" /></label>
        <label className="text-xs font-black text-slate-500">إلى تاريخ<input type="date" value={end} onChange={e => setEnd(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm font-bold" /></label>
        <label className="text-xs font-black text-slate-500">المندوب<select value={delegateId} onChange={e => setDelegateId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm font-bold"><option value="">كل المندوبين</option>{delegates.map(delegate => <option key={delegate.id} value={delegate.id}>{delegate.name}</option>)}</select></label>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-4 text-sm font-black text-rose-700 dark:text-rose-300">{error}</div>}
      {loading && !report && <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center text-sm font-black text-slate-500">جاري تحميل التقرير...</div>}
      {report && <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map(card => { const Icon = card.icon; return <div key={card.label} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-black text-slate-500">{card.label}</span><Icon className={`w-5 h-5 ${card.color}`} /></div><strong className="block mt-4 text-2xl font-black text-slate-900 dark:text-white">{money(card.value)}</strong></div>; })}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5"><div className="flex items-center gap-2 text-sm font-black text-slate-500"><CalendarDays className="w-4 h-4" />إجمالي التسويات التاريخية</div><strong className="block mt-3 text-xl font-black text-slate-900 dark:text-white">{money(report.historicalSettledTotal)}</strong></div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5"><h3 className="text-sm font-black text-slate-500 mb-3">الأرصدة الحالية غير المسوّاة</h3>{Object.keys(report.currentUnsettledByDelegate).length === 0 ? <p className="text-sm font-bold text-slate-400">لا توجد أرصدة غير مسوّاة</p> : <div className="space-y-2">{Object.entries(report.currentUnsettledByDelegate).map(([id, amount]) => <div key={id} className="flex items-center justify-between text-sm font-black"><span>{delegates.find(delegate => delegate.id === id)?.name || id}</span><span className="text-emerald-500">{money(amount)}</span></div>)}</div>}</div>
        </div>
      </>}
    </section>
  );
};
