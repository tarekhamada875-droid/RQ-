import React, { memo } from 'react';
import { Delete, Loader2 } from 'lucide-react';
import { getCleanPlate, getRawPlate, getPlateParts, isPlateValid, resolveShimmerColor } from '../../utils';
import { Garage, Vehicle } from '../../types';
import { LicensePlateKeyboard } from './LicensePlateKeyboard';
import { BorderShimmer } from './BorderShimmer';
import { useTheme } from '../../utils/ThemeContext';
import { FitText } from '../ui/FitText';

interface RegistrationCardProps {
  newPlateNumber: string;
  setNewPlateNumber: (val: string) => void;
  isInputFocused: boolean;
  setIsInputFocused: (val: boolean) => void;
  plateInputRef: React.RefObject<HTMLInputElement>;
  vehicles: Vehicle[];
  garage: Garage;
  handleCheckIn: (type: 'hourly' | 'overnight') => void;
  onCheckOut: (vehicle: Vehicle) => void;
  closeKeyboard: () => void;
  inputRef: React.RefObject<HTMLDivElement>;
  shimmerActive?: boolean;
  isLoading?: boolean;
}

export const RegistrationCard = memo(({
  newPlateNumber,
  setNewPlateNumber,
  isInputFocused,
  setIsInputFocused,
  plateInputRef,
  vehicles,
  garage,
  handleCheckIn,
  onCheckOut,
  closeKeyboard,
  inputRef,
  shimmerActive = false,
  isLoading = false
}: RegistrationCardProps) => {
  const { theme } = useTheme();
  const activeShimmerColor = resolveShimmerColor(garage?.shimmerColor, theme);
  const [isDebouncing, setIsDebouncing] = React.useState(false);

  const handleGuardedCheckIn = (type: 'hourly' | 'overnight') => {
    if (isDebouncing || isLoading) return;
    setIsDebouncing(true);
    setTimeout(() => setIsDebouncing(false), 300);
    closeKeyboard();
    handleCheckIn(type);
  };

  const handleGuardedCheckOut = (vehicle: Vehicle) => {
    if (isDebouncing || isLoading) return;
    setIsDebouncing(true);
    setTimeout(() => setIsDebouncing(false), 300);
    closeKeyboard();
    setNewPlateNumber('');
    onCheckOut(vehicle);
  };

  // Force input value to stay in sync with state
  // even when getCleanPlate results in no state change (e.g. typing a space)
  React.useEffect(() => {
    if (plateInputRef.current && plateInputRef.current.value !== newPlateNumber) {
      plateInputRef.current.value = newPlateNumber;
    }
  }, [newPlateNumber]);

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      // Don't close if they click inside the card containing the keyboard
      if (
        isInputFocused && 
        inputRef.current && 
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsInputFocused(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isInputFocused, setIsInputFocused, inputRef]);

  const handleVirtualKeyPress = (key: string) => {
    const raw = getRawPlate(newPlateNumber + key);
    const clean = getCleanPlate(raw);
    setNewPlateNumber(clean);
  };

  return (
    <div 
      ref={inputRef}
      className={`bg-[#faf9f6] dark:bg-slate-900 rounded-[2rem] border relative shrink-0 p-4 md:p-8 max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto w-full transition-all duration-150 ${
        isInputFocused 
          ? 'border-slate-900 dark:border-slate-700' 
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <BorderShimmer isActive={shimmerActive} rx={32} ry={32} color={activeShimmerColor} />
      <div className="relative">

          <div className="flex flex-col gap-3 relative z-10">
            {newPlateNumber && (
              <button 
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setNewPlateNumber(newPlateNumber.slice(0, -1));
                  plateInputRef.current?.focus();
                }}
                className="absolute bg-red-500 text-white rounded-2xl flex items-center justify-center hover:bg-red-600 transition-colors outline-none -top-3 -left-3 w-11 h-11 min-w-[44px] min-h-[44px] md:w-16 md:h-16 md:-top-6 md:-left-6 z-50 shadow-md cursor-pointer active:scale-95"
              >
                <Delete className="w-6 h-6 md:w-8 md:h-8" />
              </button>
            )}
            
            <div className="relative h-28 sm:h-36 md:h-52 lg:h-60 overflow-hidden" onClick={() => { setIsInputFocused(true); plateInputRef.current?.focus(); }}>
              <input 
                ref={plateInputRef}
                type="text" 
                inputMode="none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                value={newPlateNumber}
                onChange={(e) => {
                  const val = e.target.value;
                  const clean = getCleanPlate(val);
                  
                  // Force state update even if same to ensure input sync
                  setNewPlateNumber(clean);
                }}
                onFocus={(e) => {
                  setIsInputFocused(true);
                  const len = e.target.value.length;
                  e.target.setSelectionRange(len, len);
                }}
                onBlur={() => {
                  // Small delay to allow other interactions
                  setTimeout(() => setIsInputFocused(false), 200);
                }}
                className="absolute inset-0 w-full h-full opacity-0 z-30 cursor-text"
                dir="rtl"
              />
              
              <div className={`absolute inset-0 w-full h-full bg-white border-slate-900 rounded-xl overflow-hidden flex flex-col z-10 ${
                isInputFocused ? 'border-[3px] ring-2 ring-blue-500/20' : 'border-2 md:border-[3px]'
              }`} dir="ltr">
                {/* Authentic Egyptian Plate Header */}
                <div className="flex items-center justify-between px-3 sm:px-6 font-black bg-[#0057b7] text-white shrink-0 h-8 sm:h-11 md:h-14 border-b-2 border-slate-900/20 select-none">
                  {/* Left Screw Rivet */}
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-tr from-slate-400 to-slate-100 border border-slate-600/40 shadow-inner inline-block" />
                  </div>

                  {/* Right Screw Rivet */}
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-tr from-slate-400 to-slate-100 border border-slate-600/40 shadow-inner inline-block" />
                  </div>
                </div>

                {/* Plate Content */}
                <div className="flex-1 flex items-center justify-between bg-[#ffffff] overflow-hidden">
                  {/* Numbers Section (Left) */}
                  <div className="flex-1 h-full min-w-0 flex justify-center items-center px-2">
                    <FitText
                      minFontSize={14}
                      className={`font-mono font-black text-slate-950 tracking-tighter text-center ${
                        newPlateNumber 
                          ? (getPlateParts(newPlateNumber).numbers.length >= 4
                              ? 'text-3xl sm:text-6xl md:text-7xl lg:text-8xl'
                              : 'text-4xl sm:text-7xl md:text-8xl lg:text-9xl') 
                          : 'text-2xl sm:text-4xl md:text-5xl text-slate-300 font-sans font-normal'
                      }`}
                    >
                      {getPlateParts(newPlateNumber).numbers}
                    </FitText>
                  </div>

                  {/* Vertical Divider */}
                  <div className="w-[2px] md:w-[3px] h-[70%] bg-slate-300 rounded-full" />

                  {/* Letters Section (Right) */}
                  <div className="flex-1 h-full min-w-0 flex justify-center items-center px-2" dir="rtl">
                    <FitText
                      minFontSize={14}
                      className={`font-black text-slate-950 text-center transition-all duration-150 ${
                        newPlateNumber 
                          ? (getPlateParts(newPlateNumber).letters.length >= 4
                              ? 'text-2xl sm:text-4xl md:text-5xl lg:text-6xl tracking-normal'
                              : 'text-4xl sm:text-6xl md:text-7xl lg:text-8xl tracking-[0.1em]') 
                          : 'text-2xl sm:text-4xl md:text-5xl text-slate-300 font-sans font-normal'
                      }`}
                    >
                      {getPlateParts(newPlateNumber).letters ? (
                        getPlateParts(newPlateNumber).letters.split('').map((char, idx) => (
                          <span 
                            key={idx} 
                            className={`inline-block select-none ${getPlateParts(newPlateNumber).letters.length >= 4 ? 'mx-[0.125em]' : 'mx-[0.25em]'}`}
                          >
                            {char}
                          </span>
                        ))
                      ) : null}
                    </FitText>
                  </div>
                </div>
 
                {/* Fixed Cursor Line */}
                {isInputFocused && (
                  <div className="absolute bottom-1.5 md:bottom-3 left-1/2 -translate-x-1/2 w-12 md:w-20 h-1 md:h-1.5 bg-blue-600 rounded-full animate-pulse" />
                )}
              </div>
            </div>            {(() => {
              const raw = getRawPlate(newPlateNumber);
              const isValid = isPlateValid(newPlateNumber);

              // Find if vehicle matching this plate is currently inside
              const existing = (isValid && raw)
                ? vehicles.find(v => getRawPlate(v.plateNumberRaw) === raw && v.status === 'inside')
                : undefined;

              // 1. If car is inside, ALWAYS allow check-out (even if subscription/balance is out)
              if (existing) {
                return (
                  <div className="overflow-hidden mt-2">
                    <button 
                      disabled={isLoading || isDebouncing}
                      onClick={() => handleGuardedCheckOut(existing)}
                      className="w-full py-4 md:py-8 bg-red-500 text-white rounded-2xl md:rounded-[2rem] flex flex-col items-center justify-center gap-1 md:gap-2 transition-all outline-none md:scale-[1.01] hover:bg-red-600 active:scale-[0.99] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="text-lg md:text-2xl font-black tracking-tight flex items-center justify-center gap-2">
                        {(isLoading || isDebouncing) ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 text-white animate-spin" /> : 'إصدار فاتورة خروج'}
                      </div>
                      <span className="text-[10px] md:text-sm opacity-90 font-bold uppercase tracking-widest">السيارة موجودة حالياً بالداخل</span>
                    </button>
                  </div>
                );
              }

              // 2. Normal check-in controls
              if (isInputFocused || (newPlateNumber && isValid)) {
                const hourlyPrice = Number(garage?.hourlyRate) || 0;
                const overnightPrice = Number(garage?.overnightRate) || 0;
                const hasHourly = hourlyPrice > 0;
                const hasOvernight = overnightPrice > 0;
                // If both are enabled or both are zero/unset, show both side-by-side
                const showBoth = (hasHourly && hasOvernight) || (!hasHourly && !hasOvernight);
                const showOnlyHourly = hasHourly && !hasOvernight;
                const showOnlyOvernight = !hasHourly && hasOvernight;

                return (
                  <div className="overflow-hidden">
                    <div className="flex gap-4 mt-1">
                      {(showBoth || showOnlyHourly) && (
                        <button 
                          disabled={!isValid || isLoading || isDebouncing}
                          onClick={() => handleGuardedCheckIn('hourly')}
                          className={`${showOnlyHourly ? 'w-full' : 'flex-1'} py-4 md:py-8 rounded-2xl md:rounded-[2rem] flex flex-col items-center justify-center gap-1 md:gap-2 outline-none transition-all duration-150 ${
                            isValid && !isLoading && !isDebouncing
                              ? 'bg-white dark:bg-slate-900 border-2 md:border-3 border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/80 active:scale-[0.98]' 
                              : 'bg-slate-100 dark:bg-slate-800/40 border-2 border-slate-200 dark:border-slate-800/80 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <div className="text-base md:text-2xl uppercase tracking-tight font-black flex items-center justify-center gap-2">
                            {(isLoading || isDebouncing) ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : 'ساعة'}
                          </div>
                          <span className={`text-[10px] md:text-xs font-black tracking-widest whitespace-nowrap ${
                            isValid ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400/70 dark:text-slate-700'
                          }`}>
                            <span className="font-mono">{garage?.hourlyRate ?? 0}</span> ج.م / ساعة
                          </span>
                        </button>
                      )}
                      {(showBoth || showOnlyOvernight) && (
                        <button 
                          disabled={!isValid || isLoading || isDebouncing}
                          onClick={() => handleGuardedCheckIn('overnight')}
                          className={`${showOnlyOvernight ? 'w-full' : 'flex-1'} py-4 md:py-8 rounded-2xl md:rounded-[2rem] flex flex-col items-center justify-center gap-1 md:gap-2 outline-none transition-all duration-150 ${
                            isValid && !isLoading && !isDebouncing
                              ? 'bg-emerald-600 dark:bg-emerald-600 border-2 md:border-3 border-emerald-700 dark:border-emerald-500 text-white font-black hover:bg-emerald-700 dark:hover:bg-emerald-600/90 active:scale-[0.98]' 
                              : 'bg-slate-100 dark:bg-slate-800/40 border-2 border-slate-200 dark:border-slate-800/80 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <div className="text-base md:text-2xl uppercase tracking-tight font-black flex items-center justify-center gap-2">
                            {(isLoading || isDebouncing) ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : 'مبيت'}
                          </div>
                          <span className={`text-[10px] md:text-xs font-black tracking-widest whitespace-nowrap ${
                            isValid ? 'text-slate-950/80 dark:text-slate-950/85' : 'text-slate-400/70 dark:text-slate-700'
                          }`}>
                            <span className="font-mono">{garage?.overnightRate ?? 0}</span> ج.م مبيت
                          </span>
                        </button>
                      )}
                    </div>

                    {isInputFocused && (
                      <div className="mt-4 md:mt-8">
                        <LicensePlateKeyboard 
                          onKeyPress={handleVirtualKeyPress}
                          currentValue={newPlateNumber}
                        />
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
    </div>
  );
});
