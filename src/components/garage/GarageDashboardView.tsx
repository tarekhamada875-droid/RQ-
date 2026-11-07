/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  memo,
} from "react";
import { Car } from "lucide-react";
import { useBackHandler } from "../../hooks/backHandler";
import { useGarageInput } from "../../hooks/garageInput";
import { useVehicleOps } from "../../hooks/vehicleOpsContext";
import { FlipNumber } from "../ui/FlipNumber";
import { useTheme } from "../../utils/ThemeContext";
import { resolveShimmerColor, isLightColor } from '../../utils/colors';
import { safeDate } from '../../utils/dates';
import { auth } from "../../firebase";
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { useCreditGrantNotification } from '../../hooks/useCreditGrantNotification';
import { RegistrationCard } from "./RegistrationCard";
import { GarageDashboardOverlays } from "./GarageDashboardOverlays";
import { SmartActionPrompt } from "./SmartActionPrompt";
import { GarageDashboardHeaderAndDrawer } from "./dashboard/GarageDashboardHeaderAndDrawer";
import { GarageSubscriptionCard } from "./dashboard/GarageSubscriptionCard";
import { GarageActiveVehiclesList } from "./dashboard/GarageActiveVehiclesList";
import { useGarageDashboardLiveData } from "../../hooks/useGarageDashboardLiveData";
import { getCairoDateKey } from "../../domain/garage/businessDay";
import type { Garage, Staff, Vehicle } from "../../types";

type ToastType = 'success' | 'error' | 'info';

interface GarageDashboardViewProps {
  garage: Garage;
  currentStaff: Staff | null;
  vehicles?: Vehicle[];
  todayTransactions?: Vehicle[];
  closeKeyboard: () => void;
  onLogout: () => void;
  showToast: (message: string, type?: ToastType) => void;
  staffList: Staff[];
  showSubscribers: boolean;
  setShowSubscribers: (show: boolean) => void;
}

