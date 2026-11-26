import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, Check, Loader2 } from 'lucide-react';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { ModalShell } from './ModalShell';

/**
 * ConfirmDialog — the canonical confirm dialog (audit F-19, Phase 4c,
 * baseline: main a5a5fc9). Generalized from the admin-only
 * AdminConfirmDialog, which previously coexisted with five hand-rolled
 * confirm modals that disagreed on icon size, button layout, colors and
 * a11y coverage. Every confirm dialog in the app now renders through this
 * component, so:
 *
 *   - tones are consistent (danger red / warning amber / success emerald)
 *   - Escape, focus trap, initial focus, backdrop click and body scroll
 *     lock all come from ModalShell — including for dialogs that
 *     previously had NO a11y at all (delegate details inline confirms)
 *   - the confirm action is async-aware: the icon becomes a spinner and
 *     both buttons lock while the promise is in flight
 *
 * The old AdminConfirmDialog is a thin prop-mapping re-export of this
 * component, so its four consumers keep compiling unchanged.
 */

export type ConfirmTone = 'danger' | 'warning' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  /** Message under the title. Accepts a node so dialogs can embed plates, mono chips, <br/>s. */
  message?: React.ReactNode;
  /** Confirm action. May be async — the dialog shows a spinner and locks buttons while it runs. */
  onConfirm?: () => void | Promise<void>;
  /** Cancel action. Omit for a single-button acknowledgement dialog. */
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  /** Icon override (defaults: danger → Trash2, warning → RotateCcw, success → Check). */
  icon?: React.ReactNode;
  /** Tailwind z-index utility. Default 'z-[100]'. */
  zIndex?: string;
  /**
   * Externally-managed busy state (e.g. the parent owns the mutation and
   * passes its isLoading). Locks both buttons and swaps the confirm label
   * for `busyLabel`, exactly like an in-flight async onConfirm.
   */
  busy?: boolean;
  busyLabel?: string;
  /** Extra content between the message and the buttons (plate preview, progress…). */
  children?: React.ReactNode;
  panelClassName?: string;
  backdropClassName?: string;
}

const TONE_ICON_CLASSES: Record<ConfirmTone, string> = {
  danger: 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400',
  warning: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400',
};

const TONE_CONFIRM_CLASSES: Record<ConfirmTone, string> = {
  danger: 'bg-red-600 active:bg-red-800',
  warning: 'bg-amber-600 active:bg-amber-800',
  success: 'bg-emerald-600 active:bg-emerald-800',
};

const DEFAULT_ICONS: Record<ConfirmTone, React.ReactNode> = {
  danger: <Trash2 className="w-10 h-10" />,
  warning: <RotateCcw className="w-10 h-10" />,
  success: <Check className="w-10 h-10" />,
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  tone = 'success',
  icon,
  zIndex = 'z-[100]',
  busy = false,
  busyLabel = 'جاري التنفيذ...',
  children,
  panelClassName = '',
  backdropClassName,
}) => {
  const { isLoading: isAsyncRunning, run: runConfirmAction } = useAsyncAction();
  const [isCancelling, setIsCancelling] = useState(false);
  const isProcessing = busy || isAsyncRunning;

  // The dialog stays mounted while hidden (isOpen prop) — reset the
  // cancel-flash state and pass isOpen to ModalShell so the trap/focus/
  // Escape re-arm on every open instead of arming once.
  useEffect(() => {
    if (!isOpen) {
      setIsCancelling(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmClick = async () => {
    if (isProcessing || isCancelling || !onConfirm) return;
    if (busy) {
      // Parent-managed busy: the callback's promise is not ours to await.
      onConfirm();
      return;
    }
    await runConfirmAction(() => Promise.resolve(onConfirm()), (err) => {
      console.error('Error in confirm dialog action:', err);
    });
  };

  const handleCancelClick = () => {
    if (isProcessing || !onCancel) return;
    setIsCancelling(true);
    onCancel();
  };

  return (
    <ModalShell
      onClose={onCancel}
      active={isOpen}
      closeOnBackdrop={!isProcessing}
      zIndex={zIndex}
      panelClassName={`bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-2xl focus-visible:ring-2 focus-visible:ring-emerald-500 ${panelClassName}`}
      backdropClassName={backdropClassName}
    >
      <div className="p-8 text-center">
        <div className={`w-20 h-20 mx-auto rounded-xl flex items-center justify-center mb-6 ${TONE_ICON_CLASSES[tone]}`}>
          {isProcessing ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : (
            (icon ?? DEFAULT_ICONS[tone])
          )}
        </div>

        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{title}</h3>
        {message && (
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
            {message}
          </p>
        )}

        {children}

        <div className={`flex gap-4 ${children ? 'mt-6' : ''}`}>
          {onCancel && (
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={isProcessing}
              className={`flex-1 h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm outline-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center ${
                isCancelling ? 'opacity-60 scale-95' : ''
              }`}
            >
              {cancelText}
            </button>
          )}
          {onConfirm && (
            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={isProcessing || isCancelling}
              className={`flex-1 h-14 text-white rounded-2xl font-black text-sm outline-none disabled:opacity-80 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-sm ${TONE_CONFIRM_CLASSES[tone]}`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{busyLabel}</span>
                </>
              ) : (
                confirmText
              )}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
