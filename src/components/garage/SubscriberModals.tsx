import { Delete, Phone, Save, Trash2, User, X } from 'lucide-react';
import { EgyptianPlate } from '../ui/EgyptianPlate';
import { LicensePlateKeyboard } from './LicensePlateKeyboard';
import { formatPlateNumber, getCleanPlate, safeDate } from '../../utils';
import { getCairoDateKey } from '../../domain/garage/businessDay';

const parseDateKey = (dateKey: string | any): Date => {
  if (!dateKey) return new Date();
  if (typeof dateKey === 'string' && dateKey.length === 10 && dateKey[4] === '-' && dateKey[7] === '-') {
    const y = parseInt(dateKey.substring(0, 4), 10);
    const m = parseInt(dateKey.substring(5, 7), 10);
    const d = parseInt(dateKey.substring(8, 10), 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m - 1, d);
  }
  return safeDate(dateKey);
};

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const SubscriberModals = (props: any) => {
  const {
    showAddModal,
    setShowAddModal,
    editingSubscriber,
    plateNumber,
    setPlateNumber,
    ownerName,
    setOwnerName,
    phone,
    setPhone,
    startDate,
    endDate,
    selectedDuration,
    setSelectedDuration,
    isPlateFocused,
    setIsPlateFocused,
    handleVirtualKeyPress,
    plateContainerRef,
    keypadContainerRef,
    isSubmitting,
    handleSubmit,
    subscriberToDelete,
    setSubscriberToDelete,
    confirmDelete,
    showRenewModal,
    setShowRenewModal,
    activeSubscriberForRenew,
    setActiveSubscriberForRenew,
    handleConfirmRenew,
    formatDisplayDate,
  } = props;

  return (
    <>
        {showAddModal && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 animate-overlay-30fps" onClick={() => setShowAddModal(false)} />
            <div className="relative bg-[#faf9f6] dark:bg-slate-900 w-full max-w-md rounded-[2rem] sm:rounded-xl max-h-[90dvh] overflow-y-auto custom-scrollbar-slate animate-popup-30fps">
              
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  {editingSubscriber ? 'تعديل المشترك' : 'مشترك جديد'}
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-8 h-8 flex items-center justify-center bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-full border border-red-100 dark:border-red-900/30 outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
  
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                
                {!editingSubscriber && (
                   <div className="space-y-1">
                     <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">رقم اللوحة</label>
                     <div 
                       ref={plateContainerRef}
                       onClick={() => {
                         setIsPlateFocused(true);
                         const inputEl = plateContainerRef.current?.querySelector('input');
                         if (inputEl) {
                           inputEl.focus();
                         }
                       }}
                       className="relative h-14 w-full cursor-text"
                     >
                       {plateNumber && (
                         <button 
                           type="button"
                           onMouseDown={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                           }}
                           onClick={(e) => {
                             e.stopPropagation();
                             setPlateNumber(plateNumber.slice(0, -1));
                           }}
                           className="absolute bg-red-500 text-white rounded-xl flex items-center justify-center hover:bg-red-600 transition-colors outline-none -top-2 -left-2 w-8 h-8 z-40 shadow-md"
                         >
                           <Delete className="w-4 h-4" />
                         </button>
                       )}
                       <input 
                         type="text" 
                         inputMode="none"
                         autoComplete="off"
                         autoCorrect="off"
                         spellCheck="false"
                         value={plateNumber}
                         onChange={(e) => {
                           const clean = getCleanPlate(e.target.value);
                           setPlateNumber(clean);
                         }}
                         onFocus={() => setIsPlateFocused(true)}
                         className="absolute inset-0 w-full h-full opacity-0 z-30 cursor-text"
                         dir="rtl"
  
                       />
                       <div className="absolute inset-0 pointer-events-none z-10 flex">
                         <EgyptianPlate 
                           plateNumber={plateNumber} 
                           size="sm" 
                           className={`!w-full !h-full !max-w-none !rounded-xl !text-2xl sm:!text-3xl font-black ${isPlateFocused ? '!border-[3px] !border-blue-500 dark:!border-blue-500' : '!border-slate-900 dark:!border-black'}`} 
                         />
                       </div>
                     </div>
                   </div>
                )}
                {editingSubscriber && (
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">رقم اللوحة</label>
                      <div className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-4 text-center font-black text-slate-900 dark:text-slate-100 text-lg">
                          {formatPlateNumber(editingSubscriber.plateNumber)}
                      </div>
                    </div>
                )}
  
                {!editingSubscriber && isPlateFocused && (
                   <div ref={keypadContainerRef} className="mt-2 animate-fadeIn shrink-0">
                     <LicensePlateKeyboard 
                       onKeyPress={handleVirtualKeyPress}
                       currentValue={plateNumber}
                     />
                   </div>
                )}
  
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">اسم المالك</label>
                  <div className="relative">
                    <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value.replace(/[0-9]/g, ''))}
                      onFocus={() => setIsPlateFocused(false)}
                      className="w-full pl-4 pr-12 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:border-slate-400 dark:focus:border-slate-500 text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                      placeholder="الاسم"
                      required
                    />
                  </div>
                </div>
  
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">رقم الهاتف</label>
                  <div className="relative">
                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      onFocus={() => setIsPlateFocused(false)}
                      className="w-full pl-4 pr-12 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:border-slate-400 dark:focus:border-slate-500 text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-left hover:text-right transition-all"
                      placeholder="رقم الهاتف"
                      dir="ltr"
                      required
                    />
                  </div>
                </div>
  
                <div className="space-y-2 select-none">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">
                    مدة الاشتراك
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: '1w', label: 'أسبوع', durationLabel: '٧ أيام' },
                      { id: '2w', label: 'أسبوعين', durationLabel: '١٤ يوم' },
                      { id: '1m', label: 'شهر واحد', durationLabel: '٣٠ يوم' }
                    ].map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setSelectedDuration(d.id as any);
                          setIsPlateFocused(false);
                        }}
                        className={`py-3.5 px-2 rounded-2xl border text-center flex flex-col items-center justify-center transition-all ${
                          selectedDuration === d.id
                            ? 'bg-blue-600 border-blue-700 text-white dark:bg-blue-600 dark:border-blue-700 dark:text-white font-extrabold shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700/80'
                        }`}
                      >
                        <span className="text-sm">{d.label}</span>
                        <span className={`text-[10px] mt-0.5 opacity-80 ${selectedDuration === d.id ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                          {d.durationLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
  
                <div className="grid grid-cols-2 gap-4 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                  <div className="space-y-1 text-center">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">تاريخ البدء</span>
                    <span className="text-sm font-black text-slate-800 dark:text-slate-200">
                      {formatDisplayDate(startDate)}
                    </span>
                  </div>
                  <div className="space-y-1 text-center border-r border-slate-200/60 dark:border-slate-800/60">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">تاريخ الانتهاء</span>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                      {formatDisplayDate(endDate)}
                    </span>
                  </div>
                </div>
  
                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-black text-sm disabled:opacity-50 transition-all outline-none"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>حفظ البيانات</span>
                    </>
                  )}
                </button>
  
              </form>
            </div>
          </div>
        )}
  
        {/* Delete Subscriber Confirmation Modal */}
        {subscriberToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps">
            <div className="bg-[#faf9f6] dark:bg-slate-900 w-full max-w-sm rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 animate-popup-30fps">
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">تأكيد الحذف</h3>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">هل أنت متأكد من حذف هذا المشترك نهائياً?</p>
              </div>
              <div className="px-8 pb-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => setSubscriberToDelete(null)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all outline-none"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all outline-none"
                >
                  حذف
                </button>
              </div>
            </div>
          </div>
        )}
  
        {/* Renewal Options Modal */}
        {showRenewModal && activeSubscriberForRenew && (
          <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 animate-overlay-30fps">
            <div className="absolute inset-0" onClick={() => { setShowRenewModal(false); setActiveSubscriberForRenew(null); }} />
            <div className="relative bg-[#faf9f6] dark:bg-slate-900 w-full max-w-md rounded-[2rem] sm:rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-2xl animate-popup-30fps" dir="rtl">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
                    تجديد الاشتراك الشهري
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowRenewModal(false);
                    setActiveSubscriberForRenew(null);
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-full border border-red-100 dark:border-red-900/30 outline-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
  
              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span>اسم المشترك:</span>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">{activeSubscriberForRenew.ownerName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>رقم اللوحة:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100 font-black">{formatPlateNumber(activeSubscriberForRenew.plateNumber)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-dashed border-slate-200 dark:border-slate-700 pt-2 mt-1">
                    <span>تاريخ الانتهاء الحالي:</span>
                    <span className="font-black text-blue-500">{activeSubscriberForRenew.endDate}</span>
                  </div>
                </div>
  
                <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pr-1">خيارات التوقيت والخصم المتاحة:</p>
                
                <div className="space-y-3">
                  {[{ type: 'week' as const, label: 'تجديد لمدة أسبوع', days: 7 },
                    { type: 'two_weeks' as const, label: 'تجديد لمدة أسبوعين', days: 14 },
                    { type: 'month' as const, label: 'تجديد لمدة شهر واحد', days: null }].map((opt) => {
                    
                    // Calculate dynamic future expiration date preview
                    const todayKey = getCairoDateKey();
                    const today = parseDateKey(todayKey);
                    const currentEndDate = parseDateKey(activeSubscriberForRenew.endDate);
                    const baseDate = currentEndDate >= today ? currentEndDate : today;
                    const previewNewEndDate = new Date(baseDate);
                    if (opt.days) {
                      previewNewEndDate.setDate(previewNewEndDate.getDate() + opt.days);
                    } else {
                      previewNewEndDate.setMonth(previewNewEndDate.getMonth() + 1);
                    }
                    const previewDateStr = formatDateKey(previewNewEndDate);
                    
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleConfirmRenew(opt.type)}
                        className="w-full text-right p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-[#faf9f6] dark:bg-slate-900 hover:bg-blue-50/10 dark:hover:bg-blue-400/5 transition-all outline-none flex items-center justify-between group active:scale-[0.98] disabled:opacity-50"
                      >
                        <div className="space-y-1">
                          <p className="font-black text-slate-900 dark:text-white text-sm group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">{opt.label}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">ينتهي في: <span className="text-slate-600 dark:text-slate-300 font-extrabold">{previewDateStr}</span></p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
  
    </>
  );
};
