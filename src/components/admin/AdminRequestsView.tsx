import React, { useState, useEffect, useCallback } from 'react';
import { Check, X, Building2, ClipboardList, Loader2, Coins } from 'lucide-react';
import { Garage } from '../../types';
import { sortGaragesNewestFirst } from '../../utils';
import { adminBillingService } from '../../services/adminBillingService';
import type { DelegateCreditRequest } from '../../services/delegateService';

interface AdminRequestsViewProps {
  pendingGarages: Garage[];
  handleApproveGarage: (garage: Garage) => Promise<void>;
  handleRejectGarage: (garage: Garage) => Promise<void>;
}

export const AdminRequestsView: React.FC<AdminRequestsViewProps> = ({
  pendingGarages,
  handleApproveGarage,
  handleRejectGarage,
}) => {
  const [processingGarageId, setProcessingGarageId] = useState<string | null>(null);
  const [processingGarageAction, setProcessingGarageAction] = useState<'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Credit requests state
  const [creditRequests, setCreditRequests] = useState<DelegateCreditRequest[]>([]);
  const [creditRequestsLoading, setCreditRequestsLoading] = useState(true);
  const [processingCreditRequestId, setProcessingCreditRequestId] = useState<string | null>(null);
  const [processingCreditRequestAction, setProcessingCreditRequestAction] = useState<'approve' | 'reject' | null>(null);
  const [creditRequestError, setCreditRequestError] = useState<string | null>(null);

  const refreshCreditRequests = useCallback(async () => {
    try {
      setCreditRequestsLoading(true);
      const requests = await adminBillingService.listPendingCreditRequests();
      setCreditRequests(requests);
    } catch {
      // Silent — the section just won't show
    } finally {
      setCreditRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCreditRequests();
  }, [refreshCreditRequests]);

  const processGarage = async (garage: Garage, action: 'approve' | 'reject') => {
    if (processingGarageId) return;
    setProcessingGarageId(garage.id);
    setProcessingGarageAction(action);
    setActionError(null);
    try {
      if (action === 'approve') await handleApproveGarage(garage);
      else await handleRejectGarage(garage);
    } catch (error) {
      console.error(`Failed to ${action} garage application:`, error);
      setActionError(action === 'approve'
        ? 'تعذر تفعيل الجراج. يرجى المحاولة مرة أخرى.'
        : 'تعذر رفض طلب الجراج. يرجى المحاولة مرة أخرى.');
    } finally {
      setProcessingGarageId(null);
      setProcessingGarageAction(null);
    }
  };

  const processCreditRequest = async (request: DelegateCreditRequest, action: 'approve' | 'reject') => {
    if (processingCreditRequestId) return;
    setProcessingCreditRequestId(request.id);
    setProcessingCreditRequestAction(action);
    setCreditRequestError(null);
    try {
      if (action === 'approve') {
        await adminBillingService.approveCreditRequest(request.id);
      } else {
        await adminBillingService.rejectCreditRequest(request.id);
      }
      await refreshCreditRequests();
    } catch (error) {
      console.error(`Failed to ${action} credit request:`, error);
      setCreditRequestError(action === 'approve'
        ? 'تعذر الموافقة على طلب الرصيد. يرجى المحاولة مرة أخرى.'
        : 'تعذر رفض طلب الرصيد. يرجى المحاولة مرة أخرى.');
    } finally {
      setProcessingCreditRequestId(null);
      setProcessingCreditRequestAction(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 dir-rtl text-right font-sans" dir="rtl">
      {/* Garage creation requests */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">طلبات تسجيل الجراجات</h2>
            <p className="mt-0.5 text-xs font-bold text-slate-400">طلبات تسجيل الجراجات المقدمة من المندوبين</p>
          </div>
        </div>
        <span className="rounded-lg bg-blue-500/10 px-3 py-1 font-mono text-sm font-black text-blue-600 dark:text-blue-400">
          {pendingGarages.length}
        </span>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </div>
      )}

      {pendingGarages.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {sortGaragesNewestFirst(pendingGarages).map((garage) => {
            const isProcessing = processingGarageId === garage.id;
            const isApproving = isProcessing && processingGarageAction === 'approve';
            const isRejecting = isProcessing && processingGarageAction === 'reject';

            return (
              <div
                key={garage.id}
                className="space-y-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-500/50 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black leading-tight text-slate-900 dark:text-white sm:text-lg">{garage.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-slate-400">
                        <span>المندوب:</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">{garage.createdByDelegateName || 'غير محدد'}</span>
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-black text-blue-600 dark:text-blue-400">
                    جراج جديد
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold dark:border-slate-800 dark:bg-slate-800/50">
                  <div>
                    <span className="block text-[11px] text-slate-400">رقم الهاتف</span>
                    <span className="font-mono text-slate-900 dark:text-white">{garage.phone || 'بدون هاتف'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">سعر الساعة / المبيت</span>
                    <span className="font-mono text-slate-900 dark:text-white">{garage.hourlyRate} / {garage.overnightRate} ج.م</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void processGarage(garage, 'approve')}
                    disabled={isProcessing}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 sm:text-sm"
                  >
                    {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 stroke-[3]" />}
                    <span>{isApproving ? 'جاري التفعيل...' : 'تأكيد وتفعيل الجراج'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void processGarage(garage, 'reject')}
                    disabled={isProcessing}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-xs font-black text-red-600 transition-all hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/50 sm:text-sm"
                  >
                    {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 stroke-[3]" />}
                    <span>{isRejecting ? 'جاري الرفض...' : 'رفض'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 rounded-3xl border-2 border-dashed border-slate-200 bg-white py-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Building2 className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">لا توجد طلبات تسجيل معلقة</h3>
        </div>
      )}

      {/* Credit requests section */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">طلبات الرصيد</h2>
            <p className="mt-0.5 text-xs font-bold text-slate-400">طلبات شحن الرصيد المقدمة من المندوبين</p>
          </div>
        </div>
        <span className="rounded-lg bg-amber-500/10 px-3 py-1 font-mono text-sm font-black text-amber-600 dark:text-amber-400">
          {creditRequests.length}
        </span>
      </div>

      {creditRequestError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {creditRequestError}
        </div>
      )}

      {creditRequestsLoading ? (
        <div className="flex items-center justify-center py-12 rounded-3xl border-2 border-dashed border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : creditRequests.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {creditRequests.map((request) => {
            const isProcessing = processingCreditRequestId === request.id;
            const isApproving = isProcessing && processingCreditRequestAction === 'approve';
            const isRejecting = isProcessing && processingCreditRequestAction === 'reject';
            return (
              <div
                key={request.id}
                className="space-y-4 rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-amber-500/50 dark:border-slate-800 dark:bg-slate-900 sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Coins className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black leading-tight text-slate-900 dark:text-white sm:text-lg">
                        {request.garageName || request.garageId}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-slate-400">
                        <span>المندوب:</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">{request.delegateName || request.delegateId}</span>
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-black text-amber-600 dark:text-amber-400">
                    {request.amount} ج.م
                  </span>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void processCreditRequest(request, 'approve')}
                    disabled={isProcessing}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 sm:text-sm"
                  >
                    {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 stroke-[3]" />}
                    <span>{isApproving ? 'جاري الموافقة...' : 'موافقة وإضافة الرصيد'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void processCreditRequest(request, 'reject')}
                    disabled={isProcessing}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-xs font-black text-red-600 transition-all hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/50 sm:text-sm"
                  >
                    {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 stroke-[3]" />}
                    <span>{isRejecting ? 'جاري الرفض...' : 'رفض'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 rounded-3xl border-2 border-dashed border-slate-200 bg-white py-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Coins className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">لا توجد طلبات رصيد معلقة</h3>
        </div>
      )}
    </div>
  );
};

export default AdminRequestsView;
