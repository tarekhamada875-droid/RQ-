import React from 'react';
import { X as XIcon, Gift, Zap, Sparkles, Coins } from 'lucide-react';
import { ActivityLog } from '../../../types';
import { safeDate } from '../../../utils/dates';

interface CreditGrantNotificationModalProps {
  isOpen: boolean;
  creditGrantLog: ActivityLog | null;
  /** Live garage.credits from the dashboard's garage-doc subscription —
   *  shown as "الرصيد الحالي" on the prepaid top-up card. Optional: the row
   *  is hidden when the balance is unknown rather than guessed. */
  currentCredits?: number;
  onClose: () => void;
}

export const CreditGrantNotificationModal: React.FC<CreditGrantNotificationModalProps> = ({
  isOpen,
  creditGrantLog,
  currentCredits,
  onClose
}) => {
  if (!isOpen || !creditGrantLog) return null;

  const details = creditGrantLog.details as Record<string, any> | undefined;

  // Claim/usage logs must NEVER display as an incoming gift notification
  if (details?.type === 'use_referral_reward' || creditGrantLog.plateNumber?.includes('استخدام مكافأة')) {
    return null;
  }
  
  const isReferralReward =
    details?.type === 'referral_reward' ||
    creditGrantLog.packageId === 'referral_reward' ||
    (Boolean(creditGrantLog.plateNumber && creditGrantLog.plateNumber.includes('مكافأة إحالة')) && !creditGrantLog.plateNumber?.includes('استخدام'));

  const rawPkgName = String(details?.packageName || creditGrantLog.plateNumber || '');
  const isTrial =
    Boolean(details?.isTrial) ||
    creditGrantLog.packageId === 'trial' ||
    rawPkgName.includes('تجريب') ||
    rawPkgName.includes('تجريبية');

  const referredGarageName =
    details?.referredGarageName ||
    (creditGrantLog.plateNumber ? creditGrantLog.plateNumber.replace(/^مكافأة إحالة من\s*/, '').split('—')[0].trim() : 'جراج صديق');

  const cleanPackageName =
    rawPkgName
      .replace(/^(شحن باقة:|شحن باقة\s*|تفعيل الباقة:|تفعيل\s*|شحن رصيد الجراج)/gi, '')
      .trim() || (isTrial ? 'الباقة التجريبية' : 'الباقة');

  const formattedDate = creditGrantLog.timestamp
    ? safeDate(creditGrantLog.timestamp).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'غير معروف';

  // Time display is hidden from user-facing screens per Q89D.
  // formattedTime is retained for potential admin-only use but not shown to users.

  // ── Prepaid credit top-up (the current billing model) ──────────────────────
  // Admin "إضافة رصيد" grants (and approved credit requests) write
  // actionType:'credit_grant' with details:{amount, paymentAmountEgp, reason}
  // and NO package identity — no details.packageName, no plateNumber. The
  // legacy subscription layout below would fall back to "الباقة: الباقة"
  // and "مجاناً (فترة تجريبية)" — meaningless for a paid credit top-up.
  // Instead render a clean top-up card mirroring the سجل شحن الرصيد history
  // cards (owner-approved visual language): +N رصيد, current balance, date.
  const creditAmount = Number(details?.amount);
  const isPrepaidCreditTopUp =
    !isReferralReward &&
    !isTrial &&
    rawPkgName === '' &&
    Number.isSafeInteger(creditAmount) &&
    creditAmount > 0;

  const currentBalanceDisplay =
    typeof currentCredits === 'number' && Number.isFinite(currentCredits)
      ? currentCredits.toLocaleString('ar-EG')
      : null;

  if (isPrepaidCreditTopUp) {
    return (
      <div
        className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 z-[110] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
        >
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center outline-none z-20"
            aria-label="إغلاق"
          >
            <XIcon className="w-5 h-5" />
          </button>

          <div className="text-center mt-2">
            <div className="w-16 h-16 bg-emerald-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Coins className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4">
              تم شحن الرصيد بنجاح!
            </h3>

            <p className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 leading-none mb-6">
              +{creditAmount.toLocaleString('ar-EG')} رصيد
            </p>

            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl px-4 py-3.5 text-right border border-slate-100 dark:border-slate-800/50 mb-6">
              {currentBalanceDisplay && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                      الرصيد الحالي:
                    </span>
                    <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                      {currentBalanceDisplay}
                    </span>
                  </div>
                  <div className="w-full border-t border-slate-200/40 dark:border-slate-800/40 my-3" />
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  التاريخ:
                </span>
                <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">
                  {formattedDate}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full bg-emerald-600 text-white py-4 px-6 rounded-2xl font-black text-base block"
            >
              تمام
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Legacy subscription-package / trial / referral layouts below — kept for
  // garages still on the subscription model and for historical logs.
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

  const displayAmount = isTrial || !creditGrantLog.amount
    ? 'مجاناً (فترة تجريبية)'
    : `${creditGrantLog.amount} ج.م`;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 z-[110] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Subtle, modern close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center outline-none z-20"
          aria-label="إغلاق"
        >
          <XIcon className="w-5 h-5" />
        </button>

        <div className="text-center mt-2">
          <div
            className={`w-16 h-16 ${
              isReferralReward
                ? 'bg-amber-500 '
                : isTrial
                ? 'bg-emerald-500 '
                : 'bg-emerald-500 '
            } text-white rounded-2xl flex items-center justify-center mx-auto mb-5 `}
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
                    التاريخ:
                  </span>
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">
                    {formattedDate}
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
                    التاريخ:
                  </span>
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono">
                    {formattedDate}
                  </span>
                </div>
              </>
            )}
          </div>

          <button
            onClick={onClose}
            className={`w-full ${
              isReferralReward
                ? 'bg-amber-500 '
                : 'bg-emerald-600 '
            } text-white py-4 px-6 rounded-2xl font-black text-base block`}
          >
            تمام
          </button>
        </div>
      </div>
    </div>
  );
};

