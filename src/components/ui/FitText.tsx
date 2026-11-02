import { HTMLAttributes, ReactNode, useLayoutEffect, useRef, useState } from 'react';

interface FitTextProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  minFontSize?: number;
}

/** Keeps inherently single-line values readable inside a fixed-width visual area. */
export function FitText({ children, minFontSize = 12, className = '', style, ...props }: FitTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number | undefined>(undefined);
  // Mirror of `fontSize` so the imperative inline style we re-apply after
  // measuring stays in sync with what React last rendered.
  const appliedSizeRef = useRef<number | undefined>(undefined);
  // Natural (unfitted) text metrics, measured at most once per children
  // change. Measuring requires clearing the inline font-size (a style write)
  // before reading scrollWidth/computed size — doing that on every resize
  // tick forced a synchronous layout per instance per frame (thrashing when
  // many plates resize together). Caching lets every later fit be read-only.
  const naturalWidthRef = useRef(0);
  const naturalSizeRef = useRef(0);

  useLayoutEffect(() => {
    const element = textRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    naturalWidthRef.current = 0;
    naturalSizeRef.current = 0;

    const fit = () => {
      const availableWidth = container.clientWidth;
      if (!availableWidth) return;

      if (!naturalWidthRef.current) {
        // First measurement: clear the inline override, read natural metrics,
        // then restore the last applied size (React won't rewrite an inline
        // style that didn't change in its diff, so restoring imperatively is
        // required for correctness, not just tidiness).
        element.style.fontSize = '';
        naturalSizeRef.current = Number.parseFloat(window.getComputedStyle(element).fontSize) || 0;
        naturalWidthRef.current = element.scrollWidth;
        element.style.fontSize = appliedSizeRef.current != null ? `${appliedSizeRef.current}px` : '';
        if (!naturalWidthRef.current || !naturalSizeRef.current) return;
      }

      const naturalWidth = naturalWidthRef.current;
      const naturalSize = naturalSizeRef.current;

      if (naturalWidth <= availableWidth) {
        appliedSizeRef.current = undefined;
        setFontSize(undefined);
        return;
      }

      const safeMinimum = Math.min(minFontSize, naturalSize);
      appliedSizeRef.current = Math.max(safeMinimum, Math.floor((naturalSize * availableWidth / naturalWidth) * 10) / 10);
      setFontSize(appliedSizeRef.current);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    void document.fonts?.ready.then(() => {
      // A font swap changes the natural text width — force one re-measure.
      naturalWidthRef.current = 0;
      naturalSizeRef.current = 0;
      fit();
    });

    return () => observer.disconnect();
  }, [children, minFontSize]);

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
