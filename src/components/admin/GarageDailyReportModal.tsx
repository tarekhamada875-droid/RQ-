/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback } from 'react';
import {
  X, Download, Calendar, ChevronLeft, ChevronRight, Loader2, AlertCircle
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { safeDate } from '../../utils/dates';
import { useToast } from '../../hooks/toast';
import type { ActivityLog, Garage } from '../../types';

interface GarageDailyReportModalProps {
  garage: Garage;
  onClose: () => void;
}

const DAILY_REPORT_LOG_LIMIT = 200;

/**
 * Per-garage daily CSV export modal.
 *
 * Flow:
 *   1. Modal opens with a calendar (current month, past dates enabled).
 *   2. Admin picks a date.
 *   3. Fetches up to 200 activity_logs for that garage+date.
 *   4. Generates and downloads a CSV directly — no on-screen summary, no
 *      log list. The CSV is the report.
 *
 * Read cost: 1-N reads for activity_logs (capped at 200; N = actual
 * activity that day). 5-min in-memory cache prevents refetching the same
 * garage+date if the modal is reopened.
 */
const csvCache = new Map<string, { logs: ActivityLog[]; fetchedAt: number }>();
const CSV_CACHE_MS = 5 * 60 * 1000;

function getCairoDayBounds(dateId: string): { start: Date; end: Date } {
  // dateId is YYYY-MM-DD already in Cairo timezone
  const start = new Date(`${dateId}T00:00:00+02:00`);
  const end = new Date(`${dateId}T23:59:59.999+02:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    const now = new Date();
    return { start: now, end: now };
  }
  return { start, end };
}

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

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
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Build the calendar grid for the current viewMonth
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.year, viewMonth.month, 1);
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
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
    const now = new Date();
    const candidateLast = new Date(next.year, next.month + 1, 0);
    if (candidateLast.getTime() > now.getTime() && next.month >= now.getMonth() && next.year >= now.getFullYear()) return;
    setViewMonth(next);
  }, [viewMonth]);

  // Fetch activity logs and download CSV directly. No on-screen log list.
  const handleDownloadCSV = useCallback(async (dateId: string) => {
    setIsExporting(true);
    setExportError(null);
    try {
      const cacheKey = `${garage.id}:${dateId}`;
      const cached = csvCache.get(cacheKey);
      let logs: ActivityLog[];
      if (cached && Date.now() - cached.fetchedAt < CSV_CACHE_MS) {
        logs = cached.logs;
      } else {
        const { start, end } = getCairoDayBounds(dateId);
        const startTs = Timestamp.fromDate(start);
        const endTs = Timestamp.fromDate(end);
        try {
          const snap = await getDocs(query(
            collection(db, 'activity_logs'),
            where('garageId', '==', garage.id),
            where('timestamp', '>=', startTs),
            where('timestamp', '<=', endTs),
            orderBy('timestamp', 'desc'),
            limit(DAILY_REPORT_LOG_LIMIT)
          ));
          logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
        } catch (primaryErr) {
          // Composite index fallback: query by garageId only, filter by date client-side.
          console.warn('[GarageDailyReportModal] activity_logs index fallback:', primaryErr);
          const fallbackSnap = await getDocs(query(
            collection(db, 'activity_logs'),
            where('garageId', '==', garage.id),
            orderBy('timestamp', 'desc'),
            limit(DAILY_REPORT_LOG_LIMIT * 2)
          ));
          const startMs = start.getTime();
          const endMs = end.getTime();
          logs = fallbackSnap.docs
            .filter(d => {
              const t = safeDate(d.data()?.timestamp).getTime();
              return t >= startMs && t <= endMs;
            })
            .slice(0, DAILY_REPORT_LOG_LIMIT)
            .map(d => ({ id: d.id, ...d.data() } as ActivityLog));
        }
        csvCache.set(cacheKey, { logs, fetchedAt: Date.now() });
      }

      if (logs.length === 0) {
        setExportError('لا توجد عمليات مسجلة في هذا اليوم');
        setIsExporting(false);
        return;
      }

      // Generate CSV
      const headers = ['التوقيت', 'العملية', 'المستخدم', 'اللوحة/التفاصيل', 'المبلغ'];
      const rows = [headers.map(escapeCsv).join(',')];
      for (const log of logs) {
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
      link.setAttribute('download', `تقرير-${garage.name || garage.id}-${dateId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`تم تحميل ${logs.length} سجل من ${garage.name || 'الجراج'} — ${dateId}`, 'success');
      onClose();
    } catch (err) {
      console.error('[GarageDailyReportModal] CSV error:', err);
      setExportError('تعذّر تحميل الملف. حاول مرة أخرى.');
      setIsExporting(false);
    }
  }, [garage, onClose, showToast]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 font-sans animate-overlay-30fps"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl transition-all animate-popup-30fps"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center font-black shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">
                تقرير يومي — {garage.name || 'جراج'}
              </h3>
              <p className="text-[11px] font-bold text-slate-400">
                اختر التاريخ ثم اضغط زر التحميل
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={goPrevMonth}
              disabled={isExporting}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="الشهر السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="font-black text-sm text-slate-900 dark:text-white">{monthName}</span>
            <button
              type="button"
              onClick={goNextMonth}
              disabled={isExporting}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  disabled={isFuture || isExporting}
                  onClick={() => {
                    setSelectedDate(day.dateId);
                  }}
                  className={`aspect-square rounded-lg text-xs font-black transition-all ${
                    isSelected
                      ? 'bg-emerald-500 text-white shadow-md'
                      : isFuture
                        ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                        : day.isToday
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-500 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-950/50'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
                  } ${!isFuture && !isSelected ? 'active:scale-95' : ''}`}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Loading state */}
          {isExporting && (
            <div className="mt-4 flex flex-col items-center justify-center py-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">جاري تحميل البيانات وتصدير الملف...</p>
            </div>
          )}

          {/* Error */}
          {exportError && !isExporting && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300">{exportError}</p>
            </div>
          )}

          {/* Hint */}
          {!isExporting && !exportError && !selectedDate && (
            <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500 text-center font-bold leading-relaxed">
              اختر يوماً من التقويم أولاً
            </p>
          )}
          {selectedDate && !isExporting && !exportError && (
            <p className="mt-4 text-[11px] text-emerald-600 dark:text-emerald-400 text-center font-bold leading-relaxed font-mono" dir="ltr">
              التاريخ المختار: {selectedDate}
            </p>
          )}

          {/* Download button */}
          <button
            type="button"
            onClick={() => selectedDate && void handleDownloadCSV(selectedDate)}
            disabled={!selectedDate || isExporting}
            className={`mt-4 w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
              selectedDate && !isExporting
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md active:scale-98 cursor-pointer'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري التحميل...</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>تحميل سجل اليوم (CSV)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
