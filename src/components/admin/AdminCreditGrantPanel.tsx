import React, { useRef, useState } from 'react';
import { Coins, Wrench } from 'lucide-react';
import { Garage } from '../../types';
import { adminService } from '../../services';
import { normalizeDigits } from '../../utils/plates';
import { FastInput } from '../ui/FastInput';
import { creditsForEgp, formatEgpPerCredit, rateToEgpPerCredit } from '../../utils/creditRate';
import { getDomainErrorMessage } from '../../utils/domainErrors';
import { CREDIT_AMOUNT_MAX_EGP, CREDIT_AMOUNT_MIN_EGP, CREDIT_CORRECTION_MAX_CREDITS } from '../../utils/limits';
import { useGlobalCreditRate } from '../../hooks/useGlobalCreditRate';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { formatNumberEn } from '../../utils/money';

const CREDIT_ERROR_MESSAGES: Record<string, string> = {
  ADMIN_ONLY: 'ليس لديك صلاحية لإدارة الرصيد.',
  ADMIN_SDK_NOT_INITIALIZED: 'خدمة الإدارة غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
  PAYMENT_CONFIRMATION_REQUIRED: 'يجب تأكيد استلام الدفع والتحقق منه قبل إضافة الرصيد.',
  IDEMPOTENCY_KEY_REQUIRED: 'تعذر التحقق من الطلب. يرجى المحاولة مرة أخرى.',
  CREDIT_AMOUNT_REQUIRED: 'أدخل قيمة الرصيد المراد إضافته.',
  PAYMENT_AMOUNT_MUST_MATCH_CREDITS: 'يجب أن يساوي مبلغ الدفع قيمة الرصيد المراد إضافته.',
  INVALID_CREDIT_RATE_CONFIG: 'سعر الصرف المُعد غير صالح. راجع إعدادات سعر الصرف.',
  CREDIT_AMOUNT_BELOW_MINIMUM: 'القيمة المُدخلة صغيرة جدًا مقابل سعر الصرف الحالي. أدخل قيمة أكبر أو راجع سعر الصرف.',
  GARAGE_NOT_FOUND: 'الجراج المطلوب غير موجود.',
  GARAGE_NOT_PREPAID: 'إدارة الرصيد متاحة للجراجات التي تعمل بنظام الرصيد مسبق الدفع فقط.',
  INVALID_CREDIT_AMOUNT: 'قيمة الرصيد غير صالحة.',
  INVALID_CREDIT_BALANCE: 'رصيد الجراج غير صالح. يرجى مراجعة البيانات.',
  CREDIT_BALANCE_OVERFLOW: 'لا يمكن إضافة الرصيد لأن الإجمالي سيتجاوز الحد المسموح.',
  INSUFFICIENT_CREDITS: 'الرصيد غير كافٍ لإتمام هذه العملية.',
  INSUFFICIENT_PAID_CREDITS: 'الرصيد غير كافٍ لإتمام هذه العملية.',
  INSUFFICIENT_ELIGIBLE_CREDITS: 'الرصيد المتاح غير كافٍ.',
  IDEMPOTENCY_KEY_REUSE: 'اكتُشف اختلاف في بيانات طلب سابق. راجع سجل الرصيد قبل إعادة المحاولة.',
};

function getCreditErrorMessage(cause: unknown): string {
  return getDomainErrorMessage(cause, CREDIT_ERROR_MESSAGES, 'تعذرت العملية. يرجى مراجعة البيانات والمحاولة مرة أخرى.');
}

interface Props {
  garage: Garage;
}

type Mode = 'grant' | 'correction';

