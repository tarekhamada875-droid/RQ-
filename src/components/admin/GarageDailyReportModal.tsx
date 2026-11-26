/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  X, Download, Calendar, ChevronDown, ChevronLeft, ChevronRight, Loader2, AlertCircle
} from 'lucide-react';
import { db } from '../../firebase';
import {
  collection, query, where, getDocs, orderBy, limit, Timestamp,
  getCountFromServer, startAfter,
} from 'firebase/firestore';
import { safeDate, AR_DAY } from '../../utils/dates';
import { getCairoDayBounds } from '../../../server/projections';
import { useToast } from '../../hooks/toast';
import type { ActivityLog, Garage } from '../../types';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { isMissingActivityLogIndexError } from '../../services/activityLogShared';

interface GarageDailyReportModalProps {
  garage: Garage;
  onClose: () => void;
}

const DAILY_REPORT_LOG_LIMIT = 200;
// "Download everything" pages this many docs per request and walks backwards
// through the day until Firestore returns a short page.
const CSV_PAGE_SIZE = 500;

/**
 * Per-garage daily CSV export modal.
 *
 * Flow (owner redesign 2026-11-22 — replaces the full calendar grid, which
 * was confusing: most days had nothing in them; later the same day the
 * always-visible day list was shrank into one dropdown after the owner
 * found it filled the whole screen with no way to scroll):
 * 1. Modal opens and counts each day's operations for the visible month
 *    (one index-only count query per day, run in parallel; days before the
 *    garage existed and future days are skipped — they cannot have ops).
 * 2. The active days live behind ONE select-style button ("اختر يوماً").
 *    Opening it reveals a small capped scrollable panel (max 260px) listing
 *    ONLY days that have operations, newest first, with the count on each
 *    row. The modal itself is capped at 85dvh with its own scroll region,
 *    so nothing can overflow the screen anymore.
 * 3. Tapping a day downloads its CSV directly. If the day has more than
 *    DAILY_REPORT_LOG_LIMIT operations, a choice dialog appears first:
 *    "latest 200 only" or "ALL of them" (paginated fetch).
 *
 * Read cost: identical to the old list design — opening a month = 1
 * index-only count per counted day (~22-31, minimum 1 read each), cached
 * 5 minutes per garage+month. A day download = N reads (N = that day's
 * logs, capped at 200 for "latest", uncapped for "all" — the admin
 * explicitly chose "all"). 5-min in-memory caches prevent refetching the
 * same month / same garage+date+mode.
 */

// ── month day-count cache (bounded, same eviction pattern as csvCache) ──
const monthCountsCache = new Map<string, { counts: Record<string, number>; fetchedAt: number }>();
const MONTH_COUNTS_CACHE_MS = 5 * 60 * 1000;
const MONTH_COUNTS_CACHE_MAX_ENTRIES = 24;
function rememberMonthCounts(key: string, counts: Record<string, number>): void {
  if (monthCountsCache.size >= MONTH_COUNTS_CACHE_MAX_ENTRIES) {
    const oldestKey = monthCountsCache.keys().next().value;
    if (oldestKey !== undefined) monthCountsCache.delete(oldestKey);
  }
  monthCountsCache.set(key, { counts, fetchedAt: Date.now() });
}

const csvCache = new Map<string, { logs: ActivityLog[]; fetchedAt: number }>();
const CSV_CACHE_MS = 5 * 60 * 1000;
// Audit fix (2026-11-21): the cache previously grew unbounded for the whole
// session (up to 200 logs per garage:date). Evict the oldest entry at 50.
const CSV_CACHE_MAX_ENTRIES = 50;
function rememberCsvCache(key: string, value: { logs: ActivityLog[]; fetchedAt: number }): void {
  if (csvCache.size >= CSV_CACHE_MAX_ENTRIES) {
    const oldestKey = csvCache.keys().next().value;
    if (oldestKey !== undefined) csvCache.delete(oldestKey);
  }
  csvCache.set(key, value);
}

// Audit fix (2026-11-21): the local copy below hardcoded +02:00, which is
// wrong during Egypt's daylight-saving period (+03:00, ~April–October) —
// activity between 00:00 and 01:00 local fell outside the day window. The
// shared Cairo helper resolves the real Africa/Cairo offset per date.
// NOTE: the shared bounds return an EXCLUSIVE end (next day's 00:00); callers
// must use `<` against the end timestamp.

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Translate raw actionType codes (e.g. 'check_in', 'subscriber_renewal_debit')
 * to human-readable Arabic labels. Mirrors the labels that were previously
 * shown in the now-removed ActivityLogExportModal.
 */
