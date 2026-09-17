import { AlertTriangle } from "lucide-react";
import { TrialExpiryModal } from "../modals/TrialExpiryModal";
import { SubscribersView } from "./SubscribersView";
import { RechargeHistoryView } from "./RechargeHistoryView";
import { PackagesModal } from "../modals/PackagesModal";
import { RewardsModal } from "../modals/RewardsModal";
import { StaffStatsModal } from "../modals/StaffStatsModal";
import { GarageReportsView } from "./GarageReportsView";
import { AppearanceSettingsModal } from "../modals/AppearanceSettingsModal";
import { TermsAndConditionsModal } from "../modals/TermsAndConditionsModal";
import { RechargeNotificationModal } from "./modals/RechargeNotificationModal";
import { AnnouncementModal } from "./modals/AnnouncementModal";

export const GarageDashboardOverlays = (props: any) => {
  const {
    garage,
    adminPhone,
    isLocked,
    isSubscribersOpen,
    isRechargeHistoryOpen,
    isPackagesOpen,
    isRewardsOpen,
    isStaffStatsOpen,
    isReportsOpen,
    isAppearanceOpen,
    showTermsModal,
    showToast,
    onToggleMenu,
    onCloseSubscribers,
    onCloseRechargeHistory,
    onClosePackages,
    onCloseRewards,
    onCloseStaffStats,
    onCloseReports,
    onCloseAppearance,
    onCloseTerms,
    packages,
    subscriptionPrices,
    packagesInitialDuration,
    currentStaff,
    staffList,
    vehiclesInside,
    todayExitedVehicles,
    now,
    isRechargeNotificationOpen,
    rechargeLog,
    onCloseRechargeNotification,
    selectedAnnouncement,
    onCloseAnnouncement,
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
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 inline-block">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">رقم الإدارة</p>
                <p className="text-xl font-black text-white font-mono tracking-widest" dir="ltr">
                  {adminPhone}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {isSubscribersOpen && garage?.hasMonthlySubscribers && (
        <SubscribersView garage={garage} onClose={onCloseSubscribers} showToast={showToast} onToggleMenu={onToggleMenu} />
      )}
      {isRechargeHistoryOpen && (
        <RechargeHistoryView garage={garage} onClose={onCloseRechargeHistory} showToast={showToast} onToggleMenu={onToggleMenu} />
      )}
      {isPackagesOpen && (
        <PackagesModal
          packages={packages}
          onClose={onClosePackages}
          garageHourlyRate={garage.hourlyRate}
          walletNumber={adminPhone}
          onToggleMenu={onToggleMenu}
          subscriptionPrices={subscriptionPrices}
          hasMonthlySubscribers={garage.hasMonthlySubscribers}
          referrerId={garage.referrerId || garage.createdByDelegateId || null}
          garage={garage}
          garageId={garage.id}
          garageBalance={garage.balance || 0}
          showToast={showToast}
          initialDurationFilter={packagesInitialDuration}
        />
      )}
      {isRewardsOpen && (
        <RewardsModal
          garage={garage}
          onClose={onCloseRewards}
          onToggleMenu={onToggleMenu}
          referralBonusBalance={garage.referralBonusBalance || 0}
          showToast={showToast}
        />
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
        <GarageReportsView
          garage={garage}
          vehiclesInside={vehiclesInside}
          todayExitedVehicles={todayExitedVehicles}
          staffList={staffList}
          onClose={onCloseReports}
          onToggleMenu={onToggleMenu}
        />
      )}
      {isAppearanceOpen && (
        <AppearanceSettingsModal garage={garage} currentStaff={currentStaff} onClose={onCloseAppearance} showToast={showToast} onToggleMenu={onToggleMenu} />
      )}
      {showTermsModal && <TermsAndConditionsModal onClose={onCloseTerms} />}
      <RechargeNotificationModal isOpen={isRechargeNotificationOpen && !!rechargeLog} rechargeLog={rechargeLog} onClose={onCloseRechargeNotification} />
      <AnnouncementModal announcement={selectedAnnouncement} onClose={onCloseAnnouncement} />
      <TrialExpiryModal garage={garage} showToast={showToast} />
    </>
  );
};
