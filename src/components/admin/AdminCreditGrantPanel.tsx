import React, { useRef, useState } from 'react';
import { Coins } from 'lucide-react';
import { Garage } from '../../types';
import { firestoreService } from '../../services';

const CREDIT_GRANT_ERROR_MESSAGES: Record<string, string> = {
  ADMIN_ONLY: 'ليس لديك صلاحية لإضافة الرصيد.',
  ADMIN_SDK_NOT_INITIALIZED: 'خدمة الإدارة غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
  PAYMENT_CONFIRMATION_REQUIRED: 'يجب تأكيد استلام الدفع والتحقق منه قبل إضافة الرصيد.',
  IDEMPOTENCY_KEY_REQUIRED: 'تعذر التحقق من طلب الإضافة. يرجى المحاولة مرة أخرى.',
  CREDIT_AMOUNT_REQUIRED: 'أدخل قيمة الرصيد المراد إضافته.',
  CHOOSE_TEMPLATE_OR_AMOUNT: 'اختر باقة رصيد أو أدخل قيمة يدوية، وليس كليهما.',
  PAYMENT_AMOUNT_MUST_MATCH_CREDITS: 'يجب أن يساوي مبلغ الدفع قيمة الرصيد المراد إضافته.',
  GARAGE_NOT_FOUND: 'الجراج المطلوب غير موجود.',
  GARAGE_NOT_PREPAID: 'إضافة الرصيد متاحة للجراجات التي تعمل بنظام الرصيد مسبق الدفع فقط.',
  PACKAGE_NOT_FOUND: 'باقة الرصيد المطلوبة غير موجودة.',
  PACKAGE_NOT_CREDIT_BUNDLE: 'الباقة المحددة ليست باقة رصيد نشطة.',
  CREDIT_TEMPLATE_PRICE_MISMATCH: 'سعر باقة الرصيد لا يطابق إعداداتها. يرجى مراجعة إعدادات الباقة.',
  INVALID_CREDIT_AMOUNT: 'قيمة الرصيد غير صالحة.',
  INVALID_CREDIT_BALANCE: 'رصيد الجراج غير صالح. يرجى مراجعة البيانات.',
  CREDIT_BALANCE_OVERFLOW: 'لا يمكن إضافة الرصيد لأن الإجمالي سيتجاوز الحد المسموح.',
  INSUFFICIENT_PAID_CREDITS: 'الرصيد المدفوع غير كافٍ.',
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

export const AdminCreditGrantPanel: React.FC<Props> = ({ garage }) => {
  const [amount, setAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const idempotencyIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const creditAmount = Number(amount.trim());
    if (!Number.isSafeInteger(creditAmount) || creditAmount < 50 || creditAmount > 2_000) {
      setError('أدخل عددًا صحيحًا من 50 إلى 2,000 جنيه.');
      setSuccess('');
      return;
    }

    if (!paymentReference.trim() || paymentReference.trim().length > 120) {
      setError('أدخل مرجع الدفع الفعلي (حتى 120 حرفًا).');
      setSuccess('');
      return;
    }
    if (!paymentConfirmed) {
      setError('يجب تأكيد استلام الدفع والتحقق منه قبل إضافة الرصيد.');
      setSuccess('');
      return;
    }

    const intentFingerprint = JSON.stringify([garage.id, creditAmount, paymentReference.trim(), 'إضافة رصيد يدوي']);
    const idempotencyKey = idempotencyIntentRef.current?.fingerprint === intentFingerprint
      ? idempotencyIntentRef.current.key
      : (globalThis.crypto?.randomUUID?.() || `grant-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    idempotencyIntentRef.current = { fingerprint: intentFingerprint, key: idempotencyKey };

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await firestoreService.adminGrantGarageCredits(garage.id, {
        amount: creditAmount,
        paymentAmountEgp: creditAmount,
        paymentReference: paymentReference.trim(),
        reason: 'إضافة رصيد يدوي',
        paymentConfirmed,
        idempotencyKey
      });
      setAmount('');
      setPaymentReference('');
      setPaymentConfirmed(false);
      idempotencyIntentRef.current = null;
      setSuccess(`${creditAmount.toLocaleString('en-US')} رصيد تمت إضافته.`);
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" aria-label="إضافة رصيد يدوي">
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="credit-amount" className="block text-sm font-bold text-slate-800 dark:text-slate-100">
          الرصيد المراد إضافته
        </label>
        <input
          id="credit-amount"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) >= 0x06f0 ? digit.charCodeAt(0) - 0x06f0 : digit.charCodeAt(0) - 0x0660)).replace(/\D/g, ''))}
          placeholder="أدخل قيمة الرصيد"
          aria-describedby={error ? 'credit-amount-error' : success ? 'credit-amount-success' : undefined}
          className="w-full rounded-xl border border-slate-300 bg-white p-3 text-lg font-bold text-slate-900 outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        <label htmlFor="credit-payment-reference" className="block text-sm font-bold text-slate-800 dark:text-slate-100">
          مرجع الدفع الفعلي
        </label>
        <input
          id="credit-payment-reference"
          type="text"
          maxLength={120}
          value={paymentReference}
          onChange={(event) => setPaymentReference(event.target.value)}
          placeholder="أدخل رقم الإيصال أو مرجع التحويل"
          className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input
            type="checkbox"
            checked={paymentConfirmed}
            onChange={(event) => setPaymentConfirmed(event.target.checked)}
            className="mt-1"
          />
          أؤكد أن الدفع الفعلي قد تم استلامه والتحقق منه.
        </label>
        {error && <p id="credit-amount-error" role="alert" className="text-sm text-red-600">{error}</p>}
        {success && <p id="credit-amount-success" role="status" className="text-sm font-semibold text-emerald-600">{success}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">
          {submitting ? 'جارٍ إضافة الرصيد…' : 'إضافة رصيد'}
        </button>
      </form>
    </section>
  );
};
