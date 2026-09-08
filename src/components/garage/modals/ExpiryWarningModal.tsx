import React from 'react';
import { AlertTriangle, X as XIcon } from 'lucide-react';

interface ExpiryWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestRecharge: () => void;
}

export const ExpiryWarningModal: React.FC<ExpiryWarningModalProps> = ({
  isOpen,
  onClose,
  onRequestRecharge
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/70 dark:bg-slate-950/85 z-[120] flex items-center justify-center p-4 animate-overlay-30fps"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border-2 border-red-500/30 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden text-right animate-popup-30fps"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-48 h-48 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-9 h-9 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full flex items-center justify-center transition-colors outline-none"
          aria-label="إغلاق"
        >
          <XIcon className="w-5 h-5" />
        </button>
        <div className="text-center mt-2">
          <div className="w-16 h-16 bg-red-500/15 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20 shadow-sm">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white mb-2">
            تنبيه انتهاء الاشتراك
          </h3>
          <p className="text-sm md:text-base font-black text-red-600 dark:text-red-400 mb-4 leading-relaxed bg-red-50 dark:bg-red-950/40 p-4 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-inner">
            إشتراكك هينتهى النهاردة الحق اشحن قبل الساعة 5 علشان تقدر تكمل شغل
          </p>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            يرجى طلب تجديد الاشتراك من باقات الاشتراكات مع المندوب الخاص بك لتجنب توقف الخدمة.
          </p>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                onClose();
                onRequestRecharge();
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3.5 px-6 rounded-2xl font-black text-sm md:text-base transition-all shadow-lg shadow-red-600/20 uppercase tracking-wider block outline-none"
            >
              طلب تجديد الاشتراك الآن
            </button>
            <button
              onClick={onClose}
              className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 px-6 rounded-2xl font-bold text-xs transition-all outline-none"
            >
              تذكيري لاحقاً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
