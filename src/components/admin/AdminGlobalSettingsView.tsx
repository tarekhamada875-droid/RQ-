import React, { useState, useEffect } from 'react';
import { 
  Save, 
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Coins
} from 'lucide-react';
import { SystemConfig } from '../../types';
import { firestoreService } from '../../services';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';

interface AdminGlobalSettingsViewProps {
  // Cleaned up - no showToast to avoid duplicate notifications
}

export const AdminGlobalSettingsView: React.FC<AdminGlobalSettingsViewProps> = () => {
  const { adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);

  const [config, setConfig] = useState<SystemConfig>({
    defaultTrialDays: 15,
    warningDaysThreshold: 3,
    monthlySubscribersFlatFee: 500,
    monthlySubscribersSurchargePercent: 25,
    referralFeePerRenewal: 100,
    delegateMonthlyCommission: 100,
    isMaintenanceMode: false,
    maintenanceMessage: ''
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const loadConfig = async () => {
      try {
        const fetchedConfig = await firestoreService.getSystemConfig();
        if (fetchedConfig) {
          const fetchedMonthly = fetchedConfig.delegateMonthlyCommission !== undefined && !isNaN(Number(fetchedConfig.delegateMonthlyCommission))
            ? Math.max(0, Math.floor(Number(fetchedConfig.delegateMonthlyCommission)))
            : (fetchedConfig.referralFeePerRenewal !== undefined && !isNaN(Number(fetchedConfig.referralFeePerRenewal))
              ? Math.max(0, Math.floor(Number(fetchedConfig.referralFeePerRenewal)))
              : 100);

          setConfig(prev => ({ 
            ...prev, 
            ...fetchedConfig,
            referralFeePerRenewal: fetchedMonthly,
            delegateMonthlyCommission: fetchedMonthly,
          }));
        }
      } catch (e) {
        console.error('Failed to load system config:', e);
      } finally {
        clearTimeout(timeout);
        setIsLoading(false);
      }
    };
    
    timeout = setTimeout(() => {
      setIsLoading(false);
    }, 5000);
    
    loadConfig();
    
    return () => clearTimeout(timeout);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const delegateComm = config.delegateMonthlyCommission !== undefined && !isNaN(Number(config.delegateMonthlyCommission)) && Number(config.delegateMonthlyCommission) >= 0
        ? Math.floor(Number(config.delegateMonthlyCommission))
        : (config.referralFeePerRenewal !== undefined && !isNaN(Number(config.referralFeePerRenewal)) && Number(config.referralFeePerRenewal) >= 0
          ? Math.floor(Number(config.referralFeePerRenewal))
          : 100);

      await firestoreService.updateSystemConfig({
        defaultTrialDays: Number(config.defaultTrialDays) || 15,
        warningDaysThreshold: Number(config.warningDaysThreshold) || 3,
        monthlySubscribersFlatFee: Number(config.monthlySubscribersFlatFee) || 500,
        monthlySubscribersSurchargePercent: 25,
        referralFeePerRenewal: delegateComm,
        delegateMonthlyCommission: delegateComm,
        isMaintenanceMode: !!config.isMaintenanceMode,
        maintenanceMessage: (config.maintenanceMessage || '').trim()
      });
      setStatusMessage({ type: 'success', text: t('تم حفظ وتحديث الإعدادات العامة للنظام بنجاح') });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: t('فشل حفظ الإعدادات العامة') });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-sm font-bold text-slate-400">{t('جاري تحميل الإعدادات...')}</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Subscriptions & Trials */}
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span>{t('فترات التجربة والتنبيهات')}</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                {t('مدة الفترة التجريبية المجانية الافتراضية (بالأيام)')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.defaultTrialDays}
                  onChange={(e) => setConfig({ ...config, defaultTrialDays: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  {t('يوم')}
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400">
                {t('المدة التي تُمنح للجراجات الجديدة عند اختيار تفعيل التجربة المجانية')}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                {t('حد التنبيه باقتراب انتهاء الاشتراك (بالأيام)')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.warningDaysThreshold}
                  onChange={(e) => setConfig({ ...config, warningDaysThreshold: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  {t('أيام أو أقل')}
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400">
                {t('يظهر شريط تحذيري للجراج والمندوب عندما يتبقى هذا العدد من الأيام')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                {t('رسوم المشتركين الشهريين الثابتة (ج.م)')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.monthlySubscribersFlatFee}
                  onChange={(e) => setConfig({ ...config, monthlySubscribersFlatFee: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  ج.م
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400">
                {t('المبلغ الثابت المضاف تلقائياً عند تفعيل خيار المشتركين الشهريين للجراج')}
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Delegate Monthly Commission */}
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-500" />
              <span>{t('عمولة المندوب الشهرية')}</span>
            </h3>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700 dark:text-slate-300 block text-right">
              {t('عمولة المندوب الشهرية عن كل جراج')}
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={config.delegateMonthlyCommission ?? config.referralFeePerRenewal ?? 100}
                onChange={(e) => {
                  const rawVal = e.target.value.replace(/\D/g, '');
                  const numVal = rawVal === '' ? 0 : Math.max(0, parseInt(rawVal, 10));
                  setConfig({
                    ...config,
                    referralFeePerRenewal: numVal,
                    delegateMonthlyCommission: numVal
                  });
                }}
                className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500 text-right pr-4 pl-24"
                required
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono pointer-events-none">
                ج.م / شهر
              </span>
            </div>
          </div>
        </div>

        {/* Status Feedback Banner */}
        {statusMessage && (
          <div className={`p-4 rounded-2xl border-2 flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span className="text-xs font-black">{statusMessage.text}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all shadow-lg active:scale-98 cursor-pointer disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>{t('جاري الحفظ...')}</span>
            </>
          ) : (
            <>
              <Save className="w-5 h-5 stroke-[2.5]" />
              <span>{t('حفظ وتطبيق التغييرات')}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default AdminGlobalSettingsView;
