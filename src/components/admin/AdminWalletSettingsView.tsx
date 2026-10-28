import React, { useState, useEffect } from 'react';
import { Wallet, Check, Loader2, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../api/apiClient';
import { firestoreService } from '../../services';

interface AdminWalletSettingsViewProps {
  onBack: () => void;
  t: (key: string) => string;
}

/**
 * Admin-only screen for setting the payment wallet number.
 * This number is shown to garage owners when their credits run out (the "رصيدك خلص" screen)
 * so they know where to send payment.
 *
 * This screen does NOT require PIN re-verification — setting a wallet number is not a
 * security-sensitive operation like changing the admin PIN. The admin is already authenticated.
 */
export const AdminWalletSettingsView: React.FC<AdminWalletSettingsViewProps> = ({ onBack, t }) => {
  const [paymentWalletNumber, setPaymentWalletNumber] = useState<string>('');
  const [originalWalletNumber, setOriginalWalletNumber] = useState<string>('');
  const [saveError, setSaveError] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ success?: boolean; config?: { paymentWalletNumber?: string } }>('/api/system-config');
        if (!cancelled && data?.success && data.config) {
          const wallet = data.config.paymentWalletNumber || '';
          setPaymentWalletNumber(wallet);
          setOriginalWalletNumber(wallet);
        }
      } catch (err) {
        console.warn('Failed to load paymentWalletNumber:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError('');
    setSaveSuccess('');
    const trimmed = paymentWalletNumber.trim();
    if (!trimmed) {
      setSaveError(t('أدخل رقم محفظة الدفع أولاً.'));
      return;
    }
    if (trimmed.length > 120) {
      setSaveError(t('رقم المحفظة طويل جداً.'));
      return;
    }
    if (trimmed === originalWalletNumber) {
      setSaveSuccess(t('لم يتم تغيير الرقم.'));
      return;
    }
    setIsSaving(true);
    try {
      await firestoreService.updateSystemConfig({ paymentWalletNumber: trimmed });
      setOriginalWalletNumber(trimmed);
      setSaveSuccess(t('تم حفظ رقم محفظة الدفع بنجاح.'));
    } catch (err: any) {
      setSaveError(t('تعذّر حفظ رقم المحفظة. حاول مرة أخرى.'));
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = paymentWalletNumber.trim() !== originalWalletNumber;

  return (
    <div className="max-w-2xl mx-auto font-sans" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-10 shadow-xl transition-colors relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-amber-500/5 to-transparent rounded-full -mr-16 -mt-16 pointer-events-none" />

        <div className="mb-8 text-center space-y-3 relative z-10">
          <div className="w-14 h-14 bg-amber-500/10 dark:bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <Wallet className="w-7 h-7 text-amber-600 dark:text-amber-400 stroke-[2.5]" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {t('رقم محفظة الدفع')}
          </h2>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 max-w-md mx-auto text-balance">
            {t('يُعرض لأصحاب الجراجات عند نفاد رصيدهم ليعرفوا أين يرسلون الدفع')}
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6 relative z-10">
            <div className="space-y-3">
              <label htmlFor="payment-wallet-number" className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                {t('رقم المحفظة (فودافون كاش / إنستاباي / محفظة بنكية)')}
              </label>
              <input
                id="payment-wallet-number"
                type="text"
                inputMode="tel"
                value={paymentWalletNumber}
                onChange={(e) => {
                  setPaymentWalletNumber(e.target.value);
                  setSaveError('');
                  setSaveSuccess('');
                }}
                maxLength={120}
                aria-label={t('رقم محفظة الدفع')}
                required
                placeholder={t('01012345678 / Instapay / محفظة')}
                className="w-full text-center text-lg font-mono font-bold p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-amber-500 dark:focus:border-amber-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all"
                dir="ltr"
                autoFocus
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center font-semibold">
                {t('سيظهر هذا الرقم لكل أصحاب الجراجات عند نفاد رصيدهم')}
              </p>
            </div>

            <div className="flex gap-3 sm:gap-4 pt-2 justify-center">
              <button
                type="submit"
                disabled={isSaving || !hasChanges}
                className="px-8 h-14 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t('جاري الحفظ...')}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 stroke-[3]" />
                    <span>{t('حفظ رقم المحفظة')}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="px-6 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-extrabold text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ChevronRight className="w-4 h-4" />
                <span>{t('رجوع')}</span>
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
