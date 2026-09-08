import React, { memo, useState } from 'react';
import { ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import { Garage } from '../../types';
import { garageService } from '../../services/garageService';
import { isSubscriptionExpired } from '../../utils';

interface RewardsModalProps {
  garage: Garage;
  onClose: () => void;
  onToggleMenu?: () => void;
  referralBonusBalance?: number;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const RewardsModal: React.FC<RewardsModalProps> = memo(({
  garage,
  onClose,
  showToast
}) => {
  const rewardDays = garage?.totalReferralRewardDays ?? 0;
  const isSubExpired = isSubscriptionExpired(garage);
  const isSubActive = !isSubExpired;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUseRewardDays = async () => {
    if (rewardDays <= 0 || isSubActive || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await garageService.useReferralRewardDays(garage.id);
      if (result.success) {
        showToast?.(`تم استخدام ${result.daysClaimed} ${result.daysClaimed === 1 ? 'يوم مجاني' : 'أيام مجانية'} وتمديد اشتراكك بنجاح! 🎉`, 'success');
      } else {
        showToast?.(result.error || 'حدث خطأ أثناء استخدام رصيد المكافآت', 'error');
      }
    } catch (err: any) {
      showToast?.(err.message || 'حدث خطأ غير متوقع', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] dark:bg-slate-950 flex flex-col transition-colors" dir="rtl">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 shrink-0 transition-colors shadow-sm">
        <button 
          type="button"
          onClick={onClose}
          className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors shadow-sm outline-none cursor-pointer shrink-0 active:scale-95"
          aria-label="الرجوع"
          title="رجوع"
        >
          <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
        </button>
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white leading-none transition-colors">
            المكافآت
          </h3>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar-slate stable-scrollbar flex-1">
        <div className="max-w-md mx-auto w-full space-y-4 sm:space-y-6">

          {/* Card 1: Centered Big Number Reward Days + Usage Action */}
          <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 text-center shadow-sm dark:shadow-xl relative overflow-hidden flex flex-col items-center justify-center transition-colors">
            <div className="relative z-10 flex flex-col items-center w-full">
              {/* Big Number */}
              <span className="text-6xl sm:text-7xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight leading-none mb-2 drop-shadow-sm transition-colors">
                {rewardDays}
              </span>
              
              {/* Clean Single Label without duplicate digits */}
              <span className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-200 mb-6 transition-colors">
                {rewardDays === 0
                  ? "أيام مجانية في رصيدك"
                  : rewardDays === 1
                  ? "يوم مجاني في رصيدك"
                  : rewardDays === 2
                  ? "يومان مجانيان في رصيدك"
                  : "أيام مجانية في رصيدك"}
              </span>

              {/* Action Button: استخدام */}
              <button
                type="button"
                onClick={handleUseRewardDays}
                disabled={rewardDays <= 0 || isSubActive || isSubmitting}
                className="w-full sm:w-auto min-w-[200px] h-14 px-6 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:active:bg-emerald-600 text-white dark:text-slate-950 font-black text-base rounded-2xl transition-all shadow-md hover:shadow-emerald-500/20 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:border disabled:border-slate-200 dark:disabled:border-slate-700/80 disabled:opacity-90 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-current" />
                    <span>جارٍ الاستخدام...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-current fill-current" />
                    <span>استخدام</span>
                  </>
                )}
              </button>
              
              {/* High-Contrast Alert Box - Only shown if user has rewards but subscription is active */}
              {rewardDays > 0 && isSubActive && (
                <div className="mt-4 w-full text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 rounded-2xl border border-amber-300 dark:border-amber-500/40 text-center leading-relaxed transition-colors">
                  عفواً، لا يمكن استخدام المكافأة إلا بعد انتهاء اشتراكك الحالي
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Single Concise Referral Condition */}
          <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-colors">
            <div className="flex items-center gap-3.5 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 transition-colors">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 border border-emerald-300/80 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-400 flex items-center justify-center shrink-0 transition-colors">
                <Sparkles className="w-5.5 h-5.5" />
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-relaxed transition-colors">
                  مع كل تجديد باقة شهرية لأي جراج من ترشيحك، هتاخد يوم مجاني في رصيدك.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
});

RewardsModal.displayName = 'RewardsModal';

