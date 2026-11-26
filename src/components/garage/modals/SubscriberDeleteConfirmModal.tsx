import { memo } from 'react';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

/**
 * SubscriberDeleteConfirmModal
 *
 * Confirmation dialog shown when the user taps "delete" on a subscriber.
 * Just two buttons: cancel and confirm.
 *
 * Audit F-19 (Phase 4c): the hand-rolled overlay/icon/button block was
 * replaced by the shared ConfirmDialog. Copy and semantics unchanged;
 * the shared stack adds body scroll lock and consistent tone styling.
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
  return (
    <ConfirmDialog
      isOpen={isOpen}
      tone="danger"
      title="تأكيد الحذف"
      message="هل أنت متأكد من حذف هذا المشترك نهائياً?"
      confirmText="حذف"
      onConfirm={onConfirm}
      onCancel={onCancel}
      zIndex="z-[120]"
    />
  );
});

SubscriberDeleteConfirmModal.displayName = 'SubscriberDeleteConfirmModal';
