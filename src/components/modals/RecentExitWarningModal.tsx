import React, { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Vehicle } from '../../types';
import { getDuration } from '../../utils';

interface RecentExitWarningModalProps {
  vehicle: Vehicle;
  now: Date;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RecentExitWarningModal: React.FC<RecentExitWarningModalProps> = memo(({
  vehicle,
  now,
  onConfirm,
  onCancel
}) => {
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps"
      />
      <div className="relative bg-[#faf9f6] dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 sm:p-8 text-center border border-slate-200/80 dark:border-slate-800 shadow-2xl animate-popup-30fps" dir="rtl">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-50 dark:bg-emerald-400/10 rounded-2xl flex items-center justify-center mx-auto mb-5 border-2 border-emerald-100 dark:border-emerald-900/30">
          <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500 dark:text-emerald-400" />
        </div>
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-2 transition-colors">تنبيه: دخول متكرر</h3>
        <p className="text-slate-500 dark:text-slate-400 font-bold mb-6 text-sm sm:text-base leading-relaxed transition-colors">
          هذه السيارة <span className="text-slate-900 dark:text-slate-100 font-mono font-bold">{vehicle.plateNumber}</span> خرجت منذ 
          <span className="text-emerald-600 dark:text-emerald-400 mx-1 font-mono font-black">{getDuration(vehicle.exitTime, now)}</span> فقط.
          <br/>
          هل أنت متأكد من إعادة إدخالها؟
        </p>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={onConfirm}
            className="w-full h-14 bg-slate-900 dark:bg-emerald-600 text-white rounded-2xl font-black text-sm sm:text-base hover:bg-slate-800 dark:hover:bg-emerald-700 active:scale-95 transition-all duration-150 outline-none cursor-pointer shadow-sm flex items-center justify-center"
          >
            نعم، تأكيد الدخول
          </button>
          <button 
            onClick={onCancel}
            className="w-full h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-sm sm:text-base hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all duration-150 outline-none cursor-pointer flex items-center justify-center"
          >
            لا، إلغاء
          </button>
        </div>
      </div>
    </div>
  );
});