export const GarageDashboardView = memo((props: GarageDashboardViewProps) => {
  const {
    garage,
    currentStaff,
    vehicles = [],
    todayTransactions = [],
    closeKeyboard,
    onLogout,
    showToast,
    staffList,
    showSubscribers,
    setShowSubscribers,
  } = props;

  // Vehicle operations come from VehicleOpsProvider (context, not props)
  const { setSelectedVehicle, setShowCheckOutModal, newPlateNumber, setNewPlateNumber, handleCheckIn, isLoading, checkoutJustSucceeded } = useVehicleOps();

  // Input refs + focus state come from GarageInputProvider (context, not props)
  const { plateInputRef, inputRef, isInputFocused, setIsInputFocused } = useGarageInput();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme } = useTheme();
  const shimmerColor = resolveShimmerColor(garage?.shimmerColor, theme);
  const [activeTab, setActiveTab] = useState<"main" | "active_vehicles">("main");
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [isCreditGrantHistoryOpen, setIsCreditGrantHistoryOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);

  // Return to the main dashboard tab only when checkout SUCCEEDS.
  // If checkout fails, stay on the active-vehicles list so the user can
  // retry or pick a different car. The checkoutJustSucceeded flag is set
  // by useVehicleOperations: true on success, false on failure.
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && activeTab === 'active_vehicles') {
      if (checkoutJustSucceeded) {
        setActiveTab('main');
      }
      // If checkoutJustSucceeded is false (failure), stay on active_vehicles
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, activeTab, checkoutJustSucceeded]);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // (back handler registration moved below — needs isCreditGrantNotificationOpen
  //  and isMenuOpen which are defined later in the component)

  const observerTargetRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);

  const garageId = garage?.id;
  const shouldSubscribeToSubscribers = Boolean(
    garage?.hasMonthlySubscribers && (!currentStaff || showSubscribers),
  );
  const { creditGrantLogs, isCreditGrantLoading, subscriberPage } = useGarageDashboardLiveData({
    garageId,
    isAuthenticated,
    isCreditGrantHistoryOpen,
    shouldSubscribeToSubscribers,
  });
  // Use a stable Cairo date key instead of a raw ticking Date object.
  const todayCairoKey = getCairoDateKey(new Date());
  const expiringSubscribersCount = useMemo(() => {
    const todayUtc = Date.parse(`${todayCairoKey}T00:00:00Z`);
    return subscriberPage.subscribers.filter((subscriber) => {
      const endDate = new Date(subscriber.endDate);
      if (!Number.isFinite(endDate.getTime())) return false;

      const endDateKey = getCairoDateKey(endDate);
      const endDateUtc = Date.parse(`${endDateKey}T00:00:00Z`);
      const daysUntilExpiry = (endDateUtc - todayUtc) / (1000 * 60 * 60 * 24);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 3;
    }).length;
  }, [todayCairoKey, subscriberPage.subscribers]);

  // Announcements listener removed — feature retired by owner.

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsub();
  }, []);

  const prepaidCreditsEnabled = garage?.billingModel === 'prepaid_credits' || typeof garage?.credits === 'number';

  const totalInsideCount = useMemo(
    () =>
      vehicles.length > 0
        ? vehicles.length
        : typeof garage?.carsInside === "number"
          ? Math.max(0, garage.carsInside)
          : 0,
    [vehicles.length, garage?.carsInside],
  );

  const isLockedOrSuspended = garage?.isLocked || garage?.isSuspended || false;

  const {
    hasNewCreditGrant,
    latestCreditGrantLog,
    isCreditGrantNotificationOpen,
    handleAcknowledgeCreditGrant,
    clearNewCreditGrantBadge,
  } = useCreditGrantNotification({
    garageId: garage?.id,
    isAuthenticated,
    creditGrantLogs,
    isTrial: garage?.isTrial,
  });

  // ── Back-handler registrations ──────────────────────────────────────
  // Each overlay/sub-tab self-registers via useBackHandler. The stack handles
  // priority automatically — the most recently opened overlay is on top.
  useBackHandler(() => { handleAcknowledgeCreditGrant(); return true; }, isCreditGrantNotificationOpen);
  useBackHandler(() => { setIsMenuOpen(false); return true; }, isMenuOpen);
  useBackHandler(() => { setShowTermsModal(false); return true; }, showTermsModal);
  useBackHandler(() => { setIsAppearanceOpen(false); return true; }, isAppearanceOpen);
  useBackHandler(() => { setIsReportsOpen(false); return true; }, isReportsOpen);
  useBackHandler(() => { setIsCreditGrantHistoryOpen(false); return true; }, isCreditGrantHistoryOpen);
  useBackHandler(() => { setActiveTab('main'); return true; }, activeTab === 'active_vehicles');

  useEffect(() => {
    setItemsPerPage(15);
  }, [activeTab]);

  const sortedVehicles = useMemo(() => {
    return [...(vehicles || [])].sort((a, b) => safeDate(b.entryTime).getTime() - safeDate(a.entryTime).getTime());
  }, [vehicles]);

  const visibleVehicles = sortedVehicles.slice(0, itemsPerPage);

  // Keep a ref of itemsPerPage + vehicles.length so the observer callback reads
  // latest values without re-creating the observer on every page increment.
  // BUG FIX: previously `itemsPerPage` was in this effect's deps. The observer
  // callback called setItemsPerPage(prev => prev + 10), which triggered effect
  // cleanup (disconnect) + new observer creation on every scroll — a feedback
  // loop that churned observers during active scrolling.
  const itemsPerPageRef = useRef(itemsPerPage);
  itemsPerPageRef.current = itemsPerPage;
  const vehiclesLengthRef = useRef(vehicles.length);
  vehiclesLengthRef.current = vehicles.length;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && itemsPerPageRef.current < vehiclesLengthRef.current) {
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
  }, [vehicles.length, activeTab]);

  const handleNavigateOverlay = (target: string) => {
    setIsMenuOpen(false);
    setShowSubscribers(target === "subscribers");
    setIsReportsOpen(target === "reports");
    setIsCreditGrantHistoryOpen(target === "history");
    setIsAppearanceOpen(target === "appearance");
    setShowTermsModal(target === "terms");
  };


  // Smart-action prompt fires only when the single prepaid balance is depleted.
  // Legacy `billingModel: 'subscription'`, `balance`, and `activePackageName`
  // paths were removed when the product collapsed to prepaid-credits-only.
  const prepaidCreditTotal = Number(garage?.credits ?? 0);
  const isBalanceDepleted = prepaidCreditsEnabled && prepaidCreditTotal <= 0;
  const shouldShowSmartPrompt = isBalanceDepleted;
  const systemConfig = useSystemConfig();
  const paymentWalletNumber = systemConfig?.paymentWalletNumber;

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
        expiringSubscribersCount={expiringSubscribersCount}
        hasNewCreditGrant={hasNewCreditGrant}
        onNavigateOverlay={handleNavigateOverlay}
        onLogout={onLogout}
      />

      <main
        className={`max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto p-4 [@media(max-height:500px)]:p-2.5 w-full flex-1 flex flex-col gap-4 md:gap-6 [@media(max-height:500px)]:gap-2.5 overscroll-contain overflow-y-auto ${
          isInputFocused ? "gap-3 pt-3 pb-3" : "gap-4"
        }`}
      >
        {!(isInputFocused && activeTab === "main") && !isBalanceDepleted && (
          <GarageSubscriptionCard garage={garage} />
        )}

        {activeTab === "main" ? (
          <React.Fragment>
            {shouldShowSmartPrompt ? (
              <SmartActionPrompt
                garage={garage}
                paymentWalletNumber={paymentWalletNumber}
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
                <button
                  onClick={() => setActiveTab("active_vehicles")}
                  className="mb-4 md:mb-10 [@media(max-height:500px)]:mb-2 cursor-pointer w-full flex justify-center outline-none"
                  aria-label="عرض السيارات النشطة"
                >
                  <div className="relative flex flex-col items-center w-full px-4 md:px-8">
                    <FlipNumber value={garage?.carsInside || 0} size="lg" displayDigits="arabic" />
                  </div>
                </button>

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
            onClose={() => setActiveTab("main")}
            onCheckOut={(vehicle) => {
              if (isLoading) return; // block during transaction lock
              closeKeyboard();
              setSelectedVehicle(vehicle);
              setShowCheckOutModal(true);
            }}
            onRegisterNewCar={() => setActiveTab("main")}
            disabled={isLoading}
          />
        )}
      </main>

      {/* Dashboard Overlays (Modals & Fullscreen Views) */}
      <GarageDashboardOverlays
        garage={garage}
        isLocked={isLockedOrSuspended}
        isSubscribersOpen={showSubscribers}
        isCreditGrantHistoryOpen={isCreditGrantHistoryOpen}
        creditGrantLogs={creditGrantLogs}
        isCreditGrantLogsLoading={isCreditGrantLoading}
        subscriberPage={subscriberPage}
        isReportsOpen={isReportsOpen}
        isAppearanceOpen={isAppearanceOpen}
        showTermsModal={showTermsModal}
        showToast={showToast}
        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
        onCloseSubscribers={() => setShowSubscribers(false)}
        onCloseCreditGrantHistory={() => {
          setIsCreditGrantHistoryOpen(false);
          clearNewCreditGrantBadge();
        }}
        onCloseReports={() => setIsReportsOpen(false)}
        onCloseAppearance={() => setIsAppearanceOpen(false)}
        onCloseTerms={() => setShowTermsModal(false)}
        currentStaff={currentStaff}
        staffList={staffList}
        vehiclesInside={vehicles}
        todayExitedVehicles={todayTransactions}
        isCreditGrantNotificationOpen={isCreditGrantNotificationOpen}
        creditGrantLog={latestCreditGrantLog}
        onCloseCreditGrantNotification={handleAcknowledgeCreditGrant}
      />
    </div>
  );
});
