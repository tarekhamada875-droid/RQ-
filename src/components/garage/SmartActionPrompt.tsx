import React, { useState, useMemo } from 'react';
import { 
  Phone, 
  Zap, 
  AlertTriangle, 
  Crown, 
  Loader2, 
  Clock
} from 'lucide-react';
import { garageService } from '../../services/garageService';
import { calculateFinalPrice } from '../../utils';
import { useSystemSubscribersFlatFee } from '../../hooks/useSystemSubscribersFlatFee';
import { filterPackagesForGarage, getCleanPackageInfo } from '../../constants/packages';
import { soundManager } from '../../utils/sounds';
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
        {isExpired ? 'باقة الجراج خلصت' : 'وصلت للحد الأقصى لسيارات النهاردة'}
      </h3>

      {/* Clean Egyptian description / 2-step structured layout */}
      {hasEnoughBalanceForAny ? (
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
        {hasEnoughBalanceForAny ? (
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

interface ExpiringSoonPromptBannerProps {
  garage: Garage;
  packages: Package[];
  walletNumber?: string;
  onOpenPackages: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  remainingHours: number;
}

export const ExpiringSoonPromptBanner: React.FC<ExpiringSoonPromptBannerProps> = ({
  garage,
  packages = [],
  walletNumber = '',
  onOpenPackages,
  showToast,
  remainingHours
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const subscriberFlatFee = useSystemSubscribersFlatFee();

  const targetWalletPhone = useMemo(() => {
    const raw = walletNumber ? walletNumber.replace(/\D/g, '') : '';
    return raw.length >= 10 ? raw : '01000000000';
  }, [walletNumber]);

  const { targetPackage, renewalPrice, hasEnoughBalance } = useMemo(() => {
    const currentBalance = Number(garage?.balance || 0);
    const hasMonthlySubs = Boolean(garage?.hasMonthlySubscribers);
    const validPackages = filterPackagesForGarage(packages || [], hasMonthlySubs);

    const garageRaw = garage as any;
    let selectedPkg: Package | null = null;
    if (garageRaw?.activePackageId || garageRaw?.packageId) {
      const targetId = garageRaw.activePackageId || garageRaw.packageId;
      selectedPkg = validPackages.find(p => p.id === targetId) || null;
    }
    if (!selectedPkg && (garage?.activePackageName || garageRaw?.packageName || garage?.lastRechargePackageName)) {
      const targetName = garage?.activePackageName || garageRaw?.packageName || garage?.lastRechargePackageName;
      selectedPkg = validPackages.find(p => p.name === targetName) || null;
    }
    if (!selectedPkg && validPackages.length > 0) {
      selectedPkg = validPackages[0];
    }
    if (!selectedPkg) return { targetPackage: null, renewalPrice: 0, hasEnoughBalance: false };

    const { finalPrice } = calculateFinalPrice(selectedPkg, hasMonthlySubs, subscriberFlatFee, 0);
    return {
      targetPackage: selectedPkg,
      renewalPrice: finalPrice,
      hasEnoughBalance: currentBalance >= finalPrice && finalPrice > 0
    };
  }, [garage?.balance, garage?.hasMonthlySubscribers, (garage as any)?.activePackageId, (garage as any)?.packageName, garage?.activePackageName, garage?.lastRechargePackageName, packages, subscriberFlatFee]);

  const handleInstantRenew = async () => {
    if (!targetPackage || !garage?.id || isSubscribing) return;
    setIsSubscribing(true);
    try {
      soundManager.play('setting');
      await garageService.garageSelfSubscribe(garage.id, targetPackage.id, targetPackage);
      soundManager.play('checkIn');
      showToast?.('تم تجديد الباقة وتمديد الصلاحية بنجاح!', 'success');
      setIsDismissed(true);
    } catch (err: any) {
      soundManager.play('error');
      const msg = err?.message === 'INSUFFICIENT_BALANCE' 
        ? 'رصيد المحفظة لا يكفي لتجديد هذه الباقة' 
        : (err?.message || 'تعذر التجديد، يرجى المحاولة مرة أخرى');
      showToast?.(msg, 'error');
    } finally {
      setIsSubscribing(false);
    }
  };

  if (isDismissed || remainingHours > 24 || remainingHours <= 0) return null;

  return (
    <div 
      id="expiring-soon-smart-banner"
      className="mb-3 p-3 sm:p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm"
    >
      <div className="flex items-center gap-2.5 text-right w-full sm:w-auto">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
            تنبيه: باقتك هتخلص كمان <span className="font-mono text-amber-600 dark:text-amber-400">{remainingHours} ساعة</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
        {hasEnoughBalance && targetPackage ? (
          <button
            type="button"
            disabled={isSubscribing}
            onClick={handleInstantRenew}
            className="min-h-[38px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSubscribing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 fill-white" />
            )}
            <span>تجديد دلوقتي ({renewalPrice} ج.م)</span>
          </button>
        ) : (
          <a
            href={`tel:${targetWalletPhone}`}
            className="min-h-[38px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5 fill-white" />
            <span>اتصال لتأكيد الشحن</span>
          </a>
        )}

        <button
          type="button"
          onClick={onOpenPackages}
          className="min-h-[38px] px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
        >
          <Crown className="w-3.5 h-3.5 text-amber-500" />
          <span>الباقات</span>
        </button>
      </div>
    </div>
  );
};
