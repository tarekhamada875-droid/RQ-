import { useEffect, useRef } from 'react';

/**
 * Modal accessibility hook — adds Escape-to-close, focus trap, and
 * provides the ARIA attributes to spread on the dialog container.
 *
 * Audit ref: Phase 5 / N17 (consolidated audit, 2026-11-06).
 *
 * Usage:
 *   const modalA11y = useModalA11y(onClose);
 *   return (
 *     <div {...modalA11y.containerProps}>
 *       ...modal content...
 *     </div>
 *   );
 *
 * This adds:
 *   - role="dialog"
 *   - aria-modal="true"
 *   - aria-labelledby (if a headingId is provided)
 *   - Escape key handler (calls onClose)
 *   - Focus trap (tab cycling stays within the modal)
 *   - Initial focus to the first focusable element in the modal
 *
 * Previously, no modal in the codebase had role="dialog" or aria-modal,
 * meaning screen-reader users couldn't perceive modals as dialogs and
 * keyboard focus escaped into the background page (WCAG 2.1 SC 4.1.2
 * and SC 2.4.3 violations).
 */

interface ModalA11yContainerProps {
  role: 'dialog';
  'aria-modal': true;
  'aria-labelledby'?: string;
  ref: React.RefObject<HTMLDivElement>;
}

interface UseModalA11yReturn {
  containerProps: ModalA11yContainerProps;
}

export function useModalA11y(
  onClose: (() => void) | undefined,
  headingId?: string,
): UseModalA11yReturn {
  const containerRef = useRef<HTMLDivElement>(null);

  // Escape key handler.
  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Focus trap: keep Tab cycling within the modal.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const FOCUSABLE_SELECTOR = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !container.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTab);
    return () => container.removeEventListener('keydown', handleTab);
  }, []);

  // Initial focus: move focus into the modal on mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Defer to next tick so React has finished rendering.
    const timer = setTimeout(() => {
      const FOCUSABLE_SELECTOR = [
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');
      const focusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable) {
        focusable.focus();
      } else {
        // No focusable elements — focus the container itself.
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return {
    containerProps: {
      role: 'dialog' as const,
      'aria-modal': true as const,
      ...(headingId ? { 'aria-labelledby': headingId } : {}),
      ref: containerRef,
    },
  };
}
