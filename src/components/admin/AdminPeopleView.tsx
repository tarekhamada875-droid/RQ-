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
  const [subTab, setSubTab] = useState<'delegates' | 'supervisors'>('delegates');
  const [showAddForm, setShowAddForm] = useState(false);

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
      setShowAddForm(false);
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
      setShowAddForm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingSupervisor(false);
    }
  };

  return (
    <div className="space-y-6 dir-rtl text-right font-sans max-w-6xl mx-auto px-2 sm:px-4">
      {/* Sleek Segment Switcher & Action Trigger */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        {!currentSupervisor ? (
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => { setSubTab('delegates'); setShowAddForm(false); }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer ${
                subTab === 'delegates'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Briefcase className="w-4 h-4 shrink-0" />
              <span>المناديب المعينون</span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                subTab === 'delegates' ? 'bg-emerald-700/60 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                {delegates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setSubTab('supervisors'); setShowAddForm(false); }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer ${
                subTab === 'supervisors'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span>المشرفون العامة</span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                subTab === 'supervisors' ? 'bg-purple-700/60 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}>
                {supervisors.length}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white">
            <Briefcase className="w-5 h-5 text-emerald-500" />
            <span>قائمة المناديب التابعين لك</span>
          </div>
        )}

        {!currentSupervisor && (
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
              showAddForm
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                : subTab === 'delegates'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            <Plus className={`w-4 h-4 stroke-[3] transition-transform duration-200 ${showAddForm ? 'rotate-45' : ''}`} />
            <span>{showAddForm ? 'إلغاء النافذة' : subTab === 'delegates' ? 'إضافة مندوب جديد' : 'إضافة مشرف جديد'}</span>
          </button>
        )}
      </div>

      {/* Collapsible Add Form */}
      {showAddForm && !currentSupervisor && (
        <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/30 rounded-3xl p-6 shadow-md max-w-xl mx-auto space-y-4 animate-in fade-in duration-200">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
              subTab === 'delegates' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-purple-500/10 text-purple-600'
            }`}>
              <Plus className="w-4 h-4 stroke-[3]" />
            </div>
            <span>{subTab === 'delegates' ? 'إضافة مندوب جديد للنظام' : 'إضافة مشرف جديد للنظام'}</span>
          </h3>

          <form onSubmit={subTab === 'delegates' ? handleCreateDelegate : handleCreateSupervisor} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الاسم بالكامل</label>
                <input
                  value={subTab === 'delegates' ? delegateForm.name : supervisorForm.name}
                  onChange={(e) => subTab === 'delegates' 
                    ? setDelegateForm({ ...delegateForm, name: e.target.value.replace(/[0-9]/g, '') })
                    : setSupervisorForm({ ...supervisorForm, name: e.target.value.replace(/[0-9]/g, '') })}
                  placeholder="مثال: أحمد محمد..."
                  required
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">رقم الهاتف</label>
                <input
                  value={subTab === 'delegates' ? delegateForm.phone : supervisorForm.phone}
                  onChange={(e) => subTab === 'delegates'
                    ? setDelegateForm({ ...delegateForm, phone: e.target.value.replace(/\D/g, '') })
                    : setSupervisorForm({ ...supervisorForm, phone: e.target.value.replace(/\D/g, '') })}
                  placeholder="01xxxxxxxxx"
                  required
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">رمز الدخول (8 أرقام بالضبط)</label>
              <div className="relative">
                <input
                  type="tel"
                  inputMode="numeric"
                  value={subTab === 'delegates' ? delegateForm.pin : supervisorForm.pin}
                  onChange={(e) => {
                    const cleanPin = normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8);
                    if (subTab === 'delegates') setDelegateForm({ ...delegateForm, pin: cleanPin });
                    else setSupervisorForm({ ...supervisorForm, pin: cleanPin });
                  }}
                  placeholder="••••••••"
                  minLength={8}
                  maxLength={8}
                  required
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-mono font-black text-slate-900 dark:text-white outline-none focus:border-emerald-500 text-center tracking-[0.3em] transition-all px-10"
                />
                <button
                  type="button"
                  onClick={() => {
                    const safePin = generateSafePin(subTab === 'delegates' ? delegates.map(d => d.pin) : supervisors.map(s => s.pin));
                    if (subTab === 'delegates') setDelegateForm({ ...delegateForm, pin: safePin });
                    else setSupervisorForm({ ...supervisorForm, pin: safePin });
                  }}
                  className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer"
                  title="توليد رقم سري عشوائي"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {(subTab === 'delegates' ? delegatePinError : supervisorPinError) && (
                <p className="text-[11px] font-bold text-rose-500 dark:text-rose-400 mt-1">
                  {subTab === 'delegates' ? delegatePinError : supervisorPinError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={subTab === 'delegates' ? isSubmittingDelegate : isSubmittingSupervisor}
              className={`w-full text-white py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
                subTab === 'delegates' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {(subTab === 'delegates' ? isSubmittingDelegate : isSubmittingSupervisor) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{subTab === 'delegates' ? 'تأكيد إضافة المندوب' : 'تأكيد إضافة المشرف'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Delegates Section Grid */}
      {subTab === 'delegates' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {delegates.map((d) => {
            const assignedGaragesCount = d.garageCount ?? (allGarages || []).filter(g => g.createdByDelegateId === d.id).length;

            return (
              <div
                key={d.id}
                onClick={() => !currentSupervisor && onSelectDelegate(d)}
                className={`bg-white dark:bg-slate-900 border-2 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 ${
                  currentSupervisor ? 'border-slate-200 dark:border-slate-800' : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 cursor-pointer'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-black text-sm shrink-0">
                      {d.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-900 dark:text-white text-base leading-snug truncate">
                        {d.name}
                      </h4>
                      <span className="text-xs font-mono font-bold text-slate-400 block">{d.phone}</span>
                    </div>
                  </div>
                </div>

                {/* Stats & PIN Info */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-slate-400 font-sans text-[11px]">الرمز:</span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-black text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700">
                      {formatDisplayPin(d.pin)}
                    </span>
                  </div>

                  <div className="text-left font-mono">
                    <span className="block text-[10px] text-slate-400 font-sans">الجراجات / المبيعات</span>
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {assignedGaragesCount} جراج • +{(d.totalRechargedAmount || 0).toLocaleString()} ج.م
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {delegates.length === 0 && (
            <div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-2">
              <Users className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-base font-black text-slate-800 dark:text-slate-200">لا يوجد مناديب مسجلين حالياً</h3>
            </div>
          )}
        </div>
      )}

      {/* Supervisors Section Grid */}
      {subTab === 'supervisors' && !currentSupervisor && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {supervisors.map((s) => (
            <div
              key={s.id}
              className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center font-black text-sm shrink-0">
                    {s.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-black text-slate-900 dark:text-white text-base leading-snug truncate">{s.name}</h4>
                    <span className="text-xs font-mono font-bold text-slate-400 block">{s.phone}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSupervisorToDelete(s)}
                  className="text-slate-400 hover:text-rose-500 p-1.5 transition-colors cursor-pointer"
                  title="حذف المشرف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
                <span className="text-slate-400 text-[11px]">رمز الدخول:</span>
                {editingSupervisorPinId === s.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={editingSupervisorPinValue}
                      minLength={8}
                      maxLength={8}
                      onChange={(e) => setEditingSupervisorPinValue(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8))}
                      className="w-20 text-center font-mono font-black text-xs bg-slate-50 dark:bg-slate-800 border rounded-lg px-1 py-0.5"
                      autoFocus
                    />
                    <button
                      type="button"
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
                            alert(`هذا الرمز مستخدم بالفعل في حساب آخر: (${pinCheck.name} - ${pinCheck.role})`);
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
                      className="text-emerald-600 font-bold p-1 cursor-pointer"
                    >
                      {isUpdatingSupervisorPin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="font-black text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-lg border border-purple-200 dark:border-purple-800">
                      {formatDisplayPin(s.pin)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSupervisorPinId(s.id);
                        setEditingSupervisorPinValue(s.pin && s.pin.length === 64 ? '' : (s.pin || ''));
                      }}
                      className="text-[11px] text-slate-500 hover:text-purple-600 font-bold cursor-pointer"
                    >
                      تعديل
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {supervisors.length === 0 && (
            <div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-2">
              <Shield className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-base font-black text-slate-800 dark:text-slate-200">لا يوجد مشرفين مسجلين حالياً</h3>
            </div>
          )}
        </div>
      )}

      {/* Delete Supervisor Confirmation Modal */}
      <AdminConfirmDialog
        isOpen={!!supervisorToDelete}
        title="حذف المشرف"
        message={`هل أنت متأكد من حذف المشرف "${supervisorToDelete?.name}"؟`}
        type="danger"
        confirmText="حذف"
        cancelText="إلغاء"
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
