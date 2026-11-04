import React, { memo, useMemo } from 'react';
import { formatArabicDigits } from '../../utils/plates';;

interface LicensePlateKeyboardProps {
  onKeyPress: (key: string) => void;
  currentValue: string;
  compact?: boolean;
}

const NUMBERS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9']
];
const LETTERS = [
  ['أ', 'ب', 'ج', 'د', 'ر'],
  ['س', 'ص', 'ط', 'ع', 'ف'],
  ['ق', 'ك', 'ل', 'م', 'ن'],
  ['ه', 'و', 'ي']
];

interface KeyButtonProps {
  char: string;
  isNumber?: boolean;
  className?: string;
  isSelected: boolean;
  isDisabled: boolean;
  compact: boolean;
  onKeyPress: (key: string) => void;
}

// KeyButton is defined at module scope (not inside the component) so its
// component type stays stable across renders. When it was defined inside,
// every keystroke created a new component type, causing React to unmount
// and remount all 14-19 keys — the single biggest source of typing lag.
const KeyButton = memo(({ char, isNumber, className = "", isSelected, isDisabled, compact, onKeyPress }: KeyButtonProps) => {
  const heightClass = compact
    ? 'h-8 sm:h-9 md:h-10'
    : 'h-11 sm:h-14 md:h-18 lg:h-22';

  const fontClass = compact
    ? (isNumber ? 'text-sm sm:text-base md:text-lg font-black' : 'text-base sm:text-lg md:text-xl font-black')
    : (isNumber ? 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black' : 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black');

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // Critical: prevents input focus loss
      }}
      onClick={(e) => {
        e.preventDefault();
        if (!isDisabled) onKeyPress(char);
      }}
      className={`${heightClass} w-full flex items-center justify-center transition-colors active:brightness-125 touch-manipulation select-none ${fontClass} ${
        isSelected
          ? 'bg-emerald-600 text-white z-10 scale-[1.03] border-transparent rounded-lg shadow-md'
          : 'bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 active:bg-slate-100 dark:active:bg-slate-700 border-[0.5px] border-slate-200 dark:border-slate-700/60'
      } ${isDisabled ? 'opacity-25 cursor-not-allowed' : 'opacity-100'} ${className}`}
    >
      {isNumber ? formatArabicDigits(char) : char}
    </button>
  );
});

KeyButton.displayName = 'KeyButton';

export const LicensePlateKeyboard: React.FC<LicensePlateKeyboardProps> = memo(({
  onKeyPress,
  currentValue,
  compact = false
}) => {
  // Compute counts once per render instead of running regex inside each key.
  const { numbersCount, lettersCount } = useMemo(() => ({
    numbersCount: (currentValue.match(/[0-9]/g) || []).length,
    lettersCount: (currentValue.match(/[^0-9]/g) || []).length,
  }), [currentValue]);

  const renderKey = (char: string, isNumber: boolean) => {
    const isSelected = currentValue.includes(char);
    const isNumberLimitReached = isNumber && numbersCount >= 4 && !isSelected;
    const isLetterLimitReached = !isNumber && lettersCount >= 4 && !isSelected;
    return (
      <KeyButton
        key={char}
        char={char}
        isNumber={isNumber}
        isSelected={isSelected}
        isDisabled={isNumberLimitReached || isLetterLimitReached}
        compact={compact}
        onKeyPress={onKeyPress}
      />
    );
  };

  return (
    <div
      className={`flex flex-col bg-slate-100 dark:bg-slate-900 overflow-hidden select-none touch-none ${
        compact
          ? 'rounded-xl border border-slate-300 dark:border-slate-800 mt-1'
          : 'rounded-2xl md:rounded-[2rem] border-2 border-slate-300 dark:border-slate-800 mt-2'
      }`}
      dir="rtl"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Numbers Section */}
      <div className="flex flex-col">
        {NUMBERS.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-3" dir="ltr">
            {row.map((num) => renderKey(num, true))}
          </div>
        ))}
      </div>

      {/* Middle Divider */}
      <div className="h-1 bg-slate-300/80 dark:bg-slate-800" />

      {/* Letters Section */}
      <div className="flex flex-col">
        {LETTERS.map((row, rowIdx) => (
          <div key={rowIdx} className={`grid ${row.length === 5 ? 'grid-cols-5' : 'grid-cols-3'}`}>
            {row.map((char) => renderKey(char, false))}
          </div>
        ))}
      </div>
    </div>
  );
});
