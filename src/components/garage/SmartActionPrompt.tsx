import React from 'react';
import { AlertTriangle, Wallet } from 'lucide-react';
import type { Garage } from '../../types';

interface SmartActionPromptProps {
  garage: Garage;
  paymentWalletNumber?: string;
}

/** Depleted garages are funded by an admin credit grant. */
export const SmartActionPrompt: React.FC<SmartActionPromptProps> = ({ garage, paymentWalletNumber }) => {
  const paid = Math.max(0, Number(garage.creditBalance?.paid || 0));
  const referral = Math.max(0, Number(garage.creditBalance?.referral || 0));
  const trial = Math.max(0, Number(garage.creditBalance?.trial || 0));
  const total = paid + referral + trial;
  const walletNumber = (paymentWalletNumber || '').trim();

  return (
    <div
      id="smart-action-prompt-card"
      className="bg-[#faf9f6] dark:bg-slate-900 rounded-[2rem] border-2 border-amber-500/50 relative shrink-0 p-5 sm:p-7 max-w-md md:max-w-xl mx-auto w-full text-center shadow-xl"
      dir="rtl"
    >
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg">
          <AlertTriangle className="w-6 h-6" />
        </div>
      </div>
      <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-2">رصيدك خلص</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 font-medium mb-4 leading-relaxed">
        هذا الجراج يعمل بنظام الرصيد مسبق الدفع. تواصل مع الإدارة لإضافة رصيد جديد.
      </p>
      <div className="font-mono text-2xl font-black text-slate-900 dark:text-white mb-1">{total.toLocaleString('ar-EG')}</div>
      <div className="text-xs font-bold text-slate-500 mb-4">مدفوع: {paid.toLocaleString('ar-EG')} · إحالة: {referral.toLocaleString('ar-EG')} · تجريبي: {trial.toLocaleString('ar-EG')}</div>
      {walletNumber && (
        <div className="mt-2 pt-4 border-t border-amber-500/30">
          <div className="flex items-center justify-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-black">لشحن الرصيد، أرسل الدفع إلى:</span>
          </div>
          <div className="font-mono text-lg font-black text-slate-900 dark:text-white bg-amber-50 dark:bg-slate-800 rounded-xl py-2 px-4 inline-block" dir="ltr">
            {walletNumber}
          </div>
        </div>
      )}
    </div>
  );
};
