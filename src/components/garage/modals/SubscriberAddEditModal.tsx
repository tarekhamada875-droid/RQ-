import React, { memo } from 'react';
import { Delete, Phone, Save, User, X } from 'lucide-react';
import { EgyptianPlate } from '../../ui/EgyptianPlate';
import { LicensePlateKeyboard } from '../LicensePlateKeyboard';
import { formatPlateNumber, getCleanPlate } from '../../../utils/plates';
import type { Subscriber } from '../../../types';
import { FastInput } from '../../ui/FastInput';

/**
 * SubscriberAddEditModal
 *
 * Add-or-edit modal for a single subscriber. When `editingSubscriber` is
 * null the modal is in "create" mode (shows the plate keypad + duration
 * selector). When set, it's in "edit" mode (shows the plate as read-only
 * and disables the duration selector).
 *
 * Extracted Stage 3 of the structural refactor. Previously this was
 * ~208 lines of inline JSX in SubscriberModals.tsx.
 *
 * Pure presentational — all state lives in the parent (SubscribersView).
 */

export type SubscriberDuration = '1w' | '2w' | '1m' | 'custom';

interface SubscriberAddEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSubscriber: Subscriber | null;
  plateNumber: string;
  setPlateNumber: (v: string) => void;
  ownerName: string;
  setOwnerName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  startDate: string;
  endDate: string;
  selectedDuration: SubscriberDuration;
  setSelectedDuration: (v: SubscriberDuration) => void;
  isPlateFocused: boolean;
  setIsPlateFocused: (v: boolean) => void;
  handleVirtualKeyPress: (key: string) => void;
  plateContainerRef: React.RefObject<HTMLDivElement | null>;
  keypadContainerRef: React.RefObject<HTMLDivElement | null>;
  isSubmitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
  formatDisplayDate: (dateStr: string) => string;
}

const DURATION_OPTIONS: ReadonlyArray<{ id: SubscriberDuration; label: string; durationLabel: string }> = [
  { id: '1w', label: 'أسبوع', durationLabel: '٧ أيام' },
  { id: '2w', label: 'أسبوعين', durationLabel: '١٤ يوم' },
  { id: '1m', label: 'شهر واحد', durationLabel: '٣٠ يوم' },
];

