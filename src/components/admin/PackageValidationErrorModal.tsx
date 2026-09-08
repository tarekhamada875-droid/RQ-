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
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl overflow-hidden border border-red-100 dark:border-red-900 shadow-2xl animate-popup-30fps">
        <div className="p-6">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/30 text-red-500 rounded-2xl flex items-center justify-center mb-5 mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white text-center mb-2">
            تنبيه: تسعير غير منطقي
          </h3>
          <p className="text-sm font-bold text-red-600 dark:text-red-400 text-center mb-6 leading-relaxed bg-red-50 dark:bg-red-500/10 p-4 rounded-xl">
            {message}
          </p>
          
          <div className="space-y-3 mb-8">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">نقترح عليك أحد الحلول التالية:</h4>
            <ul className="space-y-2">
              {suggestions.map((sug, idx) => (
                <li key={idx} className="flex items-start gap-4 text-sm font-bold text-slate-600 dark:text-slate-400">
                  <span className="text-emerald-500 mt-0.5"><Check className="w-4 h-4" /></span>
                  <span className="leading-relaxed">{sug}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-black py-4 rounded-xl active:scale-95 transition-all duration-150 outline-none cursor-pointer shadow-sm"
          >
            حسناً، سأقوم بالتعديل
          </button>
        </div>
      </div>
    </div>
  );
};
