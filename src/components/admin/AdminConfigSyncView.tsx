import React, { useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../api/apiClient';
import { useBackHandler } from '../../hooks/backHandler';
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
 * UX (owner request 2026-11-21): the page now behaves like the garage
 * dashboard's reports page — it opens FULLSCREEN over the admin dashboard
 * from the top-left corner menu (same pattern as AppearanceSettingsModal
 * and GarageReportsView), instead of living as a card inside the Settings
 * tab. The phone back button closes it via the back-handler stack.
 */
interface SyncResult {
  ok: boolean;
  message: string;
  config?: { creditRate?: number; paymentWalletNumber?: string };
}

export const AdminConfigSyncView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  // Android back button closes the fullscreen page (stack is popped
  // top-first, so this wins over anything below it while mounted).
  useBackHandler(() => { onBack(); return true; }, true);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setResult(null);
    try {
      const data = await apiFetch<{ success?: boolean; config?: { creditRate?: number; paymentWalletNumber?: string }; cacheSync?: string }>(
        '/api/admin/sync-system-config-cache',
        { method: 'POST' }
      );
      if (data?.success && data.cacheSync === 'ok') {
        setResult({
          ok: true,
          message: 'تمت المزامنة بنجاح — كل الأجهزة ستحصل على القيم الجديدة فوراً.',
          config: data.config,
        });
      } else if (data?.success && data.cacheSync === 'not_configured') {
        // No cache in this environment → nothing stale can exist anywhere.
        setResult({
          ok: true,
          message: 'لا توجد نسخة محفوظة حالياً — الأجهزة تقرأ القيم مباشرة.',
          config: data.config,
        });
      } else {
        setResult({ ok: false, message: 'تعذّرت المزامنة. حاول مرة أخرى.' });
      }
    } catch {
      setResult({ ok: false, message: 'تعذّرت المزامنة. تحقق من الاتصال وحاول مرة أخرى.' });
    } finally {
      setIsSyncing(false);
    }
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

      {/* Content */}
      <div className="p-6 overflow-y-auto custom-scrollbar-slate flex-1">
        <div className="max-w-md mx-auto w-full py-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-sky-500/5 to-transparent rounded-full -mr-16 -mt-16 pointer-events-none" />

            <div className="mb-8 text-center space-y-3 relative z-10">
              <div className="w-14 h-14 bg-sky-500/10 dark:bg-sky-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <RefreshCw className="w-7 h-7 text-sky-600 dark:text-sky-400 stroke-[2.5]" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
                نسخة سريعة من القيم المشتركة (سعر الرصيد، رقم المحفظة، لون الواجهة) محفوظة لدى Cloudflare لتسريع فتح التطبيق.
                عند حفظ أي تعديل تتم المزامنة تلقائياً. استخدم هذا الزر فقط إذا ظننت أن بعض الأجهزة تعرض قيماً قديمة.
              </p>
            </div>

            <div className="space-y-4 relative z-10">
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-base flex items-center justify-center gap-2 transition-colors"
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
                  className={`rounded-2xl border p-4 flex items-start gap-3 ${
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
                  <div className="space-y-1">
                    <p className={`text-sm font-bold ${result.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {result.message}
                    </p>
                    {result.ok && result.config && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                        القيم المُزامنة الآن:{' '}
                        {result.config.creditRate != null && (
                          <span>سعر الرصيد {formatEgpPerCredit(rateToEgpPerCredit(result.config.creditRate))} جنيه للرصيد الواحد</span>
                        )}
                        {result.config.paymentWalletNumber && <span> • محفظة الدفع {result.config.paymentWalletNumber}</span>}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
