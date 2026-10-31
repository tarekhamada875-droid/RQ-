import { Suspense } from "react";
import { AlertTriangle } from "lucide-react";
import { SubscribersView } from "./SubscribersView";
import { RechargeHistoryView } from "./RechargeHistoryView";
import { StaffStatsModal } from "../modals/StaffStatsModal";
import { AppearanceSettingsModal } from "../modals/AppearanceSettingsModal";
import { TermsAndConditionsModal } from "../modals/TermsAndConditionsModal";
import { RechargeNotificationModal } from "./modals/RechargeNotificationModal";
import { lazyWithRetry } from "../../utils/lazyWithRetry";

const GarageReportsLazy = lazyWithRetry(() => import("./GarageReportsView").then((module) => ({ default: module.GarageReportsView })));

export const GarageDashboardOverlays = (props: any) => {
  const {
    garage,
    isLocked,
    isSubscribersOpen,
    isRechargeHistoryOpen,
    rechargeLogs,
    isRechargeLogsLoading,
    subscriberPage,
    isStaffStatsOpen,
    isReportsOpen,
    isAppearanceOpen,
    showTermsModal,
    showToast,
    onToggleMenu,
    onCloseSubscribers,
    onCloseRechargeHistory,
    onCloseStaffStats,
    onCloseReports,
    onCloseAppearance,
    onCloseTerms,
    currentStaff,
    staffList,
    vehiclesInside,
    todayExitedVehicles,
    now,
    isRechargeNotificationOpen,
    rechargeLog,
    onCloseRechargeNotification,
  } = props;

  return (
    <>
      {isLocked && (
        <div className="fixed inset-0 z-[90] bg-slate-900/95 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm w-full">
            <div className="w-20 h-20 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-black text-white mb-3">الجراج مغلق حالياً</h2>
            <div className="space-y-4 mb-8">
              <p className="text-base md:text-lg font-bold text-slate-400 dark:text-slate-300 leading-relaxed px-4">
                {garage.lockReason || "تم تعليق الخدمة مؤقتاً، يرجى التواصل مع الإدارة."}
              </p>
            </div>
          </div>
        </div>
      )}
      {isSubscribersOpen && garage?.hasMonthlySubscribers && (
        <SubscribersView garage={garage} onClose={onCloseSubscribers} showToast={showToast} onToggleMenu={onToggleMenu} subscriberPage={subscriberPage} />
      )}
      {isRechargeHistoryOpen && (
        <RechargeHistoryView garage={garage} onClose={onCloseRechargeHistory} showToast={showToast} onToggleMenu={onToggleMenu} sharedLogs={rechargeLogs} sharedIsLoading={isRechargeLogsLoading} />
      )}
      {isStaffStatsOpen && !currentStaff && (
        <StaffStatsModal
          staffList={staffList}
          vehiclesInside={vehiclesInside}
          todayExitedVehicles={todayExitedVehicles}
          onClose={onCloseStaffStats}
          now={now}
          onToggleMenu={onToggleMenu}
        />
      )}
      {isReportsOpen && !currentStaff && (
        <Suspense fallback={null}>
          <GarageReportsLazy
            garage={garage}
            vehiclesInside={vehiclesInside}
            todayExitedVehicles={todayExitedVehicles}
            staffList={staffList}
            onClose={onCloseReports}
            onToggleMenu={onToggleMenu}
            showToast={showToast}
          />
        </Suspense>
      )}
      {isAppearanceOpen && (
        <AppearanceSettingsModal garage={garage} currentStaff={currentStaff} onClose={onCloseAppearance} showToast={showToast} onToggleMenu={onToggleMenu} />
      )}
      {showTermsModal && <TermsAndConditionsModal onClose={onCloseTerms} />}
      <RechargeNotificationModal isOpen={isRechargeNotificationOpen && !!rechargeLog} rechargeLog={rechargeLog} onClose={onCloseRechargeNotification} />
    </>
  );
};
