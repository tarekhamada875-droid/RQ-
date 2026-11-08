import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  X,
  RefreshCw,
  Gift
} from 'lucide-react';
import { Garage } from '../../types';
import { Spinner } from '../ui/Spinner';
import { IconButton } from '../ui/IconButton';
import { FastInput, type FastInputHandle } from '../ui/FastInput';
import { generateSafePin } from '../../utils/pins';
import { normalizeDigits } from '../../utils/plates';
import { useModalA11y } from '../../hooks/useModalA11y';

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
  // PERF (audit 2026-11-08): FastInput imperative handle so the "generate
  // safe PIN" button and form-reset can imperatively set the PIN field's
  // DOM value without going through a controlled-value round-trip.
  const garagePinInputRef = useRef<FastInputHandle>(null);

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

  const modalA11y = useModalA11y(onClose);

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
        {...modalA11y.containerProps}
      >
        {/* Header — lighter, cleaner */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-20 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Plus className="w-5 h-5 stroke-[3]" />
            </div>
            <div className="text-right">
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">{'إضافة جراج جديد'}</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{'تسجيل جراج جديد وتحديد التعريفة'}</p>
            </div>
          </div>
          <IconButton
            type="button"
            onClick={onClose}
            aria-label={'إغلاق'}
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
                setErrorMessage('رمز الدخول يجب أن يكون 5 أرقام');
                return;
              }
              if (hourlyNum <= 0 && overnightNum <= 0) {
                setErrorMessage('يجب إدخال سعر الساعة أو سعر المبيت على الأقل');
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
              // Imperatively clear FastInput DOM values (they're uncontrolled).
              garagePinInputRef.current?.setValue('');
            }}
            className="space-y-5"
          >
            {/* Trial credits info banner (replaces the toggle) */}
            <input type="hidden" name="isTrial" value="true" />
            <div className="flex items-center gap-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl">
              <Gift className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 leading-snug">
                {'يُمنح 100 رصيد تجربة مجاني تلقائيًا عند الإنشاء'}
              </p>
            </div>

            {/* Section 1: Identity */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="admin-add-garage-name" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{'اسم الجراج'}</label>
                <FastInput
                  name="name"
                  id="admin-add-garage-name"
                  defaultValue={localForm.name}
                  onCommit={(v) => setLocalForm(prev => ({ ...prev, name: v }))}
                  onLiveValue={(v) => setLocalForm(prev => ({ ...prev, name: v }))}
                  placeholder={'اسم الجراج...'}
                  required
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold focus:border-emerald-500 dark:focus:border-emerald-500 outline-none text-base"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="admin-add-garage-phone" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{'رقم الموبايل (اختياري)'}</label>
                <FastInput
                  name="phone"
                  id="admin-add-garage-phone"
                  defaultValue={localForm.phone}
                  onCommit={(v) => setLocalForm(prev => ({ ...prev, phone: sanitizeNumeric(v) }))}
                  onLiveValue={(v) => setLocalForm(prev => ({ ...prev, phone: sanitizeNumeric(v) }))}
                  mask={sanitizeNumeric}
                  placeholder="01xxxxxxxxx"
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-500 outline-none font-mono font-bold tracking-wider"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Section 2: Pricing */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{'التعريفة'}</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FastInput
                    name="hourlyRate"
                    id="admin-add-garage-hourly-rate"
                    type="text"
                    inputMode="numeric"
                    defaultValue={localForm.hourlyRate}
                    onCommit={(v) => setLocalForm(prev => ({ ...prev, hourlyRate: sanitizeNumeric(v) }))}
                    onLiveValue={(v) => setLocalForm(prev => ({ ...prev, hourlyRate: sanitizeNumeric(v) }))}
                    mask={sanitizeNumeric}
                    aria-label={'سعر الساعة'}
                    placeholder="10 ج.م"
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold text-center focus:border-emerald-500 dark:focus:border-emerald-500 outline-none font-mono text-lg"
                  />
                </div>
                <div>
                  <FastInput
                    name="overnightRate"
                    id="admin-add-garage-overnight-rate"
                    type="text"
                    inputMode="numeric"
                    defaultValue={localForm.overnightRate}
                    onCommit={(v) => setLocalForm(prev => ({ ...prev, overnightRate: sanitizeNumeric(v) }))}
                    onLiveValue={(v) => setLocalForm(prev => ({ ...prev, overnightRate: sanitizeNumeric(v) }))}
                    mask={sanitizeNumeric}
                    aria-label={'سعر المبيت'}
                    placeholder="50 ج.م"
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-bold text-center focus:border-emerald-500 dark:focus:border-emerald-500 outline-none font-mono text-lg"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Access PIN */}
            <div className="space-y-1.5">
              <label htmlFor="admin-add-garage-pin" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{'رمز الدخول'}</label>
              <div className="relative">
                <FastInput
                  ref={garagePinInputRef}
                  name="pin"
                  id="admin-add-garage-pin"
                  type="tel"
                  inputMode="numeric"
                  defaultValue={localPin}
                  onCommit={(v) => {
                    const val = sanitizeNumeric(v).slice(0, 5);
                    setLocalPin(val);
                    setPinInput(val);
                  }}
                  onLiveValue={(v) => {
                    const val = sanitizeNumeric(v).slice(0, 5);
                    setLocalPin(val);
                    setPinInput(val);
                  }}
                  mask={(v) => sanitizeNumeric(v).slice(0, 5)}
                  placeholder="12345"
                  minLength={5}
                  maxLength={5}
                  required
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-500 outline-none font-mono font-bold tracking-[0.3em] text-center text-lg pl-12"
                  dir="ltr"
                />
                <IconButton
                  type="button"
                  onClick={() => {
                    const newPin = generateSafePin(allGarages.map(g => g.pin));
                    setLocalPin(newPin);
                    setPinInput(newPin);
                    garagePinInputRef.current?.setValue(newPin);
                  }}
                  aria-label={'توليد رقم سري عشوائي'}
                  className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title={'توليد رقم سري عشوائي'}
                >
                  <RefreshCw className="w-4 h-4 mx-auto" strokeWidth={2} />
                </IconButton>
              </div>
            </div>

            {/* Section 4: Referral (optional) */}
            <div className="space-y-1.5">
              <label htmlFor="admin-add-garage-referrer" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {'الجراج المُرشِّح (اختياري)'}
              </label>
              <select
                name="referredByGarageId"
                id="admin-add-garage-referrer"
                className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold outline-none focus:border-emerald-500 dark:focus:border-emerald-500 transition-all"
                dir="rtl"
              >
                <option value="">{'بدون ترشيح / مباشر'}</option>
                {allGarages.filter(g => g.status !== 'pending').map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.phone || 'بدون هاتف'})
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
                  <span>{'حفظ وإضافة الجراج'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
