import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';

interface PackageValidationErrorModalProps {
  isOpen: boolean;
  message: string;
  suggestions: string[];
  onClose: () => void;
}

export const PackageValidationErrorModal: React.FC<PackageValidationErrorModalProps> = ({
  isOpen,
  message,
  suggestions,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2rem] p-6 sm:p-8 text-center border border-slate-200/80 dark:border-slate-800 shadow-2xl animate-popup-30fps" dir="rtl">
        <div className="w-14 h-14 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20 shadow-inner shrink-0">
          <AlertTriangle className="w-7 h-7" />
        </div>
        
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
          تنبيه: تسعير غير منطقي
        </h3>
        
        <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-6 leading-relaxed max-w-xs mx-auto">
          {message}
        </p>
        
        {suggestions.length > 0 && (
          <div className="space-y-3 mb-6 text-right bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">نقترح عليك أحد الحلول التالية:</h4>
            <ul className="space-y-2">
              {suggestions.map((sug, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span className="text-emerald-500 shrink-0 mt-0.5"><Check className="w-4 h-4" /></span>
                  <span className="leading-relaxed">{sug}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-black py-3.5 rounded-2xl active:scale-95 transition-all duration-150 outline-none cursor-pointer shadow-md"
        >
          حسناً، سأقوم بالتعديل
        </button>
      </div>
    </div>
  );
};