export const SubscriberAddEditModal = memo(function SubscriberAddEditModal({
  isOpen,
  onClose,
  editingSubscriber,
  plateNumber,
  setPlateNumber,
  ownerName,
  setOwnerName,
  phone,
  setPhone,
  startDate,
  endDate,
  selectedDuration,
  setSelectedDuration,
  isPlateFocused,
  setIsPlateFocused,
  handleVirtualKeyPress,
  plateContainerRef,
  keypadContainerRef,
  isSubmitting,
  handleSubmit,
  formatDisplayDate,
}: SubscriberAddEditModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative bg-[#faf9f6] dark:bg-slate-900 w-full max-w-md rounded-[2rem] sm:rounded-xl max-h-[90dvh] overflow-y-auto custom-scrollbar-slate">

        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {editingSubscriber ? 'تعديل المشترك' : 'مشترك جديد'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full border border-red-100 dark:border-red-900/30 outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {!editingSubscriber && (
             <div className="space-y-1">
               <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">رقم اللوحة</label>
               <div
                 ref={plateContainerRef}
                 onClick={() => {
                   setIsPlateFocused(true);
                   const inputEl = plateContainerRef.current?.querySelector('input');
                   if (inputEl) {
                     inputEl.focus();
                   }
                 }}
                 className="relative h-14 w-full cursor-text"
               >
                 {plateNumber && (
                   <button
                     type="button"
                     onMouseDown={(e) => {
                       e.preventDefault();
                       e.stopPropagation();
                     }}
                     onClick={(e) => {
                       e.stopPropagation();
                       setPlateNumber(plateNumber.slice(0, -1));
                     }}
                     className="absolute bg-red-500 text-white rounded-xl flex items-center justify-center outline-none -top-2 -left-2 w-8 h-8 z-40 "
                   >
                     <Delete className="w-4 h-4" />
                   </button>
                 )}
                 <FastInput
                   type="text"
                   inputMode="none"
                   autoComplete="off"
                   autoCorrect="off"
                   spellCheck="false"
                   defaultValue={plateNumber}
                   onCommit={(v) => setPlateNumber(getCleanPlate(v))}
                   onLiveValue={(v) => setPlateNumber(getCleanPlate(v))}
                   mask={getCleanPlate}
                   onFocus={() => setIsPlateFocused(true)}
                   className="absolute inset-0 w-full h-full opacity-0 z-30 cursor-text"
                   dir="rtl"
                 />
                 <div className="absolute inset-0 pointer-events-none z-10 flex">
                   <EgyptianPlate
                     plateNumber={plateNumber}
                     size="sm"
                     className={`!w-full !h-full !max-w-none !rounded-xl !text-2xl sm:!text-3xl font-black ${isPlateFocused ? '!border-[3px] !border-blue-500 dark:!border-blue-500' : '!border-slate-900 dark:!border-black'}`}
                   />
                 </div>
               </div>
             </div>
          )}
          {editingSubscriber && (
             <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">رقم اللوحة</label>
                <div className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3 px-4 text-center font-black text-slate-900 dark:text-slate-100 text-lg">
                    {formatPlateNumber(editingSubscriber.plateNumber)}
                </div>
              </div>
          )}

          {!editingSubscriber && isPlateFocused && (
             <div ref={keypadContainerRef} className="mt-2 shrink-0">
               <LicensePlateKeyboard
                 onKeyPress={handleVirtualKeyPress}
                 currentValue={plateNumber}
               />
             </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">اسم المالك</label>
            <div className="relative">
              <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <FastInput
                type="text"
                defaultValue={ownerName}
                onCommit={(v) => setOwnerName(v.replace(/[0-9]/g, ''))}
                onLiveValue={(v) => setOwnerName(v.replace(/[0-9]/g, ''))}
                mask={(v) => v.replace(/[0-9]/g, '')}
                onFocus={() => setIsPlateFocused(false)}
                className="w-full pl-4 pr-12 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:border-slate-400 dark:focus:border-slate-500 text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="الاسم"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">رقم الهاتف</label>
            <div className="relative">
              <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <FastInput
                type="tel"
                inputMode="numeric"
                defaultValue={phone}
                onCommit={(v) => setPhone(v.replace(/\D/g, ''))}
                onLiveValue={(v) => setPhone(v.replace(/\D/g, ''))}
                mask={(v) => v.replace(/\D/g, '')}
                onFocus={() => setIsPlateFocused(false)}
                className="w-full pl-4 pr-12 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:border-slate-400 dark:focus:border-slate-500 text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-left "
                placeholder="رقم الهاتف"
                dir="ltr"
                required
              />
            </div>
          </div>

          {!editingSubscriber && (
          <div className="space-y-2 select-none">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">
              مدة الاشتراك
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setSelectedDuration(d.id);
                    setIsPlateFocused(false);
                  }}
                  className={`py-3.5 px-2 rounded-2xl border text-center flex flex-col items-center justify-center ${
                    selectedDuration === d.id
                      ? 'bg-blue-600 border-blue-700 text-white dark:bg-blue-600 dark:border-blue-700 dark:text-white font-extrabold '
                      : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 font-bold '
                  }`}
                >
                  <span className="text-sm">{d.label}</span>
                  <span className={`text-[10px] mt-0.5 opacity-80 ${selectedDuration === d.id ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    {d.durationLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>
          )}
          {editingSubscriber && (
            <div className="space-y-2 select-none">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">
                مدة الاشتراك
              </label>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl px-3 py-2.5 border border-slate-100 dark:border-slate-800/50">
                لتغيير تاريخ الانتهاء استخدم زر التجديد
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/50">
            <div className="space-y-1 text-center">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">تاريخ البدء</span>
              <span className="text-sm font-black text-slate-800 dark:text-slate-200">
                {formatDisplayDate(startDate)}
              </span>
            </div>
            <div className="space-y-1 text-center border-r border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">تاريخ الانتهاء</span>
              <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                {formatDisplayDate(endDate)}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-black text-sm disabled:opacity-50 outline-none"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>حفظ البيانات</span>
              </>
            )}
          </button>

        </form>
      </div>
    </div>
  );
});

SubscriberAddEditModal.displayName = 'SubscriberAddEditModal';
