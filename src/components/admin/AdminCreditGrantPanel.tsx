import React, { useRef, useState } from 'react';
import { Coins, Wrench } from 'lucide-react';
import { Garage } from '../../types';
import { firestoreService } from '../../services';

const CREDIT_GRANT_ERROR_MESSAGES: Record<string, string> = {
  ADMIN_ONLY: 'ليس لديك صلاحية لإضافة الرصيد.',
  ADMIN_SDK_NOT_INITIALIZED: 'خدمة الإدارة غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
  PAYMENT_CONFIRMATION_REQUIRED: 'يجب تأكيد استلام الدفع والتحقق منه قبل إضافة الرصيد.',
  IDEMPOTENCY_KEY_REQUIRED: 'تعذر التحقق من طلب الإضافة. يرجى المحاولة مرة أخرى.',
  CREDIT_AMOUNT_REQUIRED: 'أدخل قيمة الرصيد المراد إضافته.',
  PAYMENT_AMOUNT_MUST_MATCH_CREDITS: 'يجب أن يساوي مبلغ الدفع قيمة الرصيد المراد إضافته.',
  GARAGE_NOT_FOUND: 'الجراج المطلوب غير موجود.',
  GARAGE_NOT_PREPAID: 'إضافة الرصيد متاحة للجراجات التي تعمل بنظام الرصيد مسبق الدفع فقط.',
  INVALID_CREDIT_AMOUNT: 'قيمة الرصيد غير صالحة.',
  INVALID_CREDIT_BALANCE: 'رصيد الجراج غير صالح. يرجى مراجعة البيانات.',
  CREDIT_BALANCE_OVERFLOW: 'لا يمكن إضافة الرصيد لأن الإجمالي سيتجاوز الحد المسموح.',
  INSUFFICIENT_CREDITS: 'الرصيد غير كافٍ لإتمام هذه العملية.',
  INSUFFICIENT_PAID_CREDITS: 'الرصيد غير كافٍ لإتمام هذه العملية.',
  INSUFFICIENT_ELIGIBLE_CREDITS: 'الرصيد المتاح غير كافٍ.',
  IDEMPOTENCY_KEY_REUSE: 'اكتُشف اختلاف في بيانات طلب سابق. راجع سجل الرصيد قبل إعادة المحاولة.',
};

function getCreditGrantErrorMessage(cause: unknown): string {
  const error = cause as { message?: unknown; code?: unknown } | null;
  const message = typeof error?.message === 'string' ? error.message : '';
  const code = typeof error?.code === 'string' ? error.code : '';
  const knownMessage = CREDIT_GRANT_ERROR_MESSAGES[message] || CREDIT_GRANT_ERROR_MESSAGES[code];
  if (knownMessage) return knownMessage;
  if (/[\u0600-\u06FF]/.test(message)) return message;
  return 'تعذرت إضافة الرصيد. يرجى مراجعة البيانات والمحاولة مرة أخرى.';
}

interface Props {
  garage: Garage;
}

type Mode = 'grant' | 'correction';

