import React from 'react';
import { useModalA11y } from '../../hooks/useModalA11y';

/**
 * FullScreenSheet — the shared container for full-page "sheet" screens
 * (audit F-19, Phase 4c, baseline: main a5a5fc9): Terms & Conditions,
 * Appearance Settings, Admin Config Sync, and the Garage Reports view all
 * previously duplicated the same wrapper — `fixed inset-0 z-[100]
 * bg-[#faf9f6] dark:bg-slate-950 flex flex-col pt-safe px-safe
 * overflow-hidden` — with drift (only some wired up Escape via
 * useModalA11y). This component is that single wrapper:
 *
 *   - cream/dark canvas, safe-area padding, column flex for
 *     header + scrollable main
 *   - optional Escape-to-close + focus trap + initial focus via
 *     useModalA11y when `onClose` is passed (pass nothing for screens
 *     that close only through their header back button)
 *
 * The header stays per-screen (each has its own icon, title and back
 * handler); the wrapper only owns the canvas.
 */

interface FullScreenSheetProps {
  /** Escape-to-close handler; also enables focus trap + initial focus. Omit when the screen has no close path. */
  onClose?: () => void;
  /** Pass the isOpen flag when the sheet can stay mounted while hidden. */
  active?: boolean;
  /** Tailwind z-index utility. Default 'z-[100]'. */
  zIndex?: string;
  /** Extra classes appended to the container (e.g. 'select-none'). */
  className?: string;
  children: React.ReactNode;
}

export const FullScreenSheet: React.FC<FullScreenSheetProps> = ({
  onClose,
  active = true,
  zIndex = 'z-[100]',
  className = '',
  children,
}) => {
  const modalA11y = useModalA11y(onClose, undefined, active);

  return (
    <div
      className={`fixed inset-0 ${zIndex} bg-[#faf9f6] dark:bg-slate-950 flex flex-col pt-safe px-safe overflow-hidden ${className}`}
      {...modalA11y.containerProps}
    >
      {children}
    </div>
  );
};
