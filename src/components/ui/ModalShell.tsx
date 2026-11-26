import React from 'react';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

/**
 * ModalShell — the single overlay+panel skeleton every dialog in the app
 * renders inside (audit F-19, Phase 4c, baseline: main a5a5fc9).
 *
 * Before this component there were ~20 hand-rolled copies of the same
 * markup — `fixed inset-0 z-[…] flex …` + a backdrop + a panel — with
 * drifted details: some locked body scroll, some didn't; some had a11y
 * (Escape/trap/focus), some didn't; z-index, padding and backdrop opacity
 * were re-decided per file. All of that now lives here:
 *
 *   - Escape-to-close, focus trap, initial focus   (useModalA11y)
 *   - Body scroll lock with token-based nesting    (useBodyScrollLock)
 *   - Backdrop click-to-close                      (closeOnBackdrop)
 *
 * Structure: the backdrop is an absolutely-positioned sibling rendered
 * BEHIND the panel (not a parent wrapper). That is equivalent to the old
 * `onClick` + `stopPropagation` pairs for every consumer — clicks on the
 * panel never reach the backdrop because they are siblings, so the
 * propagation-stopping handlers are no longer needed.
 *
 * Usage:
 *   <ModalShell onClose={onCancel} zIndex="z-[120]" panelClassName="…">
 *     …panel content…
 *   </ModalShell>
 *
 * Variants:
 *   - 'center'       items-center p-4                      (desktop dialogs)
 *   - 'sheet-flush'  items-end sm:items-center p-0 sm:p-4  (bottom sheets: CheckIn/CheckOut)
 *   - 'sheet-padded' items-end sm:items-center p-4         (bottom sheets with a gap: subscriber modals)
 *
 * The document root is already dir="rtl", so the shell does not set a
 * direction — the old per-overlay dir="rtl" attributes were redundant.
 */

export type ModalShellVariant = 'center' | 'sheet-flush' | 'sheet-padded';

interface ModalShellProps {
  /** Called on Escape (and on backdrop click when closeOnBackdrop). Omit for a static overlay. */
  onClose?: () => void;
  /**
   * Whether the modal is currently open. Shells are conditionally rendered
   * by their consumers, so the default (true) is almost always right; pass
   * the isOpen flag only when this shell can stay mounted while hidden.
   */
  active?: boolean;
  /** Backdrop click closes the modal (default true). Pass false while a critical action is in flight. */
  closeOnBackdrop?: boolean;
  /** Tailwind z-index utility, e.g. 'z-[110]'. Default 'z-[100]'. Preserve stacking order when migrating. */
  zIndex?: string;
  variant?: ModalShellVariant;
  /** Backdrop color classes. Default 'bg-slate-900/60 dark:bg-slate-950/80'. */
  backdropClassName?: string;
  /** Extra classes appended to the overlay (e.g. 'overflow-y-auto font-sans'). */
  overlayClassName?: string;
  /** Panel classes: width, rounding, padding, scroll behavior. */
  panelClassName?: string;
  /** Inline panel styles (rare — e.g. a JS-computed height). */
  panelStyle?: React.CSSProperties;
  /** aria-label for the dialog when there is no visible heading to label it by. */
  panelAriaLabel?: string;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<ModalShellVariant, string> = {
  center: 'items-center justify-center p-4',
  'sheet-flush': 'items-end sm:items-center justify-center p-0 sm:p-4',
  'sheet-padded': 'items-end sm:items-center justify-center p-4',
};

export const ModalShell: React.FC<ModalShellProps> = ({
  onClose,
  active = true,
  closeOnBackdrop = true,
  zIndex = 'z-[100]',
  variant = 'center',
  backdropClassName = 'bg-slate-900/60 dark:bg-slate-950/80',
  overlayClassName = '',
  panelClassName = '',
  panelStyle,
  panelAriaLabel,
  children,
}) => {
  // Scroll lock is tied to `active` so a shell that stays mounted while
  // hidden does not keep the page frozen. For conditionally-rendered
  // shells (the norm) active is always true while mounted.
  useBodyScrollLock(active);
  const modalA11y = useModalA11y(onClose, undefined, active);

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex ${VARIANT_CLASSES[variant]} ${overlayClassName}`}
    >
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className={`absolute inset-0 ${backdropClassName}`}
      />
      <div
        className={`relative ${panelClassName}`}
        style={panelStyle}
        aria-label={panelAriaLabel}
        {...modalA11y.containerProps}
      >
        {children}
      </div>
    </div>
  );
};
