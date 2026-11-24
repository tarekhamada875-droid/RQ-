/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useState,
  useEffect,
  useMemo,
  memo,
} from "react";
import { useBackHandler } from "../../hooks/backHandler";
import { useGarageInput } from "../../hooks/garageInput";
import { useVehicleOps } from "../../hooks/vehicleOpsContext";
import { Spinner } from "../ui/Spinner";
import { auth } from "../../firebase";
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { useCreditGrantNotification } from '../../hooks/useCreditGrantNotification';
import { RegistrationCard } from "./RegistrationCard";
import { GarageDashboardOverlays } from "./GarageDashboardOverlays";
import { SmartActionPrompt } from "./SmartActionPrompt";
import { GarageDashboardHeaderAndDrawer } from "./dashboard/GarageDashboardHeaderAndDrawer";
import { GarageSubscriptionCard } from "./dashboard/GarageSubscriptionCard";
import { GarageActiveCountCard } from "./dashboard/GarageActiveCountCard";
import { useGarageDashboardLiveData } from "../../hooks/useGarageDashboardLiveData";
import { getCairoDateKey } from "../../domain/garage/businessDay";
import type { Garage, Staff } from "../../types";

type ToastType = 'success' | 'error' | 'info';

interface GarageDashboardViewProps {
  garage: Garage;
  currentStaff: Staff | null;
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
    closeKeyboard,
    onLogout,
    showToast,
    staffList,
    showSubscribers,
    setShowSubscribers,
  } = props;

  // Vehicle operations come from VehicleOpsProvider (context, not props)
  const { setSelectedVehicle, setShowCheckOutModal, handleCheckIn, isLoading, loadingType } = useVehicleOps();

  // Input refs + focus state come from GarageInputProvider (context, not props)
  const { plateInputRef, inputRef, isInputFocused, setIsInputFocused } = useGarageInput();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const shimmerColor = garage?.shimmerColor || '#f59e0b';
  const [isCreditGrantHistoryOpen, setIsCreditGrantHistoryOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // HABIT CHANGE (2026-11-23): the cars-inside list tab was retired. The
  // count card below is display-only — check-in and check-out both happen
  // by TYPING the plate into the registration card (typing a plate that is
  // already inside shows the red "إصدار فاتورة خروج" button). This removes
  // the browse-and-tap flow so staff build the typing habit.

  // (back handler registration moved below — needs isCreditGrantNotificationOpen
  // and isMenuOpen which are defined later in the component)

  const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);

  const garageId = garage?.id;
  // On-demand subscribers listener (2026-11-15): only subscribe when the
  // subscribers view is actually open (showSubscribers === true). Previously
  // this ran for every garage owner with hasMonthlySubscribers — costing
  // ~1 read per subscriber per dashboard mount. Now the listener only
  // starts when the user navigates to the subscribers view.
  const shouldSubscribeToSubscribers = Boolean(
    garage?.hasMonthlySubscribers && showSubscribers,
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
    lastCreditGrantAt: garage?.lastCreditGrantAt,
    isTrial: garage?.isTrial,
  });

  // ── Back-handler registrations ──────────────────────────────────────
  // Each overlay/sub-tab self-registers via useBackHandler. The stack handles
  // priority automatically — the most recently opened overlay is on top.
  useBackHandler(() => { handleAcknowledgeCreditGrant(); return true; }, isCreditGrantNotificationOpen);
  useBackHandler(() => { setIsMenuOpen(false); return true; }, isMenuOpen);
  useBackHandler(() => { setShowTermsModal(false); return true; }, showTermsModal);

  useBackHandler(() => { setIsReportsOpen(false); return true; }, isReportsOpen);
  useBackHandler(() => { setIsCreditGrantHistoryOpen(false); return true; }, isCreditGrantHistoryOpen);

  const handleNavigateOverlay = (target: string) => {
    setIsMenuOpen(false);
    setShowSubscribers(target === "subscribers");
    setIsReportsOpen(target === "reports");
    setIsCreditGrantHistoryOpen(target === "history");

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
        {!isInputFocused && !isBalanceDepleted && (
          <GarageSubscriptionCard garage={garage} />
        )}

        {/* OFFLINE STEP 1 (2026-11-24, owner design): when the prepaid balance
            is depleted the registration card STAYS MOUNTED. Staff can still
            type a plate that is inside and issue its exit receipt; only the
            hourly/overnight check-in buttons are hidden (see RegistrationCard).
            The recharge prompt no longer REPLACES the plate input — it renders
            below the card (hidden while the keyboard is focused, same rule as
            the balance card above). */}
        <RegistrationCard
          isInputFocused={isInputFocused}
          setIsInputFocused={setIsInputFocused}
          plateInputRef={plateInputRef}
          garage={garage}
          handleCheckIn={handleCheckIn}
          isBalanceDepleted={isBalanceDepleted}
          onCheckOut={(vehicle) => {
            setSelectedVehicle(vehicle);
            setShowCheckOutModal(true);
          }}
          closeKeyboard={closeKeyboard}
          inputRef={inputRef}
          isLoading={isLoading}
        />

        {!isInputFocused && shouldShowSmartPrompt && (
          <SmartActionPrompt
            garage={garage}
            paymentWalletNumber={paymentWalletNumber}
          />
        )}

            {/* UX-C: during a vehicle transaction the action buttons unmount
                (the draft plate is cleared at submit start), which used to
                leave the screen silent while the Worker round trip ran. This
                slim status strip explains the locked buttons instead. */}
        {isLoading && (
          <div
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-slate-900/[0.04] dark:bg-slate-800/40 text-slate-500 dark:text-slate-400"
            role="status"
          >
            <Spinner className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold">
              {loadingType === 'hourly' || loadingType === 'overnight'
                ? 'جاري تسجيل دخول السيارة...'
                : loadingType === 'checkout'
                  ? 'جاري تسجيل خروج السيارة...'
                  : loadingType === 'delete'
                    ? 'جاري حذف السيارة...'
                    : 'جاري تنفيذ العملية...'}
            </span>
          </div>
        )}

        {!isInputFocused && (
          <GarageActiveCountCard
            count={garage?.carsInside || 0}
            shimmerColor={shimmerColor}
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
        showTermsModal={showTermsModal}
        showToast={showToast}
        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
        onCloseSubscribers={() => setShowSubscribers(false)}
        onCloseCreditGrantHistory={() => {
          setIsCreditGrantHistoryOpen(false);
          clearNewCreditGrantBadge();
        }}
        onCloseReports={() => setIsReportsOpen(false)}
        onCloseTerms={() => setShowTermsModal(false)}
        currentStaff={currentStaff}
        staffList={staffList}
        isCreditGrantNotificationOpen={isCreditGrantNotificationOpen}
        creditGrantLog={latestCreditGrantLog}
        onCloseCreditGrantNotification={handleAcknowledgeCreditGrant}
      />
    </div>
  );
});
