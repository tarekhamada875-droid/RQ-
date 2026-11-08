/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { Calendar, ChevronRight, Loader2, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { useGarageData } from '../../hooks/garageDataContext';
import { GarageDailyReportModal } from './GarageDailyReportModal';
import { normalizeDigits } from '../../utils/plates';
import type { Garage } from '../../types';
import { FastInput } from '../ui/FastInput';

interface AdminDailyGarageReportsViewProps {
  onBack: () => void;
}

/**
 * Admin page: list of garage cards. Tapping a card opens the daily report
 * modal for that garage. Read cost: zero — reuses the allGarages list already
 * loaded by useGarageSync (which paginates 50 garages per page). Tapping a
 * card opens the modal; the modal does its own per-day reads.
 */
export const AdminDailyGarageReportsView = ({ onBack }: AdminDailyGarageReportsViewProps) => {
  const { allGarages, adminGarageHasMore, loadMoreAdminGarages, adminListsLoading, adminListsError, refreshAdminLists } = useGarageData();
  const [search, setSearch] = useState('');
  const [selectedGarage, setSelectedGarage] = useState<Garage | null>(null);

  const filtered = useMemo(() => {
    const q = normalizeDigits(search.trim().toLowerCase());
    if (!q) return allGarages;
    return allGarages.filter(g => {
      const name = (g.name || '').toLowerCase();
      const phone = (g.phone || '').toLowerCase();
      const owner = (g.ownerName || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || owner.includes(q);
    });
  }, [allGarages, search]);

  return (
    <div className="max-w-5xl mx-auto font-sans animate-in fade-in duration-200" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors"
            aria-label="رجوع"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-500" />
              تقارير الجراجات اليومية
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5">
              اختر جراجاً لعرض ما حدث في يوم محدد
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshAdminLists()}
          disabled={adminListsLoading}
          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="تحديث"
        >
          {adminListsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <FastInput
          type="text"
          inputMode="search"
          defaultValue={search}
          onCommit={setSearch}
          onLiveValue={setSearch}
          placeholder="ابحث باسم الجراج أو رقم الهاتف أو المالك..."
          className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl pr-10 pl-4 py-3 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 outline-none"
        />
      </div>

      {/* Error banner */}
      {adminListsError && (
        <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 px-4 py-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-xs font-bold text-rose-700 dark:text-rose-300">تعذّر تحميل قائمة الجراجات.</p>
        </div>
      )}

      {/* Garage cards */}
      {filtered.length === 0 && !adminListsLoading ? (
        <div className="text-center py-16">
          <Calendar className="w-14 h-14 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
            {search ? 'لا توجد نتائج مطابقة' : 'لا توجد جراجات بعد'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(garage => (
            <button
              key={garage.id}
              type="button"
              onClick={() => setSelectedGarage(garage)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-700 p-4 rounded-2xl text-right cursor-pointer transition-all group shadow-sm active:scale-98 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-black text-sm text-slate-900 dark:text-white leading-tight flex-1">
                  {garage.name || 'جراج بدون اسم'}
                </h3>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="space-y-0.5">
                {garage.ownerName && (
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    المالك: {garage.ownerName}
                  </p>
                )}
                {garage.phone && (
                  <p className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400" dir="ltr">
                    {garage.phone}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mt-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span>عرض تقرير يومي</span>
                <ChevronRight className="w-3.5 h-3.5 group-hover:text-emerald-500 rotate-180" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Load more */}
      {adminGarageHasMore && !search && (
        <div className="text-center mt-5">
          <button
            type="button"
            onClick={() => void loadMoreAdminGarages()}
            disabled={adminListsLoading}
            className="px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-black text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adminListsLoading ? 'جاري التحميل...' : 'تحميل المزيد'}
          </button>
        </div>
      )}

      {/* Daily report modal */}
      {selectedGarage && (
        <GarageDailyReportModal
          garage={selectedGarage}
          onClose={() => setSelectedGarage(null)}
        />
      )}
    </div>
  );
};
