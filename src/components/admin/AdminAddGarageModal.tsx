import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  RefreshCw,
  Gift
} from 'lucide-react';
import { Garage } from '../../types';
import { Spinner } from '../ui/Spinner';
import { IconButton } from '../ui/IconButton';
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
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
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
  onSubmit,
  t,
}) => {
  const [localForm, setLocalForm] = useState({
    name: '',
    hourlyRate: '',
    overnightRate: '',
    phone: '',
    isTrial: true,
    ownerPin: ''
  });
  const [localPin, setLocalPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalForm({
        name: garageForm?.name || '',
        hourlyRate: garageForm?.hourlyRate || '',
        overnightRate: garageForm?.overnightRate || '',
        phone: garageForm?.phone || '',
        isTrial: true,
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
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl relative z-10 my-auto overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl transition-colors"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        {/* Header — lighter, cleaner */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-20 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Plus className="w-5 h-5 stroke-[3]" />
            </div>
            <div className="text-right">
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">{t('إضافة جراج جديد')}</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{t('تسجيل جراج جديد وتحديد التعريفة')}</p>
            </div>
          </div>
          <IconButton
            type="button"
            onClick={onClose}
            aria-label={t('إغلاق')}
            className="w-8 h-8 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg flex shrink-0 items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors outline-none cursor-pointer"
          >
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        <div className="p-5 max-h-[80vh] max-h-[80dvh] overflow-y-auto custom-scrollbar-slate">
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
              if (!/^\d{5}$/.test(localPin)) {
                setErrorMessage(t('رمز الدخول يجب أن يكون 5 أرقام'));
                return;
              }
              if (hourlyNum <= 0 && overnightNum <= 0) {
                setErrorMessage(t('يجب إدخال سعر الساعة أو سعر المبيت على الأقل'));
                return;
              }
              setGarageForm({ ...localForm, isTrial: true });
              setPinInput(localPin);
              const created = await onSubmit(e);
              if (!created) return;
              const emptyForm = {
                name: '',
                hourlyRate: '',
                overnightRate: '',
                phone: '',
                isTrial: true,
                ownerPin: ''
              };
              setLocalForm(emptyForm);
              setGarageForm(emptyForm);
              setLocalPin('');
              setPinInput('');
            }}
            className="space-y-5"
          >
            {/* Trial credits info banner (replaces the toggle) */}
            <input type="hidden" name="isTrial" value="true" />
            <div className="flex items-center gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl">
              <Gift className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 leading-snug">
                {t('يُمنح 100 رصيد تجربة مجاني تلقائيًا عند الإنشاء')}
              </p>
            </div>

            {/* Section 1: Identity */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="admin-add-garage-name" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{t('اسم الجراج')}</label>
                <input
                  name="name"
                  id="admin-add-garage-name"
                  placeholder={t('اسم الجراج...')}
                  value={localForm.name}
                  onChange={(e) => setLocalForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold focus:border-emerald-500 dark:focus:border-emerald-500 outline-none text-base transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="admin-add-garage-phone" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{t('رقم الموبايل (اختياري)')}</label>
                <input
                  name="phone"
                  id="admin-add-garage-phone"
                  placeholder="01xxxxxxxxx"
                  value={localForm.phone}
                  onChange={(e) => {
                    const val = sanitizeNumeric(e.target.value);
                    setLocalForm(prev => ({ ...prev, phone: val }));
                  }}
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-500 outline-none font-mono font-bold tracking-wider transition-all"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Section 2: Pricing */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{t('التعريفة')}</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    name="hourlyRate"
                    id="admin-add-garage-hourly-rate"
                    type="text"
                    inputMode="numeric"
                    aria-label={t('سعر الساعة')}
                    placeholder="10 ج.م"
                    value={localForm.hourlyRate}
                    onChange={(e) => {
                      const val = sanitizeNumeric(e.target.value);
                      setLocalForm(prev => ({ ...prev, hourlyRate: val }));
                    }}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold text-center focus:border-emerald-500 dark:focus:border-emerald-500 outline-none font-mono text-lg transition-all"
                  />
                </div>
                <div>
                  <input
                    name="overnightRate"
                    id="admin-add-garage-overnight-rate"
                    type="text"
                    inputMode="numeric"
                    aria-label={t('سعر المبيت')}
                    placeholder="50 ج.م"
                    value={localForm.overnightRate}
                    onChange={(e) => {
                      const val = sanitizeNumeric(e.target.value);
                      setLocalForm(prev => ({ ...prev, overnightRate: val }));
                    }}
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold text-center focus:border-emerald-500 dark:focus:border-emerald-500 outline-none font-mono text-lg transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Access PIN */}
            <div className="space-y-1.5">
              <label htmlFor="admin-add-garage-pin" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{t('رمز الدخول')}</label>
              <div className="relative">
                <input
                  name="pin"
                  id="admin-add-garage-pin"
                  type="tel"
                  inputMode="numeric"
                  value={localPin}
                  onChange={(e) => {
                    const val = sanitizeNumeric(e.target.value).slice(0, 5);
                    setLocalPin(val);
                    setPinInput(val);
                  }}
                  placeholder="12345"
                  minLength={5}
                  maxLength={5}
                  pattern="[0-9]{5}"
                  required
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-500 outline-none font-mono font-bold tracking-[0.3em] text-center text-lg transition-all pl-12"
                  dir="ltr"
                />
                <IconButton
                  type="button"
                  onClick={() => {
                    const newPin = generateSafePin(allGarages.map(g => g.pin));
                    setLocalPin(newPin);
                    setPinInput(newPin);
                  }}
                  aria-label={t('توليد رقم سري عشوائي')}
                  className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title={t('توليد رقم سري عشوائي')}
                >
                  <RefreshCw className="w-4 h-4 mx-auto" strokeWidth={2} />
                </IconButton>
              </div>
            </div>

            {/* Section 4: Referral (optional) */}
            <div className="space-y-1.5">
              <label htmlFor="admin-add-garage-referrer" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {t('الجراج المُرشِّح (اختياري)')}
              </label>
              <select
                name="referredByGarageId"
                id="admin-add-garage-referrer"
                className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-all"
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

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 dark:bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-emerald-700 dark:hover:bg-emerald-700 active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 transition-all duration-150 outline-none cursor-pointer shadow-sm"
            >
              {isLoading ? <Spinner /> : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>{t('حفظ وإضافة الجراج')}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
