import React from 'react';
import { AlertTriangle, Wallet } from 'lucide-react';
import type { Garage } from '../../types';

interface SmartActionPromptProps {
  garage: Garage;
  paymentWalletNumber?: string;
}

/**
 * Format a digit string with dashes every 3 characters so it reads as
 * a hero number without visual confusion.
 *   "01552411323" → "015-524-113-23"
 */
const formatWithDashes = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const groups = trimmed.match(/.{1,3}/g);
  return groups ? groups.join('-') : trimmed;
};

/**
 * Depleted-balance state. Owns the full main area when balance = 0
 * (the persistent balance card is hidden in this state by GarageDashboardView).
 *
 * Minimal layout: warning icon → headline → one short prompt → hero wallet
 * number (dashed). No copy button, no explanatory paragraph, no hints.
 */
export const SmartActionPrompt: React.FC<SmartActionPromptProps> = ({ paymentWalletNumber }) => {
  const walletNumber = (paymentWalletNumber || '').trim();
  const dashed = formatWithDashes(walletNumber);

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
      <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-3 text-center">
        رصيدك خلص
      </h3>

      {dashed ? (
        <>
          {/* One short prompt */}
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-4 text-center">
            أرسل الدفع إلى
          </p>

          {/* Hero wallet number, dashed for readability */}
          <div className="flex items-center justify-center gap-2.5">
            <Wallet className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span
              dir="ltr"
              className="font-mono text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-wide"
            >
              {dashed}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 text-center">
          تواصل مع الإدارة لشحن رصيد جديد.
        </p>
      )}
    </div>
  );
};
