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
// 2. PageSkeleton      — silent ghost preview of a dashboard-shaped page for
//                        full-page route swaps. Static gray blocks: the
//                        UI-LIGHT-SPEED plan removed pulse/animation effects,
//                        so skeletons intentionally do NOT animate.
//                        LOADING-UX (2026-11-25, owner initiative "A+B+C"):
//                        the spinner pill + "جاري التحميل..." hint were
//                        REMOVED — spinner+text+blocks together read as noise
//                        and made every wait look generic (owner screenshot
//                        2026-11-24). PageSkeleton is now the silent
//                        last-resort ghost; destination-matched previews
//                        (real LoginView / per-role dashboard skeletons) live
//                        in RoleSkeletons.tsx and cover the App gate and the
//                        App-level Suspense boundary. This component remains
//                        for in-dashboard lazy pages (reports, config sync).
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

export function PageSkeleton() {
  return (
    <div className="min-h-screen w-full bg-[#faf9f6] dark:bg-slate-950" dir="rtl" aria-hidden="true">
      <div className="max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto p-4 w-full">
        <div className="grid grid-cols-2 gap-4">
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
