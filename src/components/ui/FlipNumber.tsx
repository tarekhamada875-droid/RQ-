import React, { memo, useEffect, useRef } from 'react';
import { formatArabicDigits } from '../../utils';

interface FlipCardProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'success' | 'danger';
  /** Digit display format. Defaults to 'western' (0-9).
   *  Pass 'arabic' for the garage interface where uneducated staff read
   *  Arabic-Indic digits (٠-٩) matching real Egyptian license plates.
   *  Storage/value stays Western internally; only the rendered char changes. */
  displayDigits?: 'western' | 'arabic';
}

export const FlipNumber: React.FC<FlipCardProps> = memo(({ value, size = 'md', color = 'default', displayDigits = 'western' }) => {
  // Show only the digits that exist — no leading-zero padding. A count of 3
  // renders as "3", not "03". The counter grows/shrinks in width as the digit
  // count changes (9 -> 10 adds a slot, 10 -> 9 removes one), which is the
  // intended behavior.
  const digits = value.toString().split('');
  const previousDigitsRef = useRef<string[] | null>(null);

  useEffect(() => {
    previousDigitsRef.current = digits;
  }, [value, size]);

  return (
    <div
      className={`flex gap-1.5 sm:gap-2 items-center justify-center ${size === 'sm' ? 'p-1' : 'p-2'}`}
      dir="ltr"
    >
      {digits.map((digit, index) => (
        <FlipDigit
          key={`${index}-${digit}`}
          digit={digit}
          previousDigit={previousDigitsRef.current?.[index] ?? null}
          size={size}
          color={color}
          displayDigits={displayDigits}
          animate={previousDigitsRef.current !== null && previousDigitsRef.current[index] !== digit}
        />
      ))}
    </div>
  );
});

const FlipDigit = React.memo(({ digit, previousDigit, size = 'md', color = 'default', displayDigits = 'western', animate }: { digit: string; previousDigit: string | null; size?: 'sm' | 'md' | 'lg'; color?: 'default' | 'success' | 'danger'; displayDigits?: 'western' | 'arabic'; animate: boolean }) => {
  const sizeClasses = {
    sm: 'w-8 h-12 rounded-lg',
    md: 'w-14 h-22 rounded-xl sm:w-18 sm:h-28',
    lg: 'w-20 h-32 rounded-2xl md:w-32 md:h-48 md:rounded-xl [@media(max-height:500px)]:w-14 [@media(max-height:500px)]:h-20 [@media(max-height:500px)]:rounded-xl [@media(max-width:280px)]:w-12 [@media(max-width:280px)]:h-18'
  };

  const fontClasses = {
    sm: 'text-2xl',
    md: 'text-5xl sm:text-6xl',
    lg: 'text-7xl md:text-[8rem] [@media(max-height:500px)]:text-5xl [@media(max-width:280px)]:text-4xl'
  };

  const colorClasses = {
    default: {
      bg: 'bg-slate-900 dark:bg-white',
      topBg: 'bg-slate-900 dark:bg-white',
      text: 'text-white dark:text-slate-900',
      border: 'border-slate-800 dark:border-slate-100',
      sep: 'bg-black/40 dark:bg-slate-300'
    },
    success: {
      bg: 'bg-emerald-600 dark:bg-emerald-500',
      topBg: 'bg-emerald-600 dark:bg-emerald-500',
      text: 'text-white',
      border: 'border-emerald-700/30 dark:border-emerald-300/30',
      sep: 'bg-black/20 dark:bg-white/20'
    },
    danger: {
      bg: 'bg-red-600 dark:bg-red-500',
      topBg: 'bg-red-600 dark:bg-red-500',
      text: 'text-white',
      border: 'border-red-700/30 dark:border-red-300/30',
      sep: 'bg-black/20 dark:bg-white/20'
    }
  };

  const colors = colorClasses[color];
  const formatFn = displayDigits === 'arabic' ? formatArabicDigits : (s: string) => s;
  const oldChar = formatFn(previousDigit ?? digit);
  const newChar = formatFn(digit);

  const digitSpanClass = `${colors.text} ${fontClasses[size]} font-black font-mono leading-none tracking-tight`;

  if (!animate) {
    // Static (no animation): single span showing the current digit.
    return (
      <div
        className={`relative ${sizeClasses[size]} ${colors.bg} overflow-hidden border ${colors.border} flex items-center justify-center select-none shadow-sm`}
      >
        <span data-testid="flip-number-digit" className={digitSpanClass}>
          {newChar}
        </span>
        <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] ${colors.sep} pointer-events-none opacity-40`} />
      </div>
    );
  }

  // Split-flap animation (Option B): only the TOP HALF flips.
  // 4 layers:
  //   1. Old bottom (static, visible before midpoint, then hidden)
  //   2. New bottom (static, hidden before midpoint, then visible)
  //   3. Old top (rotates 0° → 90°, falls away over 0.3s)
  //   4. New top (rotates -90° → 0°, falls in over 0.3s with 0.3s delay)
  // At the midpoint (0.3s): old top is edge-on (invisible), bottom switches
  // old→new, new top starts falling in.
  return (
    <div
      className={`relative ${sizeClasses[size]} ${colors.bg} overflow-hidden border ${colors.border} flex items-center justify-center select-none shadow-sm`}
    >
      {/* Old bottom half — visible 0-0.3s, then disappears */}
      <div className="flip-half flip-bottom flip-old-bottom">
        <span className={digitSpanClass}>{oldChar}</span>
      </div>
      {/* New bottom half — hidden 0-0.3s, then appears at midpoint */}
      <div className="flip-half flip-bottom flip-new-bottom">
        <span className={digitSpanClass}>{newChar}</span>
      </div>
      {/* Old top half — rotates 0° → 90° (falls away), 0.3s */}
      <div className="flip-half flip-top flip-old-top">
        <span className={digitSpanClass}>{oldChar}</span>
      </div>
      {/* New top half — rotates -90° → 0° (falls in), 0.3s with 0.3s delay */}
      <div data-testid="flip-number-digit" className="flip-half flip-top flip-new-top flip-number-digit">
        <span className={digitSpanClass}>{newChar}</span>
      </div>
      {/* Center hairline (the hinge line) */}
      <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] ${colors.sep} pointer-events-none opacity-40 z-20`} />
    </div>
  );
});

FlipDigit.displayName = 'FlipDigit';
