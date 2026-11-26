import React from 'react';
import { ConfirmDialog, type ConfirmTone } from '../ui/ConfirmDialog';

/**
 * AdminConfirmDialog — legacy alias (audit F-19, Phase 4c).
 *
 * The implementation moved to the shared `ui/ConfirmDialog`, which every
 * confirm dialog in the app now uses (garage-side delete confirms,
 * subscriber warnings, delegate details inline confirms, staff delete).
 * This file keeps the admin import path and prop names (`type` instead of
 * `tone`) so its consumers compile unchanged.
 *
 * Behavior deltas vs. the pre-F-19 local implementation — all
 * improvements inherited from the shared stack:
 *   - body scroll is locked while the dialog is open (useBodyScrollLock)
 *   - backdrop click is ignored while the confirm action is in flight
 */

interface AdminConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmTone;
}

export const AdminConfirmDialog: React.FC<AdminConfirmDialogProps> = ({
  type,
  ...props
}) => <ConfirmDialog {...props} tone={type} />;
