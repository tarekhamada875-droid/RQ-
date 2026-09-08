import React, { useState } from 'react';
import { Check, X, Car, Building2, Zap, ClipboardList, Loader2, Wallet, Phone } from 'lucide-react';
import { RechargeRequest, Garage } from '../../types';

interface AdminRequestsViewProps {
  rechargeRequests: RechargeRequest[];
  pendingGarages: Garage[];
  handleApproveRequest: (request: RechargeRequest) => Promise<void>;
  handleRejectRequest: (requestId: string) => Promise<void>;
  handleApproveGarage: (garage: Garage) => Promise<void>;
  handleRejectGarage: (garage: Garage) => Promise<void>;
  adminLang: string;
  t: (key: string) => string;
}

export const AdminRequestsView: React.FC<AdminRequestsViewProps> = ({
  rechargeRequests,
  pendingGarages,
  handleApproveRequest,
  handleRejectRequest,
  handleApproveGarage,
  handleRejectGarage,
  adminLang,
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

  // Auto switch subtab if user is currently on 'recharge' but it is empty while 'creation' has pending garages
  React.useEffect(() => {
    if (requestSubTab === 'recharge' && rechargeRequests.length === 0 && pendingGarages.length > 0) {
      setRequestSubTab('creation');
    }
  }, [rechargeRequests.length, pendingGarages.length]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Sub-tabs segment controller */}
      <div className="flex bg-[#f1f5f9] dark:bg-slate-900/60 p-1 rounded-2xl max-w-sm sm:max-w-md w-full border border-slate-200/40 dark:border-slate-800/40">
        <button
          onClick={() => setRequestSubTab('recharge')}
          className={`flex-1 flex items-center justify-center gap-4 py-3 px-4 rounded-xl font-black text-xs sm:text-sm transition-all focus:outline-none ${
            requestSubTab === 'recharge'
              ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm font-black'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <span>{t('طلبات الشحن')}</span>
          {rechargeRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white shrink-0">
              {rechargeRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setRequestSubTab('creation')}
          className={`flex-1 flex items-center justify-center gap-4 py-3 px-4 rounded-xl font-black text-xs sm:text-sm transition-all focus:outline-none ${
            requestSubTab === 'creation'
              ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm font-black'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <span>{t('إنشاء الجراجات')}</span>
          {pendingGarages.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white shrink-0">
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
                {/* Header Row: Icon + Garage Name + Request Type Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      isBalanceTopup 
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' 
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {isBalanceTopup ? <Wallet className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                    </div>
                    <div className={`min-w-0 ${adminLang === 'en' ? 'text-left' : 'text-right'}`}>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight truncate">
                        {request.garageName}
                      </h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span>{t('بواسطة المندوب:')}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-black underline decoration-dotted">
                          {request.delegateName || t('غير معروف')}
                        </span>
                      </p>
                    </div>
                  </div>

                  <span className={`text-[11px] font-black px-3 py-1 rounded-full shrink-0 whitespace-nowrap ${
                    isBalanceTopup
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {isBalanceTopup ? t('شحن رصيد') : t('اشتراك باقة')}
                  </span>
                </div>

                {/* Hero Amount Section */}
                <div className="flex flex-wrap items-baseline gap-2 font-mono">
                  <span className={`text-2xl sm:text-3xl font-black ${
                    isBalanceTopup ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {isBalanceTopup ? (request.amount || request.revenueAmount) : request.revenueAmount}
                  </span>
                  <span className="text-sm font-black text-slate-500 dark:text-slate-400">{t('ج.م')}</span>
                  
                  {!isBalanceTopup && (
                    <>
                      <span className="text-xs font-bold text-slate-400 font-sans mr-1">
                        / {request.durationDays || 30} {t('يوم')}
                      </span>
                      {((request as any).originalRevenueAmount && (request as any).originalRevenueAmount > request.revenueAmount) && (
                        <span className="text-xs font-bold text-slate-400 line-through mr-1 font-mono whitespace-nowrap">
                          بدلاً من {(request as any).originalRevenueAmount} ج.م
                        </span>
                      )}
                      {request.discountAmount && request.discountAmount > 0 ? (
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-sans whitespace-nowrap">
                          خصم {request.discountAmount} ج.م {request.couponCode ? `[${request.couponCode}]` : ''}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                {/* Feature Row / Details */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    {isBalanceTopup ? (
                      <>
                        <div className="w-5 h-5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                          <Wallet className="w-3 h-3" />
                        </div>
                        <span>{t('إضافة رصيد فوري لمحفظة الجراج')}</span>
                      </>
                    ) : (
                      <>
                        <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Car className="w-3 h-3" />
                        </div>
                        <span>
                          {request.packageName} • {request.carsCount === 0 || !request.carsCount ? t('سعة مفتوحة بدون حد أقصى') : `سعة ${request.carsCount} سيارة يومياً`}
                        </span>
                      </>
                    )}
                  </div>

                  {(request.delegateId || (request as any).referrerId) && (
                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-lg font-mono whitespace-nowrap">
                      {t('عمولة المندوب')}: +{(request.durationDays || 30) <= 1 ? 5 : 50} ج.م
                    </span>
                  )}
                </div>

                {/* Actions Segment */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onApproveRequestClick(request)}
                    disabled={isReqProcessing}
                    className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isReqApproving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{t('جاري التنفيذ...')}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3] shrink-0" />
                        <span>{t('قبول واعتماد الطلب')}</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => onRejectRequestClick(request.id)}
                    disabled={isReqProcessing}
                    className="px-6 h-12 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 active:scale-[0.98] text-red-600 dark:text-red-400 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all border border-red-100 dark:border-red-900/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isReqRejecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{t('جاري الرفض...')}</span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 stroke-[3] shrink-0" />
                        <span>{t('رفض')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {rechargeRequests.length === 0 && (
            <div className="text-center py-24 bg-white dark:bg-slate-900/50 rounded-[3rem] border-4 border-dashed border-slate-100 dark:border-slate-800">
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <ClipboardList className="w-10 h-10 text-slate-200 dark:text-slate-700" />
              </div>
              <h3 className="text-xl font-bold text-slate-400 dark:text-slate-500 mb-2">{t('لا توجد طلبات معلقة')}</h3>
              <p className="text-sm font-medium text-slate-400 dark:text-slate-600">{t('سيظهر هنا طلبات شحن الأرصدة المقدمة من قبل المندوبين')}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pendingGarages.map((garage) => {
            const isGarageProcessing = processingGarageId === garage.id;
            const isApproving = isGarageProcessing && processingGarageAction === 'approve';
            const isRejecting = isGarageProcessing && processingGarageAction === 'reject';

            return (
              <div 
                key={garage.id}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 transition-all hover:border-emerald-500/50 shadow-sm space-y-4"
              >
                {/* Header: Garage Name + Delegate + Status Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-emerald-50 dark:bg-emerald-400/10 text-emerald-500 border border-emerald-500/20 rounded-2xl flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className={`min-w-0 ${adminLang === 'en' ? 'text-left' : 'text-right'}`}>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight truncate">{garage.name}</h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span>{t('بواسطة المندوب:')}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-black underline decoration-dotted">
                          {garage.createdByDelegateName || t('غير معروف')}
                        </span>
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-black px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0 whitespace-nowrap">
                    {t('تسجيل جراج جديد')}
                  </span>
                </div>

                {/* Rates & Phone Row */}
                <div className="flex flex-wrap items-baseline gap-4 font-mono">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-slate-400 font-bold font-sans">{t('سعر الساعة')}:</span>
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{garage.hourlyRate}</span>
                    <span className="text-xs font-bold text-slate-500">{t('ج.م')}</span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700 self-center" />
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-slate-400 font-bold font-sans">{t('سعر المبيت')}:</span>
                    <span className="text-xl font-black text-slate-900 dark:text-white">{garage.overnightRate}</span>
                    <span className="text-xs font-bold text-slate-500">{t('ج.م')}</span>
                  </div>
                </div>

                {/* Contact / Phone Feature Row */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                  <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                    <Phone className="w-3 h-3" />
                  </div>
                  <span>{t('رقم الهاتف')}:</span>
                  <span className="font-mono text-slate-900 dark:text-white" dir="ltr">{garage.phone || t('بدون هاتف')}</span>
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onApproveGarageClick(garage)}
                    disabled={isGarageProcessing}
                    className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isApproving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{t('جاري التفعيل...')}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3] shrink-0" />
                        <span>{t('تأكيد وتفعيل الجراج')}</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => onRejectGarageClick(garage)}
                    disabled={isGarageProcessing}
                    className="px-6 h-12 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 active:scale-[0.98] text-red-600 dark:text-red-400 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all border border-red-100 dark:border-red-900/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRejecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{t('جاري الرفض...')}</span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 stroke-[3] shrink-0" />
                        <span>{t('رفض')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {pendingGarages.length === 0 && (
            <div className="text-center py-24 bg-white dark:bg-slate-900/50 rounded-[3rem] border-4 border-dashed border-slate-100 dark:border-slate-800">
              <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <Building2 className="w-10 h-10 text-slate-200 dark:text-slate-700" />
              </div>
              <h3 className="text-xl font-bold text-slate-400 dark:text-slate-500 mb-2">{t('لا توجد طلبات معلقة')}</h3>
              <p className="text-sm font-medium text-slate-400 dark:text-slate-600">{t('سيظهر هنا طلبات تسجيل الجراجات الجديدة المقدمة من المندوبين')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
