import React, { memo } from 'react';
import { FitText } from './FitText';

interface EgyptianPlateProps {
  plateNumber: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  hideCountryLabels?: boolean;
  customBarHeightClass?: string;
  customSizeClasses?: string;
}

export const EgyptianPlate: React.FC<EgyptianPlateProps> = memo(({ 
  plateNumber, 
  className = '', 
  size = 'md',
  hideCountryLabels = false,
  customBarHeightClass,
  customSizeClasses
}) => {
  // Normalize plate number: split numbers and letters
  // Supports formats like "1234 ABC" or "ABC 1234" (Arabic letters)
  // Explicitly remove colons (:) as requested by user
  const plateText = (plateNumber || '').replace(/:/g, '');
  
  // Separation logic: Letters are non-numeric
  // Arabic digits: \u0660-\u0669
  const isNumericChar = (c: string) => /[0-9\u0660-\u0669]/.test(c);
  
  let numbers = '';
  let letters = '';
  
  for (const char of plateText) {
    if (char === ' ' || char === '-') continue;
    if (isNumericChar(char)) {
      numbers += char;
    } else {
      letters += char;
    }
  }

  const sizeClasses = {
    sm: 'w-24 h-11 text-[10px] border-[1.5px]',
    md: 'w-48 h-20 text-xl border-[3px]',
    lg: 'w-72 h-28 text-4xl border-[4px]'
  };

  const barHeight = {
    sm: 'h-4',
    md: 'h-8',
    lg: 'h-12'
  };

  const barHeightLabelsHidden = {
    sm: 'h-1.5',
    md: 'h-3.5',
    lg: 'h-4.5'
  };

  const labelSize = {
    sm: 'text-[6px]',
    md: 'text-[10px]',
    lg: 'text-[14px]'
  };

  return (
    <div className={`relative ${customSizeClasses || sizeClasses[size]} bg-white border-slate-900 rounded-xl overflow-hidden mx-auto flex flex-col ${className}`} dir="ltr">
      {/* Top Bar - Standard Egyptian Blue (Turns on when plate has content) */}
      <div className={`${customBarHeightClass || (hideCountryLabels ? barHeightLabelsHidden[size] : barHeight[size])} flex items-center justify-between px-2 sm:px-4 font-black border-b border-slate-900/10 ${
        (numbers + letters) 
          ? 'bg-[#0057b7] text-white' 
          : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
      }`}>
        {!hideCountryLabels && <span className={`${labelSize[size]} tracking-tight antialiased`}>EGYPT</span>}
        {!hideCountryLabels && <span className={`${labelSize[size]} font-sans antialiased`} dir="rtl">مصر</span>}
      </div>
      
      {/* Plate Main Content */}
      <div className="flex-1 flex items-center justify-between bg-[#fcfcfc] dark:bg-slate-200 overflow-hidden">
        {/* Numbers Section (Left side) */}
        <div className="flex-1 h-full min-w-0 flex justify-center items-center px-1">
          <FitText minFontSize={size === 'sm' ? 7 : size === 'md' ? 14 : 24} className="font-mono font-black text-slate-900 tracking-tighter text-center">
            {numbers}
          </FitText>
        </div>
        
        {/* Vertical Divider line - Centered and clean */}
        <div className="w-[1.5px] h-[70%] bg-slate-200 dark:bg-slate-400" />
        
        {/* Letters Section (Right side) - Spaced out properly */}
        <div className="flex-1 h-full min-w-0 flex justify-center items-center px-1" dir="rtl">
          <FitText
            minFontSize={size === 'sm' ? 7 : size === 'md' ? 12 : 22}
            className={`font-black text-slate-800 text-center transition-all ${
              letters.length >= 4 
                ? (size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-base' : 'text-3xl') 
                : (size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-xl' : 'text-4xl')
            }`}
          >
            {letters.split('').map((char, index) => (
              <span 
                key={index} 
                className={`inline-block select-none ${letters.length >= 4 ? 'mx-[0.125em]' : 'mx-[0.25em]'}`}
              >
                {char}
              </span>
            ))}
          </FitText>
        </div>
      </div>

      {/* Subtle mounting holes decoration */}
      <div className="absolute top-[50%] left-1.5 w-1.5 h-1.5 bg-slate-200 dark:bg-slate-300 rounded-full" />
      <div className="absolute top-[50%] right-1.5 w-1.5 h-1.5 bg-slate-200 dark:bg-slate-300 rounded-full" />
    </div>
  );
});
