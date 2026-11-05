import React, { useState, useEffect } from 'react';
import { Coins, Check, Loader2, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../api/apiClient';
import { adminService } from '../../services';

interface AdminCreditRateSettingsViewProps {
  onBack: () => void;
}

/**
 * Admin-only screen for setting the EGP-to-credit conversion rate.
 *
 * Default rate is 1 (1 EGP = 1 credit, the legacy behavior).
 * When admin changes the rate, only NEW credit grants use the new rate.
 * Existing balances and past ledger entries are immutable.
 *
 * The rate is global — applies to all garages.
 *
 * This screen does NOT require PIN re-verification — setting a rate is not a
 * security-sensitive operation. The admin is already authenticated.
 */
export const AdminCreditRateSettingsView: React.FC<AdminCreditRateSettingsViewProps> = ({ onBack }) => {
  const [creditRate, setCreditRate] = useState<string>('');
  const [originalRate, setOriginalRate] = useState<string>('');
  const [saveError, setSaveError] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ success?: boolean; config?: { creditRate?: number } }>('/api/system-config');
        if (!cancelled && data?.success && data.config) {
          const rate = data.config.creditRate ?? 1;
          const rateStr = String(rate);
          setCreditRate(rateStr);
          setOriginalRate(rateStr);
        }
      } catch (err) {
        console.warn('Failed to load creditRate:', err);
        // Default to 1 if config can't be loaded
        setCreditRate('1');
        setOriginalRate('1');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Live preview: how many credits does 100 EGP buy at the current rate?
  const previewRate = Number(creditRate) || 0;
  const previewEgp = 100;
  const previewCredits = Math.round(previewEgp * previewRate);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError('');
    setSaveSuccess('');

    const trimmed = creditRate.trim();
    const rate = Number(trimmed);

    if (!trimmed || !Number.isFinite(rate)) {
      setSaveError('أدخل سعر صرف صحيح.');
      return;
    }
    if (rate < 0.01) {
      setSaveError('السعر لا يمكن أن يكون أقل من 0.01.');
      return;
    }
    if (rate > 1000) {
      setSaveError('السعر لا يمكن أن يكون أكبر من 1000.');
      return;
    }
    if (trimmed === originalRate) {
      setSaveSuccess('لم يتم تغيير السعر.');
      return;
    }

    setIsSaving(true);
    try {
      await adminService.updateSystemConfig({ creditRate: rate });
      setOriginalRate(trimmed);
      setSaveSuccess('تم حفظ سعر الصرف بنجاح.');
    } catch (err: any) {
      setSaveError('تعذّر حفظ السعر. حاول مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = creditRate.trim() !== originalRate;

  return (
    <div className="max-w-2xl mx-auto font-sans" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-10 shadow-xl transition-colors relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-full -mr-16 -mt-16 pointer-events-none" />

        <div className="mb-8 text-center space-y-3 relative z-10">
          <div className="w-14 h-14 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <Coins className="w-7 h-7 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {'سعر الصرف'}
          </h2>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 max-w-md mx-auto text-balance">
            {'عدد الرصيد الذي يحصل عليه الجراج لكل جنيه يدفعه'}
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6 relative z-10">
            <div className="space-y-3">
              <label htmlFor="credit-rate" className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                {'السعر (رصيد لكل جنيه)'}
              </label>
              <input
                id="credit-rate"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max="1000"
                value={creditRate}
                onChange={(e) => {
                  setCreditRate(e.target.value);
                  setSaveError('');
                  setSaveSuccess('');
                }}
                aria-label={'سعر الصرف'}
                required
                className="w-full text-center text-2xl font-mono font-black p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all"
                autoFocus
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center font-semibold">
                {'الافتراضي: 1 (1 جنيه = 1 رصيد). السعر الجديد ينطبق على الشحنات الجديدة فقط.'}
              </p>
            </div>

            {/* Live preview */}
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-5 py-4 text-center">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                {'معاينة'}
              </p>
              <p className="font-mono text-base font-black text-slate-900 dark:text-white">
                {previewEgp.toLocaleString('ar-EG')} جنيه ← <span className="text-emerald-600 dark:text-emerald-400">{previewCredits.toLocaleString('ar-EG')} رصيد</span>
              </p>
            </div>

            <div className="flex gap-3 sm:gap-4 pt-2 justify-center">
              <button
                type="submit"
                disabled={isSaving || !hasChanges}
                className="px-8 h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{'جاري الحفظ...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 stroke-[3]" />
                    <span>{'حفظ السعر'}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="px-6 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-extrabold text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ChevronRight className="w-4 h-4" />
                <span>{'رجوع'}</span>
              </button>
            </div>

            {saveError && (
              <p role="alert" className="mt-2 text-center text-sm font-black text-red-500">
                {saveError}
              </p>
            )}
            {saveSuccess && (
              <p role="status" className="mt-2 text-center text-sm font-black text-emerald-500">
                {saveSuccess}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
