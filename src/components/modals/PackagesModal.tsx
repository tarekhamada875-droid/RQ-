import React, { useState, memo } from 'react';
import { Package, Garage } from '../../types';
import { getCleanPackageInfo, getDefaultDurationFilter, filterPackagesForGarage } from '../../constants/packages';
import { ChevronRight, Clock, Sparkles, Filter, Wallet, CheckCircle2, Loader2, Zap, Smartphone, Package as PackageIcon } from 'lucide-react';
import { calculateFinalPrice } from '../../utils';
import { useSystemSubscribersFlatFee } from '../../hooks/useSystemSubscribersFlatFee';
import { garageService } from '../../services/garageService';
import { BorderShimmer } from '../garage/BorderShimmer';

interface PackagesModalProps {
  packages: Package[];
  onClose: () => void;
  garageHourlyRate?: number;
  walletNumber?: string;
  onToggleMenu?: () => void;
  subscriptionPrices?: { weekly?: number; biweekly?: number; monthly?: number };
  hasMonthlySubscribers?: boolean;
  referrerId?: string | null;
  garage?: Garage | null;
  garageId?: string;
  garageBalance?: number;
  isLoading?: boolean;
  onSubscribedSuccess?: (updatedGarageInfo?: any) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  initialDurationFilter?: number;
}

export { getCleanPackageInfo };

