import React, { useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';

interface AdminWalletViewProps {
  currentWalletNumber: string;
  onUpdateWalletNumber: (val: string) => Promise<void>;
  onCancel: () => void;
  t: (key: string) => string;
}

export const AdminWalletView: React.FC<AdminWalletViewProps> = ({
  currentWalletNumber,
  onUpdateWalletNumber,
  onCancel,
  t,
}) => {
  const [walletValue, setWalletValue] = useState<string>(currentWalletNumber);
  const [isSavingWallet, setIsSavingWallet] = useState<boolean>(false);

  const renderFormattedWallet = (val: string) => {
    if (!val) return null;
    return val.split('').map((char, index) => {
      const isDigit = /\d/.test(char);
      if (isDigit) {
        return (
          <span key={index} className="text-slate-900 dark:text-white font-mono">
            {char}
          </span>
        );
      } else {
        return (
          <span key={index} className="text-emerald-500 dark:text-emerald-400 font-extrabold font-mono select-none px-[1px]">
            {char}
          </span>
        );
      }
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletValue.trim()) {
      return;
    }
    setIsSavingWallet(true);
    try {
      await onUpdateWalletNumber(walletValue);
      onCancel();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingWallet(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto font-sans">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-10 shadow-xl transition-colors relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-full -mr-16 -mt-16 pointer-events-none" />
        
        {/* Description Header */}
        <div className="mb-8 text-center space-y-3 relative z-10">
          <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-500/10">
            <Wallet className="w-7 h-7 text-slate-950 stroke-[2.5]" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{t('رقم المحفظة الإلكترونية')}</h2>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} className="space-y-6 relative z-10">
          <div className="space-y-4 text-center">
            {/* Emerald Separators Live Preview */}
            <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 text-center select-none" dir="ltr">
              <p className="text-xs font-black text-slate-400 dark:text-slate-500 mb-1 font-sans">{t('الرقم بالتنسيق الملون')}</p>
              <div className="text-2xl font-black font-mono tracking-widest">
                {renderFormattedWallet(walletValue) || <span className="text-slate-300 dark:text-slate-600">-- - --- - --- - --</span>}
              </div>
            </div>

            <input 
              type="text"
              value={walletValue}
              onChange={(e) => {
                const filtered = e.target.value.replace(/[^0-9\s-]/g, '');
                setWalletValue(filtered);
              }}
              dir="ltr"
              required
              placeholder="015 - 524 - 113 - 23"
              className="w-full text-center p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-black text-xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all tracking-wide font-mono" 
            />
          </div>

          <div className="flex gap-3 sm:gap-4 pt-2">
            <button 
              type="submit"
              disabled={isSavingWallet}
              className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm sm:text-base rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all outline-none cursor-pointer"
            >
              {isSavingWallet ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{t('جاري الحفظ...')}</span>
                </>
              ) : (
                <span>{t('حفظ التعديلات')}</span>
              )}
            </button>
            <button 
              type="button"
              disabled={isSavingWallet}
              onClick={() => {
                setWalletValue(currentWalletNumber);
                onCancel();
              }}
              className="px-6 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-400 font-extrabold text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center"
            >
              {t('إلغاء')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
