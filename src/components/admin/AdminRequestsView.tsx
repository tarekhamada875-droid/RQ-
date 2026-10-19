import React, { useState } from 'react';
import { Check, X, Building2, ClipboardList, Loader2 } from 'lucide-react';
import { Garage } from '../../types';
import { sortGaragesNewestFirst } from '../../utils';

interface AdminRequestsViewProps {
  pendingGarages: Garage[];
  handleApproveGarage: (garage: Garage) => Promise<void>;
  handleRejectGarage: (garage: Garage) => Promise<void>;
  adminLang?: string;
  t: (key: string) => string;
}

export const AdminRequestsView: React.FC<AdminRequestsViewProps> = ({
  pendingGarages,
  handleApproveGarage,
  handleRejectGarage,
  adminLang = 'ar',
  t,
}) => {
  const [processingGarageId, setProcessingGarageId] = useState<string | null>(null);
  const [processingGarageAction, setProcessingGarageAction] = useState<'approve' | 'reject' | null>(null);

  const processGarage = async (garage: Garage, action: 'approve' | 'reject') => {
    if (processingGarageId) return;
    setProcessingGarageId(garage.id);
    setProcessingGarageAction(action);
    try {
      if (action === 'approve') await handleApproveGarage(garage);
      else await handleRejectGarage(garage);
    } catch (error) {
      console.error(`Failed to ${action} garage application:`, error);
    } finally {
      setProcessingGarageId(null);
      setProcessingGarageAction(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 dir-rtl text-right font-sans" dir={adminLang === 'en' ? 'ltr' : 'rtl'}>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">{t('طلبات تسجيل الجراجات')}</h2>
            <p className="mt-0.5 text-xs font-bold text-slate-400">{t('طلبات تسجيل الجراجات المقدمة من المندوبين')}</p>
          </div>
        </div>
        <span className="rounded-lg bg-blue-500/10 px-3 py-1 font-mono text-sm font-black text-blue-600 dark:text-blue-400">
          {pendingGarages.length}
        </span>
      </div>

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
                        <span>{t('المندوب:')}</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">{garage.createdByDelegateName || t('غير محدد')}</span>
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-black text-blue-600 dark:text-blue-400">
                    {t('جراج جديد')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold dark:border-slate-800 dark:bg-slate-800/50">
                  <div>
                    <span className="block text-[11px] text-slate-400">{t('رقم الهاتف')}</span>
                    <span className="font-mono text-slate-900 dark:text-white">{garage.phone || t('بدون هاتف')}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400">{t('سعر الساعة / المبيت')}</span>
                    <span className="font-mono text-slate-900 dark:text-white">{garage.hourlyRate} / {garage.overnightRate} {t('ج.م')}</span>
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
                    <span>{isApproving ? t('جاري التفعيل...') : t('تأكيد وتفعيل الجراج')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void processGarage(garage, 'reject')}
                    disabled={isProcessing}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-xs font-black text-red-600 transition-all hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/50 sm:text-sm"
                  >
                    {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 stroke-[3]" />}
                    <span>{isRejecting ? t('جاري الرفض...') : t('رفض')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3 rounded-3xl border-2 border-dashed border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Building2 className="h-7 w-7" />
          </div>
          <h3 className="text-base font-black text-slate-800 dark:text-slate-200">{t('لا توجد طلبات تسجيل معلقة')}</h3>
          <p className="text-xs font-medium text-slate-400">{t('ستظهر هنا طلبات تسجيل الجراجات الجديدة المقدمة من المندوبين.')}</p>
        </div>
      )}
    </div>
  );
};

export default AdminRequestsView;
