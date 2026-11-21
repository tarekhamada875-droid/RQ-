/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Coins, Check, Loader2, RotateCcw } from 'lucide-react';
import { Garage } from '../../types';
import { adminService } from '../../services';
import {
  CREDIT_RATE_PRESETS,
  RATE_PREVIEW_EGP,
  creditsForEgp,
  rateToEgpPerCredit,
  formatEgpPerCredit,
} from '../../utils/creditRate';
import { getDomainErrorMessage } from '../../utils/domainErrors';
import { useGlobalCreditRate } from '../../hooks/useGlobalCreditRate';
import { useAsyncAction } from '../../hooks/useAsyncAction';

interface Props {
  garage: Garage;
}

const RATE_ERROR_MESSAGES: Record<string, string> = {
  ADMIN_ONLY: 'ليس لديك صلاحية لتغيير سعر الرصيد.',
  GARAGE_NOT_FOUND: 'الجراج المطلوب غير موجود.',
  GARAGE_NOT_PREPAID: 'سعر الرصيد متاح للجراجات التي تعمل بنظام الرصيد مسبق الدفع فقط.',
  INVALID_CREDIT_RATE: 'السعر المختار غير صالح.',
};

function getRateErrorMessage(cause: unknown): string {
  return getDomainErrorMessage(cause, RATE_ERROR_MESSAGES, 'تعذرت العملية. حاول مرة أخرى.');
}

/**
 * Per-garage credit pricing (owner decision 2026-11-18).
 *
 * Design locked by the owner:
 *   - Admin-only (this section renders only inside the admin garage details).
 *   - Preset-only: the same preset list as the global "سعر الرصيد" screen —
 *     no free-form typing, with the same live "100 ج.م ← X رصيد" preview.
 *   - Default state is "يتبع السعر العام" (no override stored); saving a
 *     preset pins THIS garage to it, and clearing returns it to the global
 *     price. Changing the global price later never touches pinned garages.
 *   - Garages see nothing: they keep receiving balance silently — the rate
 *     only changes how the server converts their paid EGP into credits.
 *
 * Display formatting: prices are always shown with at most 2 decimals via
 * formatEgpPerCredit — the raw stored inverse (1/rate) can be a long float
 * and must never be rendered as-is.
 */
