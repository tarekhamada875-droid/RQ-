import React, { useRef } from 'react';
import { Loader2, PlusCircle, RefreshCw, X } from 'lucide-react';
import { Garage } from '../../types';
import { generateSafePin } from '../../utils/pins';
import { FastInput, type FastInputHandle } from '../ui/FastInput';

interface DelegateDashboardOverlaysProps {
  showAddGarage: boolean;
  setShowAddGarage: (show: boolean) => void;
  onCreateGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  newGaragePin: string;
  pinGenerationsRemaining: number;
  allGarages: Garage[];
  setNewGaragePin: (pin: string) => void;
  setPinGenerationsRemaining: React.Dispatch<React.SetStateAction<number>>;
  isLoading: boolean;
}

export const DelegateDashboardOverlays = ({
  showAddGarage,
  setShowAddGarage,
  onCreateGarage,
  newGaragePin,
  pinGenerationsRemaining,
  allGarages,
  setNewGaragePin,
  setPinGenerationsRemaining,
  isLoading,
}: DelegateDashboardOverlaysProps) => {
  // PERF (audit 2026-11-08): FastInput imperative handle so the "generate
  // safe PIN" button can imperatively set the read-only PIN field's DOM
  // value without going through a controlled-value round-trip.
  const newGaragePinRef = useRef<FastInputHandle>(null);

  return (
    <>
        {/* 6) Add Garage Modal */}
        {showAddGarage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 overflow-y-auto" onClick={() => setShowAddGarage(false)}>
            <div 
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 sm:p-8 relative my-auto border border-slate-200 dark:border-slate-800 transition-colors" 
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 rounded-xl flex items-center justify-center">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">طلب إنشاء جراج جديد</h2>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowAddGarage(false)}
                  className="w-9 h-9 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex shrink-0 items-center justify-center transition-colors outline-none cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-xs font-bold leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                سيتم إرسال الطلب إلى الإدارة للمراجعة، ولن يتم تفعيل الجراج إلا بعد الموافقة.
              </p>
  
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await onCreateGarage(e)) {
                    setShowAddGarage(false);
                  }
                }}
                className="space-y-4 text-right"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">اسم الجراج</label>
                  <input name="name" placeholder="جراج التوفيق" required className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold outline-none focus:border-amber-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500" dir="rtl" />
                </div>
  
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 text-center">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">سعر الساعة</label>
                    <div>
                      <input
                        name="hourlyRate"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="10 ج.م"
                        className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold text-center outline-none focus:border-amber-500 font-mono text-lg"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 text-center">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">سعر المبيت</label>
                    <div>
                      <input
                        name="overnightRate"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="50 ج.م"
                        className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold text-center outline-none focus:border-amber-500 font-mono text-lg"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">رمز الدخول (PIN)</label>
                  <div className="relative">
                    <FastInput
                      ref={newGaragePinRef}
                      name="pin"
                      type="text"
                      defaultValue={newGaragePin}
                      onCommit={setNewGaragePin}
                      onLiveValue={setNewGaragePin}
                      readOnly
                      required
                      className="w-full p-3.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold font-mono outline-none cursor-not-allowed text-center pl-12"
                      dir="ltr"
                    />
                    {pinGenerationsRemaining > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextPin = generateSafePin(allGarages.map(g => g.pin));
                          setNewGaragePin(nextPin);
                          newGaragePinRef.current?.setValue(nextPin);
                          setPinGenerationsRemaining(prev => prev - 1);
                        }}
                        className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="توليد رقم سري عشوائي"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
  
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 rounded-xl py-3.5 font-black text-base hover:opacity-95 transition-all disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                      <PlusCircle className="w-4 h-4" />
                      <span>إرسال الطلب</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
  
    </>
  );
};
