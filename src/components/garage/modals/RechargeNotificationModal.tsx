import React from 'react';
import { X as XIcon, Gift, Zap, Sparkles } from 'lucide-react';
import { ActivityLog } from '../../../types';
import { safeDate } from '../../../utils';

interface RechargeNotificationModalProps {
  isOpen: boolean;
  rechargeLog: ActivityLog | null;
  onClose: () => void;
}

export const RechargeNotificationModal: React.FC<RechargeNotificationModalProps> = ({
  isOpen,
  rechargeLog,
  onClose
}) => {
  if (!isOpen || !rechargeLog) return null;

  const details = rechargeLog.details as Record<string, any> | undefined;

  // Claim/usage logs must NEVER display as an incoming gift notification
  if (details?.type === 'use_referral_reward' || rechargeLog.plateNumber?.includes('استخدام مكافأة')) {
    return null;
  }
  
  const isReferralReward =
    details?.type === 'referral_reward' ||
    rechargeLog.packageId === 'referral_reward' ||
    (Boolean(rechargeLog.plateNumber && rechargeLog.plateNumber.includes('مكافأة إحالة')) && !rechargeLog.plateNumber?.includes('استخدام'));

  const rawPkgName = String(details?.packageName || rechargeLog.plateNumber || '');
  const isTrial =
    Boolean(details?.isTrial) ||
    rechargeLog.packageId === 'trial' ||
    rawPkgName.includes('تجريب') ||
    rawPkgName.includes('تجريبية');

  const referredGarageName =
    details?.referredGarageName ||
    (rechargeLog.plateNumber ? rechargeLog.plateNumber.replace(/^مكافأة إحالة من\s*/, '').split('—')[0].trim() : 'جراج صديق');

  const cleanPackageName =
    rawPkgName
      .replace(/^(شحن باقة:|شحن باقة\s*|تفعيل الباقة:|تفعيل\s*|شحن رصيد الجراج)/gi, '')
      .trim() || (isTrial ? 'الباقة التجريبية' : 'الباقة');

  const formattedDate = rechargeLog.timestamp
    ? safeDate(rechargeLog.timestamp).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'غير معروف';

  const formattedTime = rechargeLog.timestamp
    ? safeDate(rechargeLog.timestamp).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'غير معروف';

  const modalTitle = isReferralReward
    ? 'مبروك! جالك يوم هدية مجاني 🎁'
    : isTrial
    ? 'تم تفعيل الباقة التجريبية بنجاح! 🎉'
    : 'تم تجديد الاشتراك بنجاح!';

  const modalSubtitle = isReferralReward
    ? 'تمت إضافة 1 يوم لرصيد اشتراكك'
    : isTrial
    ? 'تم تفعيل الفترة التجريبية المجانية لبدء الاستخدام فوراً'
    : 'تم تحديث رصيد الاشتراك بنجاح';

  const displayAmount = isTrial || !rechargeLog.amount
    ? 'مجاناً (فترة تجريبية)'
    : `${rechargeLog.amount} ج.م`;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 z-[110] flex items-center justify-center p-4 animate-overlay-30fps"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-popup-30fps"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div
          className={`absolute top-0 right-1/2 translate-x-1/2 w-48 h-48 ${
            isReferralReward 
              ? 'bg-amber-500/10 dark:bg-amber-500/5' 
              : isTrial 
              ? 'bg-emerald-500/15 dark:bg-emerald-500/10' 
              : 'bg-emerald-500/10 dark:bg-emerald-500/5'
          } rounded-full blur-2xl pointer-events-none`}
        />
        
        {/* Subtle, modern close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors outline-none z-20"
          aria-label="إغلاق"
        >
          <XIcon className="w-5 h-5" />
        </button>

        <div className="text-center mt-2">
          <div
            className={`w-16 h-16 ${
              isReferralReward
                ? 'bg-amber-500 shadow-amber-500/20 dark:shadow-amber-500/10'
                : isTrial
                ? 'bg-emerald-500 shadow-emerald-500/25 dark:shadow-emerald-500/15'
                : 'bg-emerald-500 shadow-emerald-500/20 dark:shadow-emerald-500/10'
            } text-white rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg`}
          >
            {isReferralReward ? (
              <Gift className="w-8 h-8 fill-current" />
            ) : isTrial ? (
              <Sparkles className="w-8 h-8 fill-current" />
            ) : (
              <Zap className="w-8 h-8 fill-current" />
            )}
          </div>

          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
            {modalTitle}
          </h3>

          <p
            className={`text-xs font-bold mb-6 ${
              isReferralReward
                ? 'text-amber-600 dark:text-amber-400'
                : isTrial
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {modalSubtitle}
          </p>

          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4.5 text-right space-y-3.5 border border-slate-100 dark:border-slate-800/50 mb-6">
            {isReferralReward ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                    من جراج:
                  </span>
                  <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                    {referredGarageName}
                  </span>
                </div>
                <div className="w-full border-t border-slate-200/40 dark:border-slate-800/40" />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                    الوقت والتاريخ:
                  </span>
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">
                    {formattedTime} - {formattedDate}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-start gap-4">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 flex-shrink-0">
                    الباقة:
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white leading-tight text-left">
                    {cleanPackageName}
                  </span>
                </div>
                <div className="w-full border-t border-slate-200/40 dark:border-slate-800/40" />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                    المبلغ:
                  </span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {displayAmount}
                  </span>
                </div>
                <div className="w-full border-t border-slate-200/40 dark:border-slate-800/40" />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                    الوقت والتاريخ:
                  </span>
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">
                    {formattedTime} - {formattedDate}
                  </span>
                </div>
              </>
            )}
          </div>

          <button
            onClick={onClose}
            className={`w-full ${
              isReferralReward
                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/10'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10'
            } text-white py-4 px-6 rounded-2xl font-black text-base transition-all shadow-lg block`}
          >
            تمام
          </button>
        </div>
      </div>
    </div>
  );
};