export const AdminCreditGrantPanel: React.FC<Props> = ({ garage }) => {
  const [mode, setMode] = useState<Mode>('grant');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const idempotencyIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const rawAmount = Number(amount.trim());
    const creditAmount = rawAmount; // correction allows negative

    if (mode === 'grant') {
      if (!Number.isSafeInteger(creditAmount) || creditAmount < 50 || creditAmount > 2_000) {
        setError('أدخل عددًا صحيحًا من 50 إلى 2,000 جنيه.');
        setSuccess('');
        return;
      }
    } else {
      // Correction: non-zero integer within ±100,000.
      if (!Number.isSafeInteger(creditAmount) || creditAmount === 0 || Math.abs(creditAmount) > 100_000) {
        setError('أدخل عددًا صحيحًا غير صفري (موجب للإضافة، سالب للخصم) ضمن ±100,000.');
        setSuccess('');
        return;
      }
    }

    // Auto-generate the audit reason. The Worker requires a non-empty reason
    // (1-300 chars) for the credit ledger + activity log. The admin no longer
    // types it manually — the amount + mode is enough context for audit.
    const reason = mode === 'grant'
      ? `إضافة رصيد ${creditAmount}`
      : `تصحيح رصيد ${creditAmount > 0 ? '+' : ''}${creditAmount}`;

    const intentFingerprint = JSON.stringify([garage.id, mode, creditAmount, reason]);
    const idempotencyKey = idempotencyIntentRef.current?.fingerprint === intentFingerprint
      ? idempotencyIntentRef.current.key
      : (globalThis.crypto?.randomUUID?.() || `${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    idempotencyIntentRef.current = { fingerprint: intentFingerprint, key: idempotencyKey };

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (mode === 'grant') {
        // paymentConfirmed is always true — the admin clicking "add balance"
        // IS the payment confirmation. The checkbox was removed per owner
        // request; the Worker still requires the field, so we send true.
        await firestoreService.adminGrantGarageCredits(garage.id, {
          amount: creditAmount,
          paymentAmountEgp: creditAmount,
          reason,
          paymentConfirmed: true,
          idempotencyKey
        });
        setSuccess(`${creditAmount.toLocaleString('en-US')} رصيد تمت إضافته.`);
      } else {
        await firestoreService.adminCorrectGarageCredits(garage.id, {
          amount: creditAmount,
          reason,
          idempotencyKey
        });
        setSuccess(creditAmount >= 0
          ? `${creditAmount.toLocaleString('en-US')} رصيد تمت إضافته كتصحيح.`
          : `${Math.abs(creditAmount).toLocaleString('en-US')} رصيد تم خصمه كتصحيح.`);
      }
      setAmount('');
      idempotencyIntentRef.current = null;
    } catch (cause: any) {
      setError(getCreditGrantErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  if (garage.billingModel !== 'prepaid_credits') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" aria-label="إضافة رصيد يدوي">
        <h3 className="flex items-center gap-2 font-black"><Coins className="h-4 w-4" />أرصدة مسبقة الدفع</h3>
        <p className="mt-2 text-sm text-slate-500">إضافة الرصيد متاحة للجراجات التي تعمل بنظام الرصيد مسبق الدفع فقط.</p>
      </section>
    );
  }

  const currentBalance = Number(garage.credits ?? 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" aria-label="إدارة رصيد الجراج">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-black"><Coins className="h-4 w-4" />رصيد الجراج</h3>
        <div className="text-sm text-slate-500">الرصيد الحالي: <span className="font-mono font-black text-slate-900 dark:text-white">{currentBalance.toLocaleString('en-US')}</span></div>
      </div>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="وضع الإدارة">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'grant'}
          onClick={() => { setMode('grant'); setError(''); setSuccess(''); setAmount(''); }}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${mode === 'grant' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
        >
          <span className="inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5" />إضافة رصيد</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'correction'}
          onClick={() => { setMode('correction'); setError(''); setSuccess(''); setAmount(''); }}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${mode === 'correction' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
        >
          <span className="inline-flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />تصحيح رصيد</span>
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="credit-amount" className="block text-sm font-bold text-slate-800 dark:text-slate-100">
          {mode === 'grant' ? 'الرصيد المراد إضافته (50 إلى 2,000)' : 'قيمة التصحيح (موجب للإضافة، سالب للخصم)'}
        </label>
        <input
          id="credit-amount"
          type="text"
          inputMode="numeric"
          pattern={mode === 'grant' ? '[0-9]*' : '-?[0-9]*'}
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) >= 0x06f0 ? digit.charCodeAt(0) - 0x06f0 : digit.charCodeAt(0) - 0x0660)).replace(/[^\d-]/g, ''))}
          placeholder={mode === 'grant' ? 'أدخل قيمة الرصيد' : 'مثال: 50 أو -50'}
          aria-describedby={error ? 'credit-amount-error' : success ? 'credit-amount-success' : undefined}
          className="w-full rounded-xl border border-slate-300 bg-white p-3 text-lg font-bold text-slate-900 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        {error && <p id="credit-amount-error" role="alert" className="text-sm text-red-600">{error}</p>}
        {success && <p id="credit-amount-success" role="status" className="text-sm font-semibold text-emerald-600">{success}</p>}
        <button type="submit" disabled={submitting} className={`w-full rounded-xl px-4 py-3 font-black text-white transition disabled:opacity-50 ${mode === 'grant' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
          {submitting
            ? (mode === 'grant' ? 'جارٍ إضافة الرصيد…' : 'جارٍ تطبيق التصحيح…')
            : (mode === 'grant' ? 'إضافة رصيد' : 'تطبيق التصحيح')}
        </button>
      </form>
    </section>
  );
};
