/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, memo } from 'react';
import {
  Users,
  Plus,
  RefreshCw,
  Check,
  Loader2,
  Briefcase
} from 'lucide-react';
import { Delegate, Supervisor, Garage } from '../../types';
import { firestoreService } from '../../services';
import { generateSafePin, normalizeDigits, formatDisplayPin } from '../../utils';
import { useTheme } from '../../utils/ThemeContext';

interface AdminPeopleViewProps {
  delegates: Delegate[];
  currentSupervisor: Supervisor | null;
  allGarages?: Garage[];
  onSelectDelegate: (delegate: Delegate) => void;
}

export const AdminPeopleView = memo(({
  delegates,
  currentSupervisor,
  allGarages = [],
  onSelectDelegate
}: AdminPeopleViewProps) => {
  const { adminLang } = useTheme();
  const [showAddForm, setShowAddForm] = useState(false);

  // Delegates State
  const [delegateForm, setDelegateForm] = useState({ name: '', phone: '', pin: '' });
  const [delegatePinError, setDelegatePinError] = useState('');
  const [isSubmittingDelegate, setIsSubmittingDelegate] = useState(false);

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

  return (
    <div className="space-y-6 dir-rtl text-right font-sans max-w-6xl mx-auto px-2 sm:px-4">
      {/* Sleek Segment Switcher & Action Trigger */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        {!currentSupervisor ? (
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer bg-emerald-600 text-white shadow-md"
            >
              <Briefcase className="w-4 h-4 shrink-0" />
              <span>المناديب المعينون</span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-700/60 text-white">
                {delegates.length}
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
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Plus className={`w-4 h-4 stroke-[3] transition-transform duration-200 ${showAddForm ? 'rotate-45' : ''}`} />
            <span>{showAddForm ? 'إلغاء النافذة' : 'إضافة مندوب جديد'}</span>
          </button>
        )}
      </div>

      {/* Collapsible Add Form */}
      {showAddForm && !currentSupervisor && (
        <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/30 rounded-3xl p-6 shadow-md max-w-xl mx-auto space-y-4 animate-in fade-in duration-200">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs bg-emerald-500/10 text-emerald-600">
              <Plus className="w-4 h-4 stroke-[3]" />
            </div>
            <span>إضافة مندوب جديد للنظام</span>
          </h3>

          <form onSubmit={handleCreateDelegate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الاسم بالكامل</label>
                <input
                  value={delegateForm.name}
                  onChange={(e) => setDelegateForm({ ...delegateForm, name: e.target.value.replace(/[0-9]/g, '') })}
                  placeholder="مثال: أحمد محمد..."
                  required
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">رقم الهاتف</label>
                <input
                  value={delegateForm.phone}
                  onChange={(e) => setDelegateForm({ ...delegateForm, phone: e.target.value.replace(/\D/g, '') })}
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
                  value={delegateForm.pin}
                  onChange={(e) => {
                    const cleanPin = normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 8);
                    setDelegateForm({ ...delegateForm, pin: cleanPin });
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
                    const safePin = generateSafePin(delegates.map(d => d.pin));
                    setDelegateForm({ ...delegateForm, pin: safePin });
                  }}
                  className="absolute left-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer"
                  title="توليد رقم سري عشوائي"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {delegatePinError && (
                <p className="text-[11px] font-bold text-rose-500 dark:text-rose-400 mt-1">
                  {delegatePinError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmittingDelegate}
              className="w-full text-white py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmittingDelegate ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>تأكيد إضافة المندوب</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Delegates Section Grid */}
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

    </div>
  );
});
