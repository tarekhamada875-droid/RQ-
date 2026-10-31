import { memo, useMemo } from 'react';
import { Users, Plus, Search, ChevronRight, ChevronDown } from 'lucide-react';
import { Garage, Subscriber } from '../../types';
import { getCairoDateKey } from '../../domain/garage/businessDay';
import { safeDate } from '../../utils';
import { SubscriberModals } from './SubscriberModals';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import type { SharedSubscriberPage } from '../../hooks/useGarageDashboardLiveData';
import { SubscriberCard } from './subscribers/SubscriberCard';
import { useSubscriberList } from './subscribers/useSubscriberList';
import { useSubscriberForm } from './subscribers/useSubscriberForm';

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

export type SubscriberStatus = {
  label: string;
  color: string;
  isAlert: boolean;
  isExpired: boolean;
  alertMessage: string;
};

// Static status configs allocated once at module load, not per-subscriber-per-render.
const STATUS_EXPIRED: SubscriberStatus = {
  label: 'منتهي الصلاحية',
  color: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900',
  isAlert: true,
  isExpired: true,
  alertMessage: 'تنبيه: انتهى موعد الاشتراك الشهري لهذا المشترك. يرجى تجديد الاشتراك أو حذف البيانات نهائياً.',
};

const STATUS_EXPIRES_TODAY: SubscriberStatus = {
  label: 'ينتهي اليوم',
  color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  isAlert: true,
  isExpired: false,
  alertMessage: 'تنبيه: ينتهي هذا الاشتراك الشهري اليوم.',
};

const STATUS_ACTIVE: SubscriberStatus = {
  label: 'ساري',
  color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  isAlert: false,
  isExpired: false,
  alertMessage: '',
};

const EXPIRING_COLOR = 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900';

interface SubscribersViewProps {
  garage: Garage;
  onClose: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
  onToggleMenu?: () => void;
  subscriberPage?: SharedSubscriberPage;
}

/**
 * Orchestrator for the subscribers fullscreen view.
 *
 * Split (Tier-2 refactor #3) from a 678-line god component into:
 *   - useSubscriberList: list state + Firestore subscription + pagination
 *   - useSubscriberForm: form draft state + add/edit/renew/delete handlers
 *   - SubscriberCard: per-item render with its own memo boundary
 *   - this file: composition + header + search + list layout
 *
 * Form keystrokes no longer re-render the list (the list hook's state is
 * isolated from the form hook's state). Each subscriber card has its own
 * React.memo boundary so editing one card's state doesn't re-render the others.
 */