function getActionLabel(action?: string): string {
  switch (action) {
    case 'check_in':
      return 'تسجيل دخول سيارة';
    case 'check_out':
      return 'تسجيل خروج سيارة';
    case 'recharge':
      return 'شحن رصيد';
    case 'delete_refund':
      return 'حذف سيارة مع استرداد';
    case 'commission_earned':
      return 'استحقاق عمولة';
    case 'credit_grant':
      return 'منح رصيد';
    case 'prepaid_credit_grant_paid':
      return 'منح رصيد مدفوع';
    case 'trial_grant':
      return 'منح رصيد تجريبي';
    case 'referral_award':
    case 'credit_referral_award':
      return 'مكافأة إحالة';
    case 'regular_entry_debit':
      return 'خصم رصيد لدخول سيارة';
    case 'subscriber_renewal_debit':
      return 'خصم رصيد لتجديد مشترك';
    case 'correction_restore':
    case 'credit_correction':
      return 'تعديل رصيد';
    case 'vehicle_refunded':
      return 'استرداد مبلغ';
    case 'garage_delete':
      return 'حذف جراج';
    default:
      return action ? 'عملية أخرى' : '';
  }
}

function getDetailsContent(log: any): string {
  const action = log.actionType || log.action;
  if (action === 'check_in' || action === 'check_out') {
    return log.plateNumber || '';
  }
  if (action === 'delete_refund') {
    const raw = log.plateNumber || (typeof log.details === 'string' ? log.details : '');
    return raw.replace(/^مسح لوحة:\s*/, '');
  }
  if (action === 'recharge') {
    if (log.details && typeof log.details === 'object' && log.details.packageName) {
      const days = log.details.durationDays ? ` — ${log.details.durationDays} ${AR_DAY(Number(log.details.durationDays))}` : '';
      return `${log.details.packageName}${days}`;
    }
    if (typeof log.details === 'string' && log.details.trim()) {
      return log.details;
    }
    return log.plateNumber || '';
  }
  if (typeof log.details === 'string' && log.details.trim()) {
    return log.details.replace(/^مسح لوحة:\s*/, '');
  }
  return log.plateNumber || '';
}

function getAmountContent(log: any): string | number {
  const val = typeof log.amount === 'number' ? log.amount : (typeof log.totalFee === 'number' ? log.totalFee : null);
  if (val !== null && val !== undefined && val > 0) {
    return val;
  }
  return '';
}

/** Arabic count of operations with proper singular/dual/plural forms. */
function opsLabel(n: number): string {
  const digits = n.toLocaleString('ar-EG');
  if (n === 1) return 'عملية واحدة';
  if (n === 2) return 'عمليتان';
  if (n >= 3 && n <= 10) return `${digits} عمليات`;
  return `${digits} عملية`;
}

/** YYYY-MM-DD key for a calendar day, matching the rest of the app's date ids. */
function toDateId(year: number, monthIndex0: number, day: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The days of `viewMonth` that are worth counting: from the month's first day
 * (or the garage's creation day, whichever is later — earlier days cannot
 * have operations) to the month's last day (or today, whichever is earlier).
 */
function countableDays(garage: Garage, year: number, monthIndex0: number, today: Date): Array<{ dateId: string; day: number }> {
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const firstDay = 1;
  let lastDay = daysInMonth;
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex0;
  if (isCurrentMonth) lastDay = Math.min(lastDay, today.getDate());
  const createdAt = garage.createdAt ? safeDate(garage.createdAt) : null;
  let startDay = firstDay;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    const created = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
    const monthStart = new Date(year, monthIndex0, 1);
    if (created.getTime() > monthStart.getTime()) {
      startDay = created.getDate();
    }
  }
  const days: Array<{ dateId: string; day: number }> = [];
  for (let d = startDay; d <= lastDay; d += 1) {
    days.push({ dateId: toDateId(year, monthIndex0, d), day: d });
  }
  return days;
}

