import { CheckCircle2, ChevronDown, Clock, Loader2, Settings } from 'lucide-react';
import { FastInput } from '../ui/FastInput';

interface RateCheck {
  allowed: boolean;
  daysRemaining: number;
  nextAllowedDate: Date | null;
}

interface AdminGarageSettingsSectionProps {
  isZone3Open: boolean;
  setIsZone3Open: (open: boolean) => void;
  rateCheck: RateCheck;
  hourlyRateInput: string;
  setHourlyRateInput: (value: string) => void;
  overnightRateInput: string;
  setOvernightRateInput: (value: string) => void;
  hasRateChanges: boolean;
  isSavingRates: boolean;
  handleSaveRates: () => Promise<void> | void;
}

export const AdminGarageSettingsSection = ({
  isZone3Open,
  setIsZone3Open,
  rateCheck,
  hourlyRateInput,
  setHourlyRateInput,
  overnightRateInput,
  setOvernightRateInput,
  hasRateChanges,
  isSavingRates,
  handleSaveRates,
}: AdminGarageSettingsSectionProps) => {
  return (
    <>
          {/* ================= ZONE 3: SETTINGS (COLLAPSIBLE ACCORDION) ================= */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden ">
            {/* Accordion Header */}
            <button
              onClick={() => setIsZone3Open(!isZone3Open)}
              className="w-full p-5 flex items-center justify-between text-right cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center justify-center font-black">
                  <Settings className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {'الإعدادات والتعريفة'}
                </h3>
              </div>
  
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">
                  {isZone3Open ? 'إخفاء' : 'عرض'}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-400 ${isZone3Open ? 'rotate-180' : ''}`} />
              </div>
            </button>
  
            {/* Accordion Content */}
            {isZone3Open && (
              <div className="p-6 border-t border-slate-100 dark:border-slate-800 space-y-6 ">
                {/* Pricing Rates Configuration */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-4">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="w-4 h-4 text-emerald-600" />
                    <span>{'تعريفة أسعار الركنة'}</span>
                  </h4>
  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-600 dark:text-slate-400 text-center">
                        {'سعر الساعة (ج.م)'}
                      </label>
                      <FastInput
                        type="text"
                        inputMode="numeric"
                        disabled={!rateCheck.allowed}
                        defaultValue={hourlyRateInput}
                        onCommit={(v) => setHourlyRateInput(v.replace(/\D/g, ''))}
                        onLiveValue={(v) => setHourlyRateInput(v.replace(/\D/g, ''))}
                        mask={(v) => v.replace(/\D/g, '')}
                        className={`w-full bg-white dark:bg-slate-800 border-2 rounded-xl px-4 py-3 text-lg font-black text-slate-900 dark:text-white text-center outline-none font-mono ${
                          !rateCheck.allowed
                            ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900'
                            : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-600 dark:text-slate-400 text-center">
                        {'سعر المبيت (ج.م)'}
                      </label>
                      <FastInput
                        type="text"
                        inputMode="numeric"
                        disabled={!rateCheck.allowed}
                        defaultValue={overnightRateInput}
                        onCommit={(v) => setOvernightRateInput(v.replace(/\D/g, ''))}
                        onLiveValue={(v) => setOvernightRateInput(v.replace(/\D/g, ''))}
                        mask={(v) => v.replace(/\D/g, '')}
                        className={`w-full bg-white dark:bg-slate-800 border-2 rounded-xl px-4 py-3 text-lg font-black text-slate-900 dark:text-white text-center outline-none font-mono ${
                          !rateCheck.allowed
                            ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900'
                            : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                    </div>
                  </div>
  
                  {!rateCheck.allowed ? (
                    <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-bold">
                      <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        {'تعديل التعريفة مقفل: مسموح بتعديل السعر مرة واحدة كل 30 يوماً. متبقي'} <strong className="font-mono text-amber-900 dark:text-amber-100 px-1">{rateCheck.daysRemaining}</strong> {'يوم للإتاحة القادمة.'}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 text-center">
                      {'ملاحظة: السعر الجديد يُطبق على جميع العمليات فوراً، وتُقفل إمكانية التعديل لمدة 30 يوماً.'}
                    </p>
                  )}
  
                  <button 
                    type="button"
                    disabled={!rateCheck.allowed || !hasRateChanges || isSavingRates}
                    onClick={handleSaveRates}
                    className={`w-full py-3.5 text-center rounded-xl font-black text-xs flex items-center justify-center gap-2 ${
                      rateCheck.allowed && hasRateChanges 
                        ? 'bg-emerald-600 text-white cursor-pointer' 
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    {isSavingRates ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{'جاري حفظ التعديل...'}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{'حفظ تعديل التعريفة'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>
    </>
  );
};
