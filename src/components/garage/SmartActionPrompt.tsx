import React from 'react';
import { AlertTriangle, Phone } from 'lucide-react';
import type { Garage, Package } from '../../types';

interface SmartActionPromptProps {
  garage: Garage;
  packages?: Package[];
  walletNumber?: string;
  onOpenPackages?: (initialDuration?: number) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  isDailyLimitReached?: boolean;
  isExpired?: boolean;
  packageDurationDays?: number;
  todayCount?: number;
  dailyCapacity?: number;
  onSubscribedSuccess?: (updatedGarageInfo?: any) => void;
}

/**
 * Garage access is prepaid-credit only. Package selection and time-based
 * subscription renewal were retired; depleted garages are funded by an admin
 * credit grant instead.
 */
export const SmartActionPrompt: React.FC<SmartActionPromptProps> = ({ garage, walletNumber = '' }) => {
  const paid = Math.max(0, Number(garage.creditBalance?.paid || 0));
  const referral = Math.max(0, Number(garage.creditBalance?.referral || 0));
  const trial = Math.max(0, Number(garage.creditBalance?.trial || 0));
  const total = paid + referral + trial;
  const phone = walletNumber.replace(/\D/g, '');

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
      <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-2">لا يوجد رصيد دخول كافٍ</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 font-medium mb-4 leading-relaxed">
        نظام الجراج يعمل بأرصدة الدخول فقط. اطلب من الإدارة إضافة أرصدة إلى حساب الجراج.
      </p>
      <div className="font-mono text-2xl font-black text-slate-900 dark:text-white mb-1">{total.toLocaleString('en-US')}</div>
      <div className="text-xs font-bold text-slate-500 mb-5">مدفوع: {paid} · إحالة: {referral} · تجربة: {trial}</div>
      {phone && (
        <a
          id="btn-smart-direct-call"
          href={`tel:${phone}`}
          className="w-full min-h-[52px] py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2.5"
        >
          <Phone className="w-5 h-5" />
          <span>الاتصال بالإدارة</span>
        </a>
      )}
    </div>
  );
};
