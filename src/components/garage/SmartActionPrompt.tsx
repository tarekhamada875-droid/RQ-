import React, { useState } from 'react';
import { AlertTriangle, Wallet, Copy, Check } from 'lucide-react';
import type { Garage } from '../../types';

interface SmartActionPromptProps {
  garage: Garage;
  paymentWalletNumber?: string;
}

/**
 * Depleted-balance state. Owns the full main area when balance = 0
 * (the persistent balance card is hidden in this state by GarageDashboardView).
 *
 * Redesign goals:
 *  - Single, unambiguous call-to-action: send payment to the wallet number.
 *  - Remove the redundant giant "0" (the depleted balance is implicit — the
 *    card's whole existence communicates that).
 *  - Wallet number is the hero element: large, high-contrast, tap-to-copy.
 *  - Short, action-oriented copy. No passive "contact admin" phrasing.
 */
export const SmartActionPrompt: React.FC<SmartActionPromptProps> = ({ paymentWalletNumber }) => {
  const walletNumber = (paymentWalletNumber || '').trim();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!walletNumber) return;
    try {
      await navigator.clipboard.writeText(walletNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (older browsers, insecure context).
      // Fallback: select-and-copy via a hidden input is overkill for a number
      // the user can read and retype; we just leave the copy badge in its
      // default state.
    }
  };

  return (
    <div
      id="smart-action-prompt-card"
      className="bg-[#faf9f6] dark:bg-slate-900 rounded-[2rem] border-2 border-amber-500/60 relative shrink-0 p-6 sm:p-8 max-w-md md:max-w-xl mx-auto w-full shadow-xl"
      dir="rtl"
    >
      {/* Warning icon */}
      <div className="flex justify-center mb-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg">
          <AlertTriangle className="w-7 h-7" strokeWidth={2.5} />
        </div>
      </div>

      {/* Headline */}
      <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2 text-center">
        رصيدك خلص
      </h3>

      {/* One short, action-oriented sentence */}
      <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium mb-6 leading-relaxed text-center">
        أرسل الدفع للمحفظة دي، وهيتشحن رصيدك تلقائيًا بعد تأكيد الإدارة.
      </p>

      {/* Wallet number — the hero element */}
      {walletNumber ? (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wider">محفظة الشحن</span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            aria-label="نسخ رقم المحفظة"
            className="group w-full bg-amber-50 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-slate-700 border-2 border-amber-500/40 hover:border-amber-500 rounded-2xl py-4 px-5 flex items-center justify-between transition-all active:scale-[0.98]"
            dir="ltr"
          >
            <span className="font-mono text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-wider">
              {walletNumber}
            </span>
            <span className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black transition-all ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 group-hover:bg-slate-300 dark:group-hover:bg-slate-600'
            }`}>
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  <span>تم النسخ</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>نسخ</span>
                </>
              )}
            </span>
          </button>

          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 text-center">
            اضغط على الرقم لنسخه
          </p>
        </div>
      ) : (
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 text-center">
          تواصل مع الإدارة لإضافة رصيد جديد.
        </p>
      )}
    </div>
  );
};
