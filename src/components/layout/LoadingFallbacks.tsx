/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Spinner } from '../ui/Spinner';

// UX-C soft-loading package. Goal: every wait answers the user's tap with an
// in-place visual — never a dead tap, never a full-screen spinner flash —
// WITHOUT changing any data flow or timing. Three pieces:
//
// 1. DelayedFallback   — shows its children only after `delayMs`. Waits that
//                        resolve faster (warm-cache chunk loads, sub-300ms
//                        session claims) render NOTHING at all, because a
//                        spinner flash on a fast transition makes the app
//                        feel slower, not faster.
// 2. PageSkeleton      — ghost preview of a dashboard-shaped page for
//                        full-page route swaps. Static gray blocks: the
//                        UI-LIGHT-SPEED plan removed pulse/animation effects,
//                        so skeletons intentionally do NOT animate.
// 3. ModalSuspenseBackdrop — dimmed layer + small card, rendered while a lazy
//                        modal chunk is downloading, so the first-ever tap on
//                        a modal is never silent.

const DELAY_DEFAULT_MS = 250;

export function DelayedFallback({ delayMs = DELAY_DEFAULT_MS, children }: { delayMs?: number; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return visible ? <>{children}</> : null;
}

export function PageSkeleton({ hint = 'جاري تجهيز الصفحة...' }: { hint?: string }) {
  return (
    <div className="min-h-screen w-full bg-[#faf9f6] dark:bg-slate-950" dir="rtl">
      <div className="max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto p-4 w-full">
        <div className="h-14 md:h-16 rounded-2xl bg-slate-200/80 dark:bg-slate-800/60 flex items-center justify-center gap-3">
          <Spinner className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{hint}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="h-24 md:h-28 rounded-2xl bg-slate-200/80 dark:bg-slate-800/60" />
          <div className="h-24 md:h-28 rounded-2xl bg-slate-200/80 dark:bg-slate-800/60" />
        </div>
        <div className="mt-4 space-y-3">
          <div className="h-16 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40" />
          <div className="h-16 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40" />
          <div className="h-16 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40" />
          <div className="h-16 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40" />
        </div>
      </div>
    </div>
  );
}

export function ModalSuspenseBackdrop() {
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 dark:bg-slate-950/80 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-2xl px-8 py-6 flex flex-col items-center gap-3 shadow-lg border border-slate-200 dark:border-slate-800">
        <Spinner className="w-6 h-6 text-emerald-500" />
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500">جاري الفتح...</span>
      </div>
    </div>
  );
}
