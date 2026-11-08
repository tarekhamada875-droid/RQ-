import { HTMLAttributes, ReactNode, useLayoutEffect, useRef, useState, useEffect } from 'react';

interface FitTextProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  minFontSize?: number;
  /**
   * Optional stable cache key for the natural-width measurement.
   *
   * When the same FitText is reused for a value that changes length on every
   * keystroke (e.g. the plate input), measuring natural width per keystroke
   * is wasted work — the font doesn't change between keystrokes, only the
   * text does. Pass a `measureKey` that's stable across keystrokes (e.g.
   * font family name, or the className that determines the font) to skip
   * the natural-width re-measurement until the key actually changes.
   *
   * Defaults to `minFontSize + className` — which captures font-family
   * changes via the className but not text content, exactly what we want.
   */
  measureKey?: string;
}

/**
 * Keeps inherently single-line values readable inside a fixed-width visual area.
 *
 * PERF (audit 2026-11-08, "keystroke lag"): previously this component's
 * useLayoutEffect re-ran on every `children` change (i.e. every keystroke
 * when used inside an input), wiping its own natural-width cache and
 * forcing a synchronous layout (getComputedStyle + scrollWidth) on every
 * keystroke. With two FitText instances on the plate input, that was two
 * forced reflows per keystroke — the dominant cause of typing lag.
 *
 * Fix: natural-width is now measured at most once per font-load + once
 * per `measureKey` change. `children` changes only recompute the math
 * (`available / natural × naturalSize`), which is pure arithmetic with
 * no DOM reads. One ResizeObserver still handles container resizes.
 */
export function FitText({ children, minFontSize = 12, className = '', style, measureKey, ...props }: FitTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number | undefined>(undefined);
  // Mirror of `fontSize` so the imperative inline style we re-apply after
  // measuring stays in sync with what React last rendered.
  const appliedSizeRef = useRef<number | undefined>(undefined);
  // Natural (unfitted) text metrics, measured ONCE per font/measurement-key
  // change — NOT per children change.
  const naturalWidthRef = useRef(0);
  const naturalSizeRef = useRef(0);
  const measuredKeyRef = useRef<string>('');

  // The effective key that determines when we re-measure. Defaults to a
  // function of minFontSize + className — both change rarely, and neither
  // changes on every keystroke (className is the same regardless of which
  // characters are typed into the plate field).
  const effectiveMeasureKey = measureKey ?? `${minFontSize}|${className}`;

  // Re-fit on `children` change WITHOUT re-measuring. Pure math + setState.
  useEffect(() => {
    const element = textRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    const naturalWidth = naturalWidthRef.current;
    const naturalSize = naturalSizeRef.current;

    // If we haven't measured yet (first render), the layout effect below
    // will do it. Skip — we have nothing to compute against.
    if (!naturalWidth || !naturalSize) return;

    const availableWidth = container.clientWidth;
    if (!availableWidth) return;

    if (naturalWidth <= availableWidth) {
      if (appliedSizeRef.current !== undefined) {
        appliedSizeRef.current = undefined;
        setFontSize(undefined);
      }
      return;
    }

    const safeMinimum = Math.min(minFontSize, naturalSize);
    const next = Math.max(safeMinimum, Math.floor((naturalSize * availableWidth / naturalWidth) * 10) / 10);
    if (appliedSizeRef.current !== next) {
      appliedSizeRef.current = next;
      setFontSize(next);
    }
  }, [children, minFontSize, effectiveMeasureKey]);

  // Measure natural width ONCE per font/measure-key change. This is the
  // only place that calls getComputedStyle / scrollWidth.
  useLayoutEffect(() => {
    const element = textRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    const measure = () => {
      if (measuredKeyRef.current === effectiveMeasureKey && naturalWidthRef.current) {
        return; // already measured for this key
      }

      const availableWidth = container.clientWidth;
      if (!availableWidth) return;

      // Clear the inline override, read natural metrics, then restore.
      element.style.fontSize = '';
      naturalSizeRef.current = Number.parseFloat(window.getComputedStyle(element).fontSize) || 0;
      naturalWidthRef.current = element.scrollWidth;
      element.style.fontSize = appliedSizeRef.current != null ? `${appliedSizeRef.current}px` : '';

      if (!naturalWidthRef.current || !naturalSizeRef.current) return;
      measuredKeyRef.current = effectiveMeasureKey;

      // First measurement: also compute the initial fit.
      if (naturalWidthRef.current <= availableWidth) {
        if (appliedSizeRef.current !== undefined) {
          appliedSizeRef.current = undefined;
          setFontSize(undefined);
        }
        return;
      }
      const safeMinimum = Math.min(minFontSize, naturalSizeRef.current);
      const next = Math.max(safeMinimum, Math.floor((naturalSizeRef.current * availableWidth / naturalWidthRef.current) * 10) / 10);
      if (appliedSizeRef.current !== next) {
        appliedSizeRef.current = next;
        setFontSize(next);
      }
    };

    measure();
    const observer = new ResizeObserver(() => {
      // Container resized — invalidate the available-width-only path and
      // recompute. Natural width is still cached (font didn't change).
      const availableWidth = container.clientWidth;
      if (!availableWidth) return;
      const naturalWidth = naturalWidthRef.current;
      const naturalSize = naturalSizeRef.current;
      if (!naturalWidth || !naturalSize) {
        measure();
        return;
      }
      if (naturalWidth <= availableWidth) {
        if (appliedSizeRef.current !== undefined) {
          appliedSizeRef.current = undefined;
          setFontSize(undefined);
        }
        return;
      }
      const safeMinimum = Math.min(minFontSize, naturalSize);
      const next = Math.max(safeMinimum, Math.floor((naturalSize * availableWidth / naturalWidth) * 10) / 10);
      if (appliedSizeRef.current !== next) {
        appliedSizeRef.current = next;
        setFontSize(next);
      }
    });
    observer.observe(container);
    void document.fonts?.ready.then(() => {
      // A font swap changes the natural text width — force one re-measure
      // by invalidating the cache, then re-running the measurement path.
      measuredKeyRef.current = '';
      naturalWidthRef.current = 0;
      naturalSizeRef.current = 0;
      measure();
    });

    return () => observer.disconnect();
  }, [effectiveMeasureKey, minFontSize]);

  return (
    <span
      {...props}
      ref={textRef}
      className={`block max-w-full whitespace-nowrap ${className}`}
      style={{ ...style, fontSize }}
    >
      {children}
    </span>
  );
}
