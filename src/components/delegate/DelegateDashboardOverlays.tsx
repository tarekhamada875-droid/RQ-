import { Loader2, PlusCircle, RefreshCw, X } from 'lucide-react';
import { generateSafePin } from '../../utils';

export const DelegateDashboardOverlays = (props: any) => {
  const {
    showAddGarage,
    setShowAddGarage,
    onCreateGarage,
    isTrial,
    setIsTrial,
    newGaragePin,
    pinGenerationsRemaining,
    allGarages,
    setNewGaragePin,
    setPinGenerationsRemaining,
    isLoading,
  } = props;

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
                  <input name="name" placeholder="جراج التوفيق" required className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold outline-none focus:border-amber-500 transition-all placeholder:text-slate-400" dir="rtl" />
                </div>
  
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 text-center">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">سعر الساعة</label>
                    <div className="relative">
                      <input 
                        name="hourlyRate" 
                        type="text" 
                        inputMode="numeric" 
                        pattern="[0-9]*"
                        placeholder="10" 
                        className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold text-center outline-none focus:border-amber-500 font-mono text-lg" 
                        dir="ltr" 
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">ج.م</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-center">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">سعر المبيت</label>
                    <div className="relative">
                      <input 
                        name="overnightRate" 
                        type="text" 
                        inputMode="numeric" 
                        pattern="[0-9]*"
                        placeholder="50" 
                        className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold text-center outline-none focus:border-amber-500 font-mono text-lg" 
                        dir="ltr" 
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">ج.م</span>
                    </div>
                  </div>
                </div>
  
                <input type="hidden" name="billingModel" value="prepaid_credits" />
  
                {/* Free Trial Toggle */}
                <div 
                  id="delegate-trial-toggle-container"
                  onClick={() => setIsTrial(prev => !prev)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 select-none flex items-center justify-between ${
                    isTrial 
                      ? 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/50 dark:border-emerald-500/50 shadow-sm shadow-emerald-500/5' 
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-0.5 text-right flex-1 min-w-0 pr-2">
                    <label className={`text-xs sm:text-sm font-bold block cursor-pointer truncate transition-colors ${
                      isTrial ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-900 dark:text-white'
                    }`}>
                      منح 100 رصيد تجربة مجاني
                    </label>
                    <span className={`text-[11px] block truncate transition-colors ${
                      isTrial ? 'text-emerald-600 dark:text-emerald-400/80' : 'text-slate-400 dark:text-slate-400'
                    }`}>
                      100 رصيد دخول مجاني للجراج الجديد
                    </span>
                  </div>
  
                  <div 
                    className="relative shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    dir="ltr"
                  >
                    <input 
                      type="checkbox" 
                      id="delegate-trial-checkbox"
                      name="isTrial" 
                      checked={isTrial} 
                      onChange={(e) => setIsTrial(e.target.checked)} 
                      className="sr-only" 
                    />
                    <input type="hidden" name="isTrial_hidden" value={isTrial ? 'true' : 'false'} />
                    
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isTrial}
                      onClick={() => setIsTrial(prev => !prev)}
                      className={`w-12 h-7 rounded-full transition-colors duration-200 ease-in-out relative focus:outline-none flex items-center p-0.5 ${
                        isTrial ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span 
                        className={`inline-block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                          isTrial ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
  
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">رقم الموبايل (اختياري)</label>
                  <input 
                    name="phone" 
                    type="tel"
                    inputMode="numeric"
                    placeholder="01xxxxxxxxx" 
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold font-mono outline-none focus:border-amber-500 transition-all placeholder:text-slate-400" 
                    dir="ltr" 
                  />
                </div>
  
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">رمز الدخول (PIN)</label>
                  <div className="relative">
                    <input 
                      name="pin" 
                      type="text" 
                      value={newGaragePin}
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
