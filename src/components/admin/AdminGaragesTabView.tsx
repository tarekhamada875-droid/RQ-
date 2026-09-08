import React from 'react';
import { Plus, Search, ChevronRight, ChevronLeft } from 'lucide-react';
import { Garage } from '../../types';

interface AdminGaragesTabViewProps {
  displayedGarages: Garage[];
  effectiveGarages: Garage[];
  adminSearch: string;
  setAdminSearch: (s: string) => void;
  currentSupervisor: any;
  onSelectGarage: (garage: Garage) => void;
  onOpenAddGarage: () => void;
  adminGaragePageError: any;
  adminGarageHasMore: boolean;
  isAdminGaragePageLoading: boolean;
  loadAdminGaragePage: (reset?: boolean) => void;
  adminLang: 'ar' | 'en';
  t: (key: string) => string;
}

export const AdminGaragesTabView: React.FC<AdminGaragesTabViewProps> = ({
  displayedGarages,
  effectiveGarages,
  adminSearch,
  setAdminSearch,
  currentSupervisor,
  onSelectGarage,
  onOpenAddGarage,
  adminGaragePageError,
  adminGarageHasMore,
  isAdminGaragePageLoading,
  loadAdminGaragePage,
  adminLang,
  t,
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
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">({displayedGarages.length})</span>
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
          <div className="p-3 sm:p-4 flex flex-col gap-2 min-h-[160px]">
            {displayedGarages.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-bold text-xs">
                {t('لا توجد جراجات مطابقة للبحث')}
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
          </div>
          {adminGaragePageError && effectiveGarages.length === 0 && (
            <div className="p-4 flex flex-col items-center gap-2 border-t border-slate-100 dark:border-slate-800 text-center">
              <span className="text-xs font-bold text-red-500 dark:text-red-400">
                {t('تعذر تحميل قائمة الجراجات.')}
              </span>
              <button
                type="button"
                onClick={() => void loadAdminGaragePage(true)}
                disabled={isAdminGaragePageLoading}
                className="px-5 py-2 text-xs font-black text-white bg-slate-900 dark:bg-emerald-600 rounded-xl disabled:opacity-60"
              >
                {t('إعادة المحاولة')}
              </button>
            </div>
          )}

          {!adminGaragePageError && adminGarageHasMore && (
            <div className="p-4 flex justify-center border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => void loadAdminGaragePage()}
                disabled={isAdminGaragePageLoading}
                className="px-6 py-2.5 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs transition-colors shadow-sm active:scale-95"
              >
                {isAdminGaragePageLoading ? t('جارٍ التحميل...') : t('تحميل المزيد')}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
