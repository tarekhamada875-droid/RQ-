import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  RefreshCw
} from 'lucide-react';
import { Garage } from '../../types';
import { Spinner } from '../ui/Spinner';
import { generateSafePin, normalizeDigits } from '../../utils';

interface AdminAddGarageModalProps {
  isOpen: boolean;
  onClose: () => void;
  garageForm: {
    name: string;
    hourlyRate: string;
    overnightRate: string;
    phone: string;
    isTrial: boolean;
    ownerPin: string;
  };
  setGarageForm: React.Dispatch<React.SetStateAction<{
    name: string;
    hourlyRate: string;
    overnightRate: string;
    phone: string;
    isTrial: boolean;
    ownerPin: string;
  }>>;
  pinInput: string;
  setPinInput: (pin: string) => void;
  allGarages: Garage[];
  isLoading: boolean;
  trialDays?: number;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  t: (key: string) => string;
}

export const AdminAddGarageModal: React.FC<AdminAddGarageModalProps> = ({
  isOpen,
  onClose,
  garageForm,
  setGarageForm,
  pinInput,
  setPinInput,
  allGarages,
  isLoading,
  trialDays = 15,
  onSubmit,
  t,
}) => {
  // Local state for fast, un-interrupted typing
  const [localForm, setLocalForm] = useState({
    name: '',
    hourlyRate: '',
    overnightRate: '',
    phone: '',
    isTrial: false,
    ownerPin: ''
  });
  const [localPin, setLocalPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync initial values on open
  useEffect(() => {
    if (isOpen) {
      setLocalForm({
        name: garageForm?.name || '',
        hourlyRate: garageForm?.hourlyRate || '',
        overnightRate: garageForm?.overnightRate || '',
        phone: garageForm?.phone || '',
        isTrial: garageForm?.isTrial || false,
        ownerPin: garageForm?.ownerPin || ''
      });
      setLocalPin(pinInput || '');
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sanitizeNumeric = (val: string) => normalizeDigits(val).replace(/\D/g, '');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 dark:bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl relative z-10 my-auto overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl transition-colors"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-20 transition-colors">
          <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-slate-900 dark:bg-slate-800 rounded-xl sm:rounded-2xl flex items-center justify-center text-white transition-colors shrink-0">
              <Plus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
            </div>
            <div className="flex flex-col text-right">
              <span>{t('إضافة جراج جديد')}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">{t('تسجيل جراج جديد وتحديد التعريفة')}</span>
            </div>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 bg-red-500 dark:bg-red-600 text-white rounded-xl flex shrink-0 items-center justify-center hover:bg-red-600 dark:hover:bg-red-700 transition-colors outline-none cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-5 sm:p-8 max-h-[80vh] max-h-[80dvh] overflow-y-auto custom-scrollbar-slate">
          <div className="transition-colors">
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-600 dark:text-red-400 text-xs font-bold text-center">
                {errorMessage}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setErrorMessage(null);
                const hourlyNum = Number(localForm.hourlyRate) || 0;
                const overnightNum = Number(localForm.overnightRate) || 0;
                if (!/^\d{8}$/.test(localPin)) {
                  setErrorMessage('رمز الدخول يجب أن يكون 8 أرقام');
                  return;
                }
                if (hourlyNum <= 0 && overnightNum <= 0) {
                  setErrorMessage('يجب إدخال سعر الساعة أو سعر المبيت على الأقل');
                  return;
                }
                setGarageForm(localForm);
                setPinInput(localPin);
                await onSubmit(e);
                const emptyForm = {
                  name: '',
                  hourlyRate: '',
                  overnightRate: '',
                  phone: '',
                  isTrial: false,
                  ownerPin: ''
                };
                setLocalForm(emptyForm);
                setGarageForm(emptyForm);
                setLocalPin('');
                setPinInput('');
              }}
              className="space-y-6"
            >
              <div className="space-y-2 text-center">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-black">{t('اسم الجراج')}</label>
                <input
                  name="name"
                  placeholder={t('اسم الجراج...')}
                  value={localForm.name}
                  onChange={(e) => setLocalForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-center focus:border-slate-900 dark:focus:border-emerald-500 outline-none text-lg transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 text-center">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-black">{t('سعر الساعة')}</label>
                  <div className="relative">
                    <input
                      name="hourlyRate"
                      type="text"
                      inputMode="numeric"
                      placeholder="10"
                      value={localForm.hourlyRate}
                      onChange={(e) => {
                        const val = sanitizeNumeric(e.target.value);
                        setLocalForm(prev => ({ ...prev, hourlyRate: val }));
                      }}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-center focus:border-slate-900 dark:focus:border-emerald-500 outline-none font-mono text-xl transition-all"
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] text-slate-300 dark:text-slate-600 font-bold">{t('ج.م')}</span>
                  </div>
                </div>
                <div className="space-y-2 text-center">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-black">{t('سعر المبيت')}</label>
                  <div className="relative">
                    <input
                      name="overnightRate"
                      type="text"
                      inputMode="numeric"
                      placeholder="50"
                      value={localForm.overnightRate}
                      onChange={(e) => {
                        const val = sanitizeNumeric(e.target.value);
                        setLocalForm(prev => ({ ...prev, overnightRate: val }));
                      }}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-center focus:border-slate-900 dark:focus:border-emerald-500 outline-none font-mono text-xl transition-all"
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] text-slate-300 dark:text-slate-600 font-bold">{t('ج.م')}</span>
                  </div>
                </div>
              </div>

              <input type="hidden" name="billingModel" value="subscription" />

              {/* Free Trial Toggle */}
              <div
                id="trial-toggle-container"
                onClick={() => setLocalForm(prev => ({ ...prev, isTrial: !prev.isTrial }))}
                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all duration-200 select-none ${
                  localForm.isTrial
                    ? 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/50 dark:border-emerald-500/50 shadow-sm shadow-emerald-500/5'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="text-right space-y-0.5 flex-1 min-w-0 pr-2">
                  <span className={`text-xs sm:text-sm font-bold block truncate transition-colors ${
                    localForm.isTrial ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-900 dark:text-white'
                  }`}>
                    {t('تفعيل فترة تجريبية مجانية')} ({trialDays} {t('يوم')})
                  </span>
                  <span className={`text-[11px] block truncate transition-colors ${
                    localForm.isTrial ? 'text-emerald-600 dark:text-emerald-400/80' : 'text-slate-400 dark:text-slate-400'
                  }`}>
                    {t('صلاحية مجانية لمدة')} {trialDays} {t('يوماً للجراج الجديد')}
                  </span>
                </div>

                <div
                  className="relative shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  dir="ltr"
                >
                  <input
                    type="checkbox"
                    id="admin-trial-checkbox"
                    name="isTrial"
                    checked={localForm.isTrial}
                    onChange={(e) => setLocalForm(prev => ({ ...prev, isTrial: e.target.checked }))}
                    className="sr-only"
                  />
                  <input type="hidden" name="isTrial" value={localForm.isTrial ? 'true' : 'false'} />
                  <input type="hidden" name="trialDays" value={trialDays} />

                  <button
                    type="button"
                    role="switch"
                    aria-checked={localForm.isTrial}
                    onClick={() => setLocalForm(prev => ({ ...prev, isTrial: !prev.isTrial }))}
                    className={`w-12 h-7 rounded-full transition-colors duration-200 ease-in-out relative focus:outline-none flex items-center p-0.5 ${
                      localForm.isTrial ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                        localForm.isTrial ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-2 uppercase tracking-widest text-center block font-black">{t('رقم الموبايل (اختياري)')}</label>
                  <input
                    name="phone"
                    placeholder="01xxxxxxxxx"
                    value={localForm.phone}
                    onChange={(e) => {
                      const val = sanitizeNumeric(e.target.value);
                      setLocalForm(prev => ({ ...prev, phone: val }));
                    }}
                    className="w-full p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-slate-900 dark:focus:border-emerald-500 outline-none font-mono font-bold tracking-wider text-center transition-all"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-2 uppercase tracking-widest text-center block font-black">{t('رمز الدخول (PIN)')}</label>
                  <div className="relative">
                    <input
                      name="pin"
                      type="tel"
                      inputMode="numeric"
                      value={localPin}
                      onChange={(e) => {
                        const val = sanitizeNumeric(e.target.value).slice(0, 8);
                        setLocalPin(val);
                        setPinInput(val);
                      }}
                      placeholder="12345678"
                      minLength={8}
                      maxLength={8}
                      pattern="[0-9]{8}"
                      required
                      className="w-full p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-slate-900 dark:focus:border-emerald-500 outline-none font-mono font-bold tracking-[0.5em] text-center transition-all pl-14"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newPin = generateSafePin(allGarages.map(g => g.pin));
                        setLocalPin(newPin);
                        setPinInput(newPin);
                      }}
                      className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                      title={t('توليد رقم سري عشوائي')}
                    >
                      <RefreshCw className="w-5 h-5 mx-auto" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>

              {/* الجراج المُرشِّح (اختياري) */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-2 uppercase tracking-widest text-center block font-black">
                  {t('الجراج المُرشِّح / تمت الإحالة بواسطة (اختياري)')}
                </label>
                <select
                  name="referredByGarageId"
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold outline-none focus:border-slate-900 dark:focus:border-emerald-500 text-center transition-all"
                  dir="rtl"
                >
                  <option value="">{t('بدون ترشيح / مباشر')}</option>
                  {allGarages.filter(g => g.status !== 'pending').map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.phone || t('بدون هاتف')})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-slate-900 dark:bg-emerald-600 text-white py-5 rounded-xl font-bold text-lg hover:bg-slate-800 dark:hover:bg-emerald-700 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-4 mt-4 uppercase tracking-widest transition-all duration-150 outline-none cursor-pointer shadow-sm"
              >
                {isLoading ? <Spinner /> : (
                  <>
                    <Plus className="w-5 h-5" />
                    <span>{t('حفظ وإضافة الجراج')}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
