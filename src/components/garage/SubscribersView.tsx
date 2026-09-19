import React, { useState, useEffect, memo } from 'react';
import { Users, Plus, Search, Clock, Edit, Trash2, CalendarDays, Phone, User, RefreshCw, ChevronRight, AlertTriangle } from 'lucide-react';
import { firestoreService } from '../../services';
import { auth } from '../../firebase';
import { Subscriber, Garage } from '../../types';
import { getCleanPlate, getRawPlate, normalizeArabicSearch, isSubscriptionExpired as checkSubscriptionExpired, safeDate } from '../../utils';
import { EgyptianPlate } from '../ui/EgyptianPlate';
import { SubscriberModals } from './SubscriberModals';
import { getCairoDateKey } from '../../domain/garage/businessDay';

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
  return safeDate(dateKey);
};

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface SubscribersViewProps {
  garage: Garage;
  onClose: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
  onToggleMenu?: () => void;
}

export const SubscribersView = memo(({ garage, onClose, showToast }: SubscribersViewProps) => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);

  const [showRenewModal, setShowRenewModal] = useState(false);
  const [activeSubscriberForRenew, setActiveSubscriberForRenew] = useState<Subscriber | null>(null);

  const [isAuthResolved, setIsAuthResolved] = useState(!!auth.currentUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setIsAuthResolved(!!u);
    });
    return () => unsubscribe();
  }, []);

  const isSubscriptionExpired = React.useMemo(() => {
    return checkSubscriptionExpired(garage);
  }, [garage]);

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
  const [selectedDuration, setSelectedDuration] = useState<'1w' | '2w' | '1m' | 'custom'>('1m');

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

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subscriberToDelete, setSubscriberToDelete] = useState<string | null>(null);
  const [isPlateFocused, setIsPlateFocused] = useState(false);

  const plateContainerRef = React.useRef<HTMLDivElement>(null);
  const keypadContainerRef = React.useRef<HTMLDivElement>(null);

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
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [editingSubscriber]);

  const handleVirtualKeyPress = (key: string) => {
    const raw = getRawPlate(plateNumber + key);
    const clean = getCleanPlate(raw);
    setPlateNumber(clean);
  };

  // Persistence Effects
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

  useEffect(() => {
    if (!isAuthResolved) return;
    const unsub = firestoreService.subscribeToSubscribers(garage.id, (data) => {
      setSubscribers(data as Subscriber[]);
    });

    // Lock body scroll
    document.body.style.overflow = 'hidden';

    return () => {
      unsub();
      // Unlock body scroll
      document.body.style.overflow = 'unset';
    };
  }, [garage.id, isAuthResolved]);

  const filteredSubscribers = React.useMemo(() => {
    const q = normalizeArabicSearch(searchQuery);
    if (!q) return subscribers;

    return subscribers.filter(s => {
      const normalizedPlate = normalizeArabicSearch(s.plateNumber);
      const normalizedName = normalizeArabicSearch(s.ownerName);
      const normalizedPhone = normalizeArabicSearch(s.phone);
      
      return normalizedPlate.includes(q) || normalizedName.includes(q) || normalizedPhone.includes(q);
    });
  }, [subscribers, searchQuery]);

  const todayDateKey = getCairoDateKey();
  const todayDateObj = parseDateKey(todayDateKey);

  const getStatus = (endStr: string) => {
    const end = parseDateKey(endStr);
    const diffTime = end.getTime() - todayDateObj.getTime();
    const diffDays = Math.ceil(diffTime / 86400000);
    
    if (diffDays < 0) return { 
      label: 'منتهي الصلاحية', 
      color: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900', 
      isAlert: true, 
      isExpired: true,
      alertMessage: 'تنبيه: انتهى موعد الاشتراك الشهري لهذا المشترك. يرجى تجديد الاشتراك أو حذف البيانات نهائياً.' 
    };
    if (diffDays === 0) return { 
      label: 'ينتهي اليوم', 
      color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900', 
      isAlert: true, 
      isExpired: false,
      alertMessage: 'تنبيه: ينتهي هذا الاشتراك الشهري اليوم.' 
    };
    if (diffDays <= 3) return { 
      label: `ينتهي بعد ${diffDays} أيام`, 
      color: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900', 
      isAlert: true, 
      isExpired: false,
      alertMessage: `تنبيه: متبقي ${diffDays} أيام فقط على انتهاء الاشتراك الشهري.` 
    };
    return { 
      label: 'ساري', 
      color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900', 
      isAlert: false, 
      isExpired: false,
      alertMessage: '' 
    };
  };

  const handleOpenAdd = () => {
    if (isSubscriptionExpired) {
      showToast('عفواً، انتهى اشتراك الجراج. برجاء تجديد الاشتراك أولاً لتمكين إضافة المشتركين.', 'error');
      return;
    }
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

    // Calculate duration
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
    if (isSubscriptionExpired) {
      showToast('عفواً، انتهى اشتراك الجراج. برجاء تجديد الاشتراك أولاً لتجديد المشتركين.', 'error');
      return;
    }
    setActiveSubscriberForRenew(s);
    setShowRenewModal(true);
  };

  const handleConfirmRenew = async (type: 'week' | 'two_weeks' | 'month') => {
    if (!activeSubscriberForRenew) return;

    if (isSubscriptionExpired) {
      showToast('عفواً، انتهى اشتراك الجراج. برجاء تجديد الاشتراك أولاً.', 'error');
      return;
    }

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
        endDate: formatDateKey(newEndDate)
      };

      await firestoreService.renewSubscriber(garage.id, activeSubscriberForRenew.id, newDates);
      
      const label = type === 'week' ? 'أسبوع' : type === 'two_weeks' ? 'أسبوعين' : 'شهر واحد';
      showToast(`تم تجديد الاشتراك بنجاح لمدة ${label}`, 'success');
      setShowRenewModal(false);
      setActiveSubscriberForRenew(null);
    } catch (err: any) {
      console.error("Renewal Error:", err);
      showToast('حدث خطأ أثناء تجديد الاشتراك', 'error');
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

    if (!editingSubscriber) {
      if (isSubscriptionExpired) {
        showToast('عفواً، انتهى اشتراك الجراج. برجاء تجديد الاشتراك أولاً.', 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const cleanPlate = getCleanPlate(plateNumber);
      const rawPlate = getRawPlate(plateNumber);
      
      const subscriberData = {
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
          if (error?.message?.includes('INSUFFICIENT_BALANCE')) {
            showToast('عفواً، اشتراك الجراج لا يكفي لإتمام العملية.', 'error');
            return;
          }
          throw error;
        }
      }
      setPlateNumber('');
      setOwnerName('');
      setPhone('');
      setShowAddModal(false);
    } catch (error: any) {
      console.error("Subscriber Save Error:", error);
      let errorMsg = 'حدث خطأ أثناء الحفظ';
      
      // Try to extract detailed error from handleFirestoreError's JSON
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

  return (
    <div className="fixed inset-0 bg-[#faf9f6] dark:bg-slate-950 z-[100] flex flex-col pt-safe px-safe overflow-hidden transition-colors" dir="rtl">
      {/* Header */}
      <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 z-40 w-full shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-4 w-full">
          <button 
            type="button"
            onClick={onClose}
            className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors shadow-sm outline-none shrink-0"
            aria-label="الرجوع"
            title="رجوع"
          >
            <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">الاشتراكات</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 pb-[120px] stable-scrollbar ${showAddModal || showRenewModal ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {/* Add Subscriber Button */}
        <button
          onClick={handleOpenAdd}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all outline-none active:scale-[0.98] mb-5 shadow-sm shadow-blue-500/10"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span>إضافة مشترك جديد</span>
        </button>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باللوحة أو الاسم أو رقم الهاتف..."
            className="w-full pl-4 pr-12 py-3.5 bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:border-slate-400 dark:focus:border-slate-600 text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-medium"
          />
        </div>

        {/* List */}
        <div className="space-y-3">
          {filteredSubscribers.length === 0 ? (
            <div className="text-center py-12 bg-[#faf9f6] dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">لا يوجد مشتركون</p>
              <p className="text-xs text-slate-500 mt-1">اضغط على زر "مشترك جديد" لإضافة مشتركين</p>
            </div>
          ) : (
            filteredSubscribers.map((subscriber) => {
              const status = getStatus(subscriber.endDate);
              
              return (
                <div 
                  key={subscriber.id} 
                  className={`bg-[#faf9f6] dark:bg-slate-900 rounded-2xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden ${
                    status.isAlert 
                      ? 'border-red-500/90 dark:border-red-500/70 shadow-[0_4px_20px_rgba(239,68,68,0.12)] bg-red-50/5 dark:bg-red-950/5 pt-6 pb-4 px-4' 
                      : 'border-slate-200 dark:border-slate-800 p-4'
                  }`}
                >
                  {status.isAlert && (
                    <div 
                      className="absolute top-0 left-0 right-0 h-1.5 z-10"
                      style={{
                        backgroundImage: status.isExpired 
                          ? 'repeating-linear-gradient(-45deg, #ef4444, #ef4444 8px, #1e293b 8px, #1e293b 16px)'
                          : 'repeating-linear-gradient(-45deg, #f59e0b, #f59e0b 8px, #1e293b 8px, #1e293b 16px)'
                      }}
                    />
                  )}
                  
                  {status.isAlert && status.alertMessage && (
                    <div className="w-full pb-2 mb-2 border-b border-red-200/60 dark:border-red-900/60 flex items-center justify-between gap-2 text-xs font-bold text-red-600 dark:text-red-400">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{status.alertMessage}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
                    <div className="flex items-center gap-4">
                      <div className="w-[110px] shrink-0">
                        <EgyptianPlate plateNumber={subscriber.plateNumber} size="sm" className="!w-full" />
                      </div>
                      
                      <div className="space-y-2">
                         <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                           <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                           <span>{subscriber.ownerName}</span>
                         </div>
                         <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                           <Phone className="w-3.5 h-3.5" />
                           <span dir="ltr">{subscriber.phone}</span>
                         </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-col gap-1 items-start md:items-end p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <CalendarDays className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                          <span>اشترك من: <span className="font-black text-slate-900 dark:text-slate-100">{subscriber.startDate}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                           <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                           <span>ينتهي في: <span className="font-black text-slate-900 dark:text-slate-100">{subscriber.endDate}</span></span>
                        </div>
                      </div>

                      <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${status.color}`}>
                        {status.label}
                      </div>

                      <div className="flex items-center gap-2">
                         <button 
                           onClick={() => handleOpenRenew(subscriber)} 
                           className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all outline-none h-8 shadow-sm active:scale-95"
                         >
                           <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
                           <span>تجديد الاشتراك</span>
                         </button>
                         <button 
                           onClick={() => handleOpenEdit(subscriber)} 
                           title="تعديل البيانات"
                           className="p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-colors outline-none h-8 w-8 justify-center"
                         >
                            <Edit className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => handleDelete(subscriber.id)} 
                           title="حذف نهائياً"
                           className="px-2.5 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors outline-none h-8"
                         >
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden sm:inline">حذف نهائياً</span>
                         </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Add/Edit Modal */}
      <SubscriberModals
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        editingSubscriber={editingSubscriber}
        plateNumber={plateNumber}
        setPlateNumber={setPlateNumber}
        ownerName={ownerName}
        setOwnerName={setOwnerName}
        phone={phone}
        setPhone={setPhone}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        isPlateFocused={isPlateFocused}
        setIsPlateFocused={setIsPlateFocused}
        handleVirtualKeyPress={handleVirtualKeyPress}
        plateContainerRef={plateContainerRef}
        keypadContainerRef={keypadContainerRef}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
        subscriberToDelete={subscriberToDelete}
        setSubscriberToDelete={setSubscriberToDelete}
        confirmDelete={confirmDelete}
        showRenewModal={showRenewModal}
        setShowRenewModal={setShowRenewModal}
        activeSubscriberForRenew={activeSubscriberForRenew}
        setActiveSubscriberForRenew={setActiveSubscriberForRenew}
        handleConfirmRenew={handleConfirmRenew}
        formatDisplayDate={formatDisplayDate}
      />
    </div>
  );
});
