import { HTMLAttributes, ReactNode, useLayoutEffect, useRef, useState } from 'react';

interface FitTextProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  minFontSize?: number;
}

/** Keeps inherently single-line values readable inside a fixed-width visual area. */
export function FitText({ children, minFontSize = 12, className = '', style, ...props }: FitTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const element = textRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    const fit = () => {
      element.style.fontSize = '';
      const naturalSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
      const availableWidth = container.clientWidth;
      const requiredWidth = element.scrollWidth;

      if (!naturalSize || !availableWidth || requiredWidth <= availableWidth) {
        setFontSize(undefined);
        return;
      }

      const safeMinimum = Math.min(minFontSize, naturalSize);
      setFontSize(Math.max(safeMinimum, Math.floor((naturalSize * availableWidth / requiredWidth) * 10) / 10));
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    window.addEventListener('resize', fit);
    void document.fonts?.ready.then(fit);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
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
