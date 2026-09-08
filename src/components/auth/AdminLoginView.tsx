/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { normalizeDigits } from '../../utils';
import { NumericKeypad } from '../ui/NumericKeypad';
import { Spinner } from '../ui/Spinner';

interface AdminLoginViewProps {
  adminPin: string;
  setAdminPin: (pin: string) => void;
  setView: (view: any) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
  closeKeyboard: () => void;
  correctAdminPin?: string;
  onLogin?: (pin: string) => Promise<void>;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = memo(({
  adminPin,
  setAdminPin,
  setView,
  showToast,
  closeKeyboard,
  onLogin
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleKeyPress = (key: string) => {
    if (isLoading) return;
    if (adminPin.length < 10) {
      setAdminPin(adminPin + key);
    }
  };

  const handleDelete = () => {
    if (isLoading) return;
    setAdminPin(adminPin.slice(0, -1));
  };

  const handleLogin = async () => {
    const entered = normalizeDigits(adminPin).replace(/\D/g, '');
    if (!entered) {
      showToast('الرقم السري خطأ', 'error');
      return;
    }
    setIsLoading(true);
    try {
      if (onLogin) {
        await onLogin(entered);
      }
    } catch (e: any) {
      showToast(e?.message || 'حدث خطأ أثناء الدخول', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Support physical keyboard / numpad
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;
      if (e.key >= '0' && e.key <= '9') {
        if (adminPin.length < 10) {
          setAdminPin(adminPin + e.key);
        }
      } else if (e.key === 'Backspace') {
        setAdminPin(adminPin.slice(0, -1));
      } else if (e.key === 'Enter' && adminPin.length > 0) {
        handleLogin();
      } else if (e.key === 'Escape') {
        setView('login');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, adminPin, setAdminPin, handleLogin, setView]);

  // Calculate dynamic size based on length
  const getBoxSize = () => {
    if (adminPin.length <= 4) return 'w-12 h-16 sm:w-18 sm:h-24 md:w-22 md:h-30 text-3xl sm:text-5xl md:text-6xl';
    if (adminPin.length <= 6) return 'w-10 h-14 sm:w-15 sm:h-20 md:w-18 md:h-26 text-2xl sm:text-4xl md:text-5xl';
    if (adminPin.length <= 8) return 'w-9 h-12 sm:w-13 sm:h-17 md:w-16 md:h-22 text-xl sm:text-3xl md:text-4xl';
    return 'w-7.5 h-10 sm:w-11 sm:h-14 md:w-13 md:h-18 text-lg sm:text-2xl md:text-3xl';
  };

  const getGapClass = () => {
    if (adminPin.length <= 6) return 'gap-2 sm:gap-4';
    return 'gap-[3px] sm:gap-2';
  };

  return (
    <div 
      className="h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-6 sm:p-12 md:p-16 font-sans relative overflow-y-auto transition-colors" 
      dir="rtl"
      onClick={closeKeyboard}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl bg-[#faf9f6] dark:bg-slate-900 rounded-2xl sm:rounded-xl p-8 sm:p-12 text-center border border-slate-100 dark:border-slate-800 relative z-10 shadow-xl"
      >
        <div className="space-y-8">
          {/* PIN Display */}
          <div className={`flex justify-center ${getGapClass()} mb-2 min-h-[5rem] sm:min-h-[7rem] md:min-h-[9rem] items-center`} dir="ltr">
            {Array.from({ length: Math.max(4, adminPin.length) }).map((_, i) => (
              <div 
                key={i}
                className={`${getBoxSize()} rounded-2xl md:rounded-xl border-2 flex items-center justify-center font-black transition-all shrink-0 relative overflow-hidden ${
                  adminPin[i] 
                    ? 'border-amber-500 bg-amber-500 text-white' 
                    : 'border-slate-300 dark:border-slate-700 text-transparent bg-[#faf9f6] dark:bg-slate-800'
                }`}
              >
                <span className="relative z-10">{adminPin[i] ? '•' : ''}</span>
              </div>
            ))}
          </div>

          <div className={`transition-all duration-300 ${isLoading ? 'opacity-40 pointer-events-none' : ''}`}>
            <NumericKeypad 
              onKeyPress={handleKeyPress}
              onDelete={handleDelete}
              className="mt-4"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4 sm:mt-8">
            <button 
              onClick={handleLogin}
              disabled={isLoading || !adminPin}
              className="bg-slate-900 dark:bg-slate-700 text-white py-5 sm:py-6 md:py-8 rounded-2xl md:rounded-xl font-black text-xl sm:text-2xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:grayscale outline-none shadow-md"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Spinner className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span>تحميل...</span>
                </div>
              ) : (
                <>
                  <span>دخول</span>
                  <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8 rotate-180" />
                </>
              )}
            </button>
            <button 
              onClick={() => setView('login')}
              disabled={isLoading}
              className="bg-[#faf9f6] dark:bg-slate-800 text-slate-400 dark:text-slate-300 py-5 sm:py-6 md:py-8 rounded-2xl md:rounded-xl font-black text-xl sm:text-2xl hover:bg-slate-50 dark:hover:bg-slate-700 border-2 border-slate-100 dark:border-slate-700 transition-all outline-none shadow-sm disabled:opacity-50"
            >
              رجوع
            </button>
          </div>
        </div>
      </div>

      {/* Brand Footer */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-3 select-none text-slate-400 dark:text-slate-500 font-bold text-[10px] tracking-wider uppercase">
        <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-slate-300 dark:to-slate-700" />
        <span className="brand-shimmer-text">ARQ FOR SOFTWARE DEVELOPMENT</span>
        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-slate-300 dark:to-slate-700" />
      </div>
    </div>
  );
});
