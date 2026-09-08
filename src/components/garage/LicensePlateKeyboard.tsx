import React, { memo } from 'react';

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

export const LicensePlateKeyboard: React.FC<LicensePlateKeyboardProps> = memo(({
  onKeyPress,
  currentValue,
  compact = false
}) => {
  const KeyButton = ({ char, isNumber, className = "" }: { char: string, isNumber?: boolean, className?: string }) => {
    // Check if this character is already used in the current plate
    const isSelected = currentValue.includes(char);
    
    // Limits logic (4 numbers, 4 letters)
    const numbersCount = (currentValue.match(/[0-9]/g) || []).length;
    const lettersCount = (currentValue.match(/[^0-9]/g) || []).length;
    
    const isNumberLimitReached = isNumber && numbersCount >= 4 && !isSelected;
    const isLetterLimitReached = !isNumber && lettersCount >= 4 && !isSelected;
    const isDisabled = isNumberLimitReached || isLetterLimitReached;

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
        className={`${heightClass} w-full border-slate-100/5 dark:border-slate-200/50 flex items-center justify-center transition-all active:brightness-150 touch-manipulation ${fontClass} ${
          isSelected 
            ? 'bg-emerald-600 text-white z-10 scale-[1.05] border-transparent rounded-md shadow-md' 
            : 'bg-slate-900 dark:bg-white text-white dark:text-black active:bg-slate-800 dark:active:bg-slate-100 border-[0.5px]'
        } ${isDisabled ? 'opacity-20 cursor-not-allowed grayscale' : 'opacity-100'} ${className}`}
      >
        {char}
      </button>
    );
  };

  return (
    <div 
      className={`flex flex-col bg-slate-900 dark:bg-white overflow-hidden select-none touch-none ${
        compact 
          ? 'rounded-xl border-2 border-slate-900 dark:border-white mt-0.5' 
          : 'rounded-[2rem] border-4 border-slate-900 dark:border-white mt-1'
      }`} 
      dir="rtl"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Numbers Section */}
      <div className="flex flex-col">
        {NUMBERS.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-3" dir="ltr">
            {row.map((num) => (
              <KeyButton key={num} char={num} isNumber />
            ))}
          </div>
        ))}
      </div>

      {/* Taller Divider */}
      <div className="h-1 bg-slate-800/50 dark:bg-slate-100" />

      {/* Letters Section */}
      <div className="flex flex-col">
        {LETTERS.map((row, rowIdx) => (
          <div key={rowIdx} className={`grid ${row.length === 5 ? 'grid-cols-5' : 'grid-cols-3'}`}>
            {row.map((char) => (
              <KeyButton key={char} char={char} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});
