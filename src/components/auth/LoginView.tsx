/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { ChevronRight, Delete } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { normalizeDigits } from '../../utils';

interface LoginViewProps {
  loginPhone: string;
  setLoginPhone: (phone: string) => void;
  handleGarageLogin: () => Promise<void>;
  isLoading: boolean;
  closeKeyboard: () => void;
}

export const LoginView: React.FC<LoginViewProps> = memo(({
  loginPhone,
  setLoginPhone,
  handleGarageLogin,
  isLoading,
  closeKeyboard,
}) => {
  const cleanPin = normalizeDigits(loginPhone || '').replace(/\D/g, '');

  const handleKeyPress = (key: string) => {
    if (isLoading) return;
    if (cleanPin.length < 10) {
      setLoginPhone(cleanPin + key);
    }
  };

  const handleDelete = () => {
    if (isLoading) return;
    setLoginPhone(cleanPin.slice(0, -1));
  };

  const handleClearAll = () => {
    if (isLoading) return;
    setLoginPhone('');
  };

  // Support physical keyboard / numpad / barcode scanner
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;
      if (e.key >= '0' && e.key <= '9') {
        if (cleanPin.length < 10) {
          setLoginPhone(cleanPin + e.key);
        }
      } else if (e.key === 'Backspace') {
        setLoginPhone(cleanPin.slice(0, -1));
      } else if (e.key === 'Enter' && cleanPin.length > 0) {
        handleGarageLogin();
      } else if (e.key === 'Escape') {
        setLoginPhone('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, cleanPin, setLoginPhone, handleGarageLogin]);

  return (
    <div 
      className="h-screen w-full bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8 md:p-12 font-sans relative overflow-hidden" 
      dir="rtl"
      onClick={closeKeyboard}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white dark:bg-slate-900 w-full max-w-sm sm:max-w-md md:max-w-lg rounded-2xl pt-6 pb-8 sm:pt-8 sm:pb-10 px-5 sm:px-8 border border-slate-100 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden"
      >
        {/* Central Display: Authentic Egyptian License Plate Design */}
        <div className="mb-5 sm:mb-7 select-none" dir="ltr">
          <div className="relative w-full max-w-[320px] sm:max-w-[380px] mx-auto bg-white dark:bg-slate-900 border-[3px] border-slate-900 dark:border-slate-700 rounded-2xl overflow-hidden shadow-md flex flex-col">
            {/* Top Bar - Standard Egyptian Blue */}
            <div className="h-7 sm:h-8 bg-[#0057b7] text-white flex items-center justify-between px-3 sm:px-4 font-black border-b border-slate-900/10">
              <span className="text-[10px] sm:text-xs tracking-wider antialiased font-mono">EGYPT</span>
              <span className="text-xs sm:text-sm font-sans antialiased" dir="rtl">مصر</span>
            </div>

            {/* Plate Interior: Monospace Egyptian PIN Numbers */}
            <div className="h-20 sm:h-24 bg-[#fcfcfc] dark:bg-slate-900/90 flex items-center justify-center px-4 relative">
              {cleanPin.length > 0 ? (
                <span className="font-mono font-black text-3xl sm:text-4xl md:text-5xl text-slate-900 dark:text-slate-100 tracking-[0.25em] antialiased">
                  {cleanPin}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-600 text-sm sm:text-base font-bold tracking-normal font-sans" dir="rtl">
                  أدخل الرمز السري...
                </span>
              )}

              {/* Blinking Cursor Indicator when active */}
              {cleanPin.length > 0 && cleanPin.length < 10 && !isLoading && (
                <span className="inline-block w-1 h-7 sm:h-8 bg-[#0057b7] animate-pulse ml-1 rounded-full" />
              )}
            </div>
          </div>
        </div>

        {/* Keypad */}
        <div className={`grid grid-cols-3 gap-2 sm:gap-3 transition-all duration-300 ${isLoading ? 'opacity-40 pointer-events-none' : ''}`} dir="ltr">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              disabled={isLoading}
              onClick={() => handleKeyPress(num.toString())}
              className="h-12 sm:h-16 rounded-xl bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800/60 text-xl sm:text-2xl font-bold font-mono text-slate-800 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-700 outline-none transition-[background-color,transform] duration-75 active:scale-95 disabled:pointer-events-none flex items-center justify-center hover:border-slate-400/40 select-none touch-manipulation shadow-xs"
            >
              {num}
            </button>
          ))}
          <button
            disabled={isLoading || cleanPin.length === 0}
            onClick={handleClearAll}
            className="h-12 sm:h-16 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-black text-xs sm:text-sm outline-none disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-all active:scale-95 select-none touch-manipulation shadow-xs"
          >
            مسح الكل
          </button>
          <button
            disabled={isLoading}
            onClick={() => handleKeyPress('0')}
            className="h-12 sm:h-16 rounded-xl bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800/60 text-xl sm:text-2xl font-bold font-mono text-slate-800 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-700 outline-none transition-[background-color,transform] duration-75 active:scale-95 disabled:pointer-events-none flex items-center justify-center hover:border-slate-400/40 select-none touch-manipulation shadow-xs"
          >
            0
          </button>
          <button
            disabled={isLoading || cleanPin.length === 0}
            onClick={handleDelete}
            className="h-12 sm:h-16 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center active:bg-amber-500/30 transition-all active:scale-95 outline-none disabled:opacity-40 disabled:pointer-events-none select-none touch-manipulation shadow-xs"
          >
            <Delete className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />
          </button>
        </div>

        {/* Action Button */}
        <button 
          onClick={() => handleGarageLogin()}
          disabled={isLoading || cleanPin.length === 0}
          className="w-full bg-[#0057b7] hover:bg-[#004494] text-white py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg disabled:opacity-40 disabled:grayscale transition-all flex items-center justify-center mt-5 sm:mt-6 outline-none shadow-sm hover:shadow-md active:scale-[0.99]"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Spinner className="w-5 h-5 border-current" />
              <span className="text-sm sm:text-base font-bold">جاري التحقق من الرمز...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>تسجيل الدخول</span>
              <ChevronRight className="w-5 h-5 rotate-180" />
            </div>
          )}
        </button>
      </div>

      {/* Brand Footer */}
      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-3 select-none text-slate-400 dark:text-slate-500 font-bold text-[10px] tracking-wider uppercase">
        <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-slate-200 dark:to-slate-800" />
        <span className="brand-shimmer-text">ARQ FOR SOFTWARE DEVELOPMENT</span>
        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-slate-200 dark:to-slate-800" />
      </div>
    </div>
  );
});
