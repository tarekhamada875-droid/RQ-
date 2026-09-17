import { CheckCircle2, Loader2, PlusCircle, RefreshCw, Wallet, X } from 'lucide-react';
import { BALANCE_PRESET_AMOUNTS } from '../../constants/packages';
import { generateSafePin, getRemainingDays } from '../../utils';

export const DelegateDashboardOverlays = (props: any) => {
  const {
    showAddGarage,
    setShowAddGarage,
    onCreateGarage,
    isTrial,
    setIsTrial,
    trialDays,
    newGaragePin,
    pinGenerationsRemaining,
    allGarages,
    setNewGaragePin,
    setPinGenerationsRemaining,
    isLoading,
    selectedGarage,
    setSelectedGarage,
    selectedTopupAmount,
    setSelectedTopupAmount,
    success,
    isProcessing,
    handleTopupSubmit,
    pendingRequests,
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
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">إضافة جراج جديد</h2>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowAddGarage(false)}
                  className="w-9 h-9 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex shrink-0 items-center justify-center transition-colors outline-none cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
  
              <form 
                onSubmit={async (e) => {
                  await onCreateGarage(e);
                  setShowAddGarage(false);
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
  
                <input type="hidden" name="billingModel" value="subscription" />
  
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
                      تفعيل فترة تجريبية مجانية ({trialDays} يوم)
                    </label>
                    <span className={`text-[11px] block truncate transition-colors ${
                      isTrial ? 'text-emerald-600 dark:text-emerald-400/80' : 'text-slate-400 dark:text-slate-400'
                    }`}>
                      صلاحية مجانية لمدة {trialDays} يوماً للجراج الجديد
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
                    <input type="hidden" name="trialDays" value={trialDays} />
                    
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
                      <span>تأكيد الإضافة</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
  
        {/* 6) Wallet Balance Top-Up Modal */}
        {selectedGarage && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps"
            onClick={() => {
              if (!isProcessing) {
                setSelectedGarage(null);
                setSelectedTopupAmount(null);
              }
            }}
          >
            <div 
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 relative overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors animate-popup-30fps"
              onClick={e => e.stopPropagation()}
            >
              {success ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center text-white mb-3 shadow-lg shadow-emerald-600/20">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">تم إرسال طلب الشحن!</h2>
                  <p className="text-slate-500 dark:text-slate-400 font-bold text-xs mt-1">سيتم إضافة الرصيد إلى محفظة {selectedGarage.name} فور اعتماد المدير</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
                        <Wallet className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">شحن رصيد المحفظة</h2>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-0.5">{selectedGarage.name}</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        if (!isProcessing) {
                          setSelectedGarage(null);
                          setSelectedTopupAmount(null);
                        }
                      }}
                      className="w-9 h-9 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl flex shrink-0 items-center justify-center transition-colors outline-none cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
  
                  {/* Garage Wallet & Subscription Status */}
                  {isLoading ? (
                    <div className="grid grid-cols-2 gap-2.5 mb-4 animate-pulse">
                      <div className="bg-slate-100 dark:bg-slate-800 h-16 rounded-xl border border-slate-200 dark:border-slate-700" />
                      <div className="bg-slate-100 dark:bg-slate-800 h-16 rounded-xl border border-slate-200 dark:border-slate-700" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 mb-4">
                      <div className="bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 text-center">
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block mb-0.5">رصيد المحفظة الحالي</span>
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
                            {selectedGarage.balance || 0}
                          </span>
                          <span className="text-[10px] font-bold text-amber-600/70">ج.م</span>
                        </div>
                      </div>
  
                      <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-400 block mb-0.5">الاشتراك الحالي</span>
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                            {getRemainingDays(selectedGarage)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">يوم متبقي</span>
                        </div>
                      </div>
                    </div>
                  )}
  
                  {/* Preset Balance Amounts (No custom input allowed) */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        اختر فئة الشحن المطلوبة:
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        فئات ثابتة
                      </span>
                    </div>
  
                    {isLoading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 animate-pulse">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {BALANCE_PRESET_AMOUNTS.map((amt) => {
                          const isSelected = selectedTopupAmount === amt;
                          return (
                            <button
                              key={amt}
                              type="button"
                              disabled={isProcessing}
                              onClick={() => setSelectedTopupAmount(amt)}
                              className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
                                isSelected
                                  ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-md ring-2 ring-amber-500/30'
                                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-800 dark:text-slate-200 hover:border-amber-400/50'
                              }`}
                            >
                              <span className="text-lg sm:text-xl font-black font-mono leading-tight">{amt}</span>
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">ج.م رصيد</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
  
                  {/* Selection Summary */}
                  {selectedTopupAmount ? (
                    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 mb-4 border border-slate-200 dark:border-slate-700">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-bold">المبلغ المطلوب شحنه:</span>
                        <span className="font-black text-slate-900 dark:text-white font-mono">{selectedTopupAmount} ج.م</span>
                      </div>
                      <div className="flex justify-between items-center text-xs mt-1 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                        <span className="text-slate-500 dark:text-slate-400 font-bold">الرصيد بعد الاعتماد:</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {(selectedGarage.balance || 0) + selectedTopupAmount} ج.م
                        </span>
                      </div>
                    </div>
                  ) : null}
  
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={isProcessing || pendingRequests.some(r => r.garageId === selectedGarage.id) || !selectedTopupAmount}
                      onClick={handleTopupSubmit}
                      className="w-full min-h-[48px] px-4 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-slate-950 py-3.5 rounded-xl font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 whitespace-nowrap"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                          <span>جاري إرسال الطلب...</span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          {pendingRequests.some(r => r.garageId === selectedGarage.id) ? (
                            'يوجد طلب شحن معلق قيد المراجعة...'
                          ) : selectedTopupAmount ? (
                            <>
                              <span>إرسال طلب شحن</span>
                              <span className="opacity-50">•</span>
                              <span className="font-mono">{selectedTopupAmount}</span>
                              <span>ج.م للمدير</span>
                            </>
                          ) : (
                            'يرجى اختيار مبلغ الشحن'
                          )}
                        </span>
                      )}
                    </button>
  
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => {
                        setSelectedGarage(null);
                        setSelectedTopupAmount(null);
                      }}
                      className="w-full py-2.5 rounded-xl text-slate-500 dark:text-slate-400 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      إلغاء
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
  
    </>
  );
};
