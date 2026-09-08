import React, { useState, memo } from 'react';
import { Package, Garage } from '../../types';
import { getCleanPackageInfo, getDefaultDurationFilter, filterPackagesForGarage, DEFAULT_PACKAGES } from '../../constants/packages';
import { ChevronRight, Clock, Car, Sparkles, Filter, Wallet, CheckCircle2, Loader2, Zap } from 'lucide-react';
import { calculateFinalPrice } from '../../utils';
import { useSystemSubscribersFlatFee, useSystemDelegateCommissions } from '../../hooks/useSystemSubscribersFlatFee';
import { garageService } from '../../services/garageService';

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
  onSubscribedSuccess?: (updatedGarageInfo?: any) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export { getCleanPackageInfo };

export const PackagesModal: React.FC<PackagesModalProps> = memo(({ 
  packages, 
  onClose, 
  walletNumber = "01552411323",
  hasMonthlySubscribers = false,
  referrerId = null,
  garage = null,
  garageId = '',
  garageBalance = 0,
  onSubscribedSuccess,
  showToast
}) => {
  const allPackages = (packages && packages.length > 0) ? packages : DEFAULT_PACKAGES;
  const rawList = React.useMemo(() => {
    return filterPackagesForGarage(allPackages, hasMonthlySubscribers);
  }, [allPackages, hasMonthlySubscribers]);

  const availableDurations = React.useMemo(() => {
    const set = new Set(rawList.map(p => getCleanPackageInfo(p).durationDays));
    return Array.from(set).sort((a, b) => a - b);
  }, [rawList]);

  const [selectedDurationFilter, setSelectedDurationFilter] = useState<number>(() => getDefaultDurationFilter(rawList, hasMonthlySubscribers));
  const subscriberFlatFee = useSystemSubscribersFlatFee();
  const delegateCommissions = useSystemDelegateCommissions();
  const effectiveReferralFee = referrerId ? delegateCommissions : 0;

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
    if (d === 1) return 'يومي';
    if (d === 7) return 'أسبوعي';
    if (d === 15) return '15 يوم';
    if (d === 30) return 'شهري';
    return `${d} يوم`;
  };

  const formatNumber = (num: number | string) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const formattedWalletNumber = React.useMemo(() => {
    const digits = walletNumber ? walletNumber.replace(/\D/g, '') : '01552411323';
    if (digits.length === 11) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
    }
    return walletNumber || '015 52 41 13 23';
  }, [walletNumber]);

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
          
          {/* Unified Compact Wallet & Recharge Card - Dark Hero Card for Ultra Contrast */}
          <div className="bg-slate-900 text-white rounded-3xl border border-slate-800 p-4 sm:p-5 shadow-md space-y-3.5 transition-colors">
            {/* Top Row: Balance on Left, Icon + Label on Right */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-400/20 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-300 block">رصيد المحفظة المتاح</span>
                </div>
              </div>

              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl sm:text-3xl font-black text-amber-400">{currentBalance}</span>
                <span className="text-xs font-black text-amber-400/80">ج.م</span>
              </div>
            </div>

            {/* Bottom Row: Direct Phone & Operating Hours */}
            <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-3 flex flex-col sm:flex-row items-center justify-between gap-2 transition-colors">
              <span className="text-base sm:text-lg font-black font-mono text-amber-300 tracking-wider dir-ltr" dir="ltr">
                {formattedWalletNumber}
              </span>

              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>الشحن: 9 ص - 5 م يومياً</span>
              </div>
            </div>
          </div>

          {/* Duration Filter Tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                اختر مدة الاشتراك:
              </span>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {filteredPackages.length} باقة
              </span>
            </div>

            <div className={`grid gap-1.5 p-1.5 bg-slate-200/80 dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 transition-colors ${
              availableDurations.length === 1 ? 'grid-cols-1' :
              availableDurations.length === 2 ? 'grid-cols-2' :
              availableDurations.length === 3 ? 'grid-cols-3' :
              'grid-cols-2 sm:grid-cols-4'
            }`}>
              {availableDurations.map((dur) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setSelectedDurationFilter(dur)}
                  className={`py-2 px-2 rounded-xl font-black text-xs transition-all text-center cursor-pointer ${
                    selectedDurationFilter === dur
                      ? 'bg-amber-400 text-slate-950 shadow-sm scale-[1.01]'
                      : 'text-slate-700 hover:text-slate-950 hover:bg-white/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
                  }`}
                >
                  {getDurationLabel(dur)}
                </button>
              ))}
            </div>
          </div>

          {/* Packages List - High Contrast Cards */}
          <div className="space-y-3.5">
            {filteredPackages.map((pkg) => {
              const info = getCleanPackageInfo(pkg);
              const { finalPrice: effectivePrice, displayBasePrice, hasDiscount } = calculateFinalPrice(pkg, hasMonthlySubscribers, subscriberFlatFee, effectiveReferralFee);

              const packageName = info.displayName;
              const isTopTier = filteredPackages.length > 1 && (
                info.isUnlimited || (!hasUnlimitedInFiltered && info.dailyCapacity !== null && info.dailyCapacity === maxCapInFiltered && maxCapInFiltered > 0)
              );

              const canAfford = currentBalance >= effectivePrice;

              return (
                <div 
                  key={pkg.id}
                  className={`p-4 sm:p-5 rounded-3xl border-2 transition-all space-y-3.5 ${
                    info.isUnlimited
                      ? 'bg-white dark:bg-slate-900 border-amber-500/80 shadow-md'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Header Row: Full Package Name + Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight transition-colors">
                      {packageName}
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasDiscount && (
                        <span className="text-xs sm:text-sm font-black text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 px-2.5 py-1 rounded-xl whitespace-nowrap shadow-xs">
                          خصم {pkg.discountType === 'percentage' ? `${pkg.discountValue}%` : `${pkg.discountValue} ج.م`}
                        </span>
                      )}
                      {isTopTier && (
                        <span className="bg-amber-400 text-slate-950 font-black text-[10px] sm:text-xs px-2.5 py-1 rounded-full flex items-center gap-1 whitespace-nowrap shadow-xs">
                          <Sparkles className="w-3 h-3" />
                          الأعلى سعة
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price Section: Clean & High Contrast */}
                  <div className="flex items-baseline gap-2 font-mono pt-0.5">
                    <span className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                      {formatNumber(effectivePrice)}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-amber-600/90 dark:text-amber-400/80">ج.م</span>
                    {hasDiscount && (
                      <span className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 line-through mr-1.5">
                        بدلاً من {formatNumber(displayBasePrice)} ج.م
                      </span>
                    )}
                  </div>

                  {/* Feature / Capacity Row in distinct enclosed pill */}
                  <div className="bg-slate-100 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 flex items-center gap-2.5 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                    <div className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Car className="w-4 h-4" />
                    </div>
                    <span>{info.isUnlimited ? 'تسجل عربيات من غير حد أقصى يومياً' : `بتسجل لغاية ${info.dailyCapacity} عربية يومياً`}</span>
                  </div>

                  {/* Dedicated Full-Width Action Button */}
                  {effectiveGarageId && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setPendingPackage(pkg);
                      }}
                      disabled={!canAfford}
                      className={`w-full min-h-[48px] py-3 px-4 rounded-2xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] whitespace-nowrap ${
                        canAfford
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 cursor-not-allowed'
                      }`}
                      title={canAfford ? 'تفعيل الباقة وخصم المبلغ من الرصيد' : currentBalance <= 0 ? 'مفيش رصيد لشراء الباقة' : 'رصيدك مش كافي لشراء الباقة'}
                    >
                      <Zap className="w-4 h-4 shrink-0" />
                      {canAfford ? (
                        <span className="whitespace-nowrap">تفعيل الباقة</span>
                      ) : currentBalance <= 0 ? (
                        <span className="whitespace-nowrap">مفيش رصيد</span>
                      ) : (
                        <span className="whitespace-nowrap">رصيدك مش كافي</span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

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
                          <span className="font-black text-amber-600 dark:text-amber-400 font-mono">{currentBalance} ج.م</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 dark:text-slate-400 font-bold">تكلفة الباقة:</span>
                          <span className="font-black text-rose-500 dark:text-rose-400 font-mono">-{effectivePrice} ج.م</span>
                        </div>
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-2 flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                          <span className="font-black">الرصيد بعد التفعيل:</span>
                          <span className="font-black font-mono text-sm">{remainingBalance} ج.م</span>
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



