import React, { useState, memo } from 'react';
import { 
  ChevronRight, 
  Phone, 
  Lock, 
  Loader2 
} from 'lucide-react';
import { NumericKeypad } from '../ui/NumericKeypad';

interface DelegateLoginViewProps {
  onLogin: (phone: string, pin: string) => void;
  isLoading: boolean;
  onBack: () => void;
}

export const DelegateLoginView: React.FC<DelegateLoginViewProps> = memo(({ onLogin, isLoading, onBack }) => {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [activeField, setActiveField] = useState<'phone' | 'pin'>('phone');

  const handleKeyPress = (key: string) => {
    if (activeField === 'phone') {
      if (phone.length < 11) setPhone(phone + key);
    } else {
      if (pin.length < 10) setPin(pin + key);
    }
  };

  const handleDelete = () => {
    if (activeField === 'phone') {
      setPhone(phone.slice(0, -1));
    } else {
      setPin(pin.slice(0, -1));
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (phone && pin) {
      onLogin(phone, pin);
    }
  };

  // Calculate dynamic size based on length for the PIN inner display
  const getBoxSize = () => {
    if (pin.length <= 4) return 'w-8 h-10 sm:w-12 sm:h-15 md:w-16 md:h-20 text-xl sm:text-3xl md:text-4xl';
    if (pin.length <= 6) return 'w-7.5 h-9 sm:w-11 sm:h-14 md:w-14 md:h-18 text-lg sm:text-2xl md:text-3xl';
    if (pin.length <= 8) return 'w-6 h-8 sm:w-10 sm:h-13 md:w-12 md:h-16 text-base sm:text-xl md:text-2xl';
    return 'w-5 h-7.5 sm:w-8.5 sm:h-12 md:w-11 md:h-15 text-xs sm:text-lg md:text-xl';
  };

  const getGapClass = () => {
    if (pin.length <= 6) return 'gap-1.5 sm:gap-2.5';
    return 'gap-[3px] sm:gap-1.5';
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#faf9f6] dark:bg-slate-950 flex items-center justify-center p-4 sm:p-10 md:p-16 relative transition-colors" dir="rtl">
      <div className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-xl p-8 sm:p-12 border border-slate-100 dark:border-slate-800 transition-colors shadow-xl">
        <div className="space-y-4 sm:space-y-6">
          {/* Phone Field */}
          <div 
            onClick={() => setActiveField('phone')}
            className={`space-y-1.5 p-4 sm:p-6 rounded-2xl border-2 transition-all cursor-pointer ${
              activeField === 'phone' 
                ? 'border-amber-400 bg-amber-50/10 dark:bg-amber-400/5' 
                : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
            }`}
          >
            <label className="text-[10px] sm:text-xs md:text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-1">رقم الموبايل</label>
            <div className="relative group">
              <Phone className={`absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 ${activeField === 'phone' ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`} />
              <div className={`w-full bg-transparent py-2 pr-8 pl-4 font-black text-xl sm:text-2xl md:text-3xl min-h-[2.5rem] sm:min-h-[3.5rem] flex items-center ${phone ? 'text-slate-900 dark:text-slate-100' : 'text-slate-200 dark:text-slate-700'}`}>
                {phone || <span>01xxxxxxxxx</span>}
              </div>
            </div>
          </div>

          {/* PIN Field */}
          <div 
            onClick={() => setActiveField('pin')}
            className={`space-y-1.5 p-4 sm:p-6 rounded-2xl border-2 transition-all cursor-pointer ${
              activeField === 'pin' 
                ? 'border-amber-400 bg-amber-50/10 dark:bg-amber-400/5' 
                : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
            }`}
          >
            <label className="text-[10px] sm:text-xs md:text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-1">رمز الدخول (PIN)</label>
            <div className="flex items-center gap-1.5 min-h-[3rem] sm:min-h-[4rem]" dir="ltr">
              <div className={activeField === 'pin' ? 'text-amber-500 mr-2' : 'text-slate-300 dark:text-slate-600 mr-2'}>
                <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className={`flex ${getGapClass()} justify-center flex-1`}>
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <div 
                    key={i}
                    className={`${getBoxSize()} rounded-lg md:rounded-xl border-2 flex items-center justify-center font-black transition-all shrink-0 relative overflow-hidden ${
                      pin[i] 
                        ? 'border-amber-500 bg-amber-500 text-white' 
                        : 'border-slate-200 dark:border-slate-700 text-transparent bg-white dark:bg-slate-800'
                    }`}
                  >
                    <span className="relative z-10">{pin[i] ? '•' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Custom Keypad */}
          <NumericKeypad 
            onKeyPress={handleKeyPress}
            onDelete={handleDelete}
            className="mt-6"
          />

          <button
            onClick={() => handleSubmit()}
            disabled={isLoading || !phone || pin.length < 4}
            className="w-full bg-slate-900 dark:bg-slate-700 text-white rounded-2xl py-5 sm:py-6 md:py-8 font-black text-base sm:text-xl md:text-2xl hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-30 disabled:grayscale transition-all flex items-center justify-center gap-2 mt-4 outline-none shadow-md"
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-white" />
            ) : (
              <>
                <span>دخول للوحة الشحن</span>
                <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8 rotate-180" />
              </>
            )}
          </button>
        </div>

        <button 
          onClick={onBack}
          className="w-full mt-6 py-2 text-slate-400 dark:text-slate-500 font-black text-[10px] sm:text-xs md:text-sm hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-widest transition-colors outline-none font-bold"
        >
          العودة للرئيسية
        </button>
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
