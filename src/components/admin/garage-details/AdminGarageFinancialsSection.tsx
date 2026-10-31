import { memo } from 'react';
import { Users } from 'lucide-react';
import { Garage } from '../../../types';

interface AdminGarageFinancialsSectionProps {
  garage: Garage;
  t: (key: string) => string;
  onToggleMonthlySubscribers: () => Promise<void>;
}

export const AdminGarageFinancialsSection = memo(({
  garage,
  t,
  onToggleMonthlySubscribers,
}: AdminGarageFinancialsSectionProps) => {
  return (
    <section className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>{t('خدمة المشتركين الشهريين / الإيواء')}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
            {t('يتيح هذا الخيار إدارة المشتركين الشهريين دون رسوم اشتراك منفصلة؛ ويتم تطبيق قواعد الرصيد المعتمدة على دخول المركبات العادية.')}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleMonthlySubscribers}
          className={`w-14 h-8 rounded-full p-1 transition-all duration-300 relative shrink-0 cursor-pointer ${
            garage.hasMonthlySubscribers ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-800'
          }`}
          aria-label={garage.hasMonthlySubscribers ? 'تعطيل المشتركين الشهريين' : 'تفعيل المشتركين الشهريين'}
        >
          <div className={`w-6 h-6 bg-white rounded-full transition-all duration-300 transform ${
            garage.hasMonthlySubscribers ? '-translate-x-6' : 'translate-x-0'
          }`} />
        </button>
      </div>
    </section>
  );
});
