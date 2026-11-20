/**
 * DebugHud — tiny always-available on-screen control for the owner to export
 * the debug recorder file (owner debugging session, 2026-11-17).
 *
 * Deliberately kept outside the app's provider tree in main.tsx so it works
 * on every view (login included) and survives provider-level failures. It
 * dynamically imports the firebase module only when exporting, so the app
 * shell bundle is unaffected (see main.tsx app-shell perf notes).
 */

import { useEffect, useRef, useState } from 'react';
import { debugRecorder } from './debugRecorder';

type HudPhase = 'idle' | 'exporting' | 'done';

export function DebugHud({ enabled = false }: { enabled?: boolean }) {
  // Audit fix (2026-11-21): the HUD (and its debug-file export, which embeds
  // sessionId / UA / URL) previously rendered for EVERY user. It now mounts
  // only when the app is opened with ?debug=1 in the URL (see main.tsx).
  // `enabled` is fixed at boot from the URL; hooks below run unconditionally
  // (rules of hooks) and the early return sits after them.
  const [count, setCount] = useState(debugRecorder.count);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<HudPhase>('idle');
  const [note, setNote] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => setCount(debugRecorder.count), 1500);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const handleDownload = async () => {
    setPhase('exporting');
    setNote(null);
    try {
      debugRecorder.download();
      setPhase('done');
      setNote('تم تنزيل الملف — أرسله للمطور');
    } catch (error) {
      setPhase('idle');
      setNote(`فشل التصدير: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleCopySummary = async () => {
    try {
      const summary = debugRecorder.getSummary();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        setNote('تم نسخ الملخص');
      } else {
        setNote('النسخ غير مدعوم — استخدم التنزيل');
      }
    } catch {
      setNote('فشل النسخ — استخدم التنزيل');
    }
  };

  if (!enabled) return null;

  return (
    <div className="fixed bottom-3 left-3 z-[9999] font-sans" dir="rtl" ref={panelRef}>
      {open && (
        <div className="mb-2 w-64 rounded-xl bg-slate-900/95 p-3 text-slate-100 shadow-2xl backdrop-blur">
          <p className="mb-2 text-[11px] font-bold text-slate-300">
            سجل التشخيص — {count} حدث
          </p>
          <button
            type="button"
            onClick={handleDownload}
            disabled={phase === 'exporting'}
            className="mb-2 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {phase === 'exporting' ? 'جاري التصدير...' : 'تنزيل ملف التشخيص'}
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            className="mb-2 w-full rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white"
          >
            نسخ الملخص
          </button>
          <button
            type="button"
            onClick={() => {
              debugRecorder.clear();
              setCount(debugRecorder.count);
              setNote('تم تفريغ السجل');
            }}
            className="mb-2 w-full rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white"
          >
            تفريغ السجل
          </button>
          {note && <p className="mb-2 text-[11px] text-emerald-300">{note}</p>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-lg px-3 py-1 text-[11px] text-slate-400 underline"
          >
            إغلاق
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Debug recorder"
        className="flex h-10 items-center gap-1 rounded-full bg-slate-900/70 px-3 text-[11px] font-bold text-slate-200 shadow-lg backdrop-blur active:bg-slate-900"
      >
        <span aria-hidden="true">DBG</span>
        <span className="tabular-nums">{count}</span>
      </button>
    </div>
  );
}
