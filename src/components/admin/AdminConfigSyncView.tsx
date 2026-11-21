import React, { useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../api/apiClient';
import { useBackHandler } from '../../hooks/backHandler';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { formatEgpPerCredit, rateToEgpPerCredit } from '../../utils/creditRate';

/**
 * Owner's manual "sync now" page (perf plan 2026-11-21).
 *
 * GET /api/system-config answers are edge-cached on Cloudflare for 30 days
 * (owner's quota decision: ~1 Firestore read/colo/month instead of 1 per
 * request). Saves bump the cache version automatically, so manual sync is
 * ONLY needed as a safety hatch — e.g. if the owner suspects a device is
 * showing stale values, or the post-save auto-sync reported a failure.
 *
 * The button calls POST /api/admin/sync-system-config-cache: it bumps the
 * version board (a Durable Object, strongly consistent) so EVERY Cloudflare
 * location drops its cached copy immediately, then re-warms the nearest one
 * with a fresh read. The response echoes the fresh config so the owner can
 * confirm exactly which values are now being served.
 *
 * UX (owner request 2026-11-21): the page behaves like the garage
 * dashboard's reports page — it opens FULLSCREEN over the admin dashboard
 * from the top-left corner menu (same pattern as AppearanceSettingsModal
 * and GarageReportsView). Cleanup same day: no explainer paragraph, no
 * duplicate icon — just the sync button and the result message.
 */
interface SyncResult {
  ok: boolean;
  message: string;
  config?: { creditRate?: number; paymentWalletNumber?: string };
}

export const AdminConfigSyncView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { isLoading: isSyncing, run: runSync } = useAsyncAction();
  const [result, setResult] = useState<SyncResult | null>(null);

  // Android back button closes the fullscreen page (stack is popped
  // top-first, so this wins over anything below it while mounted).
  useBackHandler(() => { onBack(); return true; }, true);

  const handleSync = async () => {
    if (isSyncing) return;
    setResult(null);
    await runSync(async () => {
      const data = await apiFetch<{ success?: boolean; config?: { creditRate?: number; paymentWalletNumber?: string }; cacheSync?: string }>(
        '/api/admin/sync-system-config-cache',
        { method: 'POST' }
      );
      if (data?.success && data.cacheSync === 'ok') {
        setResult({
          ok: true,
          message: 'تمت المزامنة بنجاح. القيم الجديدة أصبحت مطبقة على كل الأجهزة فوراً.',
          config: data.config,
        });
      } else if (data?.success && data.cacheSync === 'not_configured') {
        // No cache in this environment → nothing stale can exist anywhere.
        setResult({
          ok: true,
          message: 'لا توجد نسخة محفوظة حالياً — الأجهزة تقرأ القيم مباشرة من المصدر.',
          config: data.config,
        });
      } else {
        setResult({ ok: false, message: 'تعذّرت المزامنة. حاول مرة أخرى بعد لحظات.' });
      }
    }, () => {
      setResult({ ok: false, message: 'تعذّرت المزامنة. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.' });
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] dark:bg-slate-950 flex flex-col pt-safe px-safe overflow-hidden" dir="rtl">
      {/* Header — same pattern as GarageReportsView / AppearanceSettingsModal */}
      <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 z-40 w-full shrink-0">
        <div className="max-w-2xl mx-auto flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center outline-none cursor-pointer shrink-0"
            aria-label="الرجوع"
            title="رجوع"
          >
            <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">مزامنة إعدادات النظام</h1>
          </div>
        </div>
      </header>

      {/* Content — minimal by owner request: no explainer text, no extra
          icon. One action button + the result message. */}
      <div className="flex-1 overflow-y-auto custom-scrollbar-slate flex flex-col items-center justify-center p-6 gap-4">
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="w-full max-w-sm py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-base flex items-center justify-center gap-2 transition-colors"
        >
          {isSyncing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              جاري المزامنة...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              مزامنة الآن
            </>
          )}
        </button>

        {result && (
          <div
            role="status"
            className={`w-full max-w-sm rounded-2xl border p-4 flex items-start gap-3 ${
              result.ok
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-2 min-w-0">
              <p className={`text-sm font-bold leading-relaxed ${result.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {result.message}
              </p>
              {result.ok && result.config && (result.config.creditRate != null || !!result.config.paymentWalletNumber) && (
                <div className="pt-2 space-y-1.5 border-t border-emerald-200/70 dark:border-emerald-500/30">
                  {result.config.creditRate != null && (
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      سعر الرصيد:{' '}
                      <span className="text-slate-900 dark:text-white">
                        {formatEgpPerCredit(rateToEgpPerCredit(result.config.creditRate))} جنيه للرصيد الواحد
                      </span>
                    </p>
                  )}
                  {!!result.config.paymentWalletNumber && (
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      محفظة الدفع:{' '}
                      <span className="text-slate-900 dark:text-white">{result.config.paymentWalletNumber}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
