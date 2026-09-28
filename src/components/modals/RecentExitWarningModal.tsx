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
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2rem] p-6 sm:p-8 text-center border border-slate-200/80 dark:border-slate-800 shadow-2xl animate-popup-30fps" dir="rtl">
        <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-500/20 shadow-inner shrink-0">
          <AlertTriangle className="w-7 h-7 text-amber-500 dark:text-amber-400" />
        </div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">تنبيه: دخول متكرر</h3>
        <p className="text-slate-500 dark:text-slate-400 font-bold mb-6 text-sm leading-relaxed">
          هذه السيارة <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-black rounded-lg text-xs">{vehicle.plateNumber}</span> خرجت منذ 
          <span className="text-emerald-600 dark:text-emerald-400 mx-1 font-mono font-black">{getDuration(vehicle.exitTime, now)}</span> فقط.
          <br/>
          هل أنت متأكد من إعادة إدخالها؟
        </p>
        
        <div className="space-y-3 pt-1">
          <button 
            onClick={onConfirm}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-base active:scale-95 transition-all duration-150 outline-none cursor-pointer shadow-lg shadow-emerald-600/20 flex items-center justify-center"
          >
            نعم، تأكيد الدخول
          </button>
          <button 
            onClick={onCancel}
            className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 rounded-2xl font-bold text-sm transition-all duration-150 outline-none cursor-pointer flex items-center justify-center"
          >
            لا، إلغاء
          </button>
        </div>
      </div>
    </div>
  );
});
