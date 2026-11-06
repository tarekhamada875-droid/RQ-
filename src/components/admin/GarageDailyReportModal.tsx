/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Download, Calendar, ChevronLeft, ChevronRight, Loader2, AlertCircle,
  TrendingUp, LogIn, LogOut, FileSpreadsheet
} from 'lucide-react';
import { adminActivityService, type GarageDailyReport } from '../../services/adminActivityService';
import { safeDate } from '../../utils/dates';
import { useToast } from '../../hooks/toast';
import type { Garage } from '../../types';

interface GarageDailyReportModalProps {
  garage: Garage;
  onClose: () => void;
}

/**
 * Per-garage daily report modal.
 *
 * Flow:
 *   1. Modal opens with a calendar (current month, past dates enabled).
 *   2. Admin picks a date.
 *   3. Fetches daily_stats (1 read) + first 200 activity_logs (~1-200 reads).
 *   4. Shows summary card (entries, exits, revenue) + paginated log list.
 *   5. "Download CSV" button generates a CSV from the loaded logs (no extra reads).
 *
 * Read cost: ~3-201 per day-view. 5-min in-memory cache prevents refetching
 * the same garage+date when the user toggles between garages.
 */
export const GarageDailyReportModal = ({ garage, onClose }: GarageDailyReportModalProps) => {
  const { showToast } = useToast();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [report, setReport] = useState<GarageDailyReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Build the calendar grid for the current viewMonth
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.year, viewMonth.month, 1);
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
    // Sunday=0 ... Saturday=6. RTL layout, but the calendar grid still starts Sunday.
    const startWeekday = firstOfMonth.getDay();
    const days: Array<{ date: Date | null; dateId: string | null; isFuture: boolean; isToday: boolean }> = [];
    for (let i = 0; i < startWeekday; i += 1) {
      days.push({ date: null, dateId: null, isFuture: false, isToday: false });
    }
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum += 1) {
      const d = new Date(viewMonth.year, viewMonth.month, dayNum);
      d.setHours(0, 0, 0, 0);
      const dateId = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isFuture = d.getTime() > today.getTime();
      const isToday = d.getTime() === today.getTime();
      days.push({ date: d, dateId, isFuture, isToday });
    }
    return days;
  }, [viewMonth, today]);

  const monthName = useMemo(() => {
    const d = new Date(viewMonth.year, viewMonth.month, 1);
    return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(d);
  }, [viewMonth]);

  const goPrevMonth = useCallback(() => {
    setViewMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
  }, []);

  const goNextMonth = useCallback(() => {
    const next = viewMonth.month === 11 ? { year: viewMonth.year + 1, month: 0 } : { year: viewMonth.year, month: viewMonth.month + 1 };
    // Don't allow navigating past current month
    const now = new Date();
    const candidateLast = new Date(next.year, next.month + 1, 0);
    if (candidateLast.getTime() > now.getTime() && next.month >= now.getMonth() && next.year >= now.getFullYear()) return;
    setViewMonth(next);
  }, [viewMonth]);

  // Fetch report when a date is selected
  useEffect(() => {
    if (!selectedDate) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    adminActivityService.getGarageDailyReport(garage.id, garage.name || '', selectedDate)
      .then(r => {
        if (!cancelled) {
          setReport(r);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('[GarageDailyReportModal] fetch error:', err);
          setLoadError('تعذّر تحميل بيانات اليوم. حاول مرة أخرى.');
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [selectedDate, garage.id, garage.name]);

  const handleDownloadCSV = useCallback(() => {
    if (!report || report.logs.length === 0) return;
    try {
      const escapeCsv = (val: any): string => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };
      const headers = ['التوقيت', 'العملية', 'المستخدم', 'اللوحة/التفاصيل', 'المبلغ'];
      const rows = [headers.map(escapeCsv).join(',')];
      for (const log of report.logs) {
        const ts = safeDate(log.timestamp);
        const tsStr = isNaN(ts.getTime()) ? '' : new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
          timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true, day: 'numeric', month: 'numeric'
        }).format(ts);
        const action = log.actionType || (log as any).action || '';
        const user = log.staffName || (log as any).operatorName || 'النظام';
        const detail = log.plateNumber || (typeof log.details === 'string' ? log.details : '') || '';
        const amount = typeof log.amount === 'number' && log.amount > 0 ? log.amount : '';
        rows.push([tsStr, action, user, detail, amount].map(escapeCsv).join(','));
      }
      const csvContent = '\uFEFF' + rows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `تقرير-${garage.name || garage.id}-${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`تم تحميل ${report.logs.length} سجل`, 'success');
    } catch (err) {
      console.error('[GarageDailyReportModal] CSV error:', err);
      showToast('تعذّر تصدير الملف. حاول مرة أخرى.', 'error');
    }
  }, [report, garage, selectedDate, showToast]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 font-sans animate-overlay-30fps"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl transition-all animate-popup-30fps flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center font-black shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">
                تقرير يومي — {garage.name || 'جراج'}
              </h3>
              <p className="text-[11px] font-bold text-slate-400">
                اختر التاريخ لعرض كل ما حدث في ذلك اليوم
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={goPrevMonth}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors"
              aria-label="الشهر السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="font-black text-sm text-slate-900 dark:text-white">{monthName}</span>
            <button
              type="button"
              onClick={goNextMonth}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="الشهر التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'].map(d => (
              <div key={d} className="text-[10px] font-black text-slate-400 py-1">{d}</div>
            ))}
            {calendarDays.map((day, idx) => {
              if (!day.date) {
                return <div key={idx} className="aspect-square" />;
              }
              const isSelected = day.dateId === selectedDate;
              const isFuture = day.isFuture;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isFuture}
                  onClick={() => setSelectedDate(day.dateId)}
                  className={`aspect-square rounded-lg text-xs font-black transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-md'
                      : isFuture
                        ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                        : day.isToday
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-500'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body — summary + log list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!selectedDate ? (
            <div className="text-center py-10">
              <Calendar className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                اختر يوماً من التقويم أعلاه لعرض التقرير
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-3" />
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">جاري تحميل بيانات اليوم...</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-10 h-10 text-rose-400 mb-3" />
              <p className="text-sm font-bold text-rose-500 text-center">{loadError}</p>
            </div>
          ) : report ? (
            <>
              {/* Summary card */}
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-4">
                <div className="text-center mb-3">
                  <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 mb-0.5">
                    ملخص اليوم
                  </p>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono" dir="ltr">
                    {selectedDate}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-2.5 text-center">
                    <LogIn className="w-4 h-4 text-sky-500 mx-auto mb-1" />
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">دخول</p>
                    <p className="text-base font-black text-slate-900 dark:text-white font-mono">
                      {report.summary.entries.toLocaleString('ar-EG')}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-2.5 text-center">
                    <LogOut className="w-4 h-4 text-rose-500 mx-auto mb-1" />
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">خروج</p>
                    <p className="text-base font-black text-slate-900 dark:text-white font-mono">
                      {report.summary.exits.toLocaleString('ar-EG')}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-2.5 text-center">
                    <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إيراد</p>
                    <p className="text-base font-black text-slate-900 dark:text-white font-mono">
                      {report.summary.revenue.toLocaleString('ar-EG')}
                      <span className="text-[10px] mr-0.5">ج.م</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Log list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white">
                    سجل العمليات ({report.logs.length.toLocaleString('ar-EG')}
                    {report.truncated ? ' — أول 200' : ''})
                  </h4>
                  {report.logs.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadCSV}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors cursor-pointer active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تحميل CSV</span>
                    </button>
                  )}
                </div>
                {report.logs.length === 0 ? (
                  <div className="text-center py-6 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                    <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      لا توجد عمليات مسجلة في هذا اليوم
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar-emerald pr-1">
                    {report.logs.map((log) => {
                      const ts = safeDate(log.timestamp);
                      const tsStr = isNaN(ts.getTime()) ? '' : new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
                        timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true
                      }).format(ts);
                      const action = log.actionType || (log as any).action || '';
                      return (
                        <div
                          key={log.id}
                          className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2.5 border border-slate-200 dark:border-slate-700/60"
                        >
                          <span className="text-[10px] font-mono font-black text-slate-500 dark:text-slate-400 shrink-0 w-12" dir="ltr">
                            {tsStr}
                          </span>
                          <span className="text-[11px] font-bold text-slate-900 dark:text-white truncate flex-1">
                            {action}
                          </span>
                          {log.plateNumber && (
                            <span className="text-[10px] font-mono font-black text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded shrink-0">
                              {log.plateNumber}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
