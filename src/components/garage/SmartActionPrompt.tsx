import React, { useMemo } from 'react';
import { 
  Phone, 
  AlertTriangle, 
  Crown
} from 'lucide-react';
import { calculateFinalPrice } from '../../utils';
import { useSystemSubscribersFlatFee } from '../../hooks/useSystemSubscribersFlatFee';
import { filterPackagesForGarage, getCleanPackageInfo } from '../../constants/packages';
import type { Garage, Package } from '../../types';
import { BorderShimmer } from './BorderShimmer';

interface SmartActionPromptProps {
  garage: Garage;
  packages: Package[];
  walletNumber?: string;
  onOpenPackages: (initialDuration?: number) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  isDailyLimitReached?: boolean;
  isExpired?: boolean;
  todayCount?: number;
  dailyCapacity?: number;
  onSubscribedSuccess?: (updatedGarageInfo?: any) => void;
}

export const SmartActionPrompt: React.FC<SmartActionPromptProps> = ({
  garage,
  packages = [],
  walletNumber = '',
  onOpenPackages,
  showToast: _showToast,
  isDailyLimitReached = false,
  isExpired = false,
  todayCount = 0,
  dailyCapacity = 0,
  onSubscribedSuccess: _onSubscribedSuccess
}) => {
  const subscriberFlatFee = useSystemSubscribersFlatFee();

  // 1. Resolve Target Phone: Always Tarek's System Wallet Number directly
  const targetWalletPhone = useMemo(() => {
    const raw = walletNumber ? walletNumber.replace(/\D/g, '') : '';
    return raw.length >= 10 ? raw : '01000000000';
  }, [walletNumber]);

  // 2. Analyze Available Packages and Balance Eligibility
  const currentBalance = Number(garage?.balance || 0);
  const hasMonthlySubs = Boolean(garage?.hasMonthlySubscribers);
  const isBalanceDepleted = currentBalance <= 0;

  const {
    hasEnoughBalanceForAny,
    recommendedDuration,
    actionButtonText
  } = useMemo(() => {
    const validPackages = filterPackagesForGarage(packages || [], hasMonthlySubs);
    if (!validPackages || validPackages.length === 0) {
      return {
        hasEnoughBalanceForAny: false,
        canAffordMonthly: false,
        recommendedDuration: undefined,
        actionButtonText: 'شوف الباقات ورقم التحويل'
      };
    }

    // Calculate final effective price for each package
    const packagesWithPricing = validPackages.map(pkg => {
      const cleanInfo = getCleanPackageInfo(pkg);
      const { finalPrice } = calculateFinalPrice(pkg, hasMonthlySubs, subscriberFlatFee, 0);
      return {
        pkg,
        durationDays: cleanInfo.durationDays,
        finalPrice,
        canAfford: currentBalance >= finalPrice && finalPrice > 0
      };
    });

    const affordablePackages = packagesWithPricing.filter(p => p.canAfford);
    const hasEnough = affordablePackages.length > 0;

    // Check if user can afford monthly (durationDays >= 30)
    const affordableMonthly = affordablePackages.filter(p => p.durationDays >= 30);
    const canAffordMonth = affordableMonthly.length > 0;

    // Determine recommended duration tab
    let recDuration: number | undefined = undefined;
    let btnText = 'شوف الباقات ورقم التحويل';

    if (hasEnough) {
      if (canAffordMonth) {
        recDuration = 30;
        btnText = 'ادخل واختار باقتك الشهرية';
      } else {
        // Find best affordable duration (e.g. 15 or 7 or 1)
        const highestAffordable = [...affordablePackages].sort((a, b) => b.durationDays - a.durationDays)[0];
        recDuration = highestAffordable?.durationDays || 1;
        if (recDuration === 1) {
          btnText = 'ادخل واختار باقتك اليومية';
        } else if (recDuration === 7) {
          btnText = 'ادخل واختار باقتك الأسبوعية';
        } else if (recDuration === 15) {
          btnText = 'ادخل واختار باقتك (15 يوم)';
        } else {
          btnText = 'ادخل واختار باقتك';
        }
      }
    }

    return {
      hasEnoughBalanceForAny: hasEnough,
      canAffordMonthly: canAffordMonth,
      recommendedDuration: recDuration,
      actionButtonText: btnText
    };
  }, [packages, hasMonthlySubs, subscriberFlatFee, currentBalance]);

  return (
    <div 
      id="smart-action-prompt-card"
      className="bg-[#faf9f6] dark:bg-slate-900 rounded-[2rem] border-2 border-red-500/50 dark:border-red-500/60 relative shrink-0 p-5 sm:p-7 max-w-md md:max-w-xl mx-auto w-full transition-all duration-200 shadow-xl overflow-hidden text-center"
    >
      {/* Alert Icon */}
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/30">
          <AlertTriangle className="w-6 h-6 animate-pulse" />
        </div>
      </div>

      {/* Direct Title in Egyptian Arabic */}
      <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight mb-2">
        {isBalanceDepleted
          ? 'الرصيد خلص'
          : isExpired
            ? 'باقة الجراج خلصت'
            : 'وصلت للحد الأقصى لسيارات النهاردة'}
      </h3>

      {/* Clean Egyptian description / 2-step structured layout */}
      {isBalanceDepleted ? (
        <div className="mb-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
          <p>حوّل المبلغ الذي تريد إضافته إلى محفظة الإدارة، ثم اتصل بنا لتأكيد التحويل وإضافة الرصيد.</p>
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/60 px-3 py-2">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">رقم محفظة الإدارة</div>
            <div className="mt-0.5 font-mono text-base font-black text-slate-900 dark:text-white" dir="ltr">{targetWalletPhone}</div>
          </div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">بعد التحويل، اذكر المبلغ ورقم المحفظة التي أرسلت منها.</p>
        </div>
      ) : hasEnoughBalanceForAny ? (
        <div className="mb-5 space-y-1.5 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-black flex items-center justify-center shrink-0">1</span>
            <span>معاك رصيد في المحفظة:</span>
            <strong className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">({currentBalance.toLocaleString()} ج.م)</strong>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-black flex items-center justify-center shrink-0">2</span>
            <span>
              {recommendedDuration === 30 
                ? 'دوس على الزرار ده علشان تشحن الباقة الشهرية'
                : recommendedDuration === 15
                ? 'دوس على الزرار ده علشان تشحن باقة الـ 15 يوم'
                : recommendedDuration === 7
                ? 'دوس على الزرار ده علشان تشحن الباقة الأسبوعية'
                : 'دوس على الزرار ده علشان تشحن الباقة اليومية'}
            </span>
          </div>
          {isDailyLimitReached && !isExpired && (
            <span className="block mt-1 font-mono font-bold text-red-600 dark:text-red-400">
              ({todayCount} / {dailyCapacity} سيارة النهاردة)
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium mb-5 leading-relaxed">
          رصيدك الحالي (<strong className="font-mono font-bold text-slate-900 dark:text-white">{currentBalance.toLocaleString()} ج.م</strong>) ميكفيش التجديد.. حوّل قيمة الباقة كاش الأول، وبعدها اتصل لتأكيد الشحن.
          {isDailyLimitReached && !isExpired && (
            <span className="block mt-1 font-mono font-bold text-red-600 dark:text-red-400">
              ({todayCount} / {dailyCapacity} سيارة النهاردة)
            </span>
          )}
        </p>
      )}

      {/* Main Clean Actions */}
      <div className="space-y-2.5">
        {isBalanceDepleted ? (
          <a
            id="btn-smart-direct-call"
            href={`tel:${targetWalletPhone}`}
            className="w-full min-h-[52px] py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Phone className="w-5 h-5" />
            <span>اتصل لتأكيد التحويل</span>
          </a>
        ) : hasEnoughBalanceForAny ? (
          /* When balance is enough for at least one package: ONLY ONE primary button directing to package page */
          <div className="relative rounded-2xl p-[2px] overflow-hidden">
            <BorderShimmer isActive={true} rx={16} ry={16} color="#fbbf24" dur="2.5s" />
            <button
              id="btn-smart-view-packages"
              type="button"
              onClick={() => onOpenPackages(recommendedDuration)}
              className="w-full min-h-[52px] py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5 cursor-pointer relative z-20"
            >
              <Crown className="w-5 h-5 text-amber-300" />
              <span>{actionButtonText}</span>
            </button>
          </div>
        ) : (
          /* When balance is insufficient: First see packages & transfer number, then call to confirm */
          <>
            {/* Step 1 Button: View packages & transfer number */}
            <button
              id="btn-smart-view-packages"
              type="button"
              onClick={() => onOpenPackages()}
              className="w-full min-h-[52px] py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Crown className="w-5 h-5 text-amber-300" />
              <span>شوف الباقات ورقم التحويل</span>
            </button>

            {/* Step 2 Button: Call to confirm transfer and add balance */}
            <a
              id="btn-smart-direct-call"
              href={`tel:${targetWalletPhone}`}
              className="w-full min-h-[44px] py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>اتصل لتأكيد التحويل وإضافة الرصيد</span>
            </a>
          </>
        )}
      </div>
    </div>
  );
};
