import React, { useState, useRef } from 'react';
import { Trash2, RotateCcw, Check, Loader2 } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';

interface AdminConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'success';
}

export const AdminConfirmDialog: React.FC<AdminConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  type = 'success',
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const modalA11y = useModalA11y(onCancel);

  React.useEffect(() => {
    if (!isOpen) {
      setIsProcessing(false);
      setIsCancelling(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmClick = async () => {
    if (isProcessing || isCancelling) return;
    try {
      setIsProcessing(true);
      await Promise.resolve(onConfirm());
    } catch (err) {
      console.error('Error in confirm dialog action:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelClick = () => {
    if (isProcessing) return;
    setIsCancelling(true);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 " onClick={onCancel}>
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-2xl scale-100 focus-visible:ring-2 focus-visible:ring-emerald-500"
        onClick={e => e.stopPropagation()}
        {...modalA11y.containerProps}
      >
        <div className="p-8 text-center">
          <div className={`w-20 h-20 mx-auto rounded-xl flex items-center justify-center mb-6 ${
            type === 'danger' ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400' : 
            type === 'warning' ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400' : 
            'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
          }`}>
            {isProcessing ? (
              <Loader2 className="w-10 h-10 animate-spin" />
            ) : type === 'danger' ? (
              <Trash2 className="w-10 h-10" />
            ) : type === 'warning' ? (
              <RotateCcw className="w-10 h-10" />
            ) : (
              <Check className="w-10 h-10" />
            )}
          </div>
          
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{title}</h3>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
            {message}
          </p>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={isProcessing}
              className={`flex-1 h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm outline-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center ${
                isCancelling ? 'opacity-60 scale-95' : ''
              }`}
            >
              {cancelText || 'إلغاء'}
            </button>
            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={isProcessing || isCancelling}
              className={`flex-1 h-14 text-white rounded-2xl font-black text-sm outline-none disabled:opacity-80 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-sm ${
                type === 'danger' ? 'bg-red-600 active:bg-red-800' : 
                type === 'warning' ? 'bg-amber-600 active:bg-amber-800' : 
                'bg-emerald-600 active:bg-emerald-800'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>جاري التنفيذ...</span>
                </>
              ) : (
                confirmText || 'تأكيد'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
