import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Check, X, Building2, ClipboardList, Loader2, Coins } from 'lucide-react';
import { Garage } from '../../types';
import { safeDate } from '../../utils/dates';;
import { adminBillingService } from '../../services/adminBillingService';
import type { DelegateCreditRequest } from '../../services/delegateService';

interface AdminRequestsViewProps {
  pendingGarages: Garage[];
  handleApproveGarage: (garage: Garage) => Promise<void>;
  handleRejectGarage: (garage: Garage) => Promise<void>;
}

/**
 * One merged, newest-first queue of everything waiting on the admin:
 * garage registration requests (blue) + delegate credit requests (amber).
 *
 * Previously each section had its own header card + its own empty state,
 * so an all-clear page repeated "nothing pending" four times. Now one slim
 * header carries both live counters inline, and a single queue/empty state
 * follows. Card identities stay visually distinct (accent color, tag, and
 * the approve button's promise: تفعيل الجراج vs إضافة الرصيد).
 */

type QueueItem =
  | { kind: 'garage'; key: string; timestamp: number; garage: Garage }
  | { kind: 'credit'; key: string; timestamp: number; request: DelegateCreditRequest };

const garageTimestamp = (g: Garage): number => {
  if (!g?.createdAt) return 0;
  const d = safeDate(g.createdAt);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

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

  // Initial fetch + 30-second polling (only when the page is visible).
  // This keeps the admin's credit request list fresh — when a delegate
  // submits a new request, it appears within 30 seconds without a manual
  // refresh. Polling stops when the tab is hidden to save reads.
  useEffect(() => {
    void refreshCreditRequests();

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        // Silent refresh — don't flip the loading spinner on polls, only on initial load
        adminBillingService.listPendingCreditRequests()
          .then(setCreditRequests)
          .catch(() => {});
      }, 30_000);
    };
    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshCreditRequests();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === 'visible') {
      startPolling();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshCreditRequests]);

  // The unified queue: both kinds merged, newest first. A missing timestamp
  // sorts last (0) instead of crashing the sort.
  const queue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [
      ...(Array.isArray(pendingGarages) ? pendingGarages : []).map((garage) => ({
        kind: 'garage' as const,
        key: `garage-${garage.id}`,
        timestamp: garageTimestamp(garage),
        garage,
      })),
      ...creditRequests.map((request) => ({
        kind: 'credit' as const,
        key: `credit-${request.id}`,
        timestamp: request.createdAt || 0,
        request,
      })),
    ];
    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [pendingGarages, creditRequests]);

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
    <div className="max-w-4xl mx-auto space-y-4 dir-rtl text-right font-sans" dir="rtl">
      {/* One slim header for the whole queue — both counters inline next to
          the title instead of two full-width cards with floating badges. */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="text-base font-black text-slate-900 dark:text-white">طلبات معلقة</h2>
          <span className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-2.5 py-1 text-[11px] font-black text-blue-600 dark:text-blue-400">
            <span>طلبات تسجيل الجراجات</span>
            <span className="font-mono">{pendingGarages.length}</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] font-black text-amber-600 dark:text-amber-400">
            <span>طلبات الرصيد</span>
            <span className="font-mono">{creditRequests.length}</span>
          </span>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </div>
      )}
      {creditRequestError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {creditRequestError}
        </div>
      )}

      {creditRequestsLoading && queue.length === 0 ? (
        <div className="flex items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : queue.length === 0 ? (
        <div className="space-y-2 rounded-3xl border-2 border-dashed border-slate-200 bg-white py-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">لا توجد طلبات معلقة</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {queue.map((item) =>
            item.kind === 'garage' ? (() => {
              const garage = item.garage;
              const isProcessing = processingGarageId === garage.id;
              const isApproving = isProcessing && processingGarageAction === 'approve';
              const isRejecting = isProcessing && processingGarageAction === 'reject';
              return (
                <div
                  key={item.key}
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
            })() : (() => {
              const request = item.request;
              const isProcessing = processingCreditRequestId === request.id;
              const isApproving = isProcessing && processingCreditRequestAction === 'approve';
              const isRejecting = isProcessing && processingCreditRequestAction === 'reject';
              return (
                <div
                  key={item.key}
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
            })()
          )}
        </div>
      )}
    </div>
  );
};

export default AdminRequestsView;
