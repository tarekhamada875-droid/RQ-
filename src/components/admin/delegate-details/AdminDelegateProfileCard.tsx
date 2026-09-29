import React, { memo, useState } from 'react';
import { Phone, Calendar, Lock, Check, Loader2 } from 'lucide-react';
import { Delegate } from '../../../types';
import { safeDate, formatDisplayPin, normalizeDigits } from '../../../utils';
import { firestoreService } from '../../../services';
import { useAdminTranslation } from '../../../utils/adminTranslations';

interface AdminDelegateProfileCardProps {
  delegate: Delegate;
  adminLang: 'ar' | 'en';
}

export const AdminDelegateProfileCard: React.FC<AdminDelegateProfileCardProps> = memo(({
  delegate,
  adminLang
}) => {
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [pinInput, setPinInput] = useState(delegate.pin && delegate.pin.length === 64 ? '' : (delegate.pin || ''));
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const t = useAdminTranslation(adminLang);

  const handleUpdatePin = async () => {
    if (!/^\d{8}$/.test(pinInput)) {
      alert(adminLang === 'en' ? 'PIN must be exactly 8 digits' : 'يجب أن يكون الرمز 8 أرقام بالضبط');
      return;
    }
    setIsUpdatingPin(true);
    try {
      const cleanPin = pinInput.trim();
      const pinCheck = await firestoreService.isPinTaken(cleanPin, delegate.id);
      if (pinCheck.taken) {
        alert(adminLang === 'en' 
          ? `This PIN is already used by another account (${pinCheck.name} - ${pinCheck.role})`
          : `هذا الرمز مستخدم بالفعل في حساب آخر: (${pinCheck.name} - ${pinCheck.role})`);
        setIsUpdatingPin(false);
        return;
      }

      await firestoreService.updateDelegate(delegate.id, { pin: cleanPin });
      delegate.pin = cleanPin;
      setIsEditingPin(false);
    } catch {
      alert(adminLang === 'en' ? 'Failed to update PIN' : 'فشل تحديث الرمز');
    } finally {
      setIsUpdatingPin(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-100 dark:border-slate-800 p-8 transition-colors">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="flex-1 text-center sm:text-right space-y-2">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">{delegate.name}</h2>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-400 text-sm font-bold transition-colors">
              <Phone className="w-4 h-4" />
              <span dir="ltr">{delegate.phone}</span>
            </div>
            {isEditingPin ? (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl">
                <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={pinInput}
                  minLength={8}
                  maxLength={8}
                  pattern="[0-9]{8}"
                  onChange={(e) => setPinInput(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8))}
                  className="w-16 bg-transparent text-blue-600 dark:text-blue-400 text-sm font-black text-center focus:outline-none focus:ring-0 border-0 p-0 font-mono"
                  placeholder="••••"
                />
                <button
                  onClick={handleUpdatePin}
                  disabled={isUpdatingPin}
                  className="w-5 h-5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center cursor-pointer"
                >
                  {isUpdatingPin ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[3]" />}
                </button>
                <button
                  onClick={() => {
                    setPinInput(delegate.pin && delegate.pin.length === 64 ? '' : (delegate.pin || ''));
                    setIsEditingPin(false);
                  }}
                  className="text-xs font-bold text-slate-400 px-1 hover:underline"
                >
                  {t('إلغاء')}
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsEditingPin(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl text-blue-600 dark:text-blue-400 text-sm font-black transition-all hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{t('الرمز:')} {formatDisplayPin(delegate.pin)}</span>
                <span className="text-[10px] text-blue-400 dark:text-blue-500 font-bold underline mr-1 hover:text-blue-600">{t('تعديل')}</span>
              </button>
            )}
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-bold text-slate-400 dark:text-slate-500 mt-4 transition-colors">
            <Calendar className="w-4 h-4" />
            <span>{t('تاريخ الانضمام:')} {delegate.createdAt ? (adminLang === 'en' ? safeDate(delegate.createdAt).toLocaleDateString('en-US') : safeDate(delegate.createdAt).toLocaleDateString('ar-EG')) : t('غير معروف')}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

AdminDelegateProfileCard.displayName = 'AdminDelegateProfileCard';
