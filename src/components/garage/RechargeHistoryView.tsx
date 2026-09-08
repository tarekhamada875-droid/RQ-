import { useState, useEffect, useMemo, memo } from 'react';
import { ChevronRight, Zap, Clock, User } from 'lucide-react';
import { firestoreService } from '../../services';
import { ActivityLog, Garage } from '../../types';
import { safeDate } from '../../utils';
import { getCleanPackageInfo, DEFAULT_PACKAGES } from '../../constants/packages';

interface RechargeHistoryViewProps {
  garage: Garage;
  onClose: () => void;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
  onToggleMenu?: () => void;
}

export const RechargeHistoryView = memo(({ garage, onClose, showToast: _showToast }: RechargeHistoryViewProps) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to activity logs for this garage in real-time
  useEffect(() => {
    // Lock body scroll
    document.body.style.overflow = 'hidden';

    // Safety fallback timeout in case of network latency
    const fallbackTimer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    // Subscribe to garage recharge logs
    const unsub = firestoreService.subscribeToGarageRechargeLogs(
      garage.id,
      (rechargeLogs) => {
        clearTimeout(fallbackTimer);
        setLogs(rechargeLogs);
        setIsLoading(false);
      },
      50,
      () => {
        clearTimeout(fallbackTimer);
        setIsLoading(false);
      }
    );

    return () => {
      clearTimeout(fallbackTimer);
      unsub();
      // Unlock body scroll
      document.body.style.overflow = 'unset';
    };
  }, [garage.id]);

  const resolvePackagePrice = (
    rawPkgName: string,
    logRevenue: number | undefined,
    logAmount: number | undefined,
    logPackageId: string | undefined,
    garageObj: Garage
  ): number => {
    const cleanName = (rawPkgName || '').trim();

    // 1. Explicit Trial / Free Package Check (Must resolve to 0)
    if (
      garageObj?.isTrial ||
      cleanName.includes('تجريبية') ||
      cleanName.includes('تجريبي') ||
      cleanName.includes('هدية') ||
      cleanName.includes('مجانية') ||
      cleanName.includes('مجاني') ||
      cleanName.includes('trial') ||
      logPackageId === 'trial'
    ) {
      return 0;
    }

    // 2. If revenue or amount is explicitly 0 in details, and it's marked as trial or free
    if (logRevenue === 0 || logAmount === 0) {
      // If the name or log indicates trial, return 0
      if (cleanName.includes('تفعيل') && !cleanName.includes('اشتراك')) {
        return 0;
      }
    }

    const candidate = typeof logRevenue === 'number' && logRevenue > 0 ? logRevenue : (typeof logAmount === 'number' && logAmount > 0 ? logAmount : 0);
    const totalRev = garageObj?.totalAdminRevenue || 0;
    const lastAmt = garageObj?.lastRechargeAmount || 0;

    if (candidate > 0 && (totalRev <= 500 || candidate !== totalRev)) {
      return candidate;
    }

    if (lastAmt > 0 && (totalRev <= 500 || lastAmt !== totalRev)) {
      return lastAmt;
    }

    const matched = DEFAULT_PACKAGES.find(p => 
      p.name === cleanName || 
      (logPackageId && p.id === logPackageId) || 
      (logPackageId && p.id.toLowerCase() === logPackageId.toLowerCase())
    );
    if (matched && matched.price > 0) {
      return matched.price;
    }

    const priceMatch = cleanName.match(/(\d+)\s*(ج|ج\.م|EGP)/i);
    if (priceMatch) {
      const p = parseInt(priceMatch[1], 10);
      if (p > 0) return p;
    }

    if (cleanName.includes('اليومية') || cleanName.includes('يومية')) {
      if (cleanName.includes('30')) return 15;
      if (cleanName.includes('50') && !cleanName.includes('الباقة اليومية')) return 25;
      return 50;
    }

    if (cleanName.includes('نصف شهر') || cleanName.includes('15 يوم') || cleanName.includes('15-day')) {
      if (cleanName.includes('30')) return 120;
      if (cleanName.includes('50')) return 180;
      if (cleanName.includes('مفتوح')) return 280;
      return 180;
    }

    if (cleanName.includes('شهرية') || cleanName.includes('30 يوم') || cleanName.includes('شهر')) {
      if (cleanName.includes('30')) return 200;
      if (cleanName.includes('50')) return 300;
      if (cleanName.includes('مفتوح')) return 450;
      return 300;
    }

    if (candidate > 0) {
      return candidate;
    }

    if (totalRev > 0 && totalRev <= 500) {
      return totalRev;
    }

    return 50;
  };

  const displayLogs = useMemo(() => {
    const list = [...logs];
    if (list.length === 0 && garage) {
      if (garage.isTrial) {
        list.push({
          id: `initial_trial_${garage.id}`,
          garageId: garage.id,
          staffId: 'admin',
          actionType: 'recharge',
          amount: 0,
          timestamp: garage.createdAt || new Date(),
          staffName: 'الإدارة (مدير النظام)',
          plateNumber: 'تفعيل الباقة التجريبية (15 يوم)',
          details: {
            packageName: 'الباقة التجريبية (15 يوم)',
            durationDays: 15,
            carsCount: garage.dailyCapacity || 0,
            revenueAmount: 0,
            rechargedBy: 'الإدارة (مدير النظام)'
          }
        } as ActivityLog);
      } else if (garage.activePackageName || (garage as any).packageName) {
        const pkgName = garage.activePackageName || (garage as any).packageName || 'باقة الاشتراك';
        const cleanInfo = getCleanPackageInfo({ name: pkgName });
        const revenue = resolvePackagePrice(pkgName, undefined, undefined, (garage as any).packageId || (garage as any).activePackageId, garage);
        
        const staffText = 'الإدارة (مدير النظام)';
        list.push({
          id: `initial_pkg_${garage.id}`,
          garageId: garage.id,
          staffId: 'admin',
          actionType: 'recharge',
          amount: revenue,
          timestamp: (garage as any).lastRechargeDate || garage.createdAt || new Date(),
          staffName: staffText,
          plateNumber: pkgName,
          details: {
            packageName: pkgName,
            durationDays: cleanInfo.durationDays || 30,
            carsCount: garage.dailyCapacity || 0,
            revenueAmount: revenue,
            rechargedBy: staffText
          }
        } as ActivityLog);
      }
    }
    return list.sort((a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime());
  }, [logs, garage]);

  const latestRecharge = useMemo(() => {
    return displayLogs[0] || null;
  }, [displayLogs]);

  const getLogDetails = (log: ActivityLog) => {
    if ((log.details as any)?.type === 'referral_reward' || log.packageId === 'referral_reward' || (log.plateNumber && log.plateNumber.includes('مكافأة إحالة'))) {
      const rawRefName = (log.details as any)?.referredGarageName || log.plateNumber?.replace(/^مكافأة إحالة من\s*|^مكافأة إحالة \(ترشيح\s*/, '').replace(/\)$/, '').split('—')[0].trim() || '';
      const cleanRef = rawRefName ? rawRefName.replace(/^ترشيح\s*/, '').trim() : '';
      return {
        isReferralReward: true,
        packageName: cleanRef ? `هدية ترشيح: ${cleanRef}` : 'هدية ترشيح لجراج جديد',
        durationDays: 1,
        carsCount: 0,
        discountAmount: 0,
        couponCode: null,
        originalRevenueAmount: undefined,
        revenueAmount: 0,
      };
    }

    const rawName = log.details?.packageName || log.plateNumber || garage.activePackageName || 'شحن باقة';
    const cleanInfo = getCleanPackageInfo({ name: rawName, id: log.packageId, durationDays: log.details?.durationDays });

    let durationDays = 30;
    if (typeof log.details?.durationDays === 'number' && log.details.durationDays > 0) {
      durationDays = log.details.durationDays;
    } else {
      const text = log.plateNumber || '';
      const daysMatch = text.match(/(\d+)\s*يوم/);
      if (daysMatch) {
        durationDays = parseInt(daysMatch[1], 10);
      } else {
        durationDays = cleanInfo.durationDays || 30;
      }
    }

    const calculatedRevenue = resolvePackagePrice(rawName, log.details?.revenueAmount, log.amount, log.packageId, garage);

    if (log.details && log.details.packageName) {
      return {
        packageName: log.details.packageName,
        durationDays,
        carsCount: log.details.carsCount ?? (cleanInfo.isUnlimited ? 0 : (garage.dailyCapacity || 40)),
        discountAmount: log.details.discountAmount ?? 0,
        couponCode: log.details.couponCode || null,
        originalRevenueAmount: log.details.originalRevenueAmount,
        revenueAmount: calculatedRevenue,
      };
    }
    const text = log.plateNumber || '';
    return {
      packageName: text.replace(/تجديد اشتراك:\s*|شحن\s*/g, '').split('(')[0].trim() || 'شحن باقة',
      durationDays,
      carsCount: text.includes('مفتوح') ? 0 : (garage.dailyCapacity || 40),
      discountAmount: 0,
      couponCode: null,
      originalRevenueAmount: undefined,
      revenueAmount: calculatedRevenue,
    };
  };

  // Check if there is a "New" recharge that we haven't acknowledged
  useEffect(() => {
    if (latestRecharge && !isLoading) {
      // Mark as acknowledged immediately so the dashboard notification/dot turns off instantly or upon next visit
      localStorage.setItem(`acknowledged_recharge_${garage.id}`, latestRecharge.id);
    }
  }, [latestRecharge, isLoading, garage.id]);

  // When a new recharge is received in real-time, update seen last recharge so we track it
  useEffect(() => {
    if (latestRecharge) {
      const lastSeenId = localStorage.getItem(`seen_last_recharge_${garage.id}`);
      
      if (lastSeenId !== latestRecharge.id) {
        // Update seen last recharge so track state is correct
        localStorage.setItem(`seen_last_recharge_${garage.id}`, latestRecharge.id);
      }
    }
  }, [latestRecharge, garage.id]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'غير معروف';
    const date = safeDate(timestamp);
    return date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'غير معروف';
    const date = safeDate(timestamp);
    return date.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-[#faf9f6] dark:bg-slate-950 z-[100] flex flex-col pt-safe px-safe overflow-hidden transition-colors" dir="rtl">
      {/* Header */}
      <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 z-40 w-full shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-4 w-full">
          <button 
            type="button"
            onClick={onClose}
            className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors shadow-sm outline-none shrink-0"
            aria-label="الرجوع"
            title="رجوع"
          >
            <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
          </button>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">سجل شحن الباقات</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">كل عمليات الشحن والهدايا السابقة للجراج</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 pb-10 overflow-y-auto custom-scrollbar stable-scrollbar">
        
        {/* Previous History list */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">سجل العمليات السابقة</h3>
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-rose-500 animate-spin" />
              <p className="text-sm font-bold text-slate-400">جاري تحميل سجل الشحن...</p>
            </div>
          ) : displayLogs.length === 0 ? (
            <div className="bg-[#faf9f6] dark:bg-slate-900 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-800">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800">
                <Zap className="w-8 h-8 text-slate-300 dark:text-slate-700" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">لا يوجد تاريخ شحن مسجل لهذا الجراج.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayLogs.map((log) => {
                const details = getLogDetails(log);
                return (
                  <div
                    key={log.id}
                    className="bg-[#faf9f6] dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4.5 flex flex-col hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm"
                  >
                    {/* Top row: Type Tag & Status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1 ${
                        (details as any).isReferralReward 
                          ? 'text-amber-800 dark:text-amber-300 bg-amber-500/15 border border-amber-300/50 dark:border-amber-700/50' 
                          : details.packageName?.includes('تجريبية') || details.packageName?.includes('تجريبي') || (garage as any)?.isTrial
                          ? 'text-amber-800 dark:text-amber-300 bg-amber-500/15 border border-amber-300/50 dark:border-amber-700/50'
                          : details.revenueAmount === 0
                          ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-300/50 dark:border-emerald-700/50'
                          : 'text-blue-800 dark:text-blue-300 bg-blue-500/15 border border-blue-300/50 dark:border-blue-700/50'
                      }`}>
                        {(details as any).isReferralReward
                          ? '🎁 هدية ترشيح'
                          : details.packageName?.includes('تجريبية') || details.packageName?.includes('تجريبي') || (garage as any)?.isTrial
                          ? '🎁 فترة تجريبية'
                          : details.revenueAmount === 0
                          ? '🎁 باقة مجانية'
                          : '⚡ شحن باقة'}
                      </span>

                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        مكتملة
                      </span>
                    </div>

                    {/* Main Details */}
                    <div className="flex justify-between items-start gap-3 mt-3">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <h4 className="text-sm md:text-base font-black text-slate-800 dark:text-slate-100 leading-snug">
                            {details.packageName}
                          </h4>
                          {details.discountAmount > 0 && (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/50">
                              خصم {details.discountAmount} ج.م {details.couponCode ? `[${details.couponCode}]` : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/50 px-2.5 py-0.5 rounded-md font-mono">
                            {(details as any).isReferralReward ? '+1 يوم هدية' : `+${details.durationDays} يوم`}
                          </span>
                          {!(details as any).isReferralReward && (
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                              {details.carsCount === 0 ? 'سعة مفتوحة' : `${details.carsCount} سيارة`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 text-left">
                        {details.originalRevenueAmount !== undefined && details.originalRevenueAmount !== details.revenueAmount ? (
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 line-through">
                              {details.originalRevenueAmount} ج.م
                            </span>
                            <span className="text-sm md:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                              {details.revenueAmount} ج.م
                            </span>
                          </div>
                        ) : (details as any).isReferralReward || details.revenueAmount === 0 ? (
                          <span className="text-sm md:text-base font-black text-amber-500 dark:text-amber-400">
                            مجاناً 🎁
                          </span>
                        ) : (
                          <span className="text-sm md:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            {details.revenueAmount} <span className="text-xs text-slate-400 font-normal">ج.م</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ticket dashed divider */}
                    <div className="w-full border-t border-dashed border-slate-200 dark:border-slate-800 my-3" />

                    {/* Bottom row: Time & Responsibility */}
                    <div className="flex justify-between items-center text-xs text-slate-400 dark:text-slate-500">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                        <span>{formatTime(log.timestamp)} — {formatDate(log.timestamp)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 px-2.5 py-1 rounded-full text-2xs md:text-xs">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-300 font-bold">
                          {(() => {
                            let raw = log.details?.rechargedBy || log.staffName || log.operatorName || 'النظام';
                            raw = raw.replace(/\s*—\s*مكافأة إحالة/g, '').replace(/المسؤول:\s*/g, '').trim();
                            if (raw.includes('مدير النظام') || raw.toLowerCase().includes('admin') || raw.includes('الإدارة')) {
                              return 'بواسطة: الإدارة';
                            }
                            return `بواسطة: ${raw}`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
});
