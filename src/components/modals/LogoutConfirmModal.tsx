import React, { useState, useEffect, memo } from 'react';
import { Delete, Loader2 } from 'lucide-react';

interface LogoutConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  onVerifyPin: (pin: string) => Promise<boolean>;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = memo(({
  onConfirm,
  onCancel,
  onVerifyPin
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [attempts, setAttempts] = useState(() => {
    return parseInt(localStorage.getItem('logout_attempts') || '0', 10);
  });

  const displayLength = Math.max(4, pin.length);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleKeyPress = (num: string) => {
    if (pin.length < 10 && !isLoggingOut) {
      const newPin = pin + num;
      setPin(newPin);
      setError(false);
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0 && !isLoggingOut) {
      setPin(pin.slice(0, -1));
      setError(false);
    }
  };

  const handleLogoutSubmit = async () => {
    if (pin.length < 4 || isLoggingOut) return;
    setIsLoggingOut(true);
    setError(false);
    
    try {
      const valid = await onVerifyPin(pin);
      if (valid) {
        localStorage.setItem('logout_attempts', '0');
        setAttempts(0);
        onConfirm();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        localStorage.setItem('logout_attempts', newAttempts.toString());
        setError(true);
        setIsLoggingOut(false);
        
        if (newAttempts >= 3) {
          setTimeout(() => {
            onCancel(); 
          }, 1000);
        } else {
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 1200);
        }
      }
    } catch (err) {
      setError(true);
      setIsLoggingOut(false);
    }
  };

  const getBoxSize = () => {
    if (displayLength <= 4) return 'w-14 h-18 text-4xl';
    if (displayLength <= 6) return 'w-11 h-15 text-3xl sm:w-12 sm:h-16';
    if (displayLength <= 8) return 'w-9 h-13 text-2xl sm:w-10 sm:h-14';
    return 'w-8 h-12 text-xl';
  };

  const getGapClass = () => {
    if (displayLength <= 4) return 'gap-3';
    if (displayLength <= 6) return 'gap-2';
    return 'gap-1.5';
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div 
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps"
      />
      <div 
        className="relative bg-[#faf9f6] dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-2xl animate-popup-30fps"
        dir="rtl"
      >
        <div className="text-center mb-6">
          <p className="text-slate-500 dark:text-slate-400 font-bold text-sm leading-relaxed px-4">
            <span className="text-emerald-600 dark:text-emerald-400 text-sm font-black mt-2 block select-none">
              (متبقي لك {Math.max(0, 3 - attempts)} محاولات)
            </span>
          </p>
        </div>

        {/* PIN Display */}
        <div className={`flex justify-center ${getGapClass()} mb-8 items-center min-h-[4.5rem]`} dir="ltr">
          {Array.from({ length: displayLength }).map((_, i) => (
            <div 
              key={i}
              className={`${getBoxSize()} rounded-2xl border-2 flex items-center justify-center font-black relative overflow-hidden transition-all shrink-0 ${
                error 
                  ? 'border-red-500 text-red-500 bg-red-50 dark:bg-red-950/30' 
                  : (pin[i] ? 'border-emerald-500 text-white bg-emerald-600' : 'border-slate-200 dark:border-slate-800 text-transparent bg-slate-50/50 dark:bg-slate-800/50')
              }`}
            >
              <span className="relative z-10">{pin[i] ? '•' : ''}</span>
            </div>
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3" dir="ltr">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isLoggingOut}
              onClick={() => handleKeyPress(num.toString())}
              className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-100/50 dark:border-slate-800/50 text-2xl font-black text-slate-900 dark:text-white active:scale-[0.95] dark:active:bg-slate-700 outline-none transition-all disabled:opacity-50"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={onCancel}
            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 text-slate-200 font-extrabold text-sm active:scale-[0.95] outline-none transition-all disabled:opacity-50 shadow-sm"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => handleKeyPress('0')}
            className="h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-100/50 dark:border-slate-800/50 text-2xl font-black text-slate-900 dark:text-white active:scale-[0.95] dark:active:bg-slate-700 outline-none transition-all disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 border-2 border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center active:scale-[0.95] outline-none transition-all disabled:opacity-50 shadow-sm"
          >
            <Delete className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </button>
        </div>

        {/* Submit Logout Button */}
        <div className="mt-6" dir="rtl">
          <button
            type="button"
            onClick={handleLogoutSubmit}
            disabled={pin.length < 4 || isLoggingOut}
            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] outline-none cursor-pointer"
          >
            {isLoggingOut ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span>تسجيل الخروج</span>
            )}
          </button>
        </div>

        {error && (
          <div 
            className="text-red-500 dark:text-red-400 text-center font-bold mt-4 text-sm animate-pulse"
          >
            الرمز السري غير صحيح
          </div>
        )}
      </div>
    </div>
  );
});

