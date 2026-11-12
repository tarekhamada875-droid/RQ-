import { Check, CheckCircle2, ChevronDown, Clock, Loader2, Plus, Settings, Trash2, Users } from 'lucide-react';
import { adminService, authService } from '../../services';
import { formatDisplayPin } from '../../utils/pins';
import { normalizeDigits } from '../../utils/plates';
import { classifyApiFailure, getApiFailureReference } from '../../utils/apiFailure';
import { useToast } from '../../hooks/toast';
import type { Staff } from '../../types';
import { FastInput } from '../ui/FastInput';

export const isValidStaffPin = (pin: string): boolean => /^\d{5}$/.test(pin);

/**
 * Returns a NEW staff list with the matched staff's `pin` replaced.
 * Pure: does NOT mutate the input array or any of its element objects.
 * Exported so the immutability contract can be pinned by a regression test.
 */
export const applyStaffPinUpdate = (
  staffList: Staff[],
  staffId: string,
  newPin: string,
): Staff[] => staffList.map(st => st.id === staffId ? { ...st, pin: newPin } : st);

interface RateCheck {
  allowed: boolean;
  daysRemaining: number;
  nextAllowedDate: Date | null;
}

interface AdminGarageSettingsSectionProps {
  isZone3Open: boolean;
  setIsZone3Open: (open: boolean) => void;
  rateCheck: RateCheck;
  hourlyRateInput: string;
  setHourlyRateInput: (value: string) => void;
  overnightRateInput: string;
  setOvernightRateInput: (value: string) => void;
  hasRateChanges: boolean;
  isSavingRates: boolean;
  handleSaveRates: () => Promise<void> | void;
  staffList: Staff[];
  setStaffList: React.Dispatch<React.SetStateAction<Staff[]>>;
  openAddStaffModal: () => void;
  editingStaffPinId: string | null;
  setEditingStaffPinId: (id: string | null) => void;
  editingStaffPinValue: string;
  setEditingStaffPinValue: (value: string) => void;
  isUpdatingStaffPin: boolean;
  setIsUpdatingStaffPin: (updating: boolean) => void;
  setStaffToDelete: (staff: Staff | null) => void;
}

