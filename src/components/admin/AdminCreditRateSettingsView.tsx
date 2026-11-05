import React, { useState, useEffect } from 'react';
import { Coins, Check, Loader2, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../api/apiClient';
import { adminService } from '../../services';

interface AdminCreditRateSettingsViewProps {
  onBack: () => void;
}

/**
 * Admin-only screen for setting the EGP-per-credit price.
 *
 * Owner-facing input: "How many EGP does 1 credit cost?"
 *   - Type 1    → 1 credit costs 1 EGP        (default, legacy behavior)
 *   - Type 0.75 → 1 credit costs 0.75 EGP     (cheaper credits → more credits per EGP)
 *   - Type 2    → 1 credit costs 2 EGP         (premium credits → fewer credits per EGP)
 *
 * Storage: the server stores `creditRate` = credits-per-EGP (the inverse).
 *   creditRate = 1 / egpPerCredit
 *   Examples: egpPerCredit=1 → creditRate=1; egpPerCredit=0.75 → creditRate=1.333...
 *
 * The UI inverts on load (creditRate → egpPerCredit) and on save
 * (egpPerCredit → creditRate). The backend logic is unchanged — it still
 * computes `credits = round(paymentAmountEgp × creditRate)`.
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
  // egpPerCredit is what the user types and sees.
  // creditRate (stored on the server) = 1 / egpPerCredit.
  const [egpPerCredit, setEgpPerCredit] = useState<string>('');
  const [originalEgpPerCredit, setOriginalEgpPerCredit] = useState<string>('');
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
          const storedRate = data.config.creditRate ?? 1; // credits-per-EGP
          const egpPerCreditVal = storedRate > 0 ? (1 / storedRate) : 1;
          // Display with up to 4 decimal places, stripped of trailing zeros
          const display = String(Number(egpPerCreditVal.toFixed(4)));
          setEgpPerCredit(display);
          setOriginalEgpPerCredit(display);
        }
      } catch (err) {
        console.warn('Failed to load creditRate:', err);
        // Default: 1 EGP per credit
        setEgpPerCredit('1');
        setOriginalEgpPerCredit('1');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Live preview: how many credits does 100 EGP buy at the current EGP-per-credit price?
  const egpPerCreditNum = Number(egpPerCredit) || 0;
  const previewEgp = 100;
  // credits = round(EGP / egpPerCredit) = round(EGP × creditRate)
  const previewCredits = egpPerCreditNum > 0 ? Math.round(previewEgp / egpPerCreditNum) : 0;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError('');
    setSaveSuccess('');

    const trimmed = egpPerCredit.trim();
    const egpVal = Number(trimmed);

    if (!trimmed || !Number.isFinite(egpVal) || egpVal <= 0) {
      setSaveError('أدخل سعر صرف صحيح (أكبر من صفر).');
      return;
    }
    // egpPerCredit bounds: 0.001 EGP/credit (very cheap) to 10000 EGP/credit (very expensive)
    // This inverts to creditRate bounds of 0.0001 to 1000 (matching server validation).
    if (egpVal < 0.001) {
      setSaveError('السعر لا يمكن أن يكون أقل من 0.001 جنيه لكل رصيد.');
      return;
    }
    if (egpVal > 10000) {
      setSaveError('السعر لا يمكن أن يكون أكبر من 10000 جنيه لكل رصيد.');
      return;
    }
    if (trimmed === originalEgpPerCredit) {
      setSaveSuccess('لم يتم تغيير السعر.');
      return;
    }

    // Convert to creditRate (credits-per-EGP) for the server
    const creditRate = 1 / egpVal;

    setIsSaving(true);
    try {
      await adminService.updateSystemConfig({ creditRate });
      setOriginalEgpPerCredit(trimmed);
      setSaveSuccess('تم حفظ سعر الصرف بنجاح.');
    } catch (err: any) {
      setSaveError('تعذّر حفظ السعر. حاول مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = egpPerCredit.trim() !== originalEgpPerCredit;

  return (
    <div className="max-w-2xl mx-auto font-sans" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-10 shadow-xl transition-colors relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-full -mr-16 -mt-16 pointer-events-none" />

        <div className="mb-8 text-center space-y-3 relative z-10">
          <div className="w-14 h-14 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <Coins className="w-7 h-7 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {'سعر الرصيد'}
          </h2>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 max-w-md mx-auto text-balance">
            {'كم جنيه يدفع الجراج مقابل رصيد واحد؟'}
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
                {'السعر (جنيه لكل رصيد)'}
              </label>
              <input
                id="credit-rate"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.001"
                max="10000"
                value={egpPerCredit}
                onChange={(e) => {
                  setEgpPerCredit(e.target.value);
                  setSaveError('');
                  setSaveSuccess('');
                }}
                aria-label={'سعر الرصيد'}
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

            {/* Quick reference */}
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 px-5 py-3 text-center">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold leading-relaxed">
                {'أمثلة: 1 جنيه = رصيد عادي · 0.75 = رصيد أرخص · 2 = رصيد أغلى'}
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
