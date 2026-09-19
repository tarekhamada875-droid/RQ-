import React, { useState } from 'react';
import { Shield, Key, Check, Loader2 } from 'lucide-react';
import { normalizeDigits } from '../../utils';
import { firestoreService } from '../../services';
import { apiFetch } from '../../api/apiClient';

interface AdminPinSettingsViewProps {
  currentAdminPin?: string;
  onCancel: () => void;
  t: (key: string) => string;
}

export const AdminPinSettingsView: React.FC<AdminPinSettingsViewProps> = ({
  currentAdminPin: _currentAdminPin,
  onCancel,
  t,
}) => {
  const [isAdminPinVerified, setIsAdminPinVerified] = useState<boolean>(false);
  const [currentPinAttempt, setCurrentPinAttempt] = useState<string>('');
  const [newAdminPinValue, setNewAdminPinValue] = useState<string>('');
  const [adminPinError, setAdminPinError] = useState<string>('');
  const [adminPinSuccess, setAdminPinSuccess] = useState<string>('');
  const [isSavingAdminPin, setIsSavingAdminPin] = useState<boolean>(false);

  const [isVerifyingCurrent, setIsVerifyingCurrent] = useState<boolean>(false);

  const handleVerifyCurrentPin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdminPinError('');
    setAdminPinSuccess('');

    const attempt = normalizeDigits(currentPinAttempt).replace(/\D/g, '');

    if (attempt.length < 4) {
      setAdminPinError('أدخل رمز الدخول الحالي للمتابعة.');
      return;
    }

    setIsVerifyingCurrent(true);
    try {
      const data = await apiFetch('/api/auth/verify-admin-pin', {
        method: 'POST',
        body: { pin: attempt }
      });
      if (data && data.valid) {
        setIsAdminPinVerified(true);
      } else {
        setAdminPinError('رمز الدخول الحالي غير صحيح.');
      }
    } catch {
      setAdminPinError('تعذر التحقق من رمز الدخول. تحقق من الاتصال وحاول مرة أخرى.');
    } finally {
      setIsVerifyingCurrent(false);
    }
  };

  const handleSaveNewPin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdminPinError('');
    setAdminPinSuccess('');

    const newPin = normalizeDigits(newAdminPinValue).replace(/\D/g, '');
    const attempt = normalizeDigits(currentPinAttempt).replace(/\D/g, '');

    if (!/^\d{8}$/.test(newPin)) {
      setAdminPinError('رمز الدخول الجديد يجب أن يتكون من 8 أرقام بالضبط.');
      return;
    }

    if (newPin === attempt) {
      setAdminPinError('رمز الدخول الجديد يجب أن يكون مختلفاً عن الرمز الحالي.');
      return;
    }

    setIsSavingAdminPin(true);
    try {
      const pinCheck = await firestoreService.isPinTaken(newPin);
      if (pinCheck.taken) {
        setAdminPinError(`هذا الرمز السري مستخدم بالفعل في حساب آخر: (${pinCheck.name} - ${pinCheck.role})`);
        setIsSavingAdminPin(false);
        return;
      }

      await firestoreService.updateAdminPin(newPin, attempt);
      setAdminPinSuccess('تم تغيير رمز الدخول بنجاح.');
      setCurrentPinAttempt('');
      setNewAdminPinValue('');
      setIsAdminPinVerified(false);

      window.setTimeout(() => {
        setAdminPinSuccess('');
        onCancel();
      }, 1200);
    } catch (error: any) {
      console.error('Failed to update admin PIN:', error);
      setAdminPinError(error?.message || 'تعذر حفظ رمز الدخول. تحقق من الاتصال وحاول مرة أخرى.');
    } finally {
      setIsSavingAdminPin(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto font-sans">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-10 shadow-xl transition-colors relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-full -mr-16 -mt-16 pointer-events-none" />
        
        {!isAdminPinVerified ? (
          /* Stage 1: Identity verification */
          <div>
            <div className="mb-8 text-center space-y-3 relative z-10">
              <div className="w-14 h-14 bg-red-500/10 dark:bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <Shield className="w-7 h-7 text-red-600 dark:text-red-400 stroke-[2.5]" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t('التحقق من الهوية')}
              </h2>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 max-w-md mx-auto text-balance">
                {t('أدخل رمز الدخول الحالي للمتابعة')}
              </p>
            </div>

            <form onSubmit={handleVerifyCurrentPin} className="space-y-6 relative z-10">
              <div className="space-y-4 text-center">
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={currentPinAttempt}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setCurrentPinAttempt(val);
                  }}
                  maxLength={10}
                  aria-label="رمز الدخول الحالي"
                  required
                  placeholder="••••"
                  className="w-full max-w-xs mx-auto text-center p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-black text-2xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-red-500 dark:focus:border-red-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all tracking-[0.5em] font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 sm:gap-4 pt-2">
                <button
                  type="submit"
                  disabled={isVerifyingCurrent}
                  className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm sm:text-base rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all outline-none cursor-pointer"
                >
                  {isVerifyingCurrent ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Check className="w-5 h-5 stroke-[3]" />
                  )}
                  <span>{t('تأكيد ودخول')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewAdminPinValue('');
                    setAdminPinError('');
                    setAdminPinSuccess('');
                    setCurrentPinAttempt('');
                    setIsAdminPinVerified(false);
                    onCancel();
                  }}
                  className="px-6 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-extrabold text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center"
                >
                  {t('رجوع')}
                </button>
              </div>
              {adminPinError && (
                <p role="alert" className="mt-4 text-center text-sm font-black text-red-500">
                  {adminPinError}
                </p>
              )}
            </form>
          </div>
        ) : (
          /* Stage 2: Verified - Set a new admin passcode */
          <div>
            <div className="mb-8 text-center space-y-3 relative z-10">
              <div className="w-14 h-14 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <Key className="w-7 h-7 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {t('رمز دخول الآدمن')}
              </h2>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 max-w-md mx-auto text-balance">
                {t('أدخل رمز دخول جديداً (8 أرقام)')}
              </p>
            </div>

            <form onSubmit={handleSaveNewPin} className="space-y-6 relative z-10">
              <div className="space-y-4 text-center">
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={newAdminPinValue}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setNewAdminPinValue(val);
                  }}
                  maxLength={8}
                  minLength={8}
                  aria-label="رمز الدخول الجديد"
                  required
                  placeholder="••••••••"
                  className="w-full max-w-xs mx-auto text-center p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-black text-2xl text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all tracking-[0.5em] font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 sm:gap-4 pt-2">
                <button
                  type="submit"
                  disabled={isSavingAdminPin}
                  className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm sm:text-base rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all outline-none cursor-pointer"
                >
                  {isSavingAdminPin ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>جارٍ الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 stroke-[3]" />
                      <span>{t('حفظ رمز الدخول')}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewAdminPinValue('');
                    setAdminPinError('');
                    setAdminPinSuccess('');
                    setIsAdminPinVerified(false);
                  }}
                  className="px-6 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-extrabold text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center"
                >
                  {t('رجوع')}
                </button>
              </div>
              {adminPinError && (
                <p role="alert" className="mt-4 text-center text-sm font-black text-red-500">
                  {adminPinError}
                </p>
              )}
              {adminPinSuccess && (
                <p role="status" className="mt-4 text-center text-sm font-black text-emerald-500">
                  {adminPinSuccess}
                </p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