export const AdminGarageSettingsSection = ({
  isZone3Open,
  setIsZone3Open,
  rateCheck,
  hourlyRateInput,
  setHourlyRateInput,
  overnightRateInput,
  setOvernightRateInput,
  hasRateChanges,
  isSavingRates,
  handleSaveRates,
  staffList,
  setStaffList,
  openAddStaffModal,
  editingStaffPinId,
  setEditingStaffPinId,
  editingStaffPinValue,
  setEditingStaffPinValue,
  isUpdatingStaffPin,
  setIsUpdatingStaffPin,
  setStaffToDelete,
}: AdminGarageSettingsSectionProps) => {
  const { showToast } = useToast();

  return (
    <>
          {/* ================= ZONE 3: SETTINGS & STAFF (COLLAPSIBLE ACCORDION) ================= */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {/* Accordion Header */}
            <button
              onClick={() => setIsZone3Open(!isZone3Open)}
              className="w-full p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center justify-center font-black">
                  <Settings className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {'الإعدادات والتعريفة وطاقم العمل'}
                </h3>
              </div>
  
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">
                  {isZone3Open ? 'إخفاء' : 'عرض'}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isZone3Open ? 'rotate-180' : ''}`} />
              </div>
            </button>
  
            {/* Accordion Content */}
            {isZone3Open && (
              <div className="p-6 border-t border-slate-100 dark:border-slate-800 space-y-6 animate-in fade-in duration-200">
                {/* Pricing Rates Configuration */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-4">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="w-4 h-4 text-emerald-600" />
                    <span>{'تعريفة أسعار الركنة'}</span>
                  </h4>
  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-600 dark:text-slate-400 text-center">
                        {'سعر الساعة (ج.م)'}
                      </label>
                      <FastInput
                        type="text"
                        inputMode="numeric"
                        disabled={!rateCheck.allowed}
                        defaultValue={hourlyRateInput}
                        onCommit={(v) => setHourlyRateInput(v.replace(/\D/g, ''))}
                        onLiveValue={(v) => setHourlyRateInput(v.replace(/\D/g, ''))}
                        mask={(v) => v.replace(/\D/g, '')}
                        className={`w-full bg-white dark:bg-slate-800 border-2 rounded-xl px-4 py-3 text-lg font-black text-slate-900 dark:text-white text-center outline-none font-mono ${
                          !rateCheck.allowed
                            ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900'
                            : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-600 dark:text-slate-400 text-center">
                        {'سعر المبيت (ج.م)'}
                      </label>
                      <FastInput
                        type="text"
                        inputMode="numeric"
                        disabled={!rateCheck.allowed}
                        defaultValue={overnightRateInput}
                        onCommit={(v) => setOvernightRateInput(v.replace(/\D/g, ''))}
                        onLiveValue={(v) => setOvernightRateInput(v.replace(/\D/g, ''))}
                        mask={(v) => v.replace(/\D/g, '')}
                        className={`w-full bg-white dark:bg-slate-800 border-2 rounded-xl px-4 py-3 text-lg font-black text-slate-900 dark:text-white text-center outline-none font-mono ${
                          !rateCheck.allowed
                            ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900'
                            : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                    </div>
                  </div>
  
                  {!rateCheck.allowed ? (
                    <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-bold">
                      <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        {'تعديل التعريفة مقفل: مسموح بتعديل السعر مرة واحدة كل 30 يوماً. متبقي'} <strong className="font-mono text-amber-900 dark:text-amber-100 px-1">{rateCheck.daysRemaining}</strong> {'يوم للإتاحة القادمة.'}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 text-center">
                      {'ملاحظة: السعر الجديد يُطبق على جميع العمليات فوراً، وتُقفل إمكانية التعديل لمدة 30 يوماً.'}
                    </p>
                  )}
  
                  <button 
                    type="button"
                    disabled={!rateCheck.allowed || !hasRateChanges || isSavingRates}
                    onClick={handleSaveRates}
                    className={`w-full py-3.5 text-center rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-[colors,transform] ${
                      rateCheck.allowed && hasRateChanges 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-98 cursor-pointer' 
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    {isSavingRates ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{'جاري حفظ التعديل...'}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{'حفظ تعديل التعريفة'}</span>
                      </>
                    )}
                  </button>
                </div>
  
                {/* Staff Management Section */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-600" />
                      <span>{'طاقم عمل الجراج (الموظفين)'}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 font-mono">
                        {staffList.length}
                      </span>
                    </h4>
                    <button 
                      onClick={openAddStaffModal}
                      className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-black text-xs transition-[colors,transform] shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{'إضافة موظف'}</span>
                    </button>
                  </div>
  
                  <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar-slate">
                    {staffList.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center text-xs font-black">
                            {s.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 dark:text-white">{s.name}</p>
                            
                            {editingStaffPinId === s.id ? (
                              <div className="flex items-center gap-1 mt-1">
                                <FastInput
                                  type="tel"
                                  inputMode="numeric"
                                  defaultValue={editingStaffPinValue}
                                  onCommit={(v) => setEditingStaffPinValue(normalizeDigits(v).replace(/\D/g, '').slice(0, 5))}
                                  onLiveValue={(v) => setEditingStaffPinValue(normalizeDigits(v).replace(/\D/g, '').slice(0, 5))}
                                  mask={(v) => normalizeDigits(v).replace(/\D/g, '').slice(0, 5)}
                                  minLength={5}
                                  maxLength={5}
                                  pattern="[0-9]{5}"
                                  className="w-14 text-[10px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded px-1 text-center font-mono font-black placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                  placeholder="••••"
                                  autoFocus
                                />
                                <button
                                  onClick={async () => {
                                    if (!isValidStaffPin(editingStaffPinValue)) {
                                      showToast('رمز دخول الموظف يجب أن يتكون من 5 أرقام بالضبط.', 'error');
                                      return;
                                    }
                                    setIsUpdatingStaffPin(true);
                                    try {
                                      const pinCheck = await authService.isPinTaken(editingStaffPinValue, s.id);
                                      if (pinCheck.taken) {
                                        showToast('الرمز مستخدم بالفعل', 'error');
                                        setIsUpdatingStaffPin(false);
                                        return;
                                      }
                                      await adminService.updateStaff(s.id, { pin: editingStaffPinValue });
                                      setStaffList(prev => applyStaffPinUpdate(prev, s.id, editingStaffPinValue));
                                      setEditingStaffPinId(null);
                                    } catch (err) {
                                      console.error(err);
                                      const failure = classifyApiFailure(err);
                                      const reference = getApiFailureReference(err);
                                      let message = 'تعذر تحديث رمز الموظف. حاول مرة أخرى.';
                                      if (failure === 'network') message = 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.';
                                      else if (failure === 'timeout') message = 'انتهت مهلة تحديث رمز الموظف. تحقق من التغيير قبل إعادة المحاولة.';
                                      else if (failure === 'server') {
                                        const suffix = reference ? ` (${'رقم التتبع'}: ${reference})` : '';
                                        message = `${'حدث خطأ في الخادم أثناء تحديث رمز الموظف.'}${suffix}`;
                                      }
                                      showToast(message, 'error');
                                    } finally {
                                      setIsUpdatingStaffPin(false);
                                    }
                                  }}
                                  disabled={isUpdatingStaffPin}
                                  className="w-5 h-5 bg-emerald-600 text-white rounded flex items-center justify-center"
                                >
                                  {isUpdatingStaffPin ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[3]" />}
                                </button>
                                <button
                                  onClick={() => setEditingStaffPinId(null)}
                                  className="text-[10px] text-slate-400 hover:underline px-0.5"
                                >
                                  {'إلغاء'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-slate-400">{'الرمز:'}</span>
                                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-md text-[10px] font-mono font-black">
                                  {formatDisplayPin(s.pin)}
                                </span>
                                <button 
                                  onClick={() => {
                                    setEditingStaffPinId(s.id);
                                    setEditingStaffPinValue(s.pin && s.pin.length === 64 ? '' : (s.pin || ''));
                                  }}
                                  className="text-[10px] text-emerald-600 hover:underline font-bold"
                                >
                                  {'تعديل'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
  
                        <button 
                          onClick={() => setStaffToDelete(s)} 
                          className="w-8 h-8 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-100 transition-colors cursor-pointer"
                          title={'حذف الموظف'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
  
                    {staffList.length === 0 && (
                      <div className="text-center py-4 text-xs text-slate-400 font-bold">
                        {'لا يوجد موظفين مسجلين لهذا الجراج'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
    </>
  );
};
