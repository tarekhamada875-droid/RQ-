import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  toast: ToastState | null;
  clearToast: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  // Audit D8 (Phase 7, 2026-11-06): keep a ref to the active timeout
  // so a second toast within 3s doesn't get killed early by the first
  // toast's timer. Previously, each showToast() started a new 3s timer
  // without clearing the previous one — so the second toast could
  // disappear after only 0.1s if the first toast's timer fired.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    // Clear any existing timer before setting a new toast.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setToast({ message, type });
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, 3000);
  }, []);

  const clearToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, toast, clearToast }}>
      {children}
      {/* Audit D8: toast presentation moved into the provider (was inline in App.tsx). */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-[300] flex justify-center pointer-events-none">
          <div
            onClick={() => clearToast()}
            role="alert"
            className="pointer-events-auto max-w-md w-full bg-slate-900/95 dark:bg-slate-900 text-white border border-slate-700/80 rounded-2xl p-3.5 px-4 shadow-xl flex items-start justify-between gap-3 cursor-pointer "
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                {toast.type === 'error' ? <XCircle className="w-5 h-5 stroke-[2.5]" /> : <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />}
              </div>
              <div className="min-w-0 flex-1 text-center" dir="rtl">
                <p className="text-xs sm:text-sm font-bold text-slate-100 leading-relaxed break-words whitespace-normal text-center">
                  {toast.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); clearToast(); }}
              className="text-slate-400 p-1 rounded-lg shrink-0 "
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
