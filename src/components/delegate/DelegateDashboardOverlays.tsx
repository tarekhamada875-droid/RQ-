import React from 'react';
import { Loader2, PlusCircle, X } from 'lucide-react';
import { Garage } from '../../types';

/**
 * DelegateDashboardOverlays
 *
 * The "create garage" modal that delegates use to onboard a new garage.
 *
 * Per the delegate PIN policy (2026-11-15): delegates never see, set, or
 * transmit the new garage's PIN. The PIN is generated server-side by
 * the Worker when the request is processed, written to private_pins/,
 * and surfaced only to admin in the approval queue. Admin then tells
 * the garage owner the PIN by phone, out of band.
 *
 * If a delegate tries to send a `pin` in the request body anyway, the
 * Worker rejects with 400 DELEGATE_CANNOT_SET_PIN.
 *
 * Form fields (delegate modal): name, hourlyRate, overnightRate.
 * No PIN field, no regenerate button, no PIN pre-generation state.
 */

interface DelegateDashboardOverlaysProps {
  showAddGarage: boolean;
  setShowAddGarage: (show: boolean) => void;
  onCreateGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  allGarages: Garage[];
  isLoading: boolean;
}

export const DelegateDashboardOverlays = ({
  showAddGarage,
  setShowAddGarage,
  onCreateGarage,
  isLoading,
}: DelegateDashboardOverlaysProps) => {
  return (
    <>
        {/* Add Garage Modal */}
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

                {/* PIN field intentionally omitted — see file header.
                    The Worker generates the PIN server-side for delegate requests. */}

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
