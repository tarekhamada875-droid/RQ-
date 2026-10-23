import React from 'react';
import { Plus, Search, ChevronRight, ChevronLeft, Building2, Loader2, RefreshCw } from 'lucide-react';
import { Garage } from '../../types';

interface AdminGaragesTabViewProps {
  displayedGarages: Garage[];
  adminSearch: string;
  setAdminSearch: (s: string) => void;
  currentSupervisor: any;
  onSelectGarage: (garage: Garage) => void;
  onOpenAddGarage: () => void;
  adminLang: 'ar' | 'en';
  t: (key: string) => string;
  hasMore?: boolean;
  isLoading?: boolean;
  hasError?: boolean;
  onLoadMore?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export const AdminGaragesTabView: React.FC<AdminGaragesTabViewProps> = ({
  displayedGarages,
  adminSearch,
  setAdminSearch,
  currentSupervisor,
  onSelectGarage,
  onOpenAddGarage,
  adminLang,
  t,
  hasMore = false,
  isLoading = false,
  hasError = false,
  onLoadMore,
  onRefresh,
}) => {
  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Add Garage Button - Hidden for Supervisors */}
      {!currentSupervisor && (
        <button
          onClick={onOpenAddGarage}
          className="w-full bg-slate-900 dark:bg-emerald-600 text-white dark:text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-4 hover:opacity-90 transition-all outline-none active:scale-[0.98]"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span>{t('إضافة جراج جديد')}</span>
        </button>
      )}

      <section className="w-full">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-4">
            <div className={`flex flex-col sm:flex-row justify-between items-center gap-4 ${adminLang === 'en' ? 'sm:flex-row-reverse' : ''}`}>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{t('قائمة الجراجات')}</span>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className={`absolute ${adminLang === 'en' ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-3.5 h-3.5`} />
                <input 
                  type="text" 
                  placeholder={t('بحث حسب الاسم أو الهاتف...')}
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 ${adminLang === 'en' ? 'pl-8 pr-4' : 'pr-8 pl-4'} text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-emerald-500 font-medium transition-all`}
                  dir="auto"
                />
              </div>
            </div>
          </div>
          {hasError && (
            <div className="px-4 pb-3 flex items-center justify-between gap-3 text-xs font-bold text-rose-600 dark:text-rose-400">
              <span>{t('تعذر تحميل قائمة الجراجات.')}</span>
              {onRefresh && <button type="button" onClick={() => void onRefresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 px-3 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"><RefreshCw className="w-3.5 h-3.5" /> {t('إعادة المحاولة')}</button>}
            </div>
          )}
          <div className="p-3 sm:p-4 flex flex-col gap-2 min-h-[160px]">
            {displayedGarages.length === 0 ? (
              <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <Building2 className="w-16 h-16 text-emerald-500/30 dark:text-emerald-500/20 mx-auto mb-4" />
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">{t('لا توجد جراجات مسجلة')}</h3>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-sm max-w-sm mx-auto">
                  {t('لم يتم إضافة أي جراجات في النظام حتى الآن أو لا توجد جراجات مطابقة لخيارات البحث الخاصة بك.')}
                </p>
              </div>
            ) : (
              displayedGarages.map((g) => {
                return (
                  <div 
                    key={g.id} 
                    onClick={() => {
                      if (currentSupervisor) return;
                      onSelectGarage(g);
                    }}
                    className={`w-full bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition-all ${
                      currentSupervisor 
                        ? 'cursor-default select-none' 
                        : 'cursor-pointer active:scale-[0.99] group'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="text-mobile-wrap font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm leading-snug">
                        {g.name}
                      </span>
                      {g.isLocked && (
                        <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md bg-red-500/10 dark:bg-red-500/25 text-red-500 dark:text-red-400 border border-red-500/20 leading-none">
                          {t('مغلق')}
                        </span>
                      )}
                    </div>
                    {!currentSupervisor && (
                      <div className="shrink-0 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                        {adminLang === 'en' ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronLeft className="w-4 h-4" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {hasMore && onLoadMore && (
              <button type="button" disabled={isLoading} onClick={() => void onLoadMore()} className="w-full min-h-11 mt-2 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isLoading ? t('جاري تحميل المزيد...') : t('تحميل المزيد من الجراجات')}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
