import React, { memo } from 'react';

interface FlipCardProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'success' | 'danger';
}

export const FlipNumber: React.FC<FlipCardProps> = memo(({ value, size = 'md', color = 'default' }) => {
  const digits = value.toString().padStart(size === 'sm' ? 1 : 2, '0').split('');

  return (
    <div className={`flex gap-1.5 sm:gap-2 items-center justify-center ${size === 'sm' ? 'p-1' : 'p-2'}`} dir="ltr">
      {digits.map((digit, index) => (
        <FlipDigit key={index} digit={digit} size={size} color={color} />
      ))}
    </div>
  );
});

const FlipDigit = React.memo(({ digit, size = 'md', color = 'default' }: { digit: string; size?: 'sm' | 'md' | 'lg'; color?: 'default' | 'success' | 'danger' }) => {
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
      sep: 'bg-black/60 dark:bg-slate-200'
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

  return (
    <div 
      className={`relative ${sizeClasses[size]} ${colors.bg} overflow-hidden border ${colors.border} select-none`}
    >
      {/* Top half */}
      <div className={`absolute inset-x-0 top-0 h-1/2 ${colors.topBg} flex items-end justify-center overflow-hidden`}>
        <span className={`${colors.text} ${fontClasses[size]} font-black font-sans translate-y-1/2 leading-none`}>
          {digit}
        </span>
      </div>

      {/* Bottom half */}
      <div className={`absolute inset-x-0 bottom-0 h-1/2 ${colors.bg} flex items-start justify-center overflow-hidden`}>
        <span className={`${colors.text} ${fontClasses[size]} font-black font-sans -translate-y-1/2 leading-none`}>
          {digit}
        </span>
      </div>
    </div>
  );
});

FlipDigit.displayName = 'FlipDigit';