export const PackagesModal: React.FC<PackagesModalProps> = memo(({ 
  packages, 
  onClose, 
  walletNumber = "",
  hasMonthlySubscribers = false,
  referrerId: _referrerId = null,
  garage = null,
  garageId = '',
  garageBalance = 0,
  isLoading = false,
  onSubscribedSuccess,
  showToast,
  initialDurationFilter
}) => {
  const allPackages = React.useMemo(
    () => (Array.isArray(packages) ? packages : []),
    [packages],
  );
  const rawList = React.useMemo(() => {
    return filterPackagesForGarage(allPackages, hasMonthlySubscribers);
  }, [allPackages, hasMonthlySubscribers]);

  const availableDurations = React.useMemo(() => {
    const set = new Set(rawList.map(p => getCleanPackageInfo(p).durationDays));
    return Array.from(set).sort((a, b) => a - b);
  }, [rawList]);

  const [selectedDurationFilter, setSelectedDurationFilter] = useState<number>(() => {
    if (initialDurationFilter && rawList.some(p => getCleanPackageInfo(p).durationDays === initialDurationFilter)) {
      return initialDurationFilter;
    }
    return getDefaultDurationFilter(rawList, hasMonthlySubscribers);
  });
  const subscriberFlatFee = useSystemSubscribersFlatFee();
  const effectiveReferralFee = 0;

  // Self-Service Subscribe States
  const effectiveGarageId = garageId || garage?.id || '';
  const currentBalance = garage?.balance !== undefined ? Number(garage.balance) : Number(garageBalance || 0);
  const [pendingPackage, setPendingPackage] = useState<Package | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (availableDurations.length > 0 && !availableDurations.includes(selectedDurationFilter)) {
      setSelectedDurationFilter(getDefaultDurationFilter(rawList, hasMonthlySubscribers));
    }
  }, [availableDurations, selectedDurationFilter, rawList, hasMonthlySubscribers]);

  const getDurationLabel = (d: number) => {
    if (d === 1) return '1 يوم';
    if (d === 7) return 'أسبوعي';
    if (d === 15) return '15 يوم';
    if (d === 30) return 'شهري';
    return `${d} يوم`;
  };

  const formatNumber = (num: number | string) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const rawDigits = React.useMemo(() => {
    return walletNumber ? walletNumber.replace(/\D/g, '') : '';
  }, [walletNumber]);

  const formattedWalletNumber = React.useMemo(() => {
    if (rawDigits.length === 11) {
      return `${rawDigits.slice(0, 4)} - ${rawDigits.slice(4, 7)} - ${rawDigits.slice(7, 11)}`;
    }
    return walletNumber ? walletNumber.trim() : '';
  }, [rawDigits, walletNumber]);

  const displayPackages = rawList
    .map(p => {
      const { finalPrice } = calculateFinalPrice(p, hasMonthlySubscribers, subscriberFlatFee, effectiveReferralFee);
      return {
        ...p,
        _sortPrice: finalPrice
      };
    })
    .sort((a, b) => (a as any)._sortPrice - (b as any)._sortPrice);

  const filteredPackages = displayPackages.filter(pkg => {
    const info = getCleanPackageInfo(pkg);
    return info.durationDays === selectedDurationFilter;
  });

  const hasUnlimitedInFiltered = filteredPackages.some(p => getCleanPackageInfo(p).isUnlimited);
  const maxCapInFiltered = Math.max(...filteredPackages.map(p => getCleanPackageInfo(p).dailyCapacity || 0));

  const handleConfirmSelfSubscribe = async () => {
    if (!pendingPackage || !effectiveGarageId || isSubscribing) return;
    setIsSubscribing(true);
    setErrorMessage(null);

    try {
      const result = await garageService.garageSelfSubscribe(effectiveGarageId, pendingPackage.id, pendingPackage);
      setSubscribeSuccess(true);
      if (showToast) {
        showToast(`تم تفعيل باقة ${pendingPackage.name} وخصم المبلغ من رصيد المحفظة بنجاح.`, 'success');
      }
      if (onSubscribedSuccess) {
        onSubscribedSuccess(result);
      }
      setTimeout(() => {
        setSubscribeSuccess(false);
        setPendingPackage(null);
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Self subscribe failed:', err);
      const msg = err?.message || 'حدث خطأ أثناء تفعيل الاشتراك. يرجى المحاولة مرة أخرى.';
      setErrorMessage(msg);
      if (showToast) {
        showToast(msg, 'error');
      }
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-100 dark:bg-slate-950 flex flex-col transition-colors text-slate-900 dark:text-white" dir="rtl">
      {/* Sleek App Bar Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="w-10 h-10 bg-amber-400 text-slate-950 rounded-xl flex items-center justify-center hover:bg-amber-500 transition-colors shadow-sm outline-none cursor-pointer shrink-0 active:scale-95"
            title="رجوع"
          >
            <ChevronRight className="w-5.5 h-5.5 text-slate-950 stroke-[3.5]" />
          </button>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight transition-colors">
              شحن الرصيد والباقات
            </h3>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar-slate stable-scrollbar flex-1">
        <div className="max-w-xl mx-auto w-full space-y-4 sm:space-y-5">
          
          {/* Unified Wallet & Recharge Card - Dark Hero Card with Direct One-Tap Copy */}
          <div className="bg-slate-900 text-white rounded-3xl border border-slate-800 p-4 sm:p-5 shadow-lg space-y-4 transition-colors">
            {/* Top Row: Balance Display */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-400/20 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Wallet className="w-5.5 h-5.5" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-300 block">رصيدك</span>
                </div>
              </div>

              <div className="flex items-baseline gap-1 font-mono bg-slate-950 px-3.5 py-1.5 rounded-2xl border border-slate-800">
                <span className="text-2xl sm:text-3xl font-black text-amber-400">{formatNumber(currentBalance)}</span>
                <span className="text-xs font-black text-amber-400/80">ج.م</span>
              </div>
            </div>

            {/* Middle Section: Clean Wallet Number */}
            <div className="bg-slate-950/90 rounded-2xl border border-slate-800/90 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>رقم المحفظة:</span>
                </span>
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>الشحن: 9 ص - 5 م</span>
                </div>
              </div>

              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-center">
                {formattedWalletNumber ? (
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-300 tracking-wider dir-ltr select-all" dir="ltr">
                    {formattedWalletNumber}
                  </span>
                ) : (
                  <span className="text-xs sm:text-sm font-bold text-slate-400">
                    لم يتم تحديد رقم المحفظة بعد - يرجى التواصل مع الإدارة
                  </span>
                )}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {/* Skeleton Duration Tabs */}
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-200/80 dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 animate-pulse">
                <div className="h-9 bg-slate-300 dark:bg-slate-800 rounded-xl" />
                <div className="h-9 bg-slate-300 dark:bg-slate-800 rounded-xl" />
                <div className="h-9 bg-slate-300 dark:bg-slate-800 rounded-xl" />
              </div>

              {/* Skeleton Package Cards */}
              <div className="space-y-3.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="p-4 sm:p-5 rounded-3xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse space-y-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-6 w-36 bg-slate-200 dark:bg-slate-800 rounded-xl" />
                      <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-full" />
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950/70 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded-md" />
                        <div className="h-8 w-28 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                      </div>
                      <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800" />
                      <div className="h-4 w-44 bg-slate-200 dark:bg-slate-800 rounded-md" />
                    </div>
                    <div className="w-full h-12 rounded-2xl bg-slate-200 dark:bg-slate-800" />
                  </div>
                ))}
              </div>
            </div>
          ) : allPackages.length === 0 ? (
            <div className="text-center py-10 px-4 bg-slate-100/80 dark:bg-slate-900/60 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
              <PackageIcon className="w-10 h-10 text-amber-500 mx-auto opacity-70" />
              <div className="space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-200 text-base">لا توجد باقات متاحة حالياً</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">يرجى التواصل مع إدارة النظام لإضافة أو تفعيل الباقات.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Duration Filter Tabs with Badge Counts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    اختر مدة الاشتراك:
                  </span>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {filteredPackages.length} باقة متاحة
              </span>
            </div>

            <div className={`grid gap-1.5 p-1.5 bg-slate-200/80 dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 transition-colors ${
              availableDurations.length === 1 ? 'grid-cols-1' :
              availableDurations.length === 2 ? 'grid-cols-2' :
              availableDurations.length === 3 ? 'grid-cols-3' :
              'grid-cols-2 sm:grid-cols-4'
            }`}>
              {availableDurations.map((dur) => {
                const isSelected = selectedDurationFilter === dur;

                return (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setSelectedDurationFilter(dur)}
                    className={`py-2.5 px-4 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 shadow-sm scale-[1.01]'
                        : 'text-slate-700 hover:text-slate-950 hover:bg-white/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span>{getDurationLabel(dur)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Packages List - Structured Professional Cards */}
          {filteredPackages.length === 0 ? (
            <div className="text-center py-8 px-4 bg-slate-100/80 dark:bg-slate-900/60 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-2">
              <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">لا توجد باقات للمدة المحددة</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">اختر مدة اشتراك أخرى للاطلاع على الباقات المتاحة.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredPackages.map((pkg) => {
              const info = getCleanPackageInfo(pkg);
              const { finalPrice: effectivePrice, displayBasePrice, hasDiscount } = calculateFinalPrice(pkg, hasMonthlySubscribers, subscriberFlatFee, effectiveReferralFee);

              const packageName = info.displayName;
              const isTopTier = filteredPackages.length > 1 && (
                info.isUnlimited || (!hasUnlimitedInFiltered && info.dailyCapacity !== null && info.dailyCapacity === maxCapInFiltered && maxCapInFiltered > 0)
              );

              const canAfford = currentBalance >= effectivePrice;
              const missingAmount = effectivePrice - currentBalance;

              return (
                <div 
                  key={pkg.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden space-y-3.5 ${
                    info.isUnlimited
                      ? 'bg-white dark:bg-slate-900 border-amber-400 dark:border-amber-500/80 shadow-md ring-1 ring-amber-400/20'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800/80 shadow-xs hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Top Header & Price Row (Apple Clean Minimalist) */}
                  <div className="flex items-start justify-between gap-3">
                    {/* Right: Package Title & Features */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                          {packageName}
                        </h4>
                        {isTopTier && (
                          <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                            <Sparkles className="w-3 h-3 text-slate-950" />
                            الأعلى سعة
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="truncate">
                          {info.isUnlimited 
                            ? 'تسجيل سيارات بدون حد أقصى' 
                            : `تسجيل حتى ${info.dailyCapacity} سيارة يومياً`}
                        </span>
                      </div>
                    </div>

                    {/* Left: Clean Price Pill Display */}
                    <div className="text-left shrink-0">
                      <div className="flex items-baseline justify-end gap-1 font-mono">
                        <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-amber-400">
                          {formatNumber(effectivePrice)}
                        </span>
                        <span className="text-xs font-black text-slate-500 dark:text-amber-400/80 font-sans">ج.م</span>
                      </div>
                      
                      {hasDiscount && (
                        <div className="flex flex-col items-end gap-1 mt-1">
                          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                            <span className="text-[10px]">بدلاً من</span>
                            <span className="line-through font-mono">
                              {formatNumber(displayBasePrice)} ج.م
                            </span>
                          </div>
                          <span className="inline-block text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            خصم {pkg.discountType === 'percentage' ? `${pkg.discountValue}%` : `${pkg.discountValue} ج.م`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dedicated Action Pill Button (Apple Style) */}
                  {effectiveGarageId && (
                    canAfford ? (
                      <div className="relative rounded-xl p-[2px] overflow-hidden">
                        <BorderShimmer isActive={true} rx={12} ry={12} color="#fbbf24" dur="2.5s" />
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMessage(null);
                            setPendingPackage(pkg);
                          }}
                          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] whitespace-nowrap bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm relative z-20"
                          title="تفعيل الباقة وخصم المبلغ من الرصيد"
                        >
                          <Zap className="w-4 h-4 text-white shrink-0" />
                          <span>تفعيل الباقة الآن</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMessage(null);
                          setPendingPackage(pkg);
                        }}
                        disabled={true}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 cursor-not-allowed"
                        title={`رصيدك مش كافي لشراء الباقة (محتاج تشحن ${formatNumber(missingAmount)} ج.م)`}
                      >
                        <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          {currentBalance <= 0
                            ? `رصيدك مش كافي (محتاج تشحن ${formatNumber(effectivePrice)} ج.م)`
                            : `رصيدك مش كافي (محتاج تشحن ${formatNumber(missingAmount)} ج.م)`}
                        </span>
                      </button>
                    )
                  )}
                </div>
              );
            })}
            </div>
          )}
          </>
          )}

        </div>
      </div>

      {/* Confirmation & Self-Service Subscription Overlay */}
      {pendingPackage && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-xs animate-overlay-30fps"
          onClick={() => {
            if (!isSubscribing) setPendingPackage(null);
          }}
        >
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 relative overflow-hidden border border-slate-200/80 dark:border-slate-800 animate-popup-30fps shadow-2xl text-slate-900 dark:text-white transition-colors"
            onClick={e => e.stopPropagation()}
          >
            {subscribeSuccess ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white mb-3 shadow-lg shadow-emerald-600/20">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">تم تفعيل الاشتراك بنجاح!</h3>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-xs mt-1">تم خصم قيمة الباقة من رصيد المحفظة</p>
              </div>
            ) : (
              <>
                {(() => {
                  const { finalPrice: effectivePrice } = calculateFinalPrice(pendingPackage, hasMonthlySubscribers, subscriberFlatFee, effectiveReferralFee);
                  const cleanPkgInfo = getCleanPackageInfo(pendingPackage);
                  const remainingBalance = currentBalance - effectivePrice;

                  return (
                    <>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Zap className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-slate-900 dark:text-white">تأكيد تفعيل الاشتراك</h3>
                          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{cleanPkgInfo.displayName}</p>
                        </div>
                      </div>

                      {errorMessage && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl p-3 mb-3">
                          {errorMessage}
                        </div>
                      )}

                      <div className="bg-slate-50 dark:bg-slate-950/70 rounded-2xl p-4 mb-4 border border-slate-200/80 dark:border-slate-800/80 space-y-2 text-xs transition-colors">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 dark:text-slate-400 font-bold">مدة الباقة:</span>
                          <span className="font-black text-slate-900 dark:text-white">{cleanPkgInfo.durationText}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 dark:text-slate-400 font-bold">السعة اليومية:</span>
                          <span className="font-black text-slate-900 dark:text-white">
                            {cleanPkgInfo.isUnlimited ? 'سعة مفتوحة' : `${cleanPkgInfo.dailyCapacity} سيارة/يوم`}
                          </span>
                        </div>
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-2 flex justify-between items-center">
                          <span className="text-slate-500 dark:text-slate-400 font-bold">الرصيد الحالي:</span>
                          <span className="font-black text-amber-600 dark:text-amber-400 font-mono">{formatNumber(currentBalance)} ج.م</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 dark:text-slate-400 font-bold">تكلفة الباقة:</span>
                          <span className="font-black text-rose-500 dark:text-rose-400 font-mono">-{formatNumber(effectivePrice)} ج.م</span>
                        </div>
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-2 flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                          <span className="font-black">الرصيد بعد التفعيل:</span>
                          <span className="font-black font-mono text-sm">{formatNumber(remainingBalance)} ج.م</span>
                        </div>
                      </div>

                      <div className="flex gap-2.5">
                        <button
                          type="button"
                          disabled={isSubscribing || remainingBalance < 0}
                          onClick={handleConfirmSelfSubscribe}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
                        >
                          {isSubscribing ? (
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          ) : (
                            <span>تأكيد التفعيل</span>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isSubscribing}
                          onClick={() => setPendingPackage(null)}
                          className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 dark:hover:text-white font-bold text-xs transition-colors cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

PackagesModal.displayName = 'PackagesModal';