export const AdminCreditGrantPanel: React.FC<Props> = ({ garage }) => {
  const [mode, setMode] = useState<Mode>('grant');
  const [amount, setAmount] = useState('');
  const { isLoading: submitting, run: runSubmit } = useAsyncAction();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const idempotencyIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);

  // Per-garage pricing (owner decision 2026-11-18): what the admin types is
  // the EGP collected from the garage — the server converts it to credits
  // using THIS garage's price (pinned override, else the global one). The
  // typed number equals the granted credits only when that price is 1, so
  // the panel previews the real conversion instead of implying 1:1.
  const globalEgpPerCredit = useGlobalCreditRate();
  const ownEgpPerCredit = garage.creditRateOverride
    ? rateToEgpPerCredit(garage.creditRateOverride)
    : null;
  const effectiveEgpPerCredit = ownEgpPerCredit ?? globalEgpPerCredit;
  const parsedAmount = Number(amount.trim());
  const showPreview = mode === 'grant'
    && effectiveEgpPerCredit !== null
    && Number.isSafeInteger(parsedAmount)
    && parsedAmount >= CREDIT_AMOUNT_MIN_EGP
    && parsedAmount <= CREDIT_AMOUNT_MAX_EGP;
  const previewCredits = showPreview ? creditsForEgp(effectiveEgpPerCredit, parsedAmount) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const rawAmount = Number(amount.trim());

    if (mode === 'grant') {
      // Grant: the input is EGP collected from the garage (positive integer
      // 50..2,000). The server derives credits from it with the garage's
      // price — the preview below shows that conversion live.
      if (!Number.isSafeInteger(rawAmount) || rawAmount < CREDIT_AMOUNT_MIN_EGP || rawAmount > CREDIT_AMOUNT_MAX_EGP) {
        setError(`أدخل مبلغًا صحيحًا من ${CREDIT_AMOUNT_MIN_EGP} إلى ${formatNumberEn(CREDIT_AMOUNT_MAX_EGP)} ج.م.`);
        setSuccess('');
        return;
      }
    } else {
      // Correction: DEDUCT-ONLY. Must be a negative integer within -100,000..-1.
      // Positive values are rejected — adding positive balance happens through
      // the grant mode above, not through correction.
      if (!Number.isSafeInteger(rawAmount) || rawAmount >= 0 || Math.abs(rawAmount) > CREDIT_CORRECTION_MAX_CREDITS) {
        setError('أدخل قيمة خصم سالبة (مثال: -50). الخصم فقط مسموح.');
        setSuccess('');
        return;
      }
    }
    const creditAmount = rawAmount;

    // Auto-generate the audit reason. The Worker requires a non-empty reason
    // (1-300 chars) for the credit ledger + activity log. The admin no longer
    // types it manually — the amount + mode is enough context for audit.
    const reason = mode === 'grant'
      ? `إضافة رصيد ${creditAmount}`
      : `خصم رصيد ${creditAmount}`;

    const intentFingerprint = JSON.stringify([garage.id, mode, creditAmount, reason]);
    const idempotencyKey = idempotencyIntentRef.current?.fingerprint === intentFingerprint
      ? idempotencyIntentRef.current.key
      : (globalThis.crypto?.randomUUID?.() || `${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    idempotencyIntentRef.current = { fingerprint: intentFingerprint, key: idempotencyKey };

    setError('');
    setSuccess('');
    await runSubmit(async () => {
      if (mode === 'grant') {
        // paymentConfirmed is always true — the admin clicking "add balance"
        // IS the payment confirmation. The checkbox was removed per owner
        // request; the Worker still requires the field, so we send true.
        // The Worker is authoritative for the conversion: its response carries
        // the REAL granted credits + new balance, which we display instead of
        // echoing the typed number (they differ whenever the price ≠ 1).
        const result = await adminService.adminGrantGarageCredits(garage.id, {
          amount: creditAmount,
          paymentAmountEgp: creditAmount,
          reason,
          paymentConfirmed: true,
          idempotencyKey
        });
        const grantedCredits = Number(result?.amount);
        const newBalance = Number(result?.balance);
        setSuccess(
          Number.isFinite(grantedCredits) && grantedCredits > 0
            ? `${formatNumberEn(grantedCredits)} رصيد تمت إضافته مقابل ${formatNumberEn(creditAmount)} ج.م`
              + (Number.isFinite(newBalance) ? ` — الرصيد الحالي: ${formatNumberEn(newBalance)}` : '')
            : `${formatNumberEn(creditAmount)} رصيد تمت إضافته.`,
        );
      } else {
        await adminService.adminCorrectGarageCredits(garage.id, {
          amount: creditAmount,
          reason,
          idempotencyKey
        });
        setSuccess(`${formatNumberEn(Math.abs(creditAmount))} رصيد تم خصمه.`);
      }
      setAmount('');
      idempotencyIntentRef.current = null;
    }, (cause: unknown) => {
      setError(getCreditErrorMessage(cause));
    });
  };

  if (garage.billingModel !== 'prepaid_credits') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" aria-label="إدارة الرصيد">
        <h3 className="flex items-center gap-2 font-black"><Coins className="h-4 w-4" />أرصدة مسبقة الدفع</h3>
        <p className="mt-2 text-sm text-slate-500">إدارة الرصيد متاحة للجراجات التي تعمل بنظام الرصيد مسبق الدفع فقط.</p>
      </section>
    );
  }

  const currentBalance = Number(garage.credits ?? 0);

  // Money-bar layout (owner pick: Option B, 2026-11-19): on desktop the whole
  // top-up operation is one row — big balance | pill tabs | input + button —
  // so the most frequent action needs no scrolling. On phones it stacks in
  // the same order (balance row → tabs → label → input → full-width button).
  // Labels, roles, preview and messages are pinned by tests and unchanged.
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900" aria-label="إدارة رصيد الجراج">
      <h3 className="flex items-center gap-2 font-black mb-3.5"><Coins className="h-4 w-4" />رصيد الجراج</h3>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3.5">
        {/* Big balance block */}
        <div className="flex sm:flex-col items-baseline sm:items-start gap-x-1.5 sm:gap-y-0.5 sm:pl-3.5 sm:border-l sm:border-slate-200 dark:sm:border-slate-800 shrink-0">
          <span className="text-[11px] font-black text-slate-500 dark:text-slate-400">الرصيد الحالي</span>
          <span className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none">{formatNumberEn(currentBalance)}</span>
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-400">رصيد</span>
        </div>

        {/* Inline segmented mode tabs */}
        <div className="flex rounded-full bg-slate-100 dark:bg-slate-800 p-1 w-full sm:w-auto shrink-0" role="tablist" aria-label="وضع الإدارة">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'grant'}
            onClick={() => { setMode('grant'); setError(''); setSuccess(''); setAmount(''); }}
            className={`flex-1 sm:flex-none rounded-full px-3.5 py-1.5 text-[11.5px] font-black inline-flex items-center justify-center gap-1.5 cursor-pointer ${mode === 'grant' ? 'bg-emerald-600 text-white' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Coins className="h-3.5 w-3.5" />إضافة رصيد
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'correction'}
            onClick={() => { setMode('correction'); setError(''); setSuccess(''); setAmount(''); }}
            className={`flex-1 sm:flex-none rounded-full px-3.5 py-1.5 text-[11.5px] font-black inline-flex items-center justify-center gap-1.5 cursor-pointer ${mode === 'correction' ? 'bg-amber-600 text-white' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <Wrench className="h-3.5 w-3.5" />خصم رصيد
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 min-w-0 space-y-2">
          <label htmlFor="credit-amount" className="block text-[11.5px] font-black text-slate-800 dark:text-slate-100">
            {mode === 'grant' ? 'المبلغ المحصل من الجراج (50 إلى 2,000 ج.م)' : 'قيمة الخصم (سالبة، حتى -100,000)'}
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <FastInput
              id="credit-amount"
              type="text"
              inputMode="numeric"
              defaultValue={amount}
              onCommit={(v) => setAmount(normalizeDigits(v).replace(/[^\d-]/g, ''))}
              onLiveValue={(v) => setAmount(normalizeDigits(v).replace(/[^\d-]/g, ''))}
              mask={(v) => normalizeDigits(v).replace(/[^\d-]/g, '')}
              placeholder={mode === 'grant' ? 'أدخل المبلغ المحصل' : 'مثال: -50'}
              aria-describedby={error ? 'credit-amount-error' : success ? 'credit-amount-success' : undefined}
              className={`flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-bold text-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none ${mode === 'grant' ? 'focus:border-emerald-500' : 'focus:border-amber-500'} dark:border-slate-700 dark:bg-slate-950 dark:text-white`}
            />
            <button type="submit" disabled={submitting} className={`w-full sm:w-auto sm:min-w-[130px] rounded-xl px-5 py-2.5 text-xs font-black text-white disabled:opacity-50 shrink-0 ${mode === 'grant' ? 'bg-emerald-600 ' : 'bg-amber-600 '}`}>
              {submitting
                ? (mode === 'grant' ? 'جارٍ إضافة الرصيد…' : 'جارٍ تطبيق الخصم…')
                : (mode === 'grant' ? 'إضافة رصيد' : 'تطبيق الخصم')}
            </button>
          </div>
          {mode === 'grant' && previewCredits !== null && (
            <p aria-live="polite" className="text-center text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="font-mono">{formatNumberEn(parsedAmount)}</span> ج.م ←{' '}
              <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{formatNumberEn(previewCredits)}</span> رصيد
              {ownEgpPerCredit !== null && (
                <span className="text-amber-600 dark:text-amber-400"> · سعر خاص {formatEgpPerCredit(ownEgpPerCredit)} ج.م/رصيد</span>
              )}
            </p>
          )}
          {error && <p id="credit-amount-error" role="alert" className="text-sm text-red-600">{error}</p>}
          {success && <p id="credit-amount-success" role="status" className="text-sm font-semibold text-emerald-600">{success}</p>}
        </form>
      </div>
    </section>
  );
};
