import React, { useState } from 'react';
import { Check, X, Building2, Zap, ClipboardList, Loader2, Wallet } from 'lucide-react';
import { RechargeRequest, Garage } from '../../types';
import { sortGaragesNewestFirst } from '../../utils';

interface AdminRequestsViewProps {
  rechargeRequests: RechargeRequest[];
  pendingGarages: Garage[];
  handleApproveRequest: (request: RechargeRequest) => Promise<void>;
  handleRejectRequest: (requestId: string) => Promise<void>;
  handleApproveGarage: (garage: Garage) => Promise<void>;
  handleRejectGarage: (garage: Garage) => Promise<void>;
  adminLang?: string;
  t: (key: string) => string;
}

export const AdminRequestsView: React.FC<AdminRequestsViewProps> = ({
  rechargeRequests,
  pendingGarages,
  handleApproveRequest,
  handleRejectRequest,
  handleApproveGarage,
  handleRejectGarage,
  t,
}) => {
  const [requestSubTab, setRequestSubTab] = useState<'recharge' | 'creation'>(() => {
    if (rechargeRequests.length === 0 && pendingGarages.length > 0) {
      return 'creation';
    }
    return 'recharge';
  });

  const [processingGarageId, setProcessingGarageId] = useState<string | null>(null);
  const [processingGarageAction, setProcessingGarageAction] = useState<'approve' | 'reject' | null>(null);

  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [processingRequestAction, setProcessingRequestAction] = useState<'approve' | 'reject' | null>(null);

  const onApproveGarageClick = async (garage: Garage) => {
    if (processingGarageId) return;
    try {
      setProcessingGarageId(garage.id);
      setProcessingGarageAction('approve');
      await handleApproveGarage(garage);
    } catch (err) {
      console.error('Failed to approve garage:', err);
    } finally {
      setProcessingGarageId(null);
      setProcessingGarageAction(null);
    }
  };

  const onRejectGarageClick = async (garage: Garage) => {
    if (processingGarageId) return;
    try {
      setProcessingGarageId(garage.id);
      setProcessingGarageAction('reject');
      await handleRejectGarage(garage);
    } catch (err) {
      console.error('Failed to reject garage:', err);
    } finally {
      setProcessingGarageId(null);
      setProcessingGarageAction(null);
    }
  };

  const onApproveRequestClick = async (request: RechargeRequest) => {
    if (processingRequestId) return;
    try {
      setProcessingRequestId(request.id);
      setProcessingRequestAction('approve');
      await handleApproveRequest(request);
    } catch (err) {
      console.error('Failed to approve request:', err);
    } finally {
      setProcessingRequestId(null);
      setProcessingRequestAction(null);
    }
  };

  const onRejectRequestClick = async (requestId: string) => {
    if (processingRequestId) return;
    try {
      setProcessingRequestId(requestId);
      setProcessingRequestAction('reject');
      await handleRejectRequest(requestId);
    } catch (err) {
      console.error('Failed to reject request:', err);
    } finally {
      setProcessingRequestId(null);
      setProcessingRequestAction(null);
    }
  };

  React.useEffect(() => {
    if (requestSubTab === 'recharge' && rechargeRequests.length === 0 && pendingGarages.length > 0) {
      setRequestSubTab('creation');
    }
  }, [pendingGarages.length, rechargeRequests.length, requestSubTab]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 dir-rtl text-right font-sans">
      {/* Streamlined Sub-tabs segment switcher */}
      <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl max-w-md mx-auto w-full border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setRequestSubTab('recharge')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer ${
            requestSubTab === 'recharge'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>{t('طلبات الشحن والتجديد')}</span>
          {rechargeRequests.length > 0 && (
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
              requestSubTab === 'recharge' ? 'bg-emerald-700/60 text-white' : 'bg-red-500 text-white'
            }`}>
              {rechargeRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setRequestSubTab('creation')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer ${
            requestSubTab === 'creation'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>{t('طلبات تسجيل الجراجات')}</span>
          {pendingGarages.length > 0 && (
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
              requestSubTab === 'creation' ? 'bg-emerald-700/60 text-white' : 'bg-blue-500 text-white'
            }`}>
              {pendingGarages.length}
            </span>
          )}
        </button>
      </div>

      {requestSubTab === 'recharge' ? (
        <div className="grid grid-cols-1 gap-4">
          {rechargeRequests.map((request) => {
            const isReqProcessing = processingRequestId === request.id;
            const isReqApproving = isReqProcessing && processingRequestAction === 'approve';
            const isReqRejecting = isReqProcessing && processingRequestAction === 'reject';
            const isBalanceTopup = request.requestType === 'balance_topup' || request.packageId === 'balance_topup';

            return (
              <div 
                key={request.id}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 transition-all hover:border-emerald-500/50 shadow-sm space-y-4"
              >
                {/* Header Row: Icon + Garage Name + Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                      isBalanceTopup 
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' 
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {isBalanceTopup ? <Wallet className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight truncate">
                        {request.garageName}
                      </h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-1">
                        <span>المندوب:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-black">
                          {request.delegateName || 'غير محدد'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <span className={`text-[11px] font-black px-3 py-1 rounded-xl shrink-0 ${
                    isBalanceTopup
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {isBalanceTopup ? 'شحن رصيد محفظة' : 'شحن باقة'}
                  </span>
                </div>

                {/* Hero Amount Display */}
                <div className="flex items-baseline gap-2 font-mono bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-150 dark:border-slate-800">
                  <span className={`text-2xl sm:text-3xl font-black ${
                    isBalanceTopup ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {isBalanceTopup ? (request.amount || request.revenueAmount) : request.revenueAmount}
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-sans">ج.م</span>
                  
                  {!isBalanceTopup && (
                    <span className="text-xs font-bold text-slate-400 font-sans mr-2">
                      ({request.packageName || 'الباقة'} • {request.durationDays || 30} يوم)
                    </span>
                  )}
                </div>

                {/* Direct Action Buttons */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onApproveRequestClick(request)}
                    disabled={isReqProcessing}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isReqApproving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>جاري الاعتماد...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3] shrink-0" />
                        <span>موافقة واعتماد</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => onRejectRequestClick(request.id)}
                    disabled={isReqProcessing}
                    className="px-5 py-3 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 active:scale-[0.98] text-red-600 dark:text-red-400 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all border border-red-200 dark:border-red-900/40 cursor-pointer disabled:opacity-50"
                  >
                    {isReqRejecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>جاري الرفض...</span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 stroke-[3] shrink-0" />
                        <span>رفض</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {rechargeRequests.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <ClipboardList className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-200">لا توجد طلبات شحن معلقة</h3>
              <p className="text-xs font-medium text-slate-400">ستظهر هنا أية طلبات شحن جديدة مقدمة من المندوبين.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sortGaragesNewestFirst(pendingGarages).map((garage) => {
            const isGarageProcessing = processingGarageId === garage.id;
            const isApproving = isGarageProcessing && processingGarageAction === 'approve';
            const isRejecting = isGarageProcessing && processingGarageAction === 'reject';

            return (
              <div 
                key={garage.id}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 transition-all hover:border-emerald-500/50 shadow-sm space-y-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-2xl flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight truncate">{garage.name}</h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-1">
                        <span>المندوب:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-black">
                          {garage.createdByDelegateName || 'غير محدد'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-black px-3 py-1 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                    جراج جديد
                  </span>
                </div>

                {/* Details Row */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-150 dark:border-slate-800 text-xs font-bold">
                  <div>
                    <span className="text-slate-400 block text-[11px]">رقم الهاتف</span>
                    <span className="font-mono text-slate-900 dark:text-white">{garage.phone || 'بدون هاتف'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">سعر الساعة / المبيت</span>
                    <span className="font-mono text-slate-900 dark:text-white">{garage.hourlyRate} / {garage.overnightRate} ج.م</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onApproveGarageClick(garage)}
                    disabled={isGarageProcessing}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isApproving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>جاري التفعيل...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3] shrink-0" />
                        <span>تأكيد وتفعيل الجراج</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => onRejectGarageClick(garage)}
                    disabled={isGarageProcessing}
                    className="px-5 py-3 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 active:scale-[0.98] text-red-600 dark:text-red-400 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all border border-red-200 dark:border-red-900/40 cursor-pointer disabled:opacity-50"
                  >
                    {isRejecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>جاري الرفض...</span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 stroke-[3] shrink-0" />
                        <span>رفض</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {pendingGarages.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <Building2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-200">لا توجد طلبات تسجيل معلقة</h3>
              <p className="text-xs font-medium text-slate-400">ستظهر هنا طلبات تسجيل الجراجات الجديدة المقدمة من المندوبين.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminRequestsView;

