/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Spinner } from '../ui/Spinner';

// NO-SKELETONS (owner decision, 2026-11-25): every skeleton screen — the
// generic PageSkeleton ghost and the per-role dashboard previews — is
// REMOVED from the app. The owner found every skeleton variant read as
// unprofessional ("a different app") no matter how closely it mirrored the
// real layout. The app now waits with the BRAND SPLASH only (see
// BrandSplash.tsx) or with nothing at all; the real screen swaps in when
// ready. Two helpers survive here:
//
// 1. DelayedFallback   — shows its children only after `delayMs`. Waits that
//                        resolve faster (warm-cache chunk loads, sub-300ms
//                        session claims) render NOTHING at all, because a
//                        flash on a fast transition makes the app feel
//                        slower, not faster.
// 2. ModalSuspenseBackdrop — dimmed layer + small spinner card, rendered
//                        while a lazy modal chunk is downloading, so the
//                        first-ever tap on a modal is never silent. This is
//                        labeled feedback (جاري الفتح...), not a skeleton —
//                        it stays.
//
// Full-page lazy chunks (AppRoutes) fall back to the brand splash
// (see App.tsx). In-dashboard lazy pages fall back to nothing (fallback=
// {null}) — a blank area for the rare slow chunk beats a fake preview.

const DELAY_DEFAULT_MS = 250;

export function DelayedFallback({ delayMs = DELAY_DEFAULT_MS, children }: { delayMs?: number; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return visible ? <>{children}</> : null;
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
