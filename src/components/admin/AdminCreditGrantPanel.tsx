import React, { useState } from 'react';
import { Coins } from 'lucide-react';
import { Garage, Package } from '../../types';
import { firestoreService } from '../../services';

interface Props {
  garage: Garage;
  packages: Package[];
  adminLang: string;
}

export const AdminCreditGrantPanel: React.FC<Props> = ({ garage }) => {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const creditAmount = Number(amount.trim());
    if (!Number.isSafeInteger(creditAmount) || creditAmount < 1 || creditAmount > 1_000_000) {
      setError('أدخل عددًا صحيحًا من 1 إلى 1,000,000.');
      setSuccess('');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await firestoreService.adminGrantGarageCredits(garage.id, {
        amount: creditAmount,
        paymentAmountEgp: creditAmount,
        paymentReference: `admin-manual-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
        reason: 'إضافة رصيد يدوي',
        paymentConfirmed: true,
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `grant-${Date.now()}-${Math.random().toString(36).slice(2)}`
      });
      setAmount('');
      setSuccess(`${creditAmount.toLocaleString('en-US')} رصيد تمت إضافته.`);
    } catch (cause: any) {
      setError(cause?.message || 'فشلت إضافة الرصيد.');
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
          onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
          placeholder="أدخل قيمة الرصيد"
          aria-describedby={error ? 'credit-amount-error' : success ? 'credit-amount-success' : undefined}
          className="w-full rounded-xl border border-slate-300 bg-white p-3 text-lg font-bold text-slate-900 outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        {error && <p id="credit-amount-error" role="alert" className="text-sm text-red-600">{error}</p>}
        {success && <p id="credit-amount-success" role="status" className="text-sm font-semibold text-emerald-600">{success}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">
          {submitting ? 'جارٍ إضافة الرصيد…' : 'إضافة رصيد'}
        </button>
      </form>
    </section>
  );
};
