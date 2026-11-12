import React, { memo, useCallback, useDeferredValue, useMemo, useState, useRef } from 'react';
import { Delete, Loader2 } from 'lucide-react';
import { getCleanPlate, getRawPlate, getPlateParts, isPlateValid, formatArabicDigits } from '../../utils/plates';
import { Garage, Vehicle } from '../../types';
import { LicensePlateKeyboard } from './LicensePlateKeyboard';
import { FitText } from '../ui/FitText';

interface RegistrationCardProps {
  // PR-U: newPlateNumber/setNewPlateNumber removed from props — the draft
  // state now lives INSIDE RegistrationCard so every keystroke only
  // re-renders this component, not the whole app's context consumers.
  isInputFocused: boolean;
  setIsInputFocused: (val: boolean) => void;
  plateInputRef: React.RefObject<HTMLInputElement>;
  vehicles: Vehicle[];
  garage: Garage;
  // PR-U: handleCheckIn now takes the plate value as a parameter and
  // returns the formatted plate on error (so RegistrationCard can restore
  // it). Returns null on success or when no restore is needed.
  // UX (owner report 2026-11-12): the draft is cleared at submit START,
  // before the await — see handleGuardedCheckIn below.
  handleCheckIn: (type: 'hourly' | 'overnight', plateValue: string) => Promise<string | null>;
  onCheckOut: (vehicle: Vehicle) => void;
  closeKeyboard: () => void;
  inputRef: React.RefObject<HTMLDivElement>;
  isLoading?: boolean;
}

