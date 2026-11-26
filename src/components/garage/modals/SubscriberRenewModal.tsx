import { memo } from 'react';
import { X } from 'lucide-react';
import { formatPlateNumber } from '../../../utils/plates';
import { parseDateKey, formatDateKey } from '../../../utils/dates';
import { getCairoDateKey } from '../../../domain/garage/businessDay';
import type { Subscriber } from '../../../types';
import { useModalA11y } from '../../../hooks/useModalA11y';

/**
 * SubscriberRenewModal
 *
 * Renewal options modal for a single subscriber. Shows 3 duration buttons
 * (week / two_weeks / month) with a dynamic preview of the new end date
 * computed from the subscriber's current end date.
 *
 * Extracted Stage 3 of the structural refactor. Previously this was
 * ~80 lines of inline JSX in SubscriberModals.tsx, plus the two
 * date-parsing helpers (parseDateKey / formatDateKey) at module scope.
 *
 * Audit F-7 (Phase 3, 2026-11-26): the local date-key helpers were deleted
 * and replaced with the shared exports from utils/dates.ts. Same behavior,
 * one definition.
 */

export type SubscriberRenewType = 'week' | 'two_weeks' | 'month';

interface SubscriberRenewModalProps {
  isOpen: boolean;
  subscriber: Subscriber | null;
  onClose: () => void;
  onConfirm: (type: SubscriberRenewType) => void;
  isSubmitting: boolean;
}

const RENEW_OPTIONS: ReadonlyArray<{ type: SubscriberRenewType; label: string; days: number | null }> = [
  { type: 'week', label: 'تجديد لمدة أسبوع', days: 7 },
  { type: 'two_weeks', label: 'تجديد لمدة أسبوعين', days: 14 },
  { type: 'month', label: 'تجديد لمدة شهر واحد', days: null },
];

export const SubscriberRenewModal = memo(function SubscriberRenewModal({
  isOpen,
  subscriber,
  onClose,
  onConfirm,
  isSubmitting,
}: SubscriberRenewModalProps) {
  // Stays mounted while hidden — re-arm Escape/trap/focus on every open.
  const modalA11y = useModalA11y(onClose, undefined, isOpen && !!subscriber);
  if (!isOpen || !subscriber) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#faf9f6] dark:bg-slate-900 w-full max-w-md rounded-[2rem] sm:rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden " dir="rtl" {...modalA11y.containerProps}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
              تجديد الاشتراك الشهري
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full border border-red-100 dark:border-red-900/30 outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span>اسم المشترك:</span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100">{subscriber.ownerName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>رقم اللوحة:</span>
              <span className="font-mono text-slate-900 dark:text-slate-100 font-black">{formatPlateNumber(subscriber.plateNumber)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-dashed border-slate-200 dark:border-slate-700 pt-2 mt-1">
              <span>تاريخ الانتهاء الحالي:</span>
              <span className="font-black text-blue-500">{subscriber.endDate}</span>
            </div>
          </div>

          <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pr-1">خيارات التوقيت والخصم المتاحة:</p>

          <div className="space-y-3">
            {RENEW_OPTIONS.map((opt) => {

              // Calculate dynamic future expiration date preview
              const todayKey = getCairoDateKey();
              const today = parseDateKey(todayKey);
              const currentEndDate = parseDateKey(subscriber.endDate);
              const baseDate = currentEndDate >= today ? currentEndDate : today;
              const previewNewEndDate = new Date(baseDate);
              if (opt.days) {
                previewNewEndDate.setDate(previewNewEndDate.getDate() + opt.days);
              } else {
                previewNewEndDate.setMonth(previewNewEndDate.getMonth() + 1);
              }
              const previewDateStr = formatDateKey(previewNewEndDate);

              return (
                <button
                  key={opt.type}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onConfirm(opt.type)}
                  className="w-full text-right p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#faf9f6] dark:bg-slate-900 outline-none flex items-center justify-between group disabled:opacity-50"
                >
                  <div className="space-y-1">
                    <p className="font-black text-slate-900 dark:text-white text-sm ">{opt.label}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">ينتهي في: <span className="text-slate-600 dark:text-slate-300 font-extrabold">{previewDateStr}</span></p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

SubscriberRenewModal.displayName = 'SubscriberRenewModal';
