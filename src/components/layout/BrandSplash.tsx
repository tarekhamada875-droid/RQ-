/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// NO-SKELETONS (owner decision, 2026-11-25): the brand splash is the ONLY
// full-page waiting screen in the app. It is NOT a skeleton — no ghost
// blocks, no fake preview of a screen that hasn't loaded yet. It is the
// app's identity: the Egyptian license plate frame on the beige canvas with
// the "أرق لتطوير البرمجيات" footer.
//
// Boot chain (what the user actually sees):
//   1. index.html paints this same splash as static HTML (instant, pre-JS)
//   2. main.tsx renders <BrandSplash /> while the app chunk evaluates
//   3. the App gate keeps it on screen while auth/session/first-sync resolve
//      (login destinations instead get the REAL LoginView immediately — it
//      is fully static and needs zero data)
//   4. the real screen replaces it in one swap
//
// SELF-CONTAINED ON PURPOSE: this file must not import any app module (no
// firebase, no hooks, no services) so main.tsx can render it from the entry
// chunk without breaking the React.lazy app-shell boundary (see the PERF
// comment in main.tsx). Keep it dependency-free.
//
// Static on purpose: no animation (UI-LIGHT-SPEED).
export function BrandSplash() {
  return (
    <div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
      <div className="w-full max-w-[320px] border-[3px] border-slate-900 dark:border-slate-700 rounded-2xl overflow-hidden flex flex-col select-none bg-white dark:bg-slate-900/90" dir="ltr">
        <div className="h-7 sm:h-8 bg-[#0057b7] border-b-2 border-slate-900/20 flex items-center justify-between px-3 sm:px-4 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-white/40 border border-white/30" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/40 border border-white/30" />
        </div>
        <div className="h-20 sm:h-24 bg-[#fcfcfc] dark:bg-slate-900/90" />
      </div>
      <div className="mt-8 flex items-center justify-center gap-3 select-none text-slate-400 dark:text-slate-500 font-bold text-[10px] tracking-wider uppercase">
        <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-slate-200 dark:to-slate-800" />
        <span>أرق لتطوير البرمجيات</span>
        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-slate-200 dark:to-slate-800" />
      </div>
    </div>
  );
}
