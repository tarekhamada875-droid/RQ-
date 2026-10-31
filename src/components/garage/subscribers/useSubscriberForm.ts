import React, { useState, useEffect, useRef } from 'react';
import { firestoreService } from '../../../services';
import type { Subscriber, Garage } from '../../../types';
import { getCleanPlate, getRawPlate } from '../../../utils';
import { getCairoDateKey } from '../../../domain/garage/businessDay';

const parseDateKey = (dateKey: string | any): Date => {
  if (!dateKey) return new Date();
  if (typeof dateKey === 'string' && dateKey.length === 10 && dateKey[4] === '-' && dateKey[7] === '-') {
    const y = parseInt(dateKey.substring(0, 4), 10);
    const m = parseInt(dateKey.substring(5, 7), 10);
    const d = parseInt(dateKey.substring(8, 10), 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m - 1, d);
    }
  }
  return new Date(dateKey);
};

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type Duration = '1w' | '2w' | '1m' | 'custom';

type ToastFn = (msg: string, type?: 'success' | 'error' | 'info') => void;

/**
 * Subscriber form state + add/edit/renew/delete handlers.
 *
 * Extracted from SubscribersView so that form keystrokes (plate/name/phone)
 * no longer trigger list re-renders. The list hook owns subscriber[] state;
 * this hook owns the form draft + modal visibility.
 */
