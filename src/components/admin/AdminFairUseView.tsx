import React, { useState } from 'react';
import { Zap, RefreshCw, Plus, CheckCircle } from 'lucide-react';
import { Garage } from '../../types';
import { adminService } from '../../services/adminService';

interface AdminFairUseViewProps {
  garages?: Garage[];
  unlimitedGarages: Garage[];
  onSelectGarage?: (garage: Garage) => void;
  onExtendAllowance?: (garageId: string) => void;
  t: (key: string) => string;
}

export const AdminFairUseView: React.FC<AdminFairUseViewProps> = ({
  unlimitedGarages,
  onSelectGarage,
  onExtendAllowance,
  t,
}) => {
  const [extendingId, setExtendingId] = useState<string | null>(null);

  const handleExtend = async (garage: Garage) => {
    try {
      setExtendingId(garage.id);
      if (onExtendAllowance) {
        onExtendAllowance(garage.id);
      } else {
        await adminService.adminExtendFairUse(garage.id);
      }
    } catch (err) {
      console.error('Failed to extend fair use:', err);
    } finally {
      setExtendingId(null);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-amber-500/10 dark:bg-amber-500/15 border-2 border-amber-500/20 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-sm shrink-0">
            <Zap className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              {t('مراقبة الاستخدام العادل للباقات المفتوحة')} ({unlimitedGarages.length})
            </h2>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1">
              {t('نظام التمديد التلقائي الذكي يعمل بالخلفية بدون إظهار أي قيود للمشتركين')}
            </p>
          </div>
        </div>
      </div>

      {unlimitedGarages.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="font-bold text-slate-700 dark:text-slate-300">
            {t('لا توجد جراجات مشتركة في باقات غير محدودة حالياً')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {unlimitedGarages.map((g) => {
            const fu = g.unlimitedFairUse;
            const carsCount = fu?.cycleCarsCount || 0;
            const currentAllowance = fu?.currentAllowance || (fu?.tierType === 'daily' ? 200 : 1000);
            const maxAllowance = fu?.maxAllowance || (fu?.tierType === 'daily' ? 400 : 5000);
            const isNear = Boolean(fu?.isNearMaxLimit || (maxAllowance - carsCount <= (fu?.threshold || 20)));
            const isMaxReached = Boolean(fu?.isMaxLimitReached || carsCount >= maxAllowance);

            return (
              <div 
                key={g.id}
                className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border transition-all shadow-sm flex flex-col justify-between gap-4 ${
                  isMaxReached 
                    ? 'border-rose-500/50 dark:border-rose-500/40 bg-rose-50/20' 
                    : isNear 
                      ? 'border-amber-500/50 dark:border-amber-500/40 bg-amber-50/20' 
                      : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 
                      onClick={() => onSelectGarage && onSelectGarage(g)}
                      className="text-sm font-black text-slate-900 dark:text-white hover:text-amber-500 transition-colors cursor-pointer truncate"
                    >
                      {g.name}
                    </h4>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{g.phone}</p>
                  </div>

                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    isMaxReached 
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400' 
                      : isNear 
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' 
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                  }`}>
                    {isMaxReached ? t('بلغ السقف الأقصى') : isNear ? t('يقترب من السقف') : t('سلس ومستقر')}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-500 dark:text-slate-400">{t('الاستهلاك الحالي')}:</span>
                    <span className="font-black text-slate-900 dark:text-white">
                      {carsCount} / {currentAllowance} <span className="text-[10px] text-slate-400 font-sans">({t('سقف')} {maxAllowance})</span>
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        isMaxReached ? 'bg-rose-500' : isNear ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.round((carsCount / maxAllowance) * 100))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>{t('مرات التمديد التلقائي')}: <strong className="text-slate-700 dark:text-slate-300 font-mono">{fu?.extensionsCount || 0}</strong></span>
                    <span className="font-bold">{fu?.tierType === 'daily' ? t('باقة يومية') : t('باقة شهرية')}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={extendingId === g.id || currentAllowance >= maxAllowance}
                  onClick={() => handleExtend(g)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-black rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {extendingId === g.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 stroke-[3]" />
                  )}
                  <span>{t('تمديد استثنائي')} (+{fu?.stepAmount || (fu?.tierType === 'daily' ? 200 : 1000)} {t('سيارة')})</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
