import React, { useState, useEffect } from 'react';
import { 
  Save, 
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Coins,
  UserCheck
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
    referralFeePerRenewal: 50,
    delegatePackageCommissions: {
      daily: 5,
      weekly: 15,
      biweekly: 25,
      monthly: 50
    },
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
          const fetchedCommissions = fetchedConfig.delegatePackageCommissions || {};
          const fallbackMonthly = fetchedConfig.referralFeePerRenewal !== undefined && !isNaN(Number(fetchedConfig.referralFeePerRenewal))
            ? Math.max(0, Math.floor(Number(fetchedConfig.referralFeePerRenewal)))
            : 50;

          setConfig(prev => ({ 
            ...prev, 
            ...fetchedConfig,
            referralFeePerRenewal: fallbackMonthly,
            delegatePackageCommissions: {
              daily: fetchedCommissions.daily !== undefined && !isNaN(Number(fetchedCommissions.daily)) ? Math.max(0, Math.floor(Number(fetchedCommissions.daily))) : 5,
              weekly: fetchedCommissions.weekly !== undefined && !isNaN(Number(fetchedCommissions.weekly)) ? Math.max(0, Math.floor(Number(fetchedCommissions.weekly))) : 15,
              biweekly: fetchedCommissions.biweekly !== undefined && !isNaN(Number(fetchedCommissions.biweekly)) ? Math.max(0, Math.floor(Number(fetchedCommissions.biweekly))) : 25,
              monthly: fetchedCommissions.monthly !== undefined && !isNaN(Number(fetchedCommissions.monthly)) ? Math.max(0, Math.floor(Number(fetchedCommissions.monthly))) : fallbackMonthly,
            }
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
      const dailyComm = config.delegatePackageCommissions?.daily !== undefined && !isNaN(Number(config.delegatePackageCommissions.daily)) && Number(config.delegatePackageCommissions.daily) >= 0
        ? Math.floor(Number(config.delegatePackageCommissions.daily))
        : 5;
      const weeklyComm = config.delegatePackageCommissions?.weekly !== undefined && !isNaN(Number(config.delegatePackageCommissions.weekly)) && Number(config.delegatePackageCommissions.weekly) >= 0
        ? Math.floor(Number(config.delegatePackageCommissions.weekly))
        : 15;
      const biweeklyComm = config.delegatePackageCommissions?.biweekly !== undefined && !isNaN(Number(config.delegatePackageCommissions.biweekly)) && Number(config.delegatePackageCommissions.biweekly) >= 0
        ? Math.floor(Number(config.delegatePackageCommissions.biweekly))
        : 25;
      const monthlyComm = config.delegatePackageCommissions?.monthly !== undefined && !isNaN(Number(config.delegatePackageCommissions.monthly)) && Number(config.delegatePackageCommissions.monthly) >= 0
        ? Math.floor(Number(config.delegatePackageCommissions.monthly))
        : 50;

      await firestoreService.updateSystemConfig({
        defaultTrialDays: Number(config.defaultTrialDays) || 15,
        warningDaysThreshold: Number(config.warningDaysThreshold) || 3,
        monthlySubscribersFlatFee: Number(config.monthlySubscribersFlatFee) || 500,
        monthlySubscribersSurchargePercent: 25,
        referralFeePerRenewal: monthlyComm,
        delegatePackageCommissions: {
          daily: dailyComm,
          weekly: weeklyComm,
          biweekly: biweeklyComm,
          monthly: monthlyComm
        },
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
                {t('المدة التي تُمنح للجراجات الجديدة عند اختيار تفعيل التجربة المجانية (افتراضياً 15 يوماً)')}
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
                {t('يظهر شريط تحذيري للجراج والمندوب عندما يتبقى هذا العدد من الأيام (افتراضياً 3 أيام)')}
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
                {t('المبلغ الثابت المضاف تلقائياً عند تفعيل خيار المشتركين الشهريين للجراج')} ({t('افتراضياً')} 500 {t('ج.م')})
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Delegate Commissions per Package */}
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-500" />
                <span>{t('عمولات المناديب لكل باقة (تجديد/شحن)')}</span>
              </h3>
              <p className="text-xs font-bold text-slate-400 mt-1">
                {t('تُضاف هذه العمولات تلقائياً إلى سعر كل باقة للجراجات التابعة لمناديب فقط، وتُحوّل إلى رصيد وأرباح المندوب عند موافقة الإدارة على التجديد.')}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-black self-start sm:self-auto border border-emerald-200 dark:border-emerald-800/50">
              <UserCheck className="w-3.5 h-3.5" />
              <span>{t('خاصة بالجراجات التابعة لمندوب فقط')}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Daily (1 Day) */}
            <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  {t('عمولة الباقة اليومية (1 يوم)')}
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  1 {t('يوم')}
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.delegatePackageCommissions?.daily ?? 5}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/\D/g, '');
                    const numVal = rawVal === '' ? 0 : Math.max(0, parseInt(rawVal, 10));
                    setConfig({
                      ...config,
                      delegatePackageCommissions: {
                        ...(config.delegatePackageCommissions || {}),
                        daily: numVal
                      }
                    });
                  }}
                  className="w-full p-3.5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  required
                />
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                  ج.م
                </span>
              </div>
            </div>

            {/* Weekly (7 Days) */}
            <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  {t('عمولة الباقة الأسبوعية (7 أيام)')}
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                  7 {t('أيام')}
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.delegatePackageCommissions?.weekly ?? 15}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/\D/g, '');
                    const numVal = rawVal === '' ? 0 : Math.max(0, parseInt(rawVal, 10));
                    setConfig({
                      ...config,
                      delegatePackageCommissions: {
                        ...(config.delegatePackageCommissions || {}),
                        weekly: numVal
                      }
                    });
                  }}
                  className="w-full p-3.5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  required
                />
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                  ج.م
                </span>
              </div>
            </div>

            {/* Bi-weekly (15 Days) */}
            <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  {t('عمولة باقة النصف شهر (15 يوم)')}
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                  15 {t('يوم')}
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.delegatePackageCommissions?.biweekly ?? 25}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/\D/g, '');
                    const numVal = rawVal === '' ? 0 : Math.max(0, parseInt(rawVal, 10));
                    setConfig({
                      ...config,
                      delegatePackageCommissions: {
                        ...(config.delegatePackageCommissions || {}),
                        biweekly: numVal
                      }
                    });
                  }}
                  className="w-full p-3.5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  required
                />
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                  ج.م
                </span>
              </div>
            </div>

            {/* Monthly (30 Days) */}
            <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  {t('عمولة الباقة الشهرية (30 يوم)')}
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  30 {t('يوم')}
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={config.delegatePackageCommissions?.monthly ?? 50}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/\D/g, '');
                    const numVal = rawVal === '' ? 0 : Math.max(0, parseInt(rawVal, 10));
                    setConfig({
                      ...config,
                      referralFeePerRenewal: numVal,
                      delegatePackageCommissions: {
                        ...(config.delegatePackageCommissions || {}),
                        monthly: numVal
                      }
                    });
                  }}
                  className="w-full p-3.5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                  required
                />
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                  ج.م
                </span>
              </div>
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
