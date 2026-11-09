import { Suspense } from "react";
import { AlertTriangle } from "lucide-react";
import { SubscribersView } from "./SubscribersView";
import { CreditGrantHistoryView } from "./CreditGrantHistoryView";
import { lazyWithRetry } from "../../utils/lazyWithRetry";
import type { ActivityLog, Garage, Staff, Vehicle } from "../../types";
import type { SharedSubscriberPage } from "../../hooks/useGarageDashboardLiveData";

const GarageReportsLazy = lazyWithRetry(() => import("./GarageReportsView").then((module) => ({ default: module.GarageReportsView })));
// PR-G: lazy-load TermsAndConditionsModal + CreditGrantNotificationModal
const TermsAndConditionsModal = lazyWithRetry(() => import("../modals/TermsAndConditionsModal").then(m => ({ default: m.TermsAndConditionsModal })));
const CreditGrantNotificationModal = lazyWithRetry(() => import("./modals/CreditGrantNotificationModal").then(m => ({ default: m.CreditGrantNotificationModal })));

interface GarageDashboardOverlaysProps {
  garage: Garage;
  isLocked: boolean;
  isSubscribersOpen: boolean;
  isCreditGrantHistoryOpen: boolean;
  creditGrantLogs: ActivityLog[];
  isCreditGrantLogsLoading: boolean;
  subscriberPage: SharedSubscriberPage | null;
  isReportsOpen: boolean;
  showTermsModal: boolean;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onToggleMenu: () => void;
  onCloseSubscribers: () => void;
  onCloseCreditGrantHistory: () => void;
  onCloseReports: () => void;
  onCloseTerms: () => void;
  currentStaff: Staff | null;
  staffList: Staff[];
  vehiclesInside: Vehicle[];
  todayExitedVehicles: Vehicle[];
  isCreditGrantNotificationOpen: boolean;
  creditGrantLog: ActivityLog | null;
  onCloseCreditGrantNotification: () => void;
}

export const GarageDashboardOverlays = ({
  garage,
  isLocked,
  isSubscribersOpen,
  isCreditGrantHistoryOpen,
  creditGrantLogs,
  isCreditGrantLogsLoading,
  subscriberPage,
  isReportsOpen,
  showTermsModal,
  showToast,
  onToggleMenu,
  onCloseSubscribers,
  onCloseCreditGrantHistory,
  onCloseReports,
  onCloseTerms,
  currentStaff,
  staffList,
  vehiclesInside,
  todayExitedVehicles,
  isCreditGrantNotificationOpen,
  creditGrantLog,
  onCloseCreditGrantNotification,
}: GarageDashboardOverlaysProps) => {

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
      {isCreditGrantHistoryOpen && (
        <CreditGrantHistoryView garage={garage} onClose={onCloseCreditGrantHistory} showToast={showToast} onToggleMenu={onToggleMenu} sharedLogs={creditGrantLogs} sharedIsLoading={isCreditGrantLogsLoading} />
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
      {showTermsModal && (
        <Suspense fallback={null}>
          <TermsAndConditionsModal onClose={onCloseTerms} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <CreditGrantNotificationModal isOpen={isCreditGrantNotificationOpen && !!creditGrantLog} creditGrantLog={creditGrantLog} onClose={onCloseCreditGrantNotification} />
      </Suspense>
    </>
  );
};
