import React, { useState } from 'react';
import { Coins, Plus, Trash2, X } from 'lucide-react';
import { Package } from '../../types';
import { firestoreService } from '../../services';
import { classifyApiFailure, getApiFailureReference } from '../../utils/apiFailure';

interface AdminPackagesViewProps {
  packages: Package[];
  setConfirmDialog: React.Dispatch<React.SetStateAction<any>>;
  setPackageValidationError: React.Dispatch<React.SetStateAction<any>>;
  t: (key: string) => string;
}

function effectivePrice(pkg: Package): number {
  if (pkg.catalogType === 'credit_bundle' || !pkg.discountValue) return pkg.price;
  return pkg.discountType === 'percentage'
    ? Math.round(pkg.price * (1 - pkg.discountValue / 100))
    : Math.max(0, pkg.price - pkg.discountValue);
}

export const AdminPackagesView: React.FC<AdminPackagesViewProps> = ({
  packages,
  setConfirmDialog,
  setPackageValidationError: _setPackageValidationError,
  t,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmitNewPackage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    const form = e.currentTarget;
    const name = (form.elements.namedItem('pkgName') as HTMLInputElement)?.value?.trim() || '';
    const price = Number((form.elements.namedItem('pkgPrice') as HTMLInputElement)?.value);
    const creditQuantity = Number((form.elements.namedItem('pkgCreditQuantity') as HTMLInputElement)?.value);

    if (!name || !Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(creditQuantity) || creditQuantity <= 0) {
      setFormError(t('يرجى إدخال اسم وسعر وعدد أرصدة صالحين'));
      return;
    }

    const duplicate = (packages || []).find((pkg) => (
      pkg.catalogType === 'credit_bundle'
        && pkg.creditQuantity === creditQuantity
        && effectivePrice(pkg) === price
    ));
    if (duplicate) {
      setFormError(`يوجد قالب أرصدة مطابق بالفعل: ${duplicate.name}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await firestoreService.addPackage({
        name,
        price,
        creditQuantity,
        catalogType: 'credit_bundle',
        // Kept only for the legacy TypeScript/package facade; the Worker does not persist it for credit bundles.
        vehiclesCount: creditQuantity,
      });
      form.reset();
      setIsAddModalOpen(false);
    } catch (err) {
      console.error(err);
      const failure = classifyApiFailure(err);
      if (failure === 'network') {
        setFormError(t('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.'));
      } else if (failure === 'timeout') {
        setFormError(t('انتهت مهلة حفظ قالب الأرصدة. تحقق من ظهوره قبل إعادة المحاولة.'));
      } else if (failure === 'server') {
        const referenceId = getApiFailureReference(err);
        const reference = referenceId ? ` (${t('رقم التتبع')}: ${referenceId})` : '';
        setFormError(`${t('حدث خطأ في الخادم أثناء حفظ قالب الأرصدة.')}${reference}`);
      } else {
        setFormError(t('تعذر حفظ قالب الأرصدة. حاول مرة أخرى.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const visiblePackages = (packages || []).filter((pkg) => pkg.isActive !== false);

  return (
    <div className="space-y-6 dir-rtl text-right font-sans max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center shrink-0 border border-amber-500/20">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">{t('قوالب أرصدة الدخول')}</h2>
            <p className="text-xs font-bold text-slate-400 mt-0.5">{t('إدارة قوالب الأرصدة غير المنتهية — لا تؤكد الدفع أو تمنح الرصيد')}</p>
          </div>
        </div>
        <button
          id="btn_open_add_package_modal"
          type="button"
          onClick={() => { setFormError(null); setIsAddModalOpen(true); }}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-2xl text-xs transition-all shadow-sm cursor-pointer active:scale-98"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>{t('إضافة قالب أرصدة')}</span>
        </button>
      </div>

      <div className="p-3 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 text-xs font-bold">
        {t('القوالب للاستخدام الإداري فقط. لا يختارها مالك الجراج ولا تؤكد الدفع ولا تمنح أرصدة تلقائياً.')}
      </div>

      <div>
        {visiblePackages.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visiblePackages.map((pkg) => {
              const isCreditBundle = pkg.catalogType === 'credit_bundle' && Number.isSafeInteger(pkg.creditQuantity);
              const finalPrice = effectivePrice(pkg);
              return (
                <div key={pkg.id} className="p-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl hover:border-emerald-500/50 transition-all flex flex-col justify-between shadow-sm space-y-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-900 dark:text-white text-base leading-tight truncate">{pkg.name}</h4>
                      <span className="inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {isCreditBundle ? t('قالب أرصدة') : t('سجل قديم حتى الترحيل')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDialog({
                        isOpen: true,
                        title: t('حذف قالب الأرصدة'),
                        message: `هل أنت متأكد من حذف القالب "${pkg.name}"؟`,
                        confirmText: t('حذف'),
                        cancelText: t('تراجع'),
                        type: 'danger',
                        onConfirm: async () => {
                          try { await firestoreService.deletePackage(pkg.id); } catch (err) { console.error(err); }
                          finally { setConfirmDialog((prev: any) => ({ ...prev, isOpen: false })); }
                        },
                      })}
                      className="w-8 h-8 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-600 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 border border-rose-200/60 dark:border-rose-900/40"
                      title={t('حذف القالب')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-baseline gap-1.5 font-mono bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{finalPrice.toLocaleString('en-US')}</span>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-sans">ج.م</span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isCreditBundle
                      ? `${Number(pkg.creditQuantity).toLocaleString('en-US')} ${t('رصيد دخول غير منتهٍ')}`
                      : t('هذا سجل زمني قديم؛ لا يُستخدم كقالب رصيد جديد')}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 font-bold space-y-2">
            <Coins className="w-10 h-10 mx-auto opacity-30 text-amber-500" />
            <p>{t('لا توجد قوالب أرصدة مسجلة حالياً')}</p>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-emerald-600 text-white rounded-xl flex items-center justify-center"><Coins className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">{t('إضافة قالب أرصدة جديد')}</h3>
                  <p className="text-xs font-bold text-slate-400">{t('القالب لا يمنح رصيداً ولا يؤكد الدفع')}</p>
                </div>
              </div>
              <button type="button" disabled={isSubmitting} onClick={() => setIsAddModalOpen(false)} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleSubmitNewPackage} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="admin-package-name" className="text-xs font-black text-slate-800 dark:text-slate-200 block">{t('اسم قالب الأرصدة')} <span className="text-red-500">*</span></label>
                <input name="pkgName" id="admin-package-name" placeholder={t('مثال: قالب 400 رصيد')} required className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 outline-none font-bold text-xs sm:text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="admin-package-price" className="text-xs font-black text-slate-800 dark:text-slate-200 block">{t('سعر القالب (ج.م)')} <span className="text-red-500">*</span></label>
                  <input name="pkgPrice" id="admin-package-price" type="text" inputMode="decimal" placeholder="800" required className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 outline-none font-black font-mono" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="admin-package-credit-quantity" className="text-xs font-black text-slate-800 dark:text-slate-200 block">{t('عدد أرصدة الدخول')} <span className="text-red-500">*</span></label>
                  <input name="pkgCreditQuantity" id="admin-package-credit-quantity" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="400" required className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 outline-none font-black font-mono" />
                </div>
              </div>
              {formError && <p className="text-xs font-bold text-red-600 dark:text-red-400" role="alert">{formError}</p>}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"><Plus className="w-4 h-4" /><span>{isSubmitting ? t('جاري الحفظ...') : t('حفظ قالب الأرصدة')}</span></button>
                <button type="button" disabled={isSubmitting} onClick={() => setIsAddModalOpen(false)} className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs cursor-pointer">{t('إلغاء')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
