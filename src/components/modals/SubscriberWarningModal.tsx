import React, { memo } from 'react';
import { AlertCircle } from 'lucide-react';
import { EgyptianPlate } from '../ui/EgyptianPlate';

interface SubscriberWarningModalProps {
  plateNumber: string;
  onConfirm: () => void;
}

export const SubscriberWarningModal: React.FC<SubscriberWarningModalProps> = memo(({
  plateNumber,
  onConfirm
}) => {
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div 
        onClick={onConfirm}
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps"
      />
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2rem] p-6 sm:p-8 text-center border border-slate-200/80 dark:border-slate-800 shadow-2xl animate-popup-30fps" dir="rtl">
        <div className="w-14 h-14 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 shadow-inner shrink-0">
          <AlertCircle className="w-7 h-7 text-emerald-500 dark:text-emerald-400" />
        </div>
        
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">تنبيه: مشترك شهري</h3>
        
        <p className="text-slate-500 dark:text-slate-400 font-bold mb-5 text-sm leading-relaxed">
          رقم اللوحة ينتمي إلى مشترك شهري فعال ونشط حالياً.
          <br/>
          <span className="text-emerald-600 dark:text-emerald-400 font-black">لن يتم تسجيله</span> في قائمة السيارات المتواجدة بالداخل.
        </p>

        {/* Plate Mockup in Warning Modal */}
        <div className="flex items-center justify-center mb-6 text-center scale-100 origin-center shrink-0">
          <EgyptianPlate 
            plateNumber={plateNumber} 
            size="md" 
          />
        </div>
        
        <button 
          onClick={onConfirm}
          className="w-full py-3.5 bg-slate-900 dark:bg-emerald-600 text-white rounded-2xl font-black text-base hover:bg-slate-800 dark:hover:bg-emerald-500 active:scale-95 transition-all duration-150 outline-none cursor-pointer shadow-lg shadow-emerald-600/20 flex items-center justify-center"
        >
          حسنًا، فهمت
        </button>
      </div>
    </div>
  );
});
