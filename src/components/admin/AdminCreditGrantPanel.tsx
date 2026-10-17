import React, { useCallback, useEffect, useState } from 'react';
import { Coins, RefreshCw } from 'lucide-react';
import { Garage, Package } from '../../types';
import { firestoreService } from '../../services';

interface Props { garage: Garage; packages: Package[]; adminLang: string; }

export const AdminCreditGrantPanel: React.FC<Props> = ({ garage, packages, adminLang }) => {
  const english = adminLang === 'en';
  const templates = packages.filter((p) => (
    p.catalogType === 'credit_bundle'
      && p.isActive !== false
      && Number.isSafeInteger(p.creditQuantity)
      && Number(p.creditQuantity) > 0
      && Number(p.price) === Number(p.creditQuantity)
  ));
  const [packageId, setPackageId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [reason, setReason] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const selectedTemplate = templates.find((p) => p.id === packageId);
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
    const creditAmount = packageId ? Number(selectedTemplate?.creditQuantity) : enteredAmount;
    const paymentAmountEgp = packageId ? Number(selectedTemplate?.price) : enteredAmount;
    if ((!packageId && (!Number.isSafeInteger(enteredAmount) || Number(enteredAmount) < 1 || Number(enteredAmount) > 1_000_000))
      || (packageId && !selectedTemplate)
      || !Number.isSafeInteger(paymentAmountEgp)
      || paymentAmountEgp !== creditAmount
      || !paymentReference.trim()
      || !reason.trim()
      || !paymentConfirmed) {
      setError(english
        ? 'Enter the confirmed transfer amount or choose a matching template, add the sender/transfer reference and reason, then confirm receipt.'
        : 'أدخل مبلغ التحويل الذي تم تأكيده أو اختر قالباً مطابقاً، ثم أدخل رقم المرسل أو مرجع التحويل والسبب وأكد الاستلام.');
      return;
    }
    setSubmitting(true); setError('');
    try {
      await firestoreService.adminGrantGarageCredits(garage.id, {
        ...(packageId ? { packageId } : { amount: enteredAmount }),
        paymentAmountEgp,
        paymentReference: paymentReference.trim(),
        reason: reason.trim(),
        paymentConfirmed,
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
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-black flex items-center gap-2"><Coins className="w-4 h-4" />{english ? 'Manual prepaid-credit grant' : 'منح رصيد مسبق يدوياً'}</h3><p className="text-xs text-slate-500 mt-1">{english ? '1 EGP = 1 credit. Enter the verified transfer amount; the same number of credits is added.' : '١ جنيه = رصيد واحد. أدخل مبلغ التحويل الذي تحققت منه؛ وسيُضاف العدد نفسه من الأرصدة.'}</p></div><button type="button" onClick={() => void refresh()} className="p-2 rounded-lg border" aria-label={english ? 'Refresh history' : 'تحديث السجل'}><RefreshCw className="w-4 h-4" /></button></div>
    <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><small>{english ? 'Total credits' : 'إجمالي الأرصدة'}</small><div className="font-black text-xl">{total.toLocaleString()}</div></div><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><small>{english ? 'Paid credits' : 'أرصدة مدفوعة'}</small><div className="font-black text-xl">{paid.toLocaleString()}</div></div><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><small>{english ? 'Referral credits' : 'أرصدة الإحالة'}</small><div className="font-black text-xl">{referral.toLocaleString()}</div></div></div>
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-bold">{english ? 'Credit template' : 'قالب الرصيد'}<select value={packageId} onChange={(e) => { setPackageId(e.target.value); setAmount(''); }} className="mt-1 w-full rounded-lg border p-2 bg-white dark:bg-slate-950"><option value="">{english ? 'Enter transfer amount' : 'أدخل مبلغ التحويل'}</option>{templates.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.creditQuantity} credits · {p.price} EGP</option>)}</select></label>
      <label className="text-xs font-bold">{packageId ? (english ? 'Confirmed amount received (EGP)' : 'مبلغ التحويل المؤكد (ج.م)') : (english ? 'Confirmed amount received (EGP) = credits to add' : 'مبلغ التحويل المؤكد (ج.م) = عدد الأرصدة المضافة')}<input type="text" inputMode="numeric" pattern="[0-9]*" value={packageId ? String(selectedTemplate?.price ?? '') : amount} disabled={Boolean(packageId)} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border p-2 bg-white dark:bg-slate-950 disabled:opacity-70" /></label>
      <label className="text-xs font-bold">{english ? 'Sender number / transfer reference' : 'رقم المرسل / مرجع التحويل'}<input required maxLength={120} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-1 w-full rounded-lg border p-2 bg-white dark:bg-slate-950" /></label>
      <label className="text-xs font-bold">{english ? 'Grant reason / note' : 'سبب المنح / ملاحظة'}<input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-2 bg-white dark:bg-slate-950" /></label>
      <label className="flex gap-2 items-start text-xs md:col-span-2"><input type="checkbox" checked={paymentConfirmed} onChange={(e) => setPaymentConfirmed(e.target.checked)} />{english ? 'I confirm that I checked the transfer and received this amount. This action records the EGP payment and grants the same number of credits; it does not charge a card.' : 'أؤكد أنني تحققت من التحويل واستلمت هذا المبلغ. تسجل هذه العملية المبلغ بالجنيه وتمنح العدد نفسه من الأرصدة؛ ولا تخصم من بطاقة.'}</label>
      {error && <p role="alert" className="text-sm text-red-600 md:col-span-2">{error}</p>}
      <button type="submit" disabled={submitting} className="rounded-xl bg-emerald-600 px-4 py-3 text-white font-black disabled:opacity-50 md:col-span-2">{submitting ? (english ? 'Recording…' : 'جارٍ التسجيل…') : (english ? 'Confirm transfer and add credits' : 'تأكيد التحويل وإضافة الأرصدة')}</button>
    </form>
    <div><h4 className="font-bold text-sm mb-2">{english ? 'Recent grants and usage (up to 50)' : 'أحدث المنح والاستخدام (حتى ٥٠)'} </h4><ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-auto">{history.map((entry) => <li key={entry.entryId} className="py-2 flex justify-between gap-3 text-xs"><span>{entry.kind} · {entry.bucket}{entry.reason ? ` · ${entry.reason}` : ''}</span><span className="font-mono font-bold">{entry.kind?.endsWith('_debit') ? '−' : '+'}{entry.amount}{entry.paymentAmountEgp === undefined ? '' : ` · ${entry.paymentAmountEgp} EGP`} · {String(entry.occurredAt || '').slice(0, 10)}</span></li>)}{history.length === 0 && <li className="py-3 text-xs text-slate-500">{english ? 'No credit history yet.' : 'لا يوجد سجل أرصدة بعد.'}</li>}</ul></div>
  </section>;
};
