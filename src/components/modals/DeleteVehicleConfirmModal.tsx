import React, { memo } from 'react';
import { Trash2 } from 'lucide-react';
import { Vehicle } from '../../types';

interface DeleteVehicleConfirmModalProps {
  vehicle: Vehicle;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteVehicleConfirmModal: React.FC<DeleteVehicleConfirmModalProps> = memo(({
  vehicle,
  isLoading,
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
        <div className="w-14 h-14 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20 shadow-inner shrink-0">
          <Trash2 className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">حذف السيارة؟</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
          سيتم حذف السيارة <span className="inline-block px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-black rounded-lg text-xs font-mono">{vehicle.plateNumber}</span> نهائياً من النظام.
        </p>
        <div className="space-y-3 pt-1">
          <button 
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-base active:scale-95 disabled:opacity-50 transition-all duration-150 outline-none cursor-pointer shadow-lg shadow-red-600/20 flex items-center justify-center"
          >
            تأكيد الحذف
          </button>
          <button 
            onClick={onCancel}
            className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 rounded-2xl font-bold text-sm transition-all duration-150 outline-none cursor-pointer flex items-center justify-center"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
});
