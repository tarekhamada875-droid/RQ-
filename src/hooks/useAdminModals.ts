import { useState, type Dispatch, type SetStateAction } from 'react';
import { useBackHandler } from './backHandler';

/**
 * useAdminModals
 *
 * Owns the visibility + content state for the admin dashboard's three
 * modals: AddGarage, AppearanceSettings, and the generic ConfirmDialog
 * (used by handleRejectGarage etc).
 *
 * Also owns the form-state that lives inside the AddGarage modal
 * (`pinInput` + `garageForm`) so the parent doesn't re-render when the
 * user types into the form. Each keystroke now re-renders only whatever
 * reads these values (just the modal body).
 *
 * Registers 3 back-handler entries (one per modal) so the hardware
 * back button closes them in priority order.
 *
 * Extracted Stage 4 of the structural refactor. Previously these
 * 3 useState + 3 useBackHandler calls lived inline in AdminDashboard.tsx.
 */

export type AdminConfirmDialog = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'success';
};

export type AdminGarageForm = {
  name: string;
  hourlyRate: string;
  overnightRate: string;
  phone: string;
  isTrial: boolean;
  ownerPin: string;
};

const EMPTY_GARAGE_FORM: AdminGarageForm = {
  name: '',
  hourlyRate: '',
  overnightRate: '',
  phone: '',
  isTrial: false,
  ownerPin: '',
};

const CLOSED_CONFIRM_DIALOG: AdminConfirmDialog = {
  isOpen: false,
  title: '',
  message: '',
  onConfirm: () => {},
};

export interface UseAdminModalsResult {
  showAddGarageModal: boolean;
  setShowAddGarageModal: Dispatch<SetStateAction<boolean>>;
  showAppearanceSettings: boolean;
  setShowAppearanceSettings: Dispatch<SetStateAction<boolean>>;
  confirmDialog: AdminConfirmDialog;
  setConfirmDialog: Dispatch<SetStateAction<AdminConfirmDialog>>;
  pinInput: string;
  setPinInput: Dispatch<SetStateAction<string>>;
  garageForm: AdminGarageForm;
  setGarageForm: Dispatch<SetStateAction<AdminGarageForm>>;
  /** Helper for callers that want to flip AddGarage open AND reset the form
   *  in one shot — the typical "open the modal" entry-point. */
  openAddGarageModal: () => void;
}

export function useAdminModals(): UseAdminModalsResult {
  const [showAddGarageModal, setShowAddGarageModal] = useState(false);
  const [showAppearanceSettings, setShowAppearanceSettings] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<AdminConfirmDialog>(CLOSED_CONFIRM_DIALOG);
  const [pinInput, setPinInput] = useState('');
  const [garageForm, setGarageForm] = useState<AdminGarageForm>(EMPTY_GARAGE_FORM);

  // ── Back-handler registrations ──────────────────────────────────────
  // Each modal self-registers via useBackHandler. The stack handles
  // priority automatically — the most recently opened modal is on top.
  useBackHandler(
    () => {
      setConfirmDialog((d) => {
        d.onCancel?.();
        return { ...d, isOpen: false };
      });
      return true;
    },
    confirmDialog.isOpen,
  );
  useBackHandler(() => { setShowAppearanceSettings(false); return true; }, showAppearanceSettings);
  useBackHandler(() => { setShowAddGarageModal(false); return true; }, showAddGarageModal);

  const openAddGarageModal = () => {
    setPinInput('');
    setShowAddGarageModal(true);
  };

  return {
    showAddGarageModal,
    setShowAddGarageModal,
    showAppearanceSettings,
    setShowAppearanceSettings,
    confirmDialog,
    setConfirmDialog,
    pinInput,
    setPinInput,
    garageForm,
    setGarageForm,
    openAddGarageModal,
  };
}
