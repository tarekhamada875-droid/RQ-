import React, { memo } from 'react';
import { Trash2 } from 'lucide-react';
import { Garage } from '../../types';
import type { GarageDeletionProgress } from '../../services/garageService';

interface DeleteGarageConfirmModalProps {
  garage: Garage;
  isLoading: boolean;
  progress: GarageDeletionProgress | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteGarageConfirmModal: React.FC<DeleteGarageConfirmModalProps> = memo(({
  garage,
  isLoading,
  progress,
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
        onClick={isLoading ? undefined : onCancel}
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps"
      />
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2rem] p-6 sm:p-8 text-center border border-slate-200/80 dark:border-slate-800 shadow-2xl animate-popup-30fps" dir="rtl">
        <div className="w-14 h-14 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20 shadow-inner shrink-0">
          <Trash2 className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">حذف الجراج؟</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
          سيتم حذف جراج <span className="inline-block px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-black rounded-lg text-xs font-mono">{garage.name}</span> وكامل بياناته نهائياً من السيستم.
        </p>

        {isLoading ? (
          <div className="space-y-4" aria-live="polite">
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
              جاري حذف كامل بيانات الجراج. لا تغلق الصفحة.
            </p>
            <div className="flex items-end justify-between text-slate-900 dark:text-white" dir="ltr">
              <span className="text-3xl font-black tabular-nums">{progress?.percentage ?? 0}%</span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {progress?.processed ?? 0} / {progress?.total ?? 0}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Garage deletion progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress?.percentage ?? 0}
              className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
            >
              <div
                className="h-full rounded-full bg-red-500 transition-[width] duration-300"
                style={{ width: `${progress?.percentage ?? 0}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <button 
              onClick={onConfirm}
              disabled={isLoading}
              className="w-full py-3.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white rounded-2xl font-black text-base disabled:opacity-50 transition-all duration-150 outline-none cursor-pointer shadow-lg shadow-red-600/20"
            >
              نعم، حذف الجراج
            </button>
            <button 
              onClick={onCancel}
              className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 rounded-2xl font-bold text-sm transition-all duration-150 outline-none cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

