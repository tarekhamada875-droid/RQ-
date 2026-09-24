/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, memo } from 'react';
import {
  Users,
  Plus,
  Shield,
  RefreshCw,
  Trash2,
  Check,
  Loader2,
  Briefcase
} from 'lucide-react';
import { Delegate, Supervisor, Garage } from '../../types';
import { firestoreService } from '../../services';
import { generateSafePin, normalizeDigits, formatDisplayPin } from '../../utils';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { AdminConfirmDialog } from './AdminConfirmDialog';

interface AdminPeopleViewProps {
  delegates: Delegate[];
  supervisors: Supervisor[];
  currentSupervisor: Supervisor | null;
  allGarages?: Garage[];
  onSelectDelegate: (delegate: Delegate) => void;
}

export const AdminPeopleView = memo(({
  delegates,
  supervisors,
  currentSupervisor,
  allGarages = [],
  onSelectDelegate
}: AdminPeopleViewProps) => {
  const { adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);
  const [subTab, setSubTab] = useState<'delegates' | 'supervisors'>('delegates');

  // If user is a supervisor, ensure subTab can never be anything other than delegates
  useEffect(() => {
    if (currentSupervisor && subTab !== 'delegates') {
      setSubTab('delegates');
    }
  }, [currentSupervisor, subTab]);

  // Delegates State
  const [delegateForm, setDelegateForm] = useState({ name: '', phone: '', pin: '' });
  const [delegatePinError, setDelegatePinError] = useState('');
  const [isSubmittingDelegate, setIsSubmittingDelegate] = useState(false);

  // Supervisors State
  const [supervisorForm, setSupervisorForm] = useState({ name: '', phone: '', pin: '' });
  const [supervisorPinError, setSupervisorPinError] = useState('');
  const [isSubmittingSupervisor, setIsSubmittingSupervisor] = useState(false);
  const [supervisorToDelete, setSupervisorToDelete] = useState<Supervisor | null>(null);
  const [editingSupervisorPinId, setEditingSupervisorPinId] = useState<string | null>(null);
  const [editingSupervisorPinValue, setEditingSupervisorPinValue] = useState('');
  const [isUpdatingSupervisorPin, setIsUpdatingSupervisorPin] = useState(false);

  const handleCreateDelegate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingDelegate) return;
    setDelegatePinError('');
    const cleanName = (delegateForm.name || '').trim();
    const cleanPhone = normalizeDigits(delegateForm.phone || '').trim();
    const cleanPin = normalizeDigits(delegateForm.pin || '').replace(/\D/g, '');
    if (!cleanName || !cleanPhone) return;
    if (!/^\d{8}$/.test(cleanPin)) {
      setDelegatePinError(adminLang === 'en' ? 'PIN must be exactly 8 digits.' : 'رمز الدخول يجب أن يكون 8 أرقام بالضبط.');
      return;
    }

    setIsSubmittingDelegate(true);
    try {
      const pinCheck = await firestoreService.isPinTaken(cleanPin);
      if (pinCheck.taken) {
        setDelegatePinError(`هذا الرمز السري مستخدم بالفعل في حساب آخر: (${pinCheck.name} - ${pinCheck.role})`);
        setIsSubmittingDelegate(false);
        return;
      }
      await firestoreService.addDelegate({
        name: cleanName,
        phone: cleanPhone,
        pin: cleanPin,
        totalRechargedAmount: 0,
        role: 'delegate',
        createdAt: new Date()
      });
      setDelegateForm({ name: '', phone: '', pin: '' });
      setDelegatePinError('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingDelegate(false);
    }
  };

  const handleCreateSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingSupervisor) return;
    setSupervisorPinError('');
    const cleanName = (supervisorForm.name || '').trim();
    const cleanPhone = normalizeDigits(supervisorForm.phone || '').trim();
    const cleanPin = normalizeDigits(supervisorForm.pin || '').replace(/\D/g, '');
    if (!cleanName || !cleanPhone) return;
    if (!/^\d{8}$/.test(cleanPin)) {
      setSupervisorPinError(adminLang === 'en' ? 'PIN must be exactly 8 digits.' : 'رمز الدخول يجب أن يكون 8 أرقام بالضبط.');
      return;
    }

    setIsSubmittingSupervisor(true);
    try {
      const pinCheck = await firestoreService.isPinTaken(cleanPin);
      if (pinCheck.taken) {
        setSupervisorPinError(`هذا الرمز السري مستخدم بالفعل في حساب آخر: (${pinCheck.name} - ${pinCheck.role})`);
        setIsSubmittingSupervisor(false);
        return;
      }
      await firestoreService.addSupervisor({
        name: cleanName,
        phone: cleanPhone,
        pin: cleanPin,
        role: 'supervisor',
        createdAt: new Date()
      });
      setSupervisorForm({ name: '', phone: '', pin: '' });
      setSupervisorPinError('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingSupervisor(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub tabs */}
      {!currentSupervisor && (
        <div className="bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-1.5 max-w-md mx-auto mb-6">
          <button
            type="button"
            onClick={() => setSubTab('delegates')}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl font-black text-[11px] sm:text-xs transition-all cursor-pointer ${
              subTab === 'delegates'
                ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="text-mobile-wrap text-center leading-tight">{t('المناديب')}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 ${
              subTab === 'delegates'
                ? 'bg-amber-400 text-slate-900 dark:bg-slate-950 dark:text-amber-400'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {delegates.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('supervisors')}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl font-black text-[11px] sm:text-xs transition-all cursor-pointer ${
              subTab === 'supervisors'
                ? 'bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="text-mobile-wrap text-center leading-tight">{t('المشرفين')}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 ${
              subTab === 'supervisors'
                ? 'bg-amber-400 text-slate-900 dark:bg-slate-950 dark:text-amber-400'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {supervisors.length}
            </span>
          </button>
        </div>
      )}

      {/* Delegates Section */}
      {subTab === 'delegates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Delegate Form */}
          <section className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="text-base font-black text-slate-900 dark:text-white mb-5 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
                  <Plus className="w-4 h-4 stroke-[3]" />
                </div>
                <span>{t('إضافة مندوب جديد')}</span>
              </h3>

              <form onSubmit={handleCreateDelegate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('اسم المندوب')}</label>
                  <input
                    value={delegateForm.name}
                    onChange={(e) => setDelegateForm({ ...delegateForm, name: e.target.value.replace(/[0-9]/g, '') })}
                    placeholder={t('الاسم الثلاثي...')}
                    required
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('رقم الموبايل')}</label>
                  <input
                    value={delegateForm.phone}
                    onChange={(e) => setDelegateForm({ ...delegateForm, phone: e.target.value.replace(/\D/g, '') })}
                    placeholder="01xxxxxxxxx"
                    required
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('رمز الدخول (8 أرقام)')}</label>
                  <div className="relative">
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={delegateForm.pin}
                      onChange={(e) => setDelegateForm({ ...delegateForm, pin: normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8) })}
                      placeholder="••••••••"
                      minLength={8}
                      maxLength={8}
                      pattern="[0-9]{8}"
                      required
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-black text-slate-900 dark:text-white outline-none focus:border-emerald-500 text-center tracking-[0.3em] transition-all px-10"
                    />
                    <button
                      type="button"
                      onClick={() => setDelegateForm({ ...delegateForm, pin: generateSafePin(delegates.map(d => d.pin)) })}
                      className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                      title={t('توليد رقم سري عشوائي')}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {delegatePinError && (
                    <p className="text-[11px] font-bold text-rose-500 dark:text-rose-400 mt-1">{delegatePinError}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingDelegate}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  {isSubmittingDelegate ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <>
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>{t('إضافة المندوب')}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>

          {/* Delegates Directory */}
          <section className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-500" />
                  <span>{t('المندوبين المعتمدين')}</span>
                </h3>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {delegates.length} {t('مندوب')}
                </span>
              </div>

              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {delegates.map((d) => {
                  if (currentSupervisor) {
                    const assignedGaragesCount = d.garageCount ?? (allGarages || []).filter(g => g.createdByDelegateId === d.id).length;
                    const isDelegateActive = d.isActive !== false;

                    return (
                      <div
                        key={d.id}
                        className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-xl flex flex-col justify-between h-32 transition-all shadow-xs text-right"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center font-black text-xs shrink-0">
                            {d.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-mobile-wrap font-black text-slate-900 dark:text-white text-xs leading-snug">
                              {d.name}
                            </h4>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-1 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 dark:text-slate-400 font-bold">{t('الحالة:')}</span>
                            <span className={`font-black ${isDelegateActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                              {isDelegateActive ? t('نشط') : t('غير نشط')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 dark:text-slate-400 font-bold">{t('الجراجات التابعة:')}</span>
                            <span className="font-mono font-black text-slate-800 dark:text-slate-200">
                              {assignedGaragesCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={d.id}
                      onClick={() => onSelectDelegate(d)}
                      className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-xl hover:border-emerald-500 cursor-pointer group flex flex-col justify-between h-36 transition-all shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center font-black text-xs shrink-0">
                            {d.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-mobile-wrap font-black text-slate-900 dark:text-white text-xs leading-snug group-hover:text-emerald-600 transition-colors">
                              {d.name}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{d.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1 font-mono">
                          <span className="text-slate-400">{t('PIN:')}</span>
                          <span className="font-black text-emerald-600 dark:text-emerald-400">{formatDisplayPin(d.pin)}</span>
                        </div>
                        <span className="font-mono font-black text-slate-700 dark:text-slate-300">
                          +{(d.totalRechargedAmount || 0).toLocaleString()} {t('ج.م')}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {delegates.length === 0 && (
                  <div className="col-span-full py-12 text-center text-xs font-bold text-slate-400">
                    {t('لا يوجد مندوبين مسجلين في النظام')}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Supervisors Section */}
      {subTab === 'supervisors' && !currentSupervisor && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Supervisor Form */}
          <section className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="text-base font-black text-slate-900 dark:text-white mb-5 flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-500/10 text-purple-600 rounded-xl flex items-center justify-center">
                  <Plus className="w-4 h-4 stroke-[3]" />
                </div>
                <span>{t('إضافة مشرف جديد')}</span>
              </h3>

              <form onSubmit={handleCreateSupervisor} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('اسم المشرف')}</label>
                  <input
                    value={supervisorForm.name}
                    onChange={(e) => setSupervisorForm({ ...supervisorForm, name: e.target.value.replace(/[0-9]/g, '') })}
                    placeholder={t('الاسم...')}
                    required
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('رقم الموبايل')}</label>
                  <input
                    value={supervisorForm.phone}
                    onChange={(e) => setSupervisorForm({ ...supervisorForm, phone: e.target.value.replace(/\D/g, '') })}
                    placeholder="01xxxxxxxxx"
                    required
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-purple-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('رمز الدخول (8 أرقام)')}</label>
                  <div className="relative">
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={supervisorForm.pin}
                      onChange={(e) => setSupervisorForm({ ...supervisorForm, pin: normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8) })}
                      placeholder="••••••••"
                      minLength={8}
                      maxLength={8}
                      pattern="[0-9]{8}"
                      required
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-black text-slate-900 dark:text-white outline-none focus:border-purple-500 text-center tracking-[0.3em] transition-all px-10"
                    />
                    <button
                      type="button"
                      onClick={() => setSupervisorForm({ ...supervisorForm, pin: generateSafePin(supervisors.map(s => s.pin)) })}
                      className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-purple-50 dark:bg-purple-950/40 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                      title={t('توليد رقم سري')}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {supervisorPinError && (
                    <p className="text-[11px] font-bold text-rose-500 dark:text-rose-400 mt-1">{supervisorPinError}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingSupervisor}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-3.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  {isSubmittingSupervisor ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <>
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>{t('إضافة المشرف')}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>

          {/* Supervisors Directory */}
          <section className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-500" />
                  <span>{t('المشرفين المعتمدين')}</span>
                </h3>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {supervisors.length} {t('مشرف')}
                </span>
              </div>

              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {supervisors.map((s) => (
                  <div
                    key={s.id}
                    className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 rounded-xl flex flex-col justify-between h-36"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-purple-100 dark:bg-purple-950/40 text-purple-600 rounded-xl flex items-center justify-center font-black text-xs shrink-0">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="text-mobile-wrap font-black text-slate-900 dark:text-white text-xs leading-snug">{s.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{s.phone}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setSupervisorToDelete(s)}
                        className="text-slate-400 hover:text-rose-500 p-1 transition-colors"
                        title={t('حذف المشرف')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">{t('الرمز السري:')}</span>
                      {editingSupervisorPinId === s.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="tel"
                            inputMode="numeric"
                            value={editingSupervisorPinValue}
                            minLength={8}
                            maxLength={8}
                            pattern="[0-9]{8}"
                            onChange={(e) => setEditingSupervisorPinValue(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8))}
                            className="w-14 text-center font-mono font-black text-[10px] bg-white dark:bg-slate-900 border rounded px-1"
                            autoFocus
                          />
                          <button
                            onClick={async () => {
                              if (!/^\d{8}$/.test(editingSupervisorPinValue)) {
                                alert(adminLang === 'en' ? 'PIN must be exactly 8 digits.' : 'رمز الدخول يجب أن يكون 8 أرقام بالضبط.');
                                return;
                              }
                              setIsUpdatingSupervisorPin(true);
                              try {
                                const cleanPin = editingSupervisorPinValue.trim();
                                const pinCheck = await firestoreService.isPinTaken(cleanPin, s.id);
                                if (pinCheck.taken) {
                                  alert(adminLang === 'en'
                                    ? `This PIN is already used by another account (${pinCheck.name} - ${pinCheck.role})`
                                    : `هذا الرمز مستخدم بالفعل في حساب آخر: (${pinCheck.name} - ${pinCheck.role})`);
                                  setIsUpdatingSupervisorPin(false);
                                  return;
                                }

                                await firestoreService.updateSupervisor(s.id, { pin: cleanPin });
                                s.pin = cleanPin;
                                setEditingSupervisorPinId(null);
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setIsUpdatingSupervisorPin(false);
                              }
                            }}
                            className="text-emerald-600 font-bold"
                          >
                            {isUpdatingSupervisorPin ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-black text-purple-600 dark:text-purple-400">{formatDisplayPin(s.pin)}</span>
                          <button
                            onClick={() => {
                              setEditingSupervisorPinId(s.id);
                              setEditingSupervisorPinValue(s.pin && s.pin.length === 64 ? '' : (s.pin || ''));
                            }}
                            className="text-[10px] text-purple-600 hover:underline font-bold"
                          >
                            {t('تعديل')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {supervisors.length === 0 && (
                  <div className="col-span-full py-12 text-center text-xs font-bold text-slate-400">
                    {t('لا يوجد مشرفين مسجلين')}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Delete Supervisor Confirmation Modal */}
      <AdminConfirmDialog
        isOpen={!!supervisorToDelete}
        title={adminLang === 'en' ? 'Delete Supervisor' : t('حذف المشرف')}
        message={adminLang === 'en'
          ? `Are you sure you want to delete supervisor "${supervisorToDelete?.name}"?`
          : `${t('هل أنت متأكد من حذف المشرف')} "${supervisorToDelete?.name}"؟`}
        type="danger"
        confirmText={adminLang === 'en' ? 'Delete' : t('حذف')}
        cancelText={adminLang === 'en' ? 'Cancel' : t('إلغاء')}
        onConfirm={async () => {
          if (supervisorToDelete) {
            await firestoreService.removeSupervisor(supervisorToDelete.id);
            setSupervisorToDelete(null);
          }
        }}
        onCancel={() => setSupervisorToDelete(null)}
      />
    </div>
  );
});
