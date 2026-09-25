/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo } from 'react';
import { 
  CheckCircle2, 
  Trash2, 
  Loader2, 
  Key, 
  Wallet 
} from 'lucide-react';
import { normalizeDigits } from '../../../utils';
import { Garage, Staff } from '../../../types';

interface AdminGarageModalsProps {
  garage: Garage;
  t: (key: string) => string;
  adminLang: string;
  isLoading: boolean;
  // Add Staff Modal
  showAddStaffModal: boolean;
  setShowAddStaffModal: (val: boolean) => void;
  staffForm: { name: string; pin: string };
  setStaffForm: React.Dispatch<React.SetStateAction<{ name: string; pin: string }>>;
  onAddStaffSubmit: (e: React.FormEvent) => Promise<void>;
  // Top-up Modal
  showTopupModal: boolean;
  setShowTopupModal: (val: boolean) => void;
  selectedTopupAmount: number | null;
  isTopupSuccess: boolean;
  onTopupSubmit: () => Promise<void>;
  // Staff Delete Modal
  staffToDelete: Staff | null;
  setStaffToDelete: (staff: Staff | null) => void;
  onDeleteStaff: (staffId: string) => Promise<void>;
  // Edit Owner PIN Modal
  showEditGaragePinModal: boolean;
  setShowEditGaragePinModal: (val: boolean) => void;
  garagePinInput: string;
  setGaragePinInput: (pin: string) => void;
  pinError: string;
  setPinError: (err: string) => void;
  isUpdatingGaragePin: boolean;
  onSaveGaragePin: (e: React.FormEvent) => Promise<void>;
}

