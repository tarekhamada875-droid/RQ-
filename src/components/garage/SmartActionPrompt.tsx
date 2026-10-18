import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Garage } from '../../types';

interface SmartActionPromptProps {
  garage: Garage;
}

/** Depleted garages are funded by an admin credit grant. */
export const SmartActionPrompt: React.FC<SmartActionPromptProps> = ({ garage }) => {
  const paid = Math.max(0, Number(garage.creditBalance?.paid || 0));
  const referral = Math.max(0, Number(garage.creditBalance?.referral || 0));
  const trial = Math.max(0, Number(garage.creditBalance?.trial || 0));
  const total = paid + referral + trial;

  return (
    <div
      id="smart-action-prompt-card"
      className="bg-[#faf9f6] dark:bg-slate-900 rounded-[2rem] border-2 border-amber-500/50 relative shrink-0 p-5 sm:p-7 max-w-md md:max-w-xl mx-auto w-full text-center shadow-xl"
      dir="ltr"
    >
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg">
          <AlertTriangle className="w-6 h-6" />
        </div>
      </div>
      <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-2">Insufficient access credits</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 font-medium mb-4 leading-relaxed">
        This garage uses access credits only. Ask an administrator to grant more credits.
      </p>
      <div className="font-mono text-2xl font-black text-slate-900 dark:text-white mb-1">{total.toLocaleString('en-US')}</div>
      <div className="text-xs font-bold text-slate-500">Paid: {paid} · Referral: {referral} · Trial: {trial}</div>
    </div>
  );
};
