/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from "react";
import { Car } from "lucide-react";
import { Announcement } from "../../types";
import { FlipNumber } from "../ui/FlipNumber";
import { useTheme } from "../../utils/ThemeContext";
import {
  resolveShimmerColor,
  isLightColor,
  getRemainingSubscriptionInfo,
  safeDate,
  getEffectiveDailyCapacity,
  isUnlimitedCapacity,
  isSubscriptionExpired,
  packageIdToDays
} from "../../utils";
import { soundManager } from "../../utils/sounds";
import { auth } from "../../firebase";
import { firestoreService } from '../../services';
import { getCairoDateKey } from '../../domain/garage/businessDay';
import { RegistrationCard } from "./RegistrationCard";
import { GarageDashboardOverlays } from "./GarageDashboardOverlays";
import { SmartActionPrompt } from "./SmartActionPrompt";
import { GarageDashboardHeaderAndDrawer } from "./dashboard/GarageDashboardHeaderAndDrawer";
import { GarageSubscriptionCard } from "./dashboard/GarageSubscriptionCard";
import { GarageActiveVehiclesList } from "./dashboard/GarageActiveVehiclesList";

export const GarageDashboardView = memo((props: any) => {
  const {
    garage,
    currentStaff,
    isInputFocused,
    now,
    vehicles = [],
    todayTransactions = [],
    setSelectedVehicle,
    setShowCheckOutModal,
    closeKeyboard,
    newPlateNumber,
    setNewPlateNumber,
    setIsInputFocused,
    plateInputRef,
    handleCheckIn,
    inputRef,
    onLogout,
    showToast,
    packages,
    staffList,
    showPackages,
    setShowPackages,
    showStaffStats,
    setShowStaffStats,
    showSubscribers,
    setShowSubscribers,
    walletNumber = "",
    subscriptionPrices,
    isLoading = false,
  } = props;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme } = useTheme();
  const shimmerColor = resolveShimmerColor(garage?.shimmerColor, theme);
  const [activeTab, setActiveTab] = useState<"main" | "active_vehicles">("main");
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [expiringSubscribersCount, setExpiringSubscribersCount] = useState(0);
  const [isRechargeHistoryOpen, setIsRechargeHistoryOpen] = useState(false);
  const [hasNewRecharge, setHasNewRecharge] = useState(false);
  const [latestRechargeLog, setLatestRechargeLog] = useState<any>(null);
  const [isRechargeNotificationOpen, setIsRechargeNotificationOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isRewardsOpen, setIsRewardsOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [packagesInitialDuration, setPackagesInitialDuration] = useState<number | undefined>(undefined);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const observerTargetRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);
  const [activeAnnouncements, setActiveAnnouncements] = useState<Announcement[]>([]);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<Record<string, boolean>>({});
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const visibleAnnouncement = activeAnnouncements.find(
    (announcement) => !dismissedAnnouncements[announcement.id]
  ) ?? null;

  const garageId = garage?.id;

  useEffect(() => {
    const unsub = firestoreService.onAnnouncementsChange((list) => {
      const relevant = list.filter(a => a.isActive && (a.target === 'all' || a.targetGarageId === garageId));
      setActiveAnnouncements(relevant);
    });
    return () => unsub();
  }, [garageId]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsub();
  }, []);

  const [, setTimeTicker] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTicker(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const prevBalanceRef = useRef<number>(garage?.balance || 0);
  useEffect(() => {
    if (garage?.balance !== undefined) {
      if (garage.balance > prevBalanceRef.current) {
        const diff = garage.balance - prevBalanceRef.current;
        if (showToast) {
          showToast(`تم إضافة ${diff} ج.م للرصيد بنجاح`, 'success');
        }
        try {
          soundManager.play('checkIn');
        } catch {
          // Audio feedback is optional
        }
      }
      prevBalanceRef.current = garage.balance;
    }
  }, [garage?.balance, showToast]);

  const packageDays = useMemo(() => {
    if (!garage) return 30;
    return packageIdToDays(garage.activePackageId || garage.packageId || '', garage.activePackageName || garage.packageName || garage.lastPackageName || '');
  }, [garage]);

  const isDailyPackage = packageDays <= 2;
  const subInfo = getRemainingSubscriptionInfo(garage, packageDays);
  const remainingDays = useMemo(() => subInfo.days, [subInfo]);
  const isCountdownInHours = subInfo.unit === 'hours';
  const countdownValue = subInfo.displayCount;
  const isUrgentRed = subInfo.isUrgentRed;
  const isWarningYellow = isDailyPackage ? (isCountdownInHours && remainingDays === 1) : (remainingDays > 0 && remainingDays <= 3) || isUrgentRed;

  const totalInsideCount = useMemo(
    () =>
      vehicles.length > 0
        ? vehicles.length
        : typeof garage?.carsInside === "number"
          ? Math.max(0, garage.carsInside)
          : 0,
    [vehicles.length, garage?.carsInside],
  );

  const isExpired = isSubscriptionExpired(garage);
  const isLockedOrSuspended = garage?.isLocked || garage?.isSuspended || false;

  useEffect(() => {
    if (!isAuthenticated || !garage?.id) return;
    const unsub = firestoreService.subscribeToGarageRechargeLogs(garage.id, (logs) => {
      const candidateLogs = (logs || []).filter((log: any) => {
        if (!log) return false;
        if (log.details?.type === 'use_referral_reward') return false;
        if (log.plateNumber && String(log.plateNumber).includes('استخدام مكافأة')) return false;
        return true;
      });

      const lastAckId = localStorage.getItem(`acknowledged_recharge_${garage.id}`);
      const lastAckTime = Number(localStorage.getItem(`acknowledged_recharge_time_${garage.id}`) || 0);

      if (candidateLogs.length > 0) {
        const latest = candidateLogs[0];
        const logId = latest.id;
        const logDate = safeDate(latest.timestamp);
        const logTime = logDate.getTime();
        const diffMs = Date.now() - logTime;
        const isRecent = diffMs < 15 * 60 * 1000;
        const isAcknowledged = lastAckId === logId || (lastAckTime > 0 && logTime <= lastAckTime);

        if (!isAcknowledged && isRecent) {
          setHasNewRecharge(true);
          setLatestRechargeLog(latest);
          setIsRechargeNotificationOpen(true);
          if (localStorage.getItem(`dashboard_sound_recharge_${garage.id}`) !== logId) {
            try {
              soundManager.play("checkIn");
            } catch (err) {
              console.error(err);
            }
            localStorage.setItem(`dashboard_sound_recharge_${garage.id}`, logId);
          }
        } else {
          setHasNewRecharge(false);
          setLatestRechargeLog(null);
          setIsRechargeNotificationOpen(false);
        }
      } else if (garage?.lastRechargeDate) {
        const logDate = safeDate(garage.lastRechargeDate);
        const logTime = logDate.getTime();
        const diffMs = Date.now() - logTime;
        const fallbackId = `recharge_${logTime}`;
        const isRecent = diffMs < 15 * 60 * 1000;
        const isAcknowledged = lastAckId === fallbackId || (lastAckTime > 0 && logTime <= lastAckTime);

        if (!isAcknowledged && isRecent) {
          const fallbackLog: any = {
            id: fallbackId,
            garageId: garage.id,
            actionType: 'recharge',
            plateNumber: garage.lastRechargePackageName ? `شحن باقة: ${garage.lastRechargePackageName}` : 'شحن رصيد الجراج',
            amount: garage.lastRechargeAmount || 0,
            timestamp: garage.lastRechargeDate,
            details: {
              packageName: garage.lastRechargePackageName || 'الباقة',
              revenueAmount: garage.lastRechargeAmount || 0,
              isTrial: Boolean(garage?.isTrial)
            }
          };
          setHasNewRecharge(true);
          setLatestRechargeLog(fallbackLog);
          setIsRechargeNotificationOpen(true);
          if (localStorage.getItem(`dashboard_sound_recharge_${garage.id}`) !== fallbackId) {
            try {
              soundManager.play("checkIn");
            } catch (err) {
              console.error(err);
            }
            localStorage.setItem(`dashboard_sound_recharge_${garage.id}`, fallbackId);
          }
        } else {
          setHasNewRecharge(false);
          setLatestRechargeLog(null);
          setIsRechargeNotificationOpen(false);
        }
      } else {
        setHasNewRecharge(false);
        setLatestRechargeLog(null);
        setIsRechargeNotificationOpen(false);
      }
    }, 1);
    return () => unsub();
  }, [garage?.id, isAuthenticated, garage?.lastRechargeDate, garage?.lastRechargeAmount, garage?.lastRechargePackageName, garage?.isTrial]);

  useEffect(
    () => () => {
      document.body.style.overflow = "unset";
    },
    [isLockedOrSuspended],
  );

  useEffect(() => {
    if (isAuthenticated && !currentStaff && garage?.hasMonthlySubscribers && garage?.id) {
      const unsub = firestoreService.subscribeToSubscribers(garage.id, (subs) => {
        const todayZero = new Date();
        todayZero.setHours(0, 0, 0, 0);
        let expiringCount = 0;
        subs.forEach((sub) => {
          const endDate = new Date(sub.endDate);
          if (Math.ceil((endDate.getTime() - todayZero.getTime()) / (1000 * 60 * 60 * 24)) <= 3) {
            expiringCount++;
          }
        });
        setExpiringSubscribersCount(expiringCount);
      });
      return () => unsub();
    }
  }, [garage?.id, currentStaff, isAuthenticated, garage?.hasMonthlySubscribers]);

  const handleAcknowledgeRecharge = useCallback(() => {
    if (latestRechargeLog && garage?.id) {
      localStorage.setItem(`acknowledged_recharge_${garage.id}`, latestRechargeLog.id);
      const logTime = safeDate(latestRechargeLog.timestamp).getTime();
      if (logTime > 0) {
        localStorage.setItem(`acknowledged_recharge_time_${garage.id}`, String(logTime));
      }
    }
    setHasNewRecharge(false);
    setIsRechargeNotificationOpen(false);
  }, [garage?.id, latestRechargeLog]);

  useEffect(() => {
    setItemsPerPage(15);
  }, [activeTab]);

  const sortedVehicles = useMemo(() => {
    return [...(vehicles || [])].sort((a, b) => safeDate(b.entryTime).getTime() - safeDate(a.entryTime).getTime());
  }, [vehicles]);

  const visibleVehicles = sortedVehicles.slice(0, itemsPerPage);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && itemsPerPage < vehicles.length) {
          setItemsPerPage((prev) => prev + 10);
        }
      },
      {
        threshold: 0.1,
        root: scrollContainerRef.current,
        rootMargin: "100px",
      },
    );
    if (observerTargetRef.current) {
      observer.observe(observerTargetRef.current);
    }
    return () => observer.disconnect();
  }, [vehicles.length, itemsPerPage, activeTab]);

  const handleNavigateOverlay = (target: string) => {
    setIsMenuOpen(false);
    setShowSubscribers(target === "subscribers");
    setIsReportsOpen(target === "reports");
    setShowPackages(target === "packages");
    setIsRewardsOpen(target === "rewards");
    setIsRechargeHistoryOpen(target === "history");
    setShowStaffStats(target === "staff");
    setIsAppearanceOpen(target === "appearance");
    setShowTermsModal(target === "terms");
  };

  const todayStr = getCairoDateKey();
  const displayTodayCount = garage?.lastTransactionDate === todayStr ? (garage.todayCount || 0) : 0;
  const isDailyLimitReached = !isUnlimitedCapacity(garage) && displayTodayCount >= getEffectiveDailyCapacity(garage);

  // Check if balance or package status requires the SmartActionPrompt
  const isActiveTrial = garage?.isTrial === true && !isExpired;
  const hasActivePaidPackage = !isExpired && (
    garage?.billingModel === 'subscription' || Boolean(garage?.activePackageName || garage?.packageName)
  );
  const isBalanceDepleted = Number(garage?.balance || 0) <= 0 && !isActiveTrial && !hasActivePaidPackage;
  const shouldShowSmartPrompt = isBalanceDepleted || isDailyLimitReached || isExpired;

  return (
    <div
      className="h-screen h-[100dvh] bg-[#faf9f6] dark:bg-transparent font-sans w-full flex flex-col items-center overflow-hidden relative"
      dir="rtl"
    >
      {/* Header and Slide-Out Drawer Navigation */}
      <GarageDashboardHeaderAndDrawer
        garage={garage}
        currentStaff={currentStaff}
        isInputFocused={isInputFocused}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        visibleAnnouncement={visibleAnnouncement}
        onOpenAnnouncement={(announcement) => {
          setSelectedAnnouncement(announcement);
          setDismissedAnnouncements((prev) => ({
            ...prev,
            [announcement.id]: true,
          }));
        }}
        expiringSubscribersCount={expiringSubscribersCount}
        hasNewRecharge={hasNewRecharge}
        onNavigateOverlay={handleNavigateOverlay}
        onLogout={onLogout}
      />

      <main
        className={`max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto p-4 [@media(max-height:500px)]:p-2.5 w-full flex-1 flex flex-col gap-4 md:gap-6 [@media(max-height:500px)]:gap-2.5 overscroll-contain overflow-y-auto ${
          isInputFocused ? "gap-3 pt-3 pb-3" : "gap-4"
        }`}
      >
        {/* Subscription / Daily Capacity Card */}
        {!((isInputFocused && activeTab === "main") || isDailyLimitReached || isExpired) && (
          <GarageSubscriptionCard
            garage={garage}
            isUrgentRed={isUrgentRed}
            remainingDays={remainingDays}
            isWarningYellow={isWarningYellow}
            countdownValue={countdownValue}
            isCountdownInHours={isCountdownInHours}
            displayTodayCount={displayTodayCount}
            dailyCapacity={getEffectiveDailyCapacity(garage)}
            isUnlimited={isUnlimitedCapacity(garage)}
          />
        )}

        {activeTab === "main" ? (
          <React.Fragment>
            {shouldShowSmartPrompt ? (
              <SmartActionPrompt
                garage={garage}
                packages={packages}
                walletNumber={walletNumber}
                onOpenPackages={(duration) => {
                  setPackagesInitialDuration(duration);
                  if (setShowPackages) {
                    setShowPackages(true);
                  }
                }}
                showToast={showToast}
                isDailyLimitReached={isDailyLimitReached}
                isExpired={isExpired}
                packageDurationDays={packageDays}
                todayCount={displayTodayCount}
                dailyCapacity={getEffectiveDailyCapacity(garage)}
              />
            ) : (
              <RegistrationCard
                newPlateNumber={newPlateNumber}
                setNewPlateNumber={setNewPlateNumber}
                isInputFocused={isInputFocused}
                setIsInputFocused={setIsInputFocused}
                plateInputRef={plateInputRef}
                vehicles={vehicles}
                garage={garage}
                handleCheckIn={handleCheckIn}
                onCheckOut={(vehicle) => {
                  setSelectedVehicle(vehicle);
                  setShowCheckOutModal(true);
                }}
                closeKeyboard={closeKeyboard}
                inputRef={inputRef}
                shimmerActive={true}
                isLoading={isLoading}
              />
            )}

            {!isInputFocused && (
              <div className="bg-[#faf9f6] dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-[2rem] overflow-hidden flex flex-col items-center pt-4 md:pt-10 [@media(max-height:500px)]:pt-2 transition-colors w-full shadow-sm relative shrink-0">
                <div
                  onClick={() => setActiveTab("active_vehicles")}
                  className="mb-4 md:mb-10 [@media(max-height:500px)]:mb-2 cursor-pointer w-full flex justify-center"
                >
                  <div className="relative flex flex-col items-center w-full px-4 md:px-8">
                    <FlipNumber value={garage?.carsInside || 0} size="lg" />
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab("active_vehicles")}
                  className="w-full h-6 md:h-7 [@media(max-height:500px)]:h-5 relative overflow-hidden group outline-none select-none flex items-center justify-center shrink-0 transition-colors"
                  style={{
                    backgroundColor: shimmerColor,
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <div
                      className={`w-7 h-7 md:w-8 md:h-8 [@media(max-height:500px)]:w-6 [@media(max-height:500px)]:h-6 rounded-full flex items-center justify-center border-2 shadow-md group-hover:scale-110 transition-all ${
                        isLightColor(shimmerColor) ? "text-slate-900" : "text-white"
                      }`}
                      style={{
                        backgroundColor: shimmerColor,
                        borderColor: `${shimmerColor}80`,
                      }}
                    >
                      <Car
                        className={`w-3.5 h-3.5 md:w-4 md:h-4 [@media(max-height:500px)]:w-3 [@media(max-height:500px)]:h-3 group-active:translate-y-0.5 transition-transform ${
                          isLightColor(shimmerColor) ? "text-slate-900" : "text-white"
                        }`}
                      />
                    </div>
                  </div>
                </button>
              </div>
            )}
          </React.Fragment>
        ) : (
          <GarageActiveVehiclesList
            vehicles={vehicles}
            visibleVehicles={visibleVehicles}
            totalInsideCount={totalInsideCount}
            hasMoreVehicles={itemsPerPage < vehicles.length}
            observerTargetRef={observerTargetRef}
            scrollContainerRef={scrollContainerRef}
            isSubscriptionExpired={isExpired}
            onClose={() => setActiveTab("main")}
            onCheckOut={(vehicle) => {
              closeKeyboard();
              setSelectedVehicle(vehicle);
              setShowCheckOutModal(true);
            }}
            onRegisterNewCar={() => setActiveTab("main")}
          />
        )}

        <div
          className={`mt-auto mb-2 py-4 flex items-center justify-center gap-3 select-none text-slate-400 dark:text-slate-500 font-bold text-[10px] md:text-xs tracking-wider uppercase transition-all duration-300 ${
            isInputFocused || activeTab !== "main"
              ? "opacity-0 h-0 overflow-hidden pointer-events-none py-0 my-0"
              : "opacity-100"
          }`}
        >
          <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-slate-200 dark:to-slate-800" />
          <span className="brand-shimmer-text">
            ARQ FOR SOFTWARE DEVELOPMENT
          </span>
          <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-slate-200 dark:to-slate-800" />
        </div>
      </main>

      {/* Dashboard Overlays (Modals & Fullscreen Views) */}
      <GarageDashboardOverlays
        garage={garage}
        adminPhone={walletNumber}
        isLocked={isLockedOrSuspended}
        isSubscribersOpen={showSubscribers}
        isRechargeHistoryOpen={isRechargeHistoryOpen}
        isPackagesOpen={showPackages}
        isRewardsOpen={isRewardsOpen}
        isStaffStatsOpen={showStaffStats}
        isReportsOpen={isReportsOpen}
        isAppearanceOpen={isAppearanceOpen}
        showTermsModal={showTermsModal}
        showToast={showToast}
        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
        onCloseSubscribers={() => setShowSubscribers(false)}
        onCloseRechargeHistory={() => {
          setIsRechargeHistoryOpen(false);
          setHasNewRecharge(false);
        }}
        onClosePackages={() => {
          setShowPackages(false);
          setPackagesInitialDuration(undefined);
        }}
        onCloseRewards={() => setIsRewardsOpen(false)}
        onCloseStaffStats={() => setShowStaffStats(false)}
        onCloseReports={() => setIsReportsOpen(false)}
        onCloseAppearance={() => setIsAppearanceOpen(false)}
        onCloseTerms={() => setShowTermsModal(false)}
        packages={packages}
        subscriptionPrices={subscriptionPrices}
        packagesInitialDuration={packagesInitialDuration}
        currentStaff={currentStaff}
        staffList={staffList}
        vehiclesInside={vehicles}
        todayExitedVehicles={todayTransactions}
        now={now}
        isRechargeNotificationOpen={isRechargeNotificationOpen}
        rechargeLog={latestRechargeLog}
        onCloseRechargeNotification={handleAcknowledgeRecharge}
        selectedAnnouncement={selectedAnnouncement}
        onCloseAnnouncement={() => setSelectedAnnouncement(null)}
      />
    </div>
  );
});
