import React from 'react';
import { CheckCircle2, Clock3, Laptop2, Loader2, LogOut, RefreshCw, ShieldCheck, Smartphone, Tablet, XCircle } from 'lucide-react';
import { ActiveSession, sessionService } from '../../services/sessionService';

interface AdminActiveSessionsViewProps {
  onLogout: () => void;
  onBack: () => void;
  t: (key: string) => string;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

function formatTimestamp(value: string | null, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function deviceIcon(session: ActiveSession): React.ReactNode {
  if (session.isCurrent) return <Laptop2 className="w-5 h-5" />;
  if (session.isActive) return <Smartphone className="w-5 h-5" />;
  return <Tablet className="w-5 h-5" />;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('401') || message.includes('UNAUTHORIZED')) return 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً';
  if (message.includes('403') || message.includes('FORBIDDEN')) return 'لا تملك صلاحية إدارة جلسات هذا الحساب';
  if (message.includes('404') || message.includes('SESSION_NOT_FOUND')) return 'لم تعد هذه الجلسة موجودة، حدّث القائمة';
  return 'تعذر تحميل جلسات الأجهزة أو تحديثها';
}

export const AdminActiveSessionsView: React.FC<AdminActiveSessionsViewProps> = ({ onLogout, onBack, t, showToast }) => {
  const [sessions, setSessions] = React.useState<ActiveSession[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busySession, setBusySession] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadSessions = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSessions(await sessionService.listActiveSessions());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const revokeSession = async (session: ActiveSession) => {
    if (!session.id || busySession) return;
    if (!window.confirm(session.isCurrent ? 'هل تريد تسجيل الخروج من هذا الجهاز؟' : 'هل تريد إلغاء جلسة هذا الجهاز؟')) return;
    setBusySession(session.id);
    setError(null);
    try {
      const result = await sessionService.revokeActiveSession(session.id);
      if (result.wasCurrent || session.isCurrent) {
        onLogout();
        return;
      }
      setSessions((current) => current.filter((entry) => entry.id !== session.id));
      showToast?.('تم إلغاء جلسة الجهاز بنجاح', 'success');
    } catch (revokeError) {
      const message = errorMessage(revokeError);
      setError(message);
      showToast?.(message, 'error');
      if (message.includes('انتهت الجلسة')) onLogout();
    } finally {
      setBusySession(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">الأجهزة والجلسات النشطة</h2>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">راجع الأجهزة التي تستخدم حسابك وألغِ الجلسات غير المعروفة.</p>
        </div>
        <button type="button" onClick={onBack} className="px-4 py-2 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-sm font-black text-slate-600 dark:text-slate-300 hover:border-emerald-500">عودة</button>
      </div>

      <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 flex gap-3 items-start">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-xs leading-6 font-bold text-emerald-900 dark:text-emerald-200">المعرّفات المعروضة هنا غير قابلة لعكسها إلى رقم الجلسة الحقيقي. لا تشاركها خارج فريقك.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 p-4 flex items-start gap-3 text-rose-700 dark:text-rose-300">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span className="text-sm font-bold">{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-slate-500 dark:text-slate-400">{sessions.length} جلسة</span>
        <button type="button" onClick={() => void loadSessions()} disabled={isLoading} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 text-xs font-black disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-slate-400"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /><span className="text-sm font-bold">جاري تحميل الجلسات...</span></div>
      ) : sessions.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-500">لا توجد جلسات نشطة ظاهرة لهذا الحساب.</div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <article key={session.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${session.isCurrent ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{deviceIcon(session)}</div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-900 dark:text-white">{session.isCurrent ? 'هذا الجهاز' : 'جهاز مسجّل'}</span>
                  {session.isCurrent && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-black"><CheckCircle2 className="w-3 h-3" /> الحالي</span>}
                  {!session.isActive && <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 text-[10px] font-black">غير نشط</span>}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400"><Clock3 className="w-3.5 h-3.5" /> آخر نشاط: {formatTimestamp(session.lastActive, 'ar-EG')}</div>
                <div className="text-[10px] font-mono text-slate-400 truncate">معرّف آمن: {session.id.slice(0, 12)}…</div>
              </div>
              <button type="button" onClick={() => void revokeSession(session)} disabled={busySession !== null} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-black disabled:opacity-50 shrink-0">
                {busySession === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                {session.isCurrent ? 'تسجيل الخروج' : 'إلغاء الجلسة'}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
