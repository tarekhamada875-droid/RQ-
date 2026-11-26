import React, { memo } from 'react';
import { Vehicle } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface DeleteVehicleConfirmModalProps {
  vehicle: Vehicle;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Delete-vehicle confirmation (audit F-19, Phase 4c). The hand-rolled
 * overlay/icon/buttons block was replaced by the shared ConfirmDialog.
 * Copy fix while migrating: the cancel button used to be labeled
 * "امسح" (delete) — a copy-paste bug that invited the exact accident the
 * dialog exists to prevent. It now reads "إلغاء" like every other dialog.
 */
export const DeleteVehicleConfirmModal: React.FC<DeleteVehicleConfirmModalProps> = memo(({
  vehicle,
  isLoading,
  onConfirm,
  onCancel
}) => (
  <ConfirmDialog
    isOpen
    tone="danger"
    title="حذف السيارة؟"
    message={
      <>
        العربية دي{' '}
        <span className="inline-block px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-black rounded-lg text-xs font-mono">
          {vehicle.plateNumber}
        </span>{' '}
        هتتمسح نهائيًا من النظام.
      </>
    }
    confirmText="امسح العربية"
    onConfirm={onConfirm}
    onCancel={onCancel}
    busy={isLoading}
  />
));
