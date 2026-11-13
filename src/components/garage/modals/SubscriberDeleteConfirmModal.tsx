import { memo } from 'react';
import { Trash2 } from 'lucide-react';

/**
 * SubscriberDeleteConfirmModal
 *
 * Confirmation dialog shown when the user taps "delete" on a subscriber.
 * Just two buttons: cancel and confirm.
 *
 * Extracted Stage 3 of the structural refactor. Previously this was
 * ~28 lines of inline JSX in SubscriberModals.tsx.
 *
 * Pure presentational — the parent owns the `subscriberToDelete` state
 * and the `confirmDelete` handler.
 */

interface SubscriberDeleteConfirmModalProps {
  /** Truthy when the modal should be visible (typically: `subscriberToDelete !== null`). */
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const SubscriberDeleteConfirmModal = memo(function SubscriberDeleteConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
}: SubscriberDeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80">
      <div className="bg-[#faf9f6] dark:bg-slate-900 w-full max-w-sm rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">تأكيد الحذف</h3>
          <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">هل أنت متأكد من حذف هذا المشترك نهائياً?</p>
        </div>
        <div className="px-8 pb-8 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl font-bold text-xs uppercase tracking-widest outline-none"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest outline-none"
          >
            حذف
          </button>
        </div>
      </div>
    </div>
  );
});

SubscriberDeleteConfirmModal.displayName = 'SubscriberDeleteConfirmModal';
