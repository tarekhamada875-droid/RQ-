import { useCallback } from 'react';
import { garageService } from '../services';
import { deleteGarageWithRecovery, garageDeletionFailureMessage } from '../services/garageDeletionService';
import { soundManager } from '../utils/sounds';
import type { Garage } from '../types';
import type { AdminConfirmDialog, AdminGarageForm } from './useAdminModals';

/**
 * useAdminGarageActions
 *
 * Owns the admin dashboard's "garage lifecycle" action handlers:
 *   - handleApproveGarage — set garage status to approved
 *   - handleRejectGarage  — open confirm dialog, then delete with recovery
 *   - handleAddGarage      — call createNewGarage + close modal + refresh
 *   - refreshAdminListsAfterMutation — best-effort refresh wrapper
 *
 * Depends on the modal-state setters from useAdminModals (setConfirmDialog,
 * setShowAddGarageModal) because the reject flow drives a confirm dialog
 * and the add flow closes the AddGarage modal on success.
 *
 * Extracted Stage 4 of the structural refactor. Previously these
 * 3 functions + refreshAdminListsAfterMutation lived inline in
 * AdminDashboard.tsx.
 */

interface UseAdminGarageActionsArgs {
  onRefreshAdminLists?: () => Promise<void>;
  createNewGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
  setConfirmDialog: (update: AdminConfirmDialog | ((prev: AdminConfirmDialog) => AdminConfirmDialog)) => void;
  setShowAddGarageModal: (open: boolean) => void;
}

export interface UseAdminGarageActionsResult {
  handleApproveGarage: (garage: Garage) => Promise<void>;
  handleRejectGarage: (garage: Garage) => Promise<void>;
  handleAddGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
}

export function useAdminGarageActions({
  onRefreshAdminLists,
  createNewGarage,
  showToast,
  setConfirmDialog,
  setShowAddGarageModal,
}: UseAdminGarageActionsArgs): UseAdminGarageActionsResult {

  const refreshAdminListsAfterMutation = useCallback(async () => {
    try {
      await onRefreshAdminLists?.();
    } catch (error) {
      // The mutation succeeded; report refresh failures separately rather than
      // implying that the saved change itself failed.
      console.error('Failed to refresh Admin lists after mutation:', error);
    }
  }, [onRefreshAdminLists]);

  const handleApproveGarage = useCallback(async (garage: Garage) => {
    try {
      await garageService.updateGarage(garage.id, { status: 'approved' });
      soundManager.play('checkIn');
      showToast?.(`تم قبول وتفعيل جراج "${garage.name}" بنجاح 🚀`, 'success');
      void refreshAdminListsAfterMutation();
    } catch (error) {
      console.error('Failed to approve garage:', error);
      soundManager.play('error');
      showToast?.('حدث خطأ أثناء تفعيل الجراج', 'error');
      throw error;
    }
  }, [refreshAdminListsAfterMutation, showToast]);

  const handleRejectGarage = useCallback(async (garage: Garage) => {
    return new Promise<void>((resolve, reject) => {
      setConfirmDialog({
        isOpen: true,
        title: 'رفض طلب إنشاء جراج',
        message: `هل أنت متأكد من رفض طلب إنشاء جراج "${garage.name}"؟ سيؤدي ذلك لحذف البيانات نهائياً.`,
        confirmText: 'نعم، ارفض واحذف',
        cancelText: 'تراجع',
        type: 'danger',
        onConfirm: async () => {
          try {
            const result = await deleteGarageWithRecovery(garage.id);
            if (result.ok === false) {
              showToast?.(garageDeletionFailureMessage(result), 'error');
              reject(new Error(result.errorCode));
              return;
            }
            await refreshAdminListsAfterMutation();
            soundManager.play('error');
            showToast?.(`تم رفض طلب إنشاء جراج "${garage.name}" وحذف البيانات`, 'success');
            resolve();
          } catch (error) {
            console.error('Failed to reject garage:', error);
            soundManager.play('error');
            showToast?.('حدث خطأ أثناء رفض الطلب', 'error');
            reject(error);
          } finally {
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          }
        },
        onCancel: () => {
          resolve();
        }
      });
    });
  }, [refreshAdminListsAfterMutation, setConfirmDialog, showToast]);

  const handleAddGarage = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const created = await createNewGarage(e);
      if (!created) return false;
      await refreshAdminListsAfterMutation();
      setShowAddGarageModal(false);
      return true;
    } catch (err) {
      console.error('Admin garage creation failed:', err);
      showToast?.(err instanceof Error ? err.message : 'حدث خطأ أثناء إنشاء الجراج', 'error');
      return false;
    }
  }, [createNewGarage, refreshAdminListsAfterMutation, setShowAddGarageModal, showToast]);

  return {
    handleApproveGarage,
    handleRejectGarage,
    handleAddGarage,
  };
}

// Type re-export for any external importer that wants AdminGarageForm
// without depending on useAdminModals (avoids a circular import in case
// useAdminModals ever depends on this module in the future).
export type { AdminGarageForm };