export function useSubscriberForm(
  garage: Garage,
  showToast: ToastFn,
  onFormClose: () => void,
) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [activeSubscriberForRenew, setActiveSubscriberForRenew] = useState<Subscriber | null>(null);

  // Form State
  const [plateNumber, setPlateNumber] = useState(() => localStorage.getItem('sub_plate') || '');
  const [ownerName, setOwnerName] = useState(() => localStorage.getItem('sub_name') || '');
  const [phone, setPhone] = useState(() => localStorage.getItem('sub_phone') || '');
  const [startDate, setStartDate] = useState(getCairoDateKey);
  const [endDate, setEndDate] = useState(() => {
    const nextMonth = parseDateKey(getCairoDateKey());
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return formatDateKey(nextMonth);
  });
  const [selectedDuration, setSelectedDuration] = useState<Duration>('1m');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subscriberToDelete, setSubscriberToDelete] = useState<string | null>(null);
  const [isPlateFocused, setIsPlateFocused] = useState(false);

  const plateContainerRef = useRef<HTMLDivElement>(null);
  const keypadContainerRef = useRef<HTMLDivElement>(null);

  // Duration → endDate auto-sync
  useEffect(() => {
    if (selectedDuration === '1w') {
      const d = parseDateKey(startDate);
      d.setDate(d.getDate() + 7);
      setEndDate(formatDateKey(d));
    } else if (selectedDuration === '2w') {
      const d = parseDateKey(startDate);
      d.setDate(d.getDate() + 14);
      setEndDate(formatDateKey(d));
    } else if (selectedDuration === '1m') {
      const d = parseDateKey(startDate);
      d.setMonth(d.getMonth() + 1);
      setEndDate(formatDateKey(d));
    }
  }, [startDate, selectedDuration]);

  // Close keyboard on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (editingSubscriber) return;
      if (
        plateContainerRef.current?.contains(event.target as Node) ||
        keypadContainerRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setIsPlateFocused(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [editingSubscriber]);

  // Draft persistence
  useEffect(() => {
    if (!editingSubscriber) {
      localStorage.setItem('sub_plate', plateNumber);
      localStorage.setItem('sub_name', ownerName);
      localStorage.setItem('sub_phone', phone);
    }
  }, [plateNumber, ownerName, phone, editingSubscriber]);

  useEffect(() => {
    localStorage.setItem('sub_show_modal', String(showAddModal));
  }, [showAddModal]);

  const clearDraft = () => {
    localStorage.removeItem('sub_plate');
    localStorage.removeItem('sub_name');
    localStorage.removeItem('sub_phone');
    localStorage.removeItem('sub_show_modal');
  };

  const handleVirtualKeyPress = (key: string) => {
    const raw = getRawPlate(plateNumber + key);
    const clean = getCleanPlate(raw);
    setPlateNumber(clean);
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handleOpenAdd = () => {
    setEditingSubscriber(null);
    setPlateNumber('');
    setOwnerName('');
    setPhone('');
    clearDraft();
    const today = getCairoDateKey();
    const nextMonth = parseDateKey(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setStartDate(today);
    setEndDate(formatDateKey(nextMonth));
    setSelectedDuration('1m');
    setIsPlateFocused(true);
    setShowAddModal(true);
  };

  const handleOpenEdit = (s: Subscriber) => {
    setEditingSubscriber(s);
    setPlateNumber(s.plateNumber);
    setOwnerName(s.ownerName);
    setPhone(s.phone);
    setStartDate(s.startDate);
    setEndDate(s.endDate);
    setIsPlateFocused(false);

    try {
      const start = parseDateKey(s.startDate);
      const end = parseDateKey(s.endDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 7) {
        setSelectedDuration('1w');
      } else if (diffDays === 14) {
        setSelectedDuration('2w');
      } else if (diffDays >= 28 && diffDays <= 32) {
        setSelectedDuration('1m');
      } else {
        setSelectedDuration('custom');
      }
    } catch {
      setSelectedDuration('custom');
    }

    setShowAddModal(true);
  };

  const handleOpenRenew = (s: Subscriber) => {
    setActiveSubscriberForRenew(s);
    setShowRenewModal(true);
  };

  const handleConfirmRenew = async (type: 'week' | 'two_weeks' | 'month') => {
    if (!activeSubscriberForRenew) return;

    setIsSubmitting(true);
    try {
      const todayKey = getCairoDateKey();
      const today = parseDateKey(todayKey);
      const currentEndDate = parseDateKey(activeSubscriberForRenew.endDate);
      const baseDate = currentEndDate >= today ? currentEndDate : today;

      const newEndDate = new Date(baseDate);
      if (type === 'week') {
        newEndDate.setDate(newEndDate.getDate() + 7);
      } else if (type === 'two_weeks') {
        newEndDate.setDate(newEndDate.getDate() + 14);
      } else {
        newEndDate.setMonth(newEndDate.getMonth() + 1);
      }

      const newDates = {
        startDate: currentEndDate >= today ? activeSubscriberForRenew.startDate : todayKey,
        endDate: formatDateKey(newEndDate),
      };

      await firestoreService.renewSubscriber(garage.id, activeSubscriberForRenew.id, newDates);

      const label = type === 'week' ? 'أسبوع' : type === 'two_weeks' ? 'أسبوعين' : 'شهر واحد';
      showToast(`تم تجديد الاشتراك بنجاح لمدة ${label}`, 'success');
      setShowRenewModal(false);
      setActiveSubscriberForRenew(null);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('INSUFFICIENT_PAID_CREDITS') || errMsg.includes('INSUFFICIENT_ELIGIBLE_CREDITS')) {
        showToast('رصيدك خلص — تجديد الاشتراك يحتاج 5 رصيد مدفوع. يرجى شحن الرصيد أولاً', 'error');
      } else {
        showToast('حدث خطأ أثناء تجديد الاشتراك', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateNumber || !ownerName || !phone || !startDate || !endDate) {
      showToast('يرجى إكمال جميع البيانات', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanPlate = getCleanPlate(plateNumber);
      const rawPlate = getRawPlate(plateNumber);

      const subscriberData = editingSubscriber
        ? {
            // Edit mode: dates are immutable (use the renew button to extend).
            // Only send the editable fields. The Worker rejects date changes.
            plateNumber: cleanPlate,
            plateNumberRaw: rawPlate,
            ownerName,
            phone,
            garageId: garage.id,
          }
        : {
            plateNumber: cleanPlate,
            plateNumberRaw: rawPlate,
            ownerName,
            phone,
            startDate,
            endDate,
            garageId: garage.id,
          };

      if (editingSubscriber) {
        await firestoreService.updateSubscriber(garage.id, editingSubscriber.id, subscriberData);
        showToast('تم تحديث بيانات المشترك بنجاح', 'success');
      } else {
        try {
          await firestoreService.addSubscriber(garage.id, subscriberData);
          showToast('تمت إضافة المشترك بنجاح', 'success');
          clearDraft();
        } catch (error: any) {
          if (
            error?.message?.includes('INSUFFICIENT_PAID_CREDITS') ||
            error?.message?.includes('INSUFFICIENT_ELIGIBLE_CREDITS') ||
            error?.message?.includes('INSUFFICIENT_BALANCE')
          ) {
            showToast('عفواً، رصيد الجراج لا يكفي لإتمام العملية.', 'error');
            return;
          }
          throw error;
        }
      }
      setPlateNumber('');
      setOwnerName('');
      setPhone('');
      setShowAddModal(false);
      onFormClose();
    } catch (error: any) {
      let errorMsg = 'حدث خطأ أثناء الحفظ';

      try {
        const msg = typeof error === 'string' ? error : error.message;
        if (msg && msg.startsWith('{') && msg.endsWith('}')) {
          const detailed = JSON.parse(msg);
          errorMsg = `خطأ: ${detailed.error || 'غير معروف'}`;
        }
      } catch {
        // ignore parsing error
      }

      showToast(errorMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    setSubscriberToDelete(id);
  };

  const confirmDelete = async () => {
    if (!subscriberToDelete) return;
    try {
      await firestoreService.deleteSubscriber(garage.id, subscriberToDelete);
      showToast('تم حذف المشترك بنجاح', 'success');
    } catch {
      showToast('حدث خطأ أثناء الحذف', 'error');
    } finally {
      setSubscriberToDelete(null);
    }
  };

  return {
    // Modal visibility
    showAddModal,
    setShowAddModal,
    showRenewModal,
    setShowRenewModal,
    editingSubscriber,
    activeSubscriberForRenew,
    setActiveSubscriberForRenew,
    // Form fields
    plateNumber,
    setPlateNumber,
    ownerName,
    setOwnerName,
    phone,
    setPhone,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectedDuration,
    setSelectedDuration,
    isPlateFocused,
    setIsPlateFocused,
    // Refs
    plateContainerRef,
    keypadContainerRef,
    // Submit state
    isSubmitting,
    subscriberToDelete,
    setSubscriberToDelete,
    // Handlers
    handleVirtualKeyPress,
    handleOpenAdd,
    handleOpenEdit,
    handleOpenRenew,
    handleConfirmRenew,
    handleSubmit,
    handleDelete,
    confirmDelete,
    formatDisplayDate,
  };
}
