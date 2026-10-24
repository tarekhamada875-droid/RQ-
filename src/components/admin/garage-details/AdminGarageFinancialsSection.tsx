import { memo, useState } from 'react';
import { Users, Gift } from 'lucide-react';
import { Garage } from '../../../types';

interface AdminGarageFinancialsSectionProps {
  garage: Garage;
  t: (key: string) => string;
  onToggleMonthlySubscribers: () => Promise<void>;
  allGarages: Garage[];
  onReferredByChange: (refId: string) => Promise<void>;
}

export const AdminGarageFinancialsSection = memo(({
  garage,
  t,
  onToggleMonthlySubscribers,
  allGarages,
  onReferredByChange,
}: AdminGarageFinancialsSectionProps) => {
  const [isEditingReferrer, setIsEditingReferrer] = useState(false);
  const referringGarage = allGarages.find(g => g.id === garage.referredByGarageId);
  const referredGarages = allGarages.filter(g => g.referredByGarageId === garage.id);

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

      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Gift className="w-4 h-4 text-emerald-500" />
            <span>{t('نظام مكافآت الإحالة')}</span>
          </h3>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 px-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">{t('المُرشِّح:')}</span>
              {referringGarage ? (
                <span className="font-bold text-slate-900 dark:text-white">
                  {referringGarage.name}
                  {referringGarage.phone ? <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] mr-1.5 font-normal">({referringGarage.phone})</span> : null}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">{t('غير مُرشَّح من جراج آخر (مباشر)')}</span>
              )}
            </div>
            {!isEditingReferrer && (
              <button type="button" onClick={() => setIsEditingReferrer(true)} className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-bold hover:underline px-2 py-1 rounded transition-colors cursor-pointer">
                {t('تعديل')}
              </button>
            )}
          </div>

          {isEditingReferrer && (
            <div className="flex items-center gap-2 pt-1 pb-1">
              <select
                value={garage.referredByGarageId || ''}
                onChange={async (event) => {
                  await onReferredByChange(event.target.value);
                  setIsEditingReferrer(false);
                }}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                autoFocus
              >
                <option value="">{t('غير مُرشَّح من جراج آخر (مباشر)')}</option>
                {allGarages.filter(g => g.id !== garage.id && g.status !== 'pending').map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.phone || 'بدون هاتف'})</option>
                ))}
              </select>
              <button type="button" onClick={() => setIsEditingReferrer(false)} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer transition-colors">
                {t('إغلاق')}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between py-1 px-1 border-t border-slate-50 dark:border-slate-800/60 pt-2.5">
            <span className="text-slate-500 dark:text-slate-400 font-medium">{t('الإحالات التابعة:')}</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">{referredGarages.length} {t('جراج')}</span>
          </div>

          {referredGarages.length > 0 && (
            <div className="pt-1 space-y-1">
              {referredGarages.map(referredGarage => (
                <div key={referredGarage.id} className="flex items-center justify-between text-[11px] py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300">
                  <span className="font-medium">{referredGarage.name}</span>
                  {referredGarage.phone && <span className="text-slate-400 font-mono text-[10px]">{referredGarage.phone}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
});
