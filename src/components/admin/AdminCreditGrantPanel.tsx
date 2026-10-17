import React, { useCallback, useEffect, useState } from 'react';
import { Coins, RefreshCw } from 'lucide-react';
import { Garage, Package } from '../../types';
import { firestoreService } from '../../services';

interface Props { garage: Garage; packages: Package[]; adminLang: string; }

export const AdminCreditGrantPanel: React.FC<Props> = ({ garage, packages, adminLang }) => {
  const english = adminLang === 'en';
  const templates = packages.filter((p) => p.catalogType === 'credit_bundle' && p.isActive !== false && Number.isSafeInteger(p.creditQuantity) && Number(p.creditQuantity) > 0);
  const [packageId, setPackageId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [reason, setReason] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const paid = Number(garage.creditBalance?.paid || 0);
  const referral = Number(garage.creditBalance?.referral || 0);
  const total = paid + referral;

  const refresh = useCallback(async () => {
    try { setHistory(await firestoreService.getGarageCreditLedger(garage.id)); }
    catch { setError(english ? 'Could not load credit history.' : 'تعذر تحميل سجل الأرصدة.'); }
  }, [garage.id, english]);
  useEffect(() => { void refresh(); }, [refresh]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const enteredAmount = amount.trim() ? Number(amount) : undefined;
    if ((!packageId && (!Number.isSafeInteger(enteredAmount) || Number(enteredAmount) < 1 || Number(enteredAmount) > 1_000_000))
      || (packageId && amount.trim()) || !paymentReference.trim() || !reason.trim() || !paymentConfirmed) {
      setError(english ? 'Choose one template or a positive whole credit amount; enter the offline payment reference and reason, then confirm payment.' : 'اختر قالباً أو كمية صحيحة موجبة، وأدخل مرجع الدفع والسبب ثم أكد استلام الدفع الخارجي.');
      return;
    }
    setSubmitting(true); setError('');
    try {
      await firestoreService.adminGrantGarageCredits(garage.id, {
        ...(packageId ? { packageId } : { amount: enteredAmount }),
        paymentReference: paymentReference.trim(), reason: reason.trim(), paymentConfirmed,
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `grant-${Date.now()}-${Math.random().toString(36).slice(2)}`
      });
      setAmount(''); setPackageId(''); setPaymentReference(''); setReason(''); setPaymentConfirmed(false);
      await refresh();
    } catch (cause: any) { setError(cause?.message || (english ? 'Credit grant failed.' : 'فشل منح الرصيد.')); }
    finally { setSubmitting(false); }
  };

  if (garage.billingModel !== 'prepaid_credits') {
    return <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <h3 className="font-black flex items-center gap-2"><Coins className="w-4 h-4" />{english ? 'Prepaid credits' : 'أرصدة الدخول المسبقة'}</h3>
      <p className="text-sm mt-2 text-slate-500">{english ? 'Credit grants are available only after the garage is separately enabled for the prepaid model. This panel does not enable or migrate garages.' : 'تتاح المنح فقط بعد تفعيل نموذج الأرصدة للجراج بقرار مستقل. هذه الشاشة لا تفعّل الجراج ولا ترحّل بياناته.'}</p>
    </section>;
  }

  return <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4" aria-label={english ? 'Manual credit grants' : 'منح الأرصدة اليدوي'}>
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-black flex items-center gap-2"><Coins className="w-4 h-4" />{english ? 'Manual prepaid-credit grant' : 'منح رصيد مسبق يدوياً'}</h3><p className="text-xs text-slate-500 mt-1">{english ? 'Non-expiring credits · 1 credit = 1 EGP · payment confirmed offline by Admin' : 'أرصدة لا تنتهي · الرصيد الواحد = ١ ج.م · يؤكد Admin الدفع الخارجي'}</p></div><button type="button" onClick={() => void refresh()} className="p-2 rounded-lg border" aria-label={english ? 'Refresh history' : 'تحديث السجل'}><RefreshCw className="w-4 h-4" /></button></div>
    <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><small>{english ? 'Total' : 'الإجمالي'}</small><div className="font-black text-xl">{total.toLocaleString()}</div></div><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><small>{english ? 'Paid' : 'مدفوع'}</small><div className="font-black text-xl">{paid.toLocaleString()}</div></div><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><small>{english ? 'Referral' : 'إحالة'}</small><div className="font-black text-xl">{referral.toLocaleString()}</div></div></div>
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-bold">{english ? 'Credit template' : 'قالب الرصيد'}<select value={packageId} onChange={(e) => { setPackageId(e.target.value); if (e.target.value) setAmount(''); }} className="mt-1 w-full rounded-lg border p-2 bg-white dark:bg-slate-950"><option value="">{english ? 'Manual amount' : 'كمية مدخلة يدوياً'}</option>{templates.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.creditQuantity} credits · {p.price} EGP</option>)}</select></label>
      <label className="text-xs font-bold">{english ? 'Entered credits' : 'عدد الأرصدة المدخل'}<input type="number" min="1" max="1000000" step="1" value={amount} disabled={Boolean(packageId)} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border p-2 bg-white dark:bg-slate-950 disabled:opacity-50" /></label>
      <label className="text-xs font-bold">{english ? 'Offline payment reference' : 'مرجع الدفع الخارجي'}<input required maxLength={120} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-1 w-full rounded-lg border p-2 bg-white dark:bg-slate-950" /></label>
      <label className="text-xs font-bold">{english ? 'Grant reason / note' : 'سبب المنح / ملاحظة'}<input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-2 bg-white dark:bg-slate-950" /></label>
      <label className="flex gap-2 items-start text-xs md:col-span-2"><input type="checkbox" checked={paymentConfirmed} onChange={(e) => setPaymentConfirmed(e.target.checked)} />{english ? 'I confirm that external/offline payment was received. This action grants credits directly; it does not charge a card.' : 'أؤكد استلام الدفع الخارجي/غير الإلكتروني. هذا الإجراء يمنح الأرصدة مباشرة ولا ينفذ تحصيلاً إلكترونياً.'}</label>
      {error && <p role="alert" className="text-sm text-red-600 md:col-span-2">{error}</p>}
      <button type="submit" disabled={submitting} className="rounded-xl bg-emerald-600 px-4 py-3 text-white font-black disabled:opacity-50 md:col-span-2">{submitting ? (english ? 'Granting…' : 'جارٍ المنح…') : (english ? 'Confirm payment and grant credits' : 'تأكيد الدفع ومنح الأرصدة')}</button>
    </form>
    <div><h4 className="font-bold text-sm mb-2">{english ? 'Recent grants and usage (up to 50)' : 'أحدث المنح والاستخدام (حتى ٥٠)'} </h4><ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-auto">{history.map((entry) => <li key={entry.entryId} className="py-2 flex justify-between gap-3 text-xs"><span>{entry.kind} · {entry.bucket}{entry.reason ? ` · ${entry.reason}` : ''}</span><span className="font-mono font-bold">{entry.kind?.endsWith('_debit') ? '−' : '+'}{entry.amount} · {String(entry.occurredAt || '').slice(0, 10)}</span></li>)}{history.length === 0 && <li className="py-3 text-xs text-slate-500">{english ? 'No credit history yet.' : 'لا يوجد سجل أرصدة بعد.'}</li>}</ul></div>
  </section>;
};
