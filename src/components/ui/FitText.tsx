import { HTMLAttributes, ReactNode, useLayoutEffect, useRef, useState, useEffect } from 'react';

interface FitTextProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  minFontSize?: number;
  /**
   * Optional stable cache key for the class-level (natural) font size.
   *
   * The natural FONT SIZE only changes when the className (or fonts) change,
   * so it is measured once per key — not per keystroke. The natural text
   * WIDTH, in contrast, changes on every keystroke and is never cached; the
   * fit always reads the live content width instead.
   *
   * Defaults to `minFontSize + className` — which captures font-family
   * changes via the className but not text content, exactly what we want.
   */
  measureKey?: string;
}

/**
 * Keeps inherently single-line values readable inside a fixed-width visual area.
 *
 * PERF (audit 2026-11-08, "keystroke lag"): the fit must not force a
 * synchronous layout per keystroke. This implementation reads exactly one
 * value (`scrollWidth`) from a post-paint effect while the layout tree is
 * clean — no inline-style clearing and no `getComputedStyle` in the typing
 * path. The full clear → `getComputedStyle` → restore measurement only runs
 * on mount, on `measureKey` change, on container resize and after font swaps.
 *
 * FIX (owner report 2026-11-16, "3 letters drift into the number side"): the
 * fit used to consult a natural-width cache that was measured once — when
 * the first character appeared — and reused for every later keystroke. By
 * the third letter the real text was wider than the cached width, so no
 * shrink was applied, and on the RTL letters half of the plate input the
 * overflowing text spilled LEFT across the divider into the numbers half.
 * The fit is now computed from the live text width on every text change.
 */
export function FitText({ children, minFontSize = 12, className = '', style, measureKey, ...props }: FitTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number | undefined>(undefined);
  // Mirror of `fontSize` so the imperative inline style we re-apply after
  // measuring stays in sync with what React last rendered.
  const appliedSizeRef = useRef<number | undefined>(undefined);
  // Class-level (natural) font size — the size the className asks for.
  // Measured once per measure-key change; never per keystroke.
  const naturalSizeRef = useRef(0);
  const measuredKeyRef = useRef<string>('');

  // The effective key that determines when we re-measure. Defaults to a
  // function of minFontSize + className — both change rarely.
  const effectiveMeasureKey = measureKey ?? `${minFontSize}|${className}`;

  // The one fit routine, shared by text changes, container resizes and font
  // swaps. Reads the LIVE content width — the span is a fit-content flex
  // item (or shrink-wraps via max-w-full + whitespace-nowrap), so
  // `scrollWidth` is the true text width whether the text fits or overflows.
  const fit = () => {
    const element = textRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    const availableWidth = container.clientWidth;
    if (!availableWidth) return;

    const contentWidth = element.scrollWidth;
    if (!contentWidth) return;

    const applied = appliedSizeRef.current;
    const naturalSize = naturalSizeRef.current;
    // The size the text is ACTUALLY rendered at right now: the live inline
    // size (fitted, or caller-provided via the style prop) with the class
    // size as fallback. Reading the DOM — instead of trusting `applied` —
    // keeps the width/size ratio consistent even when a setState from the
    // layout pass has not committed yet.
    const renderedSize = Number.parseFloat(element.style.fontSize) || naturalSize;

    if (contentWidth <= availableWidth) {
      // Fits at the current size. If a shrink is applied (text was
      // backspaced), check whether the natural class size fits again.
      if (applied === undefined) return;
      if (!naturalSize) {
        appliedSizeRef.current = undefined;
        setFontSize(undefined);
        return;
      }
      element.style.fontSize = '';
      const naturalWidth = element.scrollWidth;
      element.style.fontSize = `${applied}px`;
      if (naturalWidth && naturalWidth <= availableWidth) {
        appliedSizeRef.current = undefined;
        setFontSize(undefined);
        return;
      }
      const next = Math.max(Math.min(minFontSize, naturalSize), Math.floor((naturalSize * availableWidth / naturalWidth) * 10) / 10);
      if (next !== applied) {
        appliedSizeRef.current = next;
        setFontSize(next);
      }
      return;
    }

    // Text overflows. Derive the fitted size from the width we are actually
    // rendering at right now (font metrics scale linearly with font-size, the
    // same assumption the original natural-width formula made).
    const baseSize = renderedSize;
    if (!baseSize) return;
    const next = Math.max(Math.min(minFontSize, baseSize), Math.floor((baseSize * availableWidth / contentWidth) * 10) / 10);
    if (next !== applied) {
      appliedSizeRef.current = next;
      setFontSize(next);
    }
  };

  // Re-fit whenever the text changes — WITHOUT re-measuring the font size.
  // Post-paint effect: the browser has already laid out the new text, so the
  // single `scrollWidth` read inside `fit()` costs no extra synchronous
  // reflow inside the keystroke's frame.
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, minFontSize, effectiveMeasureKey]);

  // Baseline: measure the class-level font size once per measure-key change.
  // This is the only place that calls getComputedStyle / clears inline
  // styles in the typing flow.
  useLayoutEffect(() => {
    const element = textRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    const measureNaturalSize = () => {
      if (measuredKeyRef.current === effectiveMeasureKey && naturalSizeRef.current) {
        return; // already measured for this key
      }
      const availableWidth = container.clientWidth;
      if (!availableWidth) return;

      // Clear the inline override, read the class-level font size, then put
      // back EXACTLY what was rendered before (the fitted size, or whatever
      // inline font-size the style prop carried) so the DOM never flashes
      // at the wrong size.
      const previousInlineSize = element.style.fontSize;
      element.style.fontSize = '';
      naturalSizeRef.current = Number.parseFloat(window.getComputedStyle(element).fontSize) || 0;
      element.style.fontSize = previousInlineSize;
      if (naturalSizeRef.current) measuredKeyRef.current = effectiveMeasureKey;
    };

    measureNaturalSize();
    fit();

    const observer = new ResizeObserver(() => {
      // Container resized — re-read the class size if it was never captured
      // (e.g. the container was hidden at mount), then re-fit with a fresh
      // content width.
      measureNaturalSize();
      fit();
    });
    observer.observe(container);
    void document.fonts?.ready.then(() => {
      // A font swap changes glyph widths — invalidate the class-size cache
      // and re-fit with fresh widths.
      measuredKeyRef.current = '';
      naturalSizeRef.current = 0;
      measureNaturalSize();
      fit();
    });

    return () => observer.disconnect();
  }, [effectiveMeasureKey, minFontSize]);

  return (
    <span
      {...props}
      ref={textRef}
      className={`block max-w-full whitespace-nowrap ${className}`}
      // Only add the key when a fit is applied — `fontSize: undefined` would
      // clobber a font-size the caller passed in via the style prop.
      style={fontSize !== undefined ? { ...style, fontSize } : style}
    >
      {children}
    </span>
  );
}
