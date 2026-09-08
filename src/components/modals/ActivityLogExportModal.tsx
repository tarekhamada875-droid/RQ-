/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { 
  X, 
  Download, 
  Clock, 
  Calendar, 
  CalendarDays, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import { firestoreService } from '../../services';
import { safeDate } from '../../utils';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';

interface ActivityLogExportModalProps {
  onClose: () => void;
}

type ExportPeriod = 'hour' | 'today' | 'week';

function formatCairoArabicDate(dateObj: any): string {
  const d = safeDate(dateObj);
  if (!d || isNaN(d.getTime())) return '';

  const parts = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(d);

  let weekday = '', day = '', month = '', year = '', hour = '', minute = '', dayPeriod = '';
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    else if (part.type === 'day') day = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'year') year = part.value;
    else if (part.type === 'hour') hour = part.value;
    else if (part.type === 'minute') minute = part.value;
    else if (part.type === 'dayPeriod') dayPeriod = part.value;
  }

  return `${weekday}، ${day} ${month} ${year} — ${hour}:${minute} ${dayPeriod}`;
}

function getActionLabel(action?: string): string {
  switch (action) {
    case 'check_in':
      return 'تسجيل دخول سيارة';
    case 'check_out':
      return 'تسجيل خروج سيارة';
    case 'recharge':
      return 'شحن اشتراك';
    case 'delete_refund':
      return 'حذف سيارة مع استرداد';
    case 'commission_payment':
      return 'دفع عمولة';
    default:
      return action || '';
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
      const days = log.details.durationDays ? ` — ${log.details.durationDays} يوم` : '';
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

export const ActivityLogExportModal = ({ onClose }: ActivityLogExportModalProps) => {
  const { adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);

  const [period, setPeriod] = useState<ExportPeriod>('today');
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const now = new Date();
      let sinceDate = new Date();

      if (period === 'hour') {
        sinceDate = new Date(now.getTime() - 60 * 60 * 1000);
      } else if (period === 'today') {
        sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      } else if (period === 'week') {
        sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        sinceDate.setHours(0, 0, 0, 0);
      }

      // Query logs from Firestore
      const logs = await firestoreService.getActivityLogsSince(sinceDate);

      if (!logs || logs.length === 0) {
        setErrorMessage(t('لا توجد عمليات مسجلة في هذه الفترة'));
        setIsExporting(false);
        return;
      }

      // Helper to escape CSV fields
      const escapeCsv = (val: any): string => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      // CSV Headers strictly according to v141
      const headers = [
        'التوقيت',
        'الجراج',
        'بواسطة',
        'العملية',
        'التفاصيل',
        'المبلغ (ج.م)'
      ];

      const csvRows = [headers.map(escapeCsv).join(',')];

      for (const log of logs) {
        const row = [
          formatCairoArabicDate(log.timestamp),
          log.garageName || '',
          log.staffName || (log as any).operatorName || 'مدير الجراج',
          getActionLabel(log.actionType || (log as any).action),
          getDetailsContent(log),
          getAmountContent(log)
        ];
        csvRows.push(row.map(escapeCsv).join(','));
      }

      // Prepend UTF-8 BOM for Arabic text Excel compatibility
      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const dateStr = now.toISOString().split('T')[0];
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `activity-log-${dateStr}-${period}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMessage(`${t('تم تصدير وتحميل الملف بنجاح')} (${logs.length} ${t('سجل')})`);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('CSV Export Error:', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 font-sans animate-overlay-30fps"
      dir={adminLang === 'en' ? 'ltr' : 'rtl'}
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl transition-all animate-popup-30fps">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center font-black">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                {t('تصدير سجل العمليات والنشاطات')}
              </h3>
              <p className="text-[11px] font-bold text-slate-400">
                {t('تحميل سجل النشاط (CSV)')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
            {t('اختر الفترة الزمنية المراد تحميل سجلاتها:')}
          </p>

          <div className="grid grid-cols-1 gap-2.5">
            {/* Hour Option */}
            <button
              type="button"
              onClick={() => setPeriod('hour')}
              className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer ${
                period === 'hour'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${period === 'hour' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                  <Clock className="w-4 h-4" />
                </div>
                <span className="text-xs font-black">{t('آخر ساعة')}</span>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${period === 'hour' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 dark:border-slate-600'}`}>
                {period === 'hour' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </button>

            {/* Today Option */}
            <button
              type="button"
              onClick={() => setPeriod('today')}
              className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer ${
                period === 'today'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${period === 'today' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                  <Calendar className="w-4 h-4" />
                </div>
                <span className="text-xs font-black">{t('اليوم')}</span>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${period === 'today' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 dark:border-slate-600'}`}>
                {period === 'today' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </button>

            {/* Past 7 Days Option */}
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition-all cursor-pointer ${
                period === 'week'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${period === 'week' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                  <CalendarDays className="w-4 h-4" />
                </div>
                <span className="text-xs font-black">{t('آخر 7 أيام')}</span>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${period === 'week' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 dark:border-slate-600'}`}>
                {period === 'week' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </button>
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-bold animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="w-full h-14 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('جاري تجهيز وتصدير ملف CSV...')}</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>{t('تحميل الملف')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
