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
          size={size}
          color={color}
          displayDigits={displayDigits}
        />
      ))}
    </div>
  );
});

const FlipDigit = React.memo(({ digit, size = 'md', color = 'default', displayDigits = 'western' }: { digit: string; size?: 'sm' | 'md' | 'lg'; color?: 'default' | 'success' | 'danger'; displayDigits?: 'western' | 'arabic' }) => {
  const sizeClasses = {
    sm: 'w-8 h-12 rounded-lg',
    md: 'w-14 h-22 rounded-xl sm:w-18 sm:h-28',
    lg: 'w-20 h-32 rounded-2xl md:w-32 md:h-48 md:rounded-xl [@media(max-height:500px)]:w-14 [@media(max-height:500px)]:h-20 [@media(max-height:500px)]:rounded-xl [@media(max-width:280px)]:w-12 [@media(max-width:280px)]:h-18'
  };

  const fontClasses = {
    sm: 'text-3xl',
    md: 'text-6xl sm:text-7xl',
    lg: 'text-8xl md:text-[9rem] [@media(max-height:500px)]:text-6xl [@media(max-width:280px)]:text-5xl'
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
  const displayChar = displayDigits === 'arabic' ? formatArabicDigits(digit) : digit;

  return (
    <div
      className={`relative ${sizeClasses[size]} ${colors.bg} overflow-hidden border ${colors.border} flex items-center justify-center select-none shadow-sm`}
    >
      <span
        data-testid="flip-number-digit"
        className={`${colors.text} ${fontClasses[size]} font-black font-mono leading-none tracking-tight`}
      >
        {displayChar}
      </span>
      {/* Subtle center hairline for clean scoreboard card division */}
      <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] ${colors.sep} pointer-events-none opacity-40`} />
    </div>
  );
});

FlipDigit.displayName = 'FlipDigit';