export const RegistrationCard = memo(({
  isInputFocused,
  setIsInputFocused,
  plateInputRef,
  vehicles,
  garage,
  handleCheckIn,
  onCheckOut,
  closeKeyboard,
  inputRef,
  isLoading = false
}: RegistrationCardProps) => {
  // PR-U: local draft state. Previously this lived in useVehicleOperations
  // (a context bucket), so every keystroke updated context state and
  // re-rendered ALL consumers. Now it's local — one keystroke = one
  // small component redrawing, never the whole app.
  const [newPlateNumber, setNewPlateNumber] = useState<string>('');
  const [isDebouncing, setIsDebouncing] = React.useState(false);
  // Guard against double-submit: a ref updates synchronously (unlike
  // isLoading state which is async). Prevents a second check-in request
  // from firing before isLoading flips to true (which causes "already inside").
  const isSubmittingRef = useRef(false);

  // Pre-build a raw-plate → vehicle lookup map when the active vehicles list
  // changes (Firestore snapshot), not on every keystroke. Replaces the O(N)
  // vehicles.find() + getRawPlate() per-vehicle scan that ran in render.
  // First-wins semantics match the previous Array.find behavior.
  const insideVehicleByRawPlate = React.useMemo(() => {
    const map = new Map<string, Vehicle>();
    for (const v of vehicles) {
      if (v.status === 'inside') {
        const raw = getRawPlate(v.plateNumberRaw);
        if (!map.has(raw)) map.set(raw, v);
      }
    }
    return map;
  }, [vehicles]);

  // Memoize plate parsing — previously getPlateParts was called 4+ times
  // and getRawPlate/isPlateValid ran in an inline IIFE on every render
  // (i.e. on every keystroke into the plate input).
  // PERF (audit 2026-11-08): deferred so the expensive downstream renders
  // (FitText re-fit, submit-button enable/disable, existing-vehicle lookup)
  // don't block the next keystroke. React batches them into the next frame.
  const deferredPlate = useDeferredValue(newPlateNumber);
  const plateParts = useMemo(() => getPlateParts(deferredPlate), [deferredPlate]);
  const rawPlate = useMemo(() => getRawPlate(deferredPlate), [deferredPlate]);
  const isPlateValidMemo = useMemo(() => isPlateValid(deferredPlate), [deferredPlate]);
  const existingVehicleForPlate = useMemo(() => {
    return (isPlateValidMemo && rawPlate) ? insideVehicleByRawPlate.get(rawPlate) : undefined;
  }, [isPlateValidMemo, rawPlate, insideVehicleByRawPlate]);

  // Rate display layout — which check-in buttons to show
  const hourlyPrice = Number(garage?.hourlyRate) || 0;
  const overnightPrice = Number(garage?.overnightRate) || 0;
  const showBoth = (hourlyPrice > 0 && overnightPrice > 0) || (hourlyPrice <= 0 && overnightPrice <= 0);
  const showOnlyHourly = hourlyPrice > 0 && overnightPrice <= 0;
  const showOnlyOvernight = hourlyPrice <= 0 && overnightPrice > 0;

  const handleGuardedCheckIn = async (type: 'hourly' | 'overnight') => {
    if (isDebouncing || isLoading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsDebouncing(true);
    setTimeout(() => setIsDebouncing(false), 300);
    closeKeyboard();
    // UX (owner report 2026-11-12): clear the draft BEFORE the await, not
    // after. During the submit window the vehicles list gains the checked-in
    // car — whichever lands first, the Worker response (setVehicles in
    // handleCheckIn) or the Firestore snapshot — while the typed plate was
    // still in the draft. existingVehicleForPlate then matched the
    // just-checked-in car and the card flipped to the red
    // "السيارة موجودة حالياً بالداخل" checkout button mid-submit, which
    // operators read as "the app says I checked in twice". With the draft
    // empty for the whole in-flight window, no intermediate render can flip
    // the action area. The restore contract is unchanged: a non-null return
    // puts the plate back (warnings, retryable errors).
    const submittedPlate = newPlateNumber;
    setNewPlateNumber('');
    const restorePlate = await handleCheckIn(type, submittedPlate);
    isSubmittingRef.current = false;
    if (restorePlate) {
      setNewPlateNumber(restorePlate);
    }
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
  }, [newPlateNumber, plateInputRef]);

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
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isInputFocused, setIsInputFocused, inputRef]);

  // PERF (audit 2026-11-08): memoized so LicensePlateKeyboard's memo
  // doesn't bail out on every render (which would re-render all 19 keys).
  const handleVirtualKeyPress = useCallback((key: string) => {
    // Use getCleanPlate (display-safe, preserves Alef variants like أ)
    // NOT getRawPlate (which normalizes أ → ا for server-side matching).
    // Pre-fix: this called getRawPlate first, which normalized أ → ا,
    // then passed the normalized result to getCleanPlate — so the display
    // always showed ا instead of the typed أ.
    const clean = getCleanPlate(newPlateNumber + key);
    setNewPlateNumber(clean);
  }, [newPlateNumber, setNewPlateNumber]);

  return (
    <div
      ref={inputRef}
      className={`bg-[#faf9f6] dark:bg-slate-900 rounded-[2rem] border relative shrink-0 p-4 md:p-8 max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto w-full ${
        isInputFocused
          ? 'border-slate-900 dark:border-slate-700'
          : 'border-slate-200 dark:border-slate-800'
      } ${isLoading ? 'pointer-events-none opacity-50' : ''}`}
    >
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
                aria-label="حذف آخر حرف"
                className="absolute bg-red-500 text-white rounded-2xl flex items-center justify-center hover:bg-red-600 transition-colors focus-visible:ring-2 focus-visible:ring-white -top-3 -left-3 w-11 h-11 min-w-[44px] min-h-[44px] md:w-16 md:h-16 md:-top-6 md:-left-6 z-50 shadow-md cursor-pointer active:scale-95"
              >
                <Delete className="w-6 h-6 md:w-8 md:h-8" />
              </button>
            )}
            
            <div className="relative h-28 sm:h-36 md:h-52 lg:h-60 overflow-hidden" onClick={() => { if (isLoading) return; setIsInputFocused(true); plateInputRef.current?.focus(); }}>
              <span id="registration-plate-input-description" className="sr-only">
                استخدم لوحة المفاتيح الظاهرة لإدخال أحرف وأرقام اللوحة المصرية.
              </span>
              <input
                ref={plateInputRef}
                type="text"
                name="plateNumber"
                id="plateNumber"
                aria-label="رقم لوحة السيارة"
                aria-describedby="registration-plate-input-description"
                inputMode="none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                disabled={isLoading}
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
                          ? (plateParts.numbers.length >= 4
                              ? 'text-3xl sm:text-6xl md:text-7xl lg:text-8xl'
                              : 'text-4xl sm:text-7xl md:text-8xl lg:text-9xl') 
                          : 'text-2xl sm:text-4xl md:text-5xl text-slate-300 font-sans font-normal'
                      }`}
                    >
                      {formatArabicDigits(plateParts.numbers)}
                    </FitText>
                  </div>

                  {/* Vertical Divider */}
                  <div className="w-[2px] md:w-[3px] h-[70%] bg-slate-300 rounded-full" />

                  {/* Letters Section (Right) */}
                  <div className="flex-1 h-full min-w-0 flex justify-center items-center px-2" dir="rtl">
                    <FitText
                      minFontSize={14}
                      className={`font-black text-slate-950 text-center ${
                        newPlateNumber
                          ? (plateParts.letters.length >= 4
                              ? 'text-2xl sm:text-4xl md:text-5xl lg:text-6xl tracking-normal'
                              : 'text-4xl sm:text-6xl md:text-7xl lg:text-8xl tracking-[0.1em]') 
                          : 'text-2xl sm:text-4xl md:text-5xl text-slate-300 font-sans font-normal'
                      }`}
                    >
                      {plateParts.letters ? (
                        plateParts.letters.split('').map((char, idx) => (
                          <span 
                            key={idx} 
                            className={`inline-block select-none ${plateParts.letters.length >= 4 ? 'mx-[0.125em]' : 'mx-[0.25em]'}`}
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
                  <div className="absolute bottom-1.5 md:bottom-3 left-1/2 -translate-x-1/2 w-12 md:w-20 h-1 md:h-1.5 bg-blue-600 rounded-full" />
                )}
              </div>
            </div>
            {existingVehicleForPlate ? (
              <div className="overflow-hidden mt-2">
                <button
                  disabled={isLoading || isDebouncing}
                  onClick={() => handleGuardedCheckOut(existingVehicleForPlate)}
                  className="w-full py-4 md:py-8 bg-red-500 text-white rounded-2xl md:rounded-[2rem] flex flex-col items-center justify-center gap-1 md:gap-2 transition-all focus-visible:ring-2 focus-visible:ring-white md:scale-[1.01] hover:bg-red-600 active:scale-[0.99] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-lg md:text-2xl font-black tracking-tight flex items-center justify-center gap-2">
                    {(isLoading || isDebouncing) ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 text-white animate-spin" /> : 'إصدار فاتورة خروج'}
                  </div>
                  <span className="text-[10px] md:text-sm opacity-90 font-bold uppercase tracking-widest">السيارة موجودة حالياً بالداخل</span>
                </button>
              </div>
            ) : (isInputFocused || (newPlateNumber && isPlateValidMemo)) ? (
                  <div className="overflow-hidden">
                    <div className="flex gap-4 mt-1">
                      {(showBoth || showOnlyHourly) && (
                        <button 
                          disabled={!isPlateValidMemo || isLoading || isDebouncing}
                          onClick={() => handleGuardedCheckIn('hourly')}
                          className={`${showOnlyHourly ? 'w-full' : 'flex-1'} py-4 md:py-8 rounded-2xl md:rounded-[2rem] flex flex-col items-center justify-center gap-1 md:gap-2 focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all duration-150 ${
                            isPlateValidMemo && !isLoading && !isDebouncing
                              ? 'bg-white dark:bg-slate-900 border-2 md:border-3 border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/80 active:scale-[0.98]' 
                              : 'bg-slate-100 dark:bg-slate-800/40 border-2 border-slate-200 dark:border-slate-800/80 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <div className="text-base md:text-2xl uppercase tracking-tight font-black flex items-center justify-center gap-2">
                            {(isLoading || isDebouncing) ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : 'ساعة'}
                          </div>
                          <span className={`text-[10px] md:text-xs font-black tracking-widest whitespace-nowrap ${
                            isPlateValidMemo ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400/70 dark:text-slate-700'
                          }`}>
                            <span className="font-mono">{formatArabicDigits(garage?.hourlyRate ?? 0)}</span> ج.م / ساعة
                          </span>
                        </button>
                      )}
                      {(showBoth || showOnlyOvernight) && (
                        <button 
                          disabled={!isPlateValidMemo || isLoading || isDebouncing}
                          onClick={() => handleGuardedCheckIn('overnight')}
                          className={`${showOnlyOvernight ? 'w-full' : 'flex-1'} py-4 md:py-8 rounded-2xl md:rounded-[2rem] flex flex-col items-center justify-center gap-1 md:gap-2 focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all duration-150 ${
                            isPlateValidMemo && !isLoading && !isDebouncing
                              ? 'bg-emerald-600 dark:bg-emerald-600 border-2 md:border-3 border-emerald-700 dark:border-emerald-500 text-white font-black hover:bg-emerald-700 dark:hover:bg-emerald-600/90 active:scale-[0.98]' 
                              : 'bg-slate-100 dark:bg-slate-800/40 border-2 border-slate-200 dark:border-slate-800/80 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <div className="text-base md:text-2xl uppercase tracking-tight font-black flex items-center justify-center gap-2">
                            {(isLoading || isDebouncing) ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : 'مبيت'}
                          </div>
                          <span className={`text-[10px] md:text-xs font-black tracking-widest whitespace-nowrap ${
                            isPlateValidMemo ? 'text-slate-950/80 dark:text-slate-950/85' : 'text-slate-400/70 dark:text-slate-700'
                          }`}>
                            <span className="font-mono">{formatArabicDigits(garage?.overnightRate ?? 0)}</span> ج.م مبيت
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
            ) : null}
          </div>
        </div>
    </div>
  );
});
