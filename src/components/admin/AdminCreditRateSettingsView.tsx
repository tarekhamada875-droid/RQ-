import React, { useState, useEffect } from 'react';
import { Coins, Check, Loader2, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../api/apiClient';
import { adminService } from '../../services';

interface AdminCreditRateSettingsViewProps {
  onBack: () => void;
}

/**
 * Admin-only screen for setting the EGP-per-credit price (global, all garages).
 *
 * Owner-facing question: "How many EGP does 1 credit cost?"
 * The admin picks ONE of five presets — no free-form typing, no inversion
 * math, no decimals to mis-enter. Each preset shows a live preview of what
 * 100 EGP buys, so the consequence of each choice is visible before saving.
 *
 *   0.5 EGP/credit → 100 EGP buys 200 credits  (cheapest credits)
 *   0.8 EGP/credit → 100 EGP buys 125 credits  (discount)
 *   1   EGP/credit → 100 EGP buys 100 credits  (default, legacy)
 *   2   EGP/credit → 100 EGP buys  50 credits
 *  10   EGP/credit → 100 EGP buys  10 credits  (premium credits)
 *
 * Storage: the server stores `creditRate` = credits-per-EGP (the inverse).
 *   creditRate = 1 / egpPerCredit
 * The UI converts on load and on save; backend logic is unchanged — it still
 * computes `credits = round(paymentAmountEgp × creditRate)`.
 *
 * When admin changes the rate, only NEW credit grants use the new rate.
 * Existing balances and past ledger entries are immutable.
 *
 * This screen does NOT require PIN re-verification — setting a rate is not a
 * security-sensitive operation. The admin is already authenticated.
 */

const PRESETS: readonly number[] = [0.5, 0.8, 1, 2, 10];

const PREVIEW_EGP = 100;

function creditsForEgp(egpPerCredit: number, egp: number): number {
  if (!(egpPerCredit > 0)) return 0;
  return Math.round(egp / egpPerCredit);
}

function rateToEgpPerCredit(creditRate: number | undefined | null): number {
  const r = Number(creditRate ?? 1);
  if (!Number.isFinite(r) || r <= 0) return 1;
  return 1 / r;
}

export const AdminCreditRateSettingsView: React.FC<AdminCreditRateSettingsViewProps> = ({ onBack }) => {
  // What the user picks (EGP-per-credit). Null until a preset is selected.
  const [selectedEgpPerCredit, setSelectedEgpPerCredit] = useState<number | null>(null);
  // What's currently persisted (EGP-per-credit). Null until loaded.
  const [currentEgpPerCredit, setCurrentEgpPerCredit] = useState<number | null>(null);
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
          const egpPerCredit = rateToEgpPerCredit(data.config.creditRate);
          setCurrentEgpPerCredit(egpPerCredit);
          // If current value matches a preset, pre-select it. Otherwise leave
          // unselected so the admin must explicitly pick a preset to save.
          if (PRESETS.includes(egpPerCredit)) {
            setSelectedEgpPerCredit(egpPerCredit);
          }
        } else if (!cancelled) {
          // No config yet → default rate is 1 EGP/credit.
          setCurrentEgpPerCredit(1);
          setSelectedEgpPerCredit(1);
        }
      } catch (err) {
        console.warn('Failed to load creditRate:', err);
        if (!cancelled) {
          setCurrentEgpPerCredit(1);
          setSelectedEgpPerCredit(1);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isCustomCurrent =
    currentEgpPerCredit !== null && !PRESETS.includes(currentEgpPerCredit);

  const hasChanges =
    selectedEgpPerCredit !== null &&
    (currentEgpPerCredit === null || selectedEgpPerCredit !== currentEgpPerCredit);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError('');
    setSaveSuccess('');

    if (selectedEgpPerCredit === null) {
      setSaveError('اختر أحد الخيارات أولاً.');
      return;
    }
    if (!hasChanges) {
      setSaveSuccess('لم يتم تغيير السعر.');
      return;
    }

    // Convert to creditRate (credits-per-EGP) for the server.
    const creditRate = 1 / selectedEgpPerCredit;

    setIsSaving(true);
    try {
      await adminService.updateSystemConfig({ creditRate });
      setCurrentEgpPerCredit(selectedEgpPerCredit);
      setSaveSuccess('تم حفظ سعر الصرف بنجاح.');
    } catch (err: any) {
      setSaveError('تعذّر حفظ السعر. حاول مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

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
            {isCustomCurrent && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-5 py-3 text-center">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  {'السعر الحالي مخصص: '}
                  <span className="font-mono text-amber-900 dark:text-amber-100 px-1">
                    {currentEgpPerCredit} ج.م/رصيد
                  </span>
                  {' — اختر أحد الخيارات أدناه لتحديد سعر قياسي.'}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <fieldset>
                <legend className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-3 text-center">
                  {'الخيارات المتاحة'}
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label={'سعر الرصيد'}>
                  {PRESETS.map((egpPerCredit) => {
                    const isSelected = selectedEgpPerCredit === egpPerCredit;
                    const isCurrent = currentEgpPerCredit === egpPerCredit;
                    const previewCredits = creditsForEgp(egpPerCredit, PREVIEW_EGP);
                    return (
                      <button
                        type="button"
                        key={egpPerCredit}
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setSelectedEgpPerCredit(egpPerCredit);
                          setSaveError('');
                          setSaveSuccess('');
                        }}
                        className={`relative w-full p-4 rounded-2xl border-2 transition-[colors,transform] cursor-pointer text-right flex flex-col gap-2 ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-md'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-emerald-400 dark:hover:border-emerald-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-mono font-black text-lg ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>
                            {egpPerCredit}
                            <span className="text-xs font-bold mr-1">ج.م/رصيد</span>
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {'الحالي'}
                            </span>
                          )}
                          {isSelected && (
                            <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono">
                          {PREVIEW_EGP.toLocaleString('ar-EG')} ج.م ←{' '}
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {previewCredits.toLocaleString('ar-EG')} رصيد
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center font-semibold leading-relaxed">
                {'السعر الجديد ينطبق على الشحنات الجديدة فقط. الأرصدة الحالية وسجل العمليات السابق لا يتأثران.'}
              </p>
            </div>

            <div className="flex gap-3 sm:gap-4 pt-2 justify-center">
              <button
                type="submit"
                disabled={isSaving || !hasChanges}
                className="px-8 h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm rounded-2xl transition-[colors,transform] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
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
                className="px-6 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-extrabold text-sm rounded-2xl transition-[colors,transform] cursor-pointer flex items-center justify-center gap-2"
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