export const AdminGarageCreditRateSection: React.FC<Props> = ({ garage }) => {
  // This garage's own pinned price (EGP-per-credit), or null when it follows
  // the global price. Seeded from the garage doc; updated in place after a
  // successful save/clear so the UI never lies while the next admin-lists
  // refresh propagates the new doc.
  const [ownEgpPerCredit, setOwnEgpPerCredit] = useState<number | null>(
    () => (garage.creditRateOverride ? rateToEgpPerCredit(garage.creditRateOverride) : null),
  );
  const globalEgpPerCredit = useGlobalCreditRate();
  const [selectedEgpPerCredit, setSelectedEgpPerCredit] = useState<number | null>(null);
  // Shared save-state machine (useAsyncAction) — one loading flag covers both
  // the save and the clear action, same as the hand-rolled isSaving it replaces.
  const { isLoading: isSaving, run: runSaveAction } = useAsyncAction();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Re-seed when switching between garages or when the doc refreshes.
    setOwnEgpPerCredit(garage.creditRateOverride ? rateToEgpPerCredit(garage.creditRateOverride) : null);
    setSelectedEgpPerCredit(null);
    setError('');
    setSuccess('');
  }, [garage.id, garage.creditRateOverride]);

  const effectiveEgpPerCredit = ownEgpPerCredit ?? globalEgpPerCredit;
  const effectiveLabel = useMemo(() => {
    if (effectiveEgpPerCredit === null) return '…';
    return formatEgpPerCredit(effectiveEgpPerCredit);
  }, [effectiveEgpPerCredit]);

  const hasChanges = selectedEgpPerCredit !== null && selectedEgpPerCredit !== ownEgpPerCredit;

  const handleSave = async () => {
    if (selectedEgpPerCredit === null || isSaving) return;
    setError('');
    setSuccess('');
    await runSaveAction(async () => {
      await adminService.setGarageCreditRate(garage.id, { egpPerCredit: selectedEgpPerCredit });
      setOwnEgpPerCredit(selectedEgpPerCredit);
      setSelectedEgpPerCredit(null);
      setSuccess('تم حفظ سعر هذا الجراج.');
    }, (cause) => setError(getRateErrorMessage(cause)));
  };

  const handleClear = async () => {
    if (isSaving) return;
    setError('');
    setSuccess('');
    await runSaveAction(async () => {
      await adminService.setGarageCreditRate(garage.id, { clear: true });
      setOwnEgpPerCredit(null);
      setSelectedEgpPerCredit(null);
      setSuccess('عاد الجراج إلى السعر العام.');
    }, (cause) => setError(getRateErrorMessage(cause)));
  };

  // The credit rate only exists for prepaid-credit garages — subscription
  // garages don't buy credits, and the grant panel above already explains
  // that, so this section renders nothing for them.
  if (garage.billingModel !== 'prepaid_credits') return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" aria-label="سعر الرصيد لهذا الجراج">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-black"><Coins className="h-4 w-4" />سعر الرصيد لهذا الجراج</h3>
        <div className="text-sm text-slate-500">
          السعر الحالي: <span className="font-mono font-black text-slate-900 dark:text-white">{effectiveLabel}</span>
          <span className="mr-1 text-xs font-bold">ج.م/رصيد</span>
        </div>
      </div>

      <div
        className={`mb-4 rounded-xl px-4 py-2.5 text-center text-xs font-bold ${
          ownEgpPerCredit !== null
            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
            : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
        }`}
        role="status"
      >
        {ownEgpPerCredit !== null
          ? <>سعر خاص بهذا الجراج: <span className="font-mono">{formatEgpPerCredit(ownEgpPerCredit)}</span> ج.م/رصيد — السعر العام لا يؤثر عليه</>
          : <>يتبع السعر العام{globalEgpPerCredit !== null ? ` (${formatEgpPerCredit(globalEgpPerCredit)} ج.م/رصيد)` : ''} — تغيير السعر العام سيشمل هذا الجراج</>}
      </div>

      <fieldset>
        <legend className="mb-3 block text-xs font-black text-slate-700 dark:text-slate-300">
          {'اختر سعرًا خاصًا بهذا الجراج'}
          <span className="mr-2 text-[10.5px] font-bold text-slate-400 dark:text-slate-500">
            {'الرقم الأخضر = الرصيد مقابل ١٠٠ ج.م'}
          </span>
        </legend>
        {/* Compact tiles (owner pick 2026-11-19, "Option A" mockup): 3 per row on
            phones, 4 on desktop — replaces the old 1/2-column full-width cards
            that left ~75% of each desktop card empty. Pure layout change: same
            presets, same selection/clear behaviour, same a11y roles. */}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="سعر الرصيد لهذا الجراج">
          {CREDIT_RATE_PRESETS.map((preset) => {
            const isSelected = selectedEgpPerCredit === preset;
            const isOwn = ownEgpPerCredit === preset;
            const previewCredits = creditsForEgp(preset, RATE_PREVIEW_EGP);
            return (
              <button
                type="button"
                key={preset}
                role="radio"
                aria-checked={isSelected}
                onClick={() => { setSelectedEgpPerCredit(preset); setError(''); setSuccess(''); }}
                className={`relative flex w-full cursor-pointer flex-col items-center gap-0.5 rounded-xl border-2 px-1.5 pb-3 pt-6 ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40'
                }`}
              >
                {isOwn && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {'الحالي'}
                  </span>
                )}
                {isSelected && (
                  <span className="absolute left-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                )}
                <span className={`font-mono text-xl font-black leading-tight ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>
                  {formatEgpPerCredit(preset)}
                </span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">ج.م/رصيد</span>
                <span className={`mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                  isSelected
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
                }`}>
                  {previewCredits.toLocaleString('ar-EG')} رصيد
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="mt-3 text-center text-[11px] font-semibold leading-relaxed text-slate-400 dark:text-slate-500">
        {'السعر الجديد ينطبق على شحنات هذا الجراج الجديدة فقط. الأرصدة الحالية وسجل العمليات السابق لا يتأثران.'}
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-8 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{'جاري الحفظ...'}</span>
            </>
          ) : (
            <>
              <Check className="h-5 w-5 stroke-[3]" />
              <span>{'حفظ سعر هذا الجراج'}</span>
            </>
          )}
        </button>
        {ownEgpPerCredit !== null && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isSaving}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-6 text-sm font-extrabold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-400"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{'العودة للسعر العام'}</span>
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-center text-sm font-black text-red-500">{error}</p>}
      {success && <p role="status" className="mt-2 text-center text-sm font-black text-emerald-500">{success}</p>}
    </section>
  );
};