async function countDayOperations(garageId: string, dateId: string): Promise<number> {
  const { start, end } = getCairoDayBounds(dateId);
  const snap = await getCountFromServer(query(
    collection(db, 'activity_logs'),
    where('garageId', '==', garageId),
    where('timestamp', '>=', Timestamp.fromDate(start)),
    where('timestamp', '<', Timestamp.fromDate(end)),
  ));
  return snap.data().count ?? 0;
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
  // Per-day operation counts for the visible month (only counted days keyed).
  const [dayCounts, setDayCounts] = useState<Record<string, number> | null>(null);
  const [isCounting, setIsCounting] = useState(true);
  const [countError, setCountError] = useState(false);
  // The busy day (> DAILY_REPORT_LOG_LIMIT ops) waiting for the user to pick
  // "latest 200 only" or "all of them".
  const [choiceDay, setChoiceDay] = useState<{ dateId: string; count: number } | null>(null);
  // The select-style day picker panel (owner fix: the always-visible list
  // filled the screen and had no scrolling).
  const [pickerOpen, setPickerOpen] = useState(false);
  const { isLoading: isExporting, run: runCsvExport } = useAsyncAction();
  const [exportError, setExportError] = useState<string | null>(null);

  const monthName = useMemo(() => {
    const d = new Date(viewMonth.year, viewMonth.month, 1);
    return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(d);
  }, [viewMonth]);

  const monthCacheKey = `${garage.id}:${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}`;

  // Count each countable day of the visible month (parallel, cached 5 min).
  useEffect(() => {
    let cancelled = false;
    const cached = monthCountsCache.get(monthCacheKey);
    if (cached && Date.now() - cached.fetchedAt < MONTH_COUNTS_CACHE_MS) {
      setDayCounts(cached.counts);
      setIsCounting(false);
      setCountError(false);
      return () => { cancelled = true; };
    }
    setIsCounting(true);
    setCountError(false);
    setDayCounts(null);
    void (async () => {
      try {
        const days = countableDays(garage, viewMonth.year, viewMonth.month, today);
        const entries = await Promise.all(days.map(async ({ dateId }) => {
          const count = await countDayOperations(garage.id, dateId);
          return [dateId, count] as const;
        }));
        const counts: Record<string, number> = {};
        for (const [dateId, count] of entries) {
          if (count > 0) counts[dateId] = count;
        }
        rememberMonthCounts(monthCacheKey, counts);
        if (!cancelled) {
          setDayCounts(counts);
          setIsCounting(false);
        }
      } catch (countErr) {
        console.error('[GarageDailyReportModal] day counts failed:', countErr);
        if (!cancelled) {
          setCountError(true);
          setIsCounting(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // monthCacheKey derives from garage.id + viewMonth, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garage.id, viewMonth]);

  const goPrevMonth = useCallback(() => {
    setPickerOpen(false);
    setViewMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
  }, []);

  const goNextMonth = useCallback(() => {
    const next = viewMonth.month === 11 ? { year: viewMonth.year + 1, month: 0 } : { year: viewMonth.year, month: viewMonth.month + 1 };
    const now = new Date();
    const candidateLast = new Date(next.year, next.month + 1, 0);
    if (candidateLast.getTime() > now.getTime() && next.month >= now.getMonth() && next.year >= now.getFullYear()) return;
    setPickerOpen(false);
    setViewMonth(next);
  }, [viewMonth]);

  // The days that have operations, newest first. Null while counting.
  const activeDays = useMemo(() => {
    if (!dayCounts) return null;
    return Object.entries(dayCounts)
      .filter(([, count]) => count > 0)
      .map(([dateId, count]) => ({ dateId, count }))
      .sort((a, b) => b.dateId.localeCompare(a.dateId));
  }, [dayCounts]);

  const dayLabel = useCallback((dateId: string): string => {
    // Noon UTC keeps the calendar day stable across the Cairo offset (+2/+3),
    // and the formatter anchors to Africa/Cairo like every app clock.
    const date = safeDate(`${dateId}T12:00:00.000Z`);
    return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }).format(date);
  }, []);

  // Fetch one day's logs. mode 'latest' = newest 200 (existing single-query +
  // index fallback); mode 'all' = every log of the day, page by page.
  const fetchLogsForDay = useCallback(async (dateId: string, mode: 'latest' | 'all'): Promise<ActivityLog[]> => {
    const { start, end } = getCairoDayBounds(dateId);
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);
    if (mode === 'latest') {
      try {
        const snap = await getDocs(query(
          collection(db, 'activity_logs'),
          where('garageId', '==', garage.id),
          where('timestamp', '>=', startTs),
          where('timestamp', '<', endTs),
          orderBy('timestamp', 'desc'),
          limit(DAILY_REPORT_LOG_LIMIT)
        ));
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
      } catch (primaryErr) {
        // Audit F-9 (Phase 3, 2026-11-26): only fall back to the garageId-only
        // compatibility query when the failure is actually a missing composite
        // index. The previous code fell back on ANY error, which silently
        // degraded on unrelated failures (permission-denied, network) and hid
        // real problems behind a client-side date filter. The shared classifier
        // now decides; a non-index error re-throws so the caller surfaces it.
        if (!isMissingActivityLogIndexError(primaryErr)) throw primaryErr;
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
        return fallbackSnap.docs
          .filter(d => {
            const t = safeDate(d.data()?.timestamp).getTime();
            return t >= startMs && t <= endMs;
          })
          .slice(0, DAILY_REPORT_LOG_LIMIT)
          .map(d => ({ id: d.id, ...d.data() } as ActivityLog));
      }
    }
    // 'all' mode: paginate backwards through the day until a short page.
    // No index fallback here — the fallback query cannot paginate honestly,
    // so a failure surfaces as a retryable error instead.
    const all: ActivityLog[] = [];
    let cursor: any = null;
    for (;;) {
      const constraints: any[] = [
        collection(db, 'activity_logs'),
        where('garageId', '==', garage.id),
        where('timestamp', '>=', startTs),
        where('timestamp', '<', endTs),
        orderBy('timestamp', 'desc'),
        limit(CSV_PAGE_SIZE),
      ];
      if (cursor) constraints.push(startAfter(cursor));
      const snap = await getDocs(query(...(constraints as [any, ...any[]])));
      const docs = snap.docs;
      all.push(...docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as ActivityLog)));
      if (docs.length < CSV_PAGE_SIZE) break;
      cursor = docs[docs.length - 1];
    }
    return all;
  }, [garage.id]);

  const handleDownloadCSV = useCallback((dateId: string, mode: 'latest' | 'all') => {
    setExportError(null);
    void runCsvExport(async () => {
      const cacheKey = `${garage.id}:${dateId}:${mode}`;
      const cached = csvCache.get(cacheKey);
      let logs: ActivityLog[];
      if (cached && Date.now() - cached.fetchedAt < CSV_CACHE_MS) {
        logs = cached.logs;
      } else {
        logs = await fetchLogsForDay(dateId, mode);
        rememberCsvCache(cacheKey, { logs, fetchedAt: Date.now() });
      }

      if (logs.length === 0) {
        setExportError('لا توجد عمليات مسجلة في هذا اليوم');
        return;
      }

      // Pure clean table — just headers + rows. The garage name + date are
      // already in the filename, so they don't need to be inside the file.
      // This keeps the CSV maximally sortable/filterable in Excel.
      const headers = ['#', 'التوقيت', 'نوع العملية', 'المستخدم', 'اللوحة/التفاصيل', 'المبلغ (ج.م)'];
      const rows: string[] = [headers.map(escapeCsv).join(',')];

      logs.forEach((log, index) => {
        const ts = safeDate(log.timestamp);
        const tsStr = isNaN(ts.getTime()) ? '' : new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
          timeZone: 'Africa/Cairo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          day: 'numeric',
          month: 'numeric',
        }).format(ts);
        const actionLabel = getActionLabel(log.actionType || (log as any).action);
        const user = log.staffName || (log as any).operatorName || 'النظام';
        const detail = getDetailsContent(log);
        const amount = getAmountContent(log);
        rows.push([index + 1, tsStr, actionLabel, user, detail, amount].map(escapeCsv).join(','));
      });

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
      setChoiceDay(null);
      onClose();
    }, (err: unknown) => {
      console.error('[GarageDailyReportModal] CSV error:', err);
      setExportError('تعذّر تحميل الملف. حاول مرة أخرى.');
    });
  }, [garage, onClose, showToast, runCsvExport, fetchLogsForDay]);

  const handleTapDay = useCallback((dateId: string, count: number) => {
    if (isExporting) return;
    if (count > DAILY_REPORT_LOG_LIMIT) {
      // Busy day: let the admin choose between the fast cap and everything.
      setChoiceDay({ dateId, count });
      return;
    }
    handleDownloadCSV(dateId, 'latest');
  }, [isExporting, handleDownloadCSV]);

  // Escape closes the day panel first, then the modal.
  const handleRequestClose = useCallback(() => {
    if (pickerOpen) {
      setPickerOpen(false);
    } else {
      onClose();
    }
  }, [pickerOpen, onClose]);

  const modalA11y = useModalA11y(handleRequestClose);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 font-sans"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] max-h-[85dvh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl "
        onClick={(e) => e.stopPropagation()}
        {...modalA11y.containerProps}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center font-black shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight truncate">
                تقرير يومي — {garage.name || 'جراج'}
              </h3>
              <p className="text-[11px] font-bold text-slate-400">
                أيام العمليات فقط — اختر يوماً لتحميل تقريره
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto min-h-0">
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goPrevMonth}
              disabled={isExporting || isCounting}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="الشهر السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="font-black text-sm text-slate-900 dark:text-white">{monthName}</span>
            <button
              type="button"
              onClick={goNextMonth}
              disabled={isExporting || isCounting}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="الشهر التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Day-count loading state */}
          {isCounting && (
            <div className="flex flex-col items-center justify-center py-8 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">جاري فحص أيام العمليات...</p>
            </div>
          )}

          {/* Day-count failure (retryable) */}
          {countError && !isCounting && (
            <div className="flex flex-col items-center justify-center py-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
              <AlertCircle className="w-6 h-6 text-rose-500 mb-2" />
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300 mb-3">تعذّر فحص أيام العمليات. حاول مرة أخرى.</p>
              <button
                type="button"
                onClick={() => {
                  // Bust the (absent) cache entry by forcing the effect via key bump.
                  monthCountsCache.delete(monthCacheKey);
                  setViewMonth(m => ({ ...m }));
                }}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black cursor-pointer"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          {/* Select-style day picker — the list stays hidden behind one button. */}
          {!isCounting && !countError && activeDays !== null && activeDays.length > 0 && (
            <button
              type="button"
              onClick={() => setPickerOpen(o => !o)}
              disabled={isExporting}
              aria-expanded={pickerOpen}
              aria-controls="daily-report-day-list"
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-right"
            >
              <span className="text-sm font-black text-slate-900 dark:text-white">اختر يوماً</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 ${pickerOpen ? 'rotate-180' : ''}`} />
            </button>
          )}

          {/* The day panel itself — capped height, real scrolling inside. */}
          {pickerOpen && !isCounting && !countError && activeDays !== null && activeDays.length > 0 && (
            <div
              id="daily-report-day-list"
              className="max-h-[260px] overflow-y-auto rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-2 space-y-1.5"
              role="list"
              aria-label="أيام العمليات"
            >
              {activeDays.map(({ dateId, count }) => (
                <button
                  key={dateId}
                  type="button"
                  role="listitem"
                  onClick={() => handleTapDay(dateId, count)}
                  disabled={isExporting}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-right"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-slate-900 dark:text-white">{dayLabel(dateId)}</span>
                    <span className="block text-[11px] font-bold text-slate-400 dark:text-slate-500">{opsLabel(count)}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-emerald-600 dark:text-emerald-400">
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Empty month — one hint, never duplicated inside the panel. */}
          {!isCounting && !countError && activeDays !== null && activeDays.length === 0 && (
            <div className="py-6 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <Calendar className="w-9 h-9 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">لا توجد عمليات في هذا الشهر</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400 dark:text-slate-500">جرّب شهراً سابقاً بالسهم الأيمن</p>
            </div>
          )}

          {/* Export loading state */}
          {isExporting && (
            <div className="flex flex-col items-center justify-center py-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">جاري تحميل البيانات وتصدير الملف...</p>
            </div>
          )}

          {/* Error */}
          {exportError && !isExporting && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300">{exportError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Busy-day choice: latest 200 only, or every operation of that day */}
      {choiceDay && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 font-sans"
          dir="rtl"
          onClick={() => setChoiceDay(null)}
          role="dialog"
          aria-modal="true"
          aria-label="اختر نطاق التحميل"
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800/80">
              <h4 className="text-base font-black text-slate-900 dark:text-white">
                هذا اليوم فيه {opsLabel(choiceDay.count)}
              </h4>
              <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                التحميل السريع يشمل آخر {DAILY_REPORT_LOG_LIMIT.toLocaleString('ar-EG')} عملية فقط. اختر ما يناسبك:
              </p>
            </div>
            <div className="p-5 space-y-2.5">
              <button
                type="button"
                onClick={() => handleDownloadCSV(choiceDay.dateId, 'all')}
                disabled={isExporting}
                className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                <span>تحميل كل العمليات ({choiceDay.count.toLocaleString('ar-EG')})</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadCSV(choiceDay.dateId, 'latest')}
                disabled={isExporting}
                className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-5 h-5" />
                <span>تحميل آخر {DAILY_REPORT_LOG_LIMIT.toLocaleString('ar-EG')} عملية فقط</span>
              </button>
              <button
                type="button"
                onClick={() => setChoiceDay(null)}
                disabled={isExporting}
                className="w-full py-2.5 rounded-2xl text-slate-400 font-black text-xs cursor-pointer disabled:opacity-50"
              >
                رجوع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