export const AdminGarageModals = memo(({
  garage,
  t,
  adminLang,
  isLoading,
  showAddStaffModal,
  setShowAddStaffModal,
  staffForm,
  setStaffForm,
  onAddStaffSubmit,
  showTopupModal,
  setShowTopupModal,
  selectedTopupAmount,
  isTopupSuccess,
  onTopupSubmit,
  staffToDelete,
  setStaffToDelete,
  onDeleteStaff,
  showEditGaragePinModal,
  setShowEditGaragePinModal,
  garagePinInput,
  setGaragePinInput,
  pinError,
  setPinError,
  isUpdatingGaragePin,
  onSaveGaragePin
}: AdminGarageModalsProps) => {
  return (
    <>
      {/* Add Staff Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl p-6 animate-popup-30fps">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">{t('إضافة موظف جديد')}</h3>
            <p className="text-xs text-slate-400 font-bold mb-5">{t('أدخل اسم الموظف وسيتم استخدام الرمز الظاهر لتسجيل الدخول.')}</p>
            
            <form onSubmit={onAddStaffSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300">{t('اسم الموظف')}</label>
                <input 
                  placeholder={t('مثال: أحمد محمد')} 
                  value={staffForm.name}
                  autoFocus
                  onChange={e => setStaffForm(prev => ({ ...prev, name: e.target.value.replace(/[0-9]/g, '') }))}
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-base font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 text-center transition-all" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300">{t('الرمز السري (PIN)')}</label>
                <div className="w-full p-4 bg-slate-900 rounded-xl text-center border border-slate-800">
                  <span className="text-3xl font-black text-emerald-400 tracking-[0.25em] font-mono">{staffForm.pin}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  disabled={isLoading || !staffForm.name} 
                  className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl font-black text-sm hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{t('جاري الإضافة...')}</span>
                    </>
                  ) : (
                    <span>{t('تأكيد الإضافة')}</span>
                  )}
                </button>
                <button 
                  type="button" 
                  disabled={isLoading}
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-black text-sm hover:bg-slate-200 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {t('إلغاء')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top-up Balance Confirmation Modal */}
      {showTopupModal && selectedTopupAmount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl p-6 sm:p-8 animate-popup-30fps">
            {isTopupSuccess ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-3 shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {t('تم شحن الرصيد بنجاح')}
                </h3>
                <p className="text-xs font-bold text-slate-400 mt-1">
                  {garage.name}
                </p>
                <div className="mt-4 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-mono font-black text-base">
                  + {selectedTopupAmount.toLocaleString('en-US')} {t('ج.م')}
                </div>
              </div>
            ) : (
              <>
                <div className="text-center mb-5">
                  <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3 text-amber-500">
                    <Wallet className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    {t('تأكيد شحن الرصيد للجراج؟')}
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    {t('أنت على وشك إضافة رصيد بمقدار')} <span className="text-slate-900 dark:text-white font-black">{selectedTopupAmount.toLocaleString('en-US')} {t('ج.م')}</span> {t('لمحفظة الجراج')}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 mb-5 space-y-2 border border-slate-100 dark:border-slate-800/80 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-500">{t('الرصيد الحالي')}:</span>
                    <span className="font-black font-mono text-slate-900 dark:text-white">
                      {(garage.balance || 0).toLocaleString('en-US')} {t('ج.م')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                    <span className="font-bold">{t('المبلغ المضاف')}:</span>
                    <span className="font-black font-mono">
                      + {selectedTopupAmount.toLocaleString('en-US')} {t('ج.م')}
                    </span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                    <span className="font-black">{t('الرصيد بعد الشحن')}:</span>
                    <span className="font-black font-mono text-sm">
                      {((garage.balance || 0) + selectedTopupAmount).toLocaleString('en-US')} {t('ج.م')}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    disabled={isLoading}
                    onClick={onTopupSubmit}
                    className="flex-1 h-14 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] whitespace-nowrap"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>{t('جاري شحن الرصيد...')}</span>
                      </>
                    ) : (
                      <span>{t('تأكيد الشحن')}</span>
                    )}
                  </button>
                  <button
                    disabled={isLoading}
                    onClick={() => setShowTopupModal(false)}
                    className="flex-1 h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm hover:bg-slate-200 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center whitespace-nowrap"
                  >
                    {t('إلغاء')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Staff Delete Confirmation Modal */}
      {staffToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-center animate-popup-30fps">
            <div className="w-14 h-14 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mb-2">{t('حذف الموظف؟')}</h3>
            <p className="text-xs text-slate-400 font-bold mb-6">
              {t('هل أنت متأكد من حذف الموظف')} <span className="text-slate-900 dark:text-white font-black">"{staffToDelete.name}"</span>؟
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => onDeleteStaff(staffToDelete.id)}
                disabled={isLoading}
                className="flex-1 h-14 bg-rose-600 text-white rounded-2xl font-black text-sm hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{t('جاري الحذف...')}</span>
                  </>
                ) : (
                  <span>{t('تأكيد الحذف')}</span>
                )}
              </button>
              <button 
                disabled={isLoading}
                onClick={() => setStaffToDelete(null)}
                className="flex-1 h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-sm hover:bg-slate-200 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center"
              >
                {t('إلغاء')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Owner PIN Modal */}
      {showEditGaragePinModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps" 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEditGaragePinModal(false);
            }
          }}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-right animate-popup-30fps"
            onClick={(e) => e.stopPropagation()}
            dir={adminLang === 'en' ? 'ltr' : 'rtl'}
          >
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-emerald-900/60">
              <Key className="w-6 h-6 stroke-[2.5]" />
            </div>

            <h3 className="text-lg font-black text-slate-900 dark:text-white text-center mb-1">
              {t('تعديل رمز المالك')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center font-bold mb-6">
              {garage.name}
            </p>

            <form onSubmit={onSaveGaragePin}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                    {t('رمز الدخول الجديد (8 أرقام):')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{8}"
                    minLength={8}
                    maxLength={8}
                    value={garagePinInput}
                    onChange={(e) => {
                      setGaragePinInput(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8));
                      setPinError('');
                    }}
                    placeholder="••••"
                    autoFocus
                    className="w-full text-center text-xl font-mono font-black tracking-widest py-3 px-4 bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl text-slate-900 dark:text-white outline-none transition-all"
                  />
                  {pinError && (
                    <p className="text-xs font-bold text-rose-500 text-center mt-2 animate-shake">
                      {pinError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={isUpdatingGaragePin || !/^\d{8}$/.test(garagePinInput)}
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs sm:text-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  {isUpdatingGaragePin ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{t('جاري الحفظ...')}</span>
                    </>
                  ) : (
                    <span>{t('حفظ الرمز')}</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isUpdatingGaragePin}
                  onClick={() => setShowEditGaragePinModal(false)}
                  className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-xs sm:text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center"
                >
                  {t('إلغاء')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
});