export const SubscribersView = memo(({ garage, onClose, showToast, subscriberPage }: SubscribersViewProps) => {
  useBodyScrollLock();

  const {
    subscribers,
    filteredSubscribers,
    hasMoreSubscribers,
    isLoadingMoreSubscribers,
    isInitialLoad,
    searchQuery,
    setSearchQuery,
    handleLoadMoreSubscribers,
  } = useSubscriberList(garage.id, subscriberPage ?? null, showToast);

  const form = useSubscriberForm(garage, showToast, () => {});

  // Day-granular today reference. Only the calendar day matters for status,
  // so this recomputes at most once per day (not per render — the string is
  // stable across renders within the same day).
  const todayDateObj = useMemo(() => parseDateKey(getCairoDateKey()), []);

  const getStatus = (endStr: string): SubscriberStatus => {
    const end = parseDateKey(endStr);
    const diffTime = end.getTime() - todayDateObj.getTime();
    const diffDays = Math.ceil(diffTime / 86400000);

    if (diffDays < 0) return STATUS_EXPIRED;
    if (diffDays === 0) return STATUS_EXPIRES_TODAY;
    if (diffDays <= 3)
      return {
        label: `ينتهي بعد ${diffDays} أيام`,
        color: EXPIRING_COLOR,
        isAlert: true,
        isExpired: false,
        alertMessage: `تنبيه: متبقي ${diffDays} أيام فقط على انتهاء الاشتراك الشهري.`,
      };
    return STATUS_ACTIVE;
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
      <main className={`flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 pb-[120px] stable-scrollbar ${form.showAddModal || form.showRenewModal ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {/* Add Subscriber Button */}
        <button
          onClick={form.handleOpenAdd}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all outline-none active:scale-[0.98] mb-5 shadow-sm shadow-blue-500/10"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span>إضافة مشترك جديد</span>
        </button>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <label htmlFor="subscribers-search" className="sr-only">
            البحث عن مشترك باللوحة أو الاسم أو رقم الهاتف
          </label>
          <input
            id="subscribers-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باللوحة أو الاسم أو رقم الهاتف..."
            className="w-full pl-4 pr-12 py-3.5 bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:border-slate-400 dark:focus:border-slate-600 text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
          />
        </div>

        {/* List */}
        <div className="space-y-3">
          {isInitialLoad ? (
            // First-page hydration skeleton. Shown only until the first
            // Firestore snapshot (or shared subscriber page) lands, so the
            // user doesn't see a blank list area during initial load.
            <div className="space-y-3" aria-label="جاري تحميل المشتركين">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-28 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
              ))}
            </div>
          ) : filteredSubscribers.length === 0 ? (
            <div className="text-center py-12 bg-[#faf9f6] dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{searchQuery ? 'لا توجد نتائج في القائمة المحمّلة' : 'لا يوجد مشتركون'}</p>
              <p className="text-xs text-slate-500 mt-1">{searchQuery && hasMoreSubscribers ? 'حمّل المزيد للبحث في السجلات الأقدم' : 'اضغط على زر "مشترك جديد" لإضافة مشتركين'}</p>
            </div>
          ) : (
            filteredSubscribers.map((subscriber: Subscriber) => (
              <SubscriberCard
                key={subscriber.id}
                subscriber={subscriber}
                status={getStatus(subscriber.endDate)}
                onRenew={form.handleOpenRenew}
                onEdit={form.handleOpenEdit}
                onDelete={form.handleDelete}
              />
            ))
          )}
        </div>
        {subscribers.length > 0 && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-5" aria-live="polite">
            يتم البحث في {subscribers.length} مشترك محمّل{hasMoreSubscribers ? 'ين؛ حمّل المزيد للبحث في السجلات الأقدم.' : '.'}
          </p>
        )}
        {hasMoreSubscribers && (
          <button
            type="button"
            onClick={handleLoadMoreSubscribers}
            disabled={isLoadingMoreSubscribers}
            className="w-full min-h-11 mt-3 px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
            <span>{isLoadingMoreSubscribers ? 'جارٍ تحميل المزيد...' : 'تحميل 50 مشتركاً أقدم'}</span>
          </button>
        )}
      </main>

      {/* Add/Edit/Renew/Delete Modals */}
      <SubscriberModals
        showAddModal={form.showAddModal}
        setShowAddModal={form.setShowAddModal}
        editingSubscriber={form.editingSubscriber}
        plateNumber={form.plateNumber}
        setPlateNumber={form.setPlateNumber}
        ownerName={form.ownerName}
        setOwnerName={form.setOwnerName}
        phone={form.phone}
        setPhone={form.setPhone}
        startDate={form.startDate}
        setStartDate={form.setStartDate}
        endDate={form.endDate}
        setEndDate={form.setEndDate}
        selectedDuration={form.selectedDuration}
        setSelectedDuration={form.setSelectedDuration}
        isPlateFocused={form.isPlateFocused}
        setIsPlateFocused={form.setIsPlateFocused}
        handleVirtualKeyPress={form.handleVirtualKeyPress}
        plateContainerRef={form.plateContainerRef}
        keypadContainerRef={form.keypadContainerRef}
        isSubmitting={form.isSubmitting}
        handleSubmit={form.handleSubmit}
        subscriberToDelete={form.subscriberToDelete}
        setSubscriberToDelete={form.setSubscriberToDelete}
        confirmDelete={form.confirmDelete}
        showRenewModal={form.showRenewModal}
        setShowRenewModal={form.setShowRenewModal}
        activeSubscriberForRenew={form.activeSubscriberForRenew}
        setActiveSubscriberForRenew={form.setActiveSubscriberForRenew}
        handleConfirmRenew={form.handleConfirmRenew}
        formatDisplayDate={form.formatDisplayDate}
      />
    </div>
  );
});
