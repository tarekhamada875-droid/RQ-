/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * FullScreenStatus — the single full-screen status component for the RQ app.
 *
 * Audit F-17 (Phase 4a, 2026-11-26): previously the app had five full-screen
 * status screens that were structural near-duplicates of each other:
 *   - BootSplash (main.tsx): cream bg, emerald spinner, "جاري تحميل البيانات..."
 *   - Logout screen (App.tsx): cream bg, emerald spinner, "جاري الخروج..."
 *   - Gate screen (App.tsx): cream bg, emerald spinner, "جاري التحميل..."
 *   - ErrorBoundary reloading branch: dark bg, amber spinner, "جاري تحديث النظام..."
 *   - ErrorBoundary crash branch: dark bg, red icon, "عفواً، حدث خطأ مفاجئ"
 *
 * The three cream screens were byte-identical except for the three-word Arabic
 * label. The two ErrorBoundary branches shared the same card layout but
 * duplicated it internally. One component with a `tone` prop replaces all five;
 * the `label` prop carries the Arabic message, and the optional `subtext` and
 * `action` slots cover the ErrorBoundary crash branch's extra content.
 *
 * Tones:
 *   - 'loading'  (default): cream bg, emerald border-spinner. Boot/logout/gate.
 *   - 'reloading':           dark bg, amber border-spinner. Stale-chunk auto-reload.
 *   - 'error':               dark bg, red alert icon.       Crash with action button.
 */

type FullScreenStatusTone = 'loading' | 'reloading' | 'error';

interface FullScreenStatusProps {
  label: string;
  subtext?: string;
  tone?: FullScreenStatusTone;
  /** Optional action node (e.g. a reload button). Rendered below the subtext. */
  action?: ReactNode;
}

const TONE_CONFIG: Record<FullScreenStatusTone, {
  container: string;
  icon: ReactNode;
}> = {
  loading: {
    container: 'bg-[#faf9f6] dark:bg-slate-950',
    icon: <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />,
  },
  reloading: {
    container: 'bg-slate-900',
    icon: (
      <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    ),
  },
  error: {
    container: 'bg-slate-900',
    icon: (
      <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
    ),
  },
};

export function FullScreenStatus({
  label,
  subtext,
  tone = 'loading',
  action,
}: FullScreenStatusProps) {
  const config = TONE_CONFIG[tone];

  // The loading tone uses a simple centered layout (spinner + label).
  // The reloading/error tones use a card layout (icon circle + title + subtext + action).
  if (tone === 'loading') {
    return (
      <div className={`w-full h-full min-h-screen ${config.container} flex flex-col items-center justify-center p-4 text-center font-sans`} dir="rtl">
        {config.icon}
        <p className="text-slate-600 dark:text-slate-300 font-bold text-sm">{label}</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${config.container} flex items-center justify-center p-6 text-center`} dir="rtl">
      <div className="max-w-sm w-full bg-slate-800 rounded-xl p-8 border border-slate-700">
        {config.icon}
        <h2 className="text-xl font-bold text-white mb-2 font-sans">{label}</h2>
        {subtext && <p className="text-slate-400 text-sm leading-relaxed mb-8">{subtext}</p>}
        {action}
      </div>
    </div>
  );
}
