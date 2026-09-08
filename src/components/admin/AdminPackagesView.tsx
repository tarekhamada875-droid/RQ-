import React, { useState } from 'react';
import { Plus, Zap, Tag, Trash2, Car, Clock } from 'lucide-react';
import { Package } from '../../types';
import { getCleanPackageInfo } from '../../constants/packages';
import { firestoreService } from '../../services';

interface AdminPackagesViewProps {
  packages: Package[];
  setConfirmDialog: React.Dispatch<React.SetStateAction<any>>;
  setPackageValidationError: React.Dispatch<React.SetStateAction<any>>;
  t: (key: string) => string;
}

export const AdminPackagesView: React.FC<AdminPackagesViewProps> = ({
  packages,
  setConfirmDialog,
  setPackageValidationError,
  t,
}) => {
  const [packageDurationFilter, setPackageDurationFilter] = useState<number>(30);

  const handleSubmitNewPackage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const nameInput = form.elements.namedItem('pkgName') as HTMLInputElement;
    const priceInput = form.elements.namedItem('pkgPrice') as HTMLInputElement;
    const durationInput = form.elements.namedItem('pkgDurationDays') as HTMLInputElement | HTMLSelectElement;
    const dailyCapInput = form.elements.namedItem('pkgDailyCapacity') as HTMLInputElement | HTMLSelectElement;
    const discountValueInput = form.elements.namedItem('pkgDiscountValue') as HTMLSelectElement;
    
    const name = nameInput?.value?.trim() || '';
    const price = Number(priceInput?.value) || 0;
    const durationDays = Number(durationInput?.value) || 30;
    const rawCapVal = dailyCapInput?.value !== undefined && dailyCapInput.value.trim() !== '' ? Number(dailyCapInput.value) : 0;
    const dailyCapacity = isNaN(rawCapVal) ? 0 : rawCapVal;
    const discountVal = discountValueInput?.value ? Number(discountValueInput.value) : 0;
    
    if (!name || price <= 0) {
      return;
    }

    // Logical Validation
    const finalPrice = discountVal > 0 ? price * (1 - discountVal / 100) : price;
    const nDur = durationDays;
    const nCap = dailyCapacity === 0 ? Infinity : dailyCapacity;

    let conflict = null;
    const currentPkgs = packages || [];
    for (const pkg of currentPkgs) {
      const info = getCleanPackageInfo(pkg);
      const eCap = info.isUnlimited ? Infinity : (info.dailyCapacity || 50);
      const eDur = info.durationDays;
      const ePrice = pkg.discountValue && pkg.discountValue > 0 
        ? (pkg.discountType === 'percentage' 
            ? pkg.price * (1 - pkg.discountValue / 100) 
            : Math.max(0, pkg.price - pkg.discountValue))
        : pkg.price;

      // Same package details (Duplicate)
      if (nCap === eCap && nDur === eDur && finalPrice === ePrice) {
        conflict = { pkgName: pkg.name, reason: 'duplicate', ePrice, eCap, eDur };
        break;
      }

      // Condition A: New offers MORE/EQUAL value but is CHEAPER/EQUAL
      if (nDur >= eDur && nCap >= eCap && finalPrice <= ePrice) {
        conflict = { pkgName: pkg.name, reason: 'too_cheap', ePrice, eCap, eDur };
        break;
      }

      // Condition B: New offers LESS/EQUAL value but is MORE EXPENSIVE/EQUAL
      if (nDur <= eDur && nCap <= eCap && finalPrice >= ePrice) {
        conflict = { pkgName: pkg.name, reason: 'too_expensive', ePrice, eCap, eDur };
        break;
      }
    }

    if (conflict) {
      let msg = '';
      let suggestions: string[] = [];
      if (conflict.reason === 'duplicate') {
        msg = `هذا الاشتراك مطابق تماماً لاشتراك "${conflict.pkgName}".`;
        suggestions = ['قم بتغيير السعر', 'أو تغيير السعة اليومية', 'أو تغيير مدة الاشتراك'];
      } else if (conflict.reason === 'too_cheap') {
        msg = `هذا الاشتراك يقدم ميزات (مدة/سعة) أكبر من أو تساوي اشتراك "${conflict.pkgName}" ولكن بسعر أرخص أو مساوٍ!`;
        suggestions = [
          `ارفع السعر (بعد الخصم) ليكون أعلى من ${Math.round(conflict.ePrice)} ج.م`,
          conflict.eCap === Infinity ? `قم بتحديد سعة يومية بدلاً من السعة المفتوحة` : `قلل السعة اليومية لتكون أقل من ${conflict.eCap} سيارة/يوم`,
          `قلل مدة الاشتراك لتكون أقل من ${conflict.eDur} يوماً`
        ];
      } else if (conflict.reason === 'too_expensive') {
        msg = `هذا الاشتراك يقدم ميزات (مدة/سعة) أقل من أو تساوي اشتراك "${conflict.pkgName}" ولكن بسعر أعلى أو مساوٍ!`;
        suggestions = [
          `قلل السعر (بعد الخصم) ليكون أقل من ${Math.round(conflict.ePrice)} ج.م`,
          conflict.eCap === Infinity ? `(السعة الحالية مفتوحة بالفعل)` : `ارفع السعة اليومية لتكون أعلى من ${conflict.eCap} سيارة/يوم`,
          `ارفع مدة الاشتراك لتكون أعلى من ${conflict.eDur} يوماً`
        ];
      }

      setPackageValidationError({
        isOpen: true,
        conflictingPackageName: conflict.pkgName,
        message: msg,
        suggestions: suggestions.filter(s => !s.includes('(السعة الحالية مفتوحة بالفعل)'))
      });
      return;
    }

    try {
      const pkgData: Omit<Package, 'id' | 'createdAt' | 'isActive'> = {
        name,
        price,
        vehiclesCount: dailyCapacity,
        durationDays,
        dailyCapacity
      };
      if (discountVal > 0) {
        pkgData.discountType = 'percentage';
        pkgData.discountValue = discountVal;
      }
      await firestoreService.addPackage(pkgData);
      form.reset();
    } catch (err) {
      console.error(err);
    }
  };

  const displayedPackages = packages.filter(p => packageDurationFilter === 30 ? (p.durationDays === 30 || !p.durationDays) : p.durationDays === packageDurationFilter);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <section className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-4">
              <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center shrink-0 text-white">
                <Plus className="w-5 h-5 stroke-[3]" />
              </div>
              <span>{t('إضافة خطة اشتراك جديدة')}</span>
            </h2>

            <form onSubmit={handleSubmitNewPackage} className="space-y-5">
              {/* Plan Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                  {t('اسم خطة الاشتراك')} <span className="text-red-500">*</span>
                </label>
                <input 
                  name="pkgName" 
                  placeholder={t('مثال: اشتراك 15 يوم - سعة 50 سيارة/يوم')} 
                  required 
                  className="w-full p-4 bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 outline-none font-bold text-sm transition-all" 
                />
              </div>

              {/* Price */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                  {t('سعر الاشتراك الدوري (ج.م)')} <span className="text-red-500">*</span>
                </label>
                <input 
                  name="pkgPrice" 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={t('مثال: 800 أو 1500')} 
                  required 
                  className="w-full p-4 bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 outline-none font-bold font-mono text-base transition-all" 
                />
              </div>

              {/* Duration & Daily Capacity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    {t('مدة الاشتراك (بالأيام)')}
                  </label>
                  <select 
                    name="pkgDurationDays" 
                    defaultValue="30"
                    className="w-full p-4.5 bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-bold font-mono text-sm outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="1">1 {t('يوم (يومي)')}</option>
                    <option value="15">15 {t('يوم')}</option>
                    <option value="30">30 {t('يوم')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    {t('السعة اليومية (سيارة/يوم)')}
                  </label>
                  <select 
                    name="pkgDailyCapacity" 
                    defaultValue=""
                    className="w-full p-4.5 bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold font-mono text-sm outline-none focus:border-emerald-500" 
                    dir="rtl"
                  >
                    <option value="40">40 {t('سيارة')}</option>
                    <option value="70">70 {t('سيارة')}</option>
                    <option value="100">100 {t('سيارة')}</option>
                    <option value="150">150 {t('سيارة')}</option>
                    <option value="">{t('غير محدودة')}</option>
                  </select>
                </div>
              </div>

              {/* Discount */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <label className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  <span>{t('نسبة الخصم التشجيعي (%)')}</span>
                </label>
                <select 
                  name="pkgDiscountValue"
                  className="w-full p-4.5 bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">{t('بدون خصم (0%)')}</option>
                  {[10, 15, 20, 25, 30, 50].map((num) => (
                    <option key={num} value={num}>
                      خصم {num}%
                    </option>
                  ))}
                </select>
              </div>

              <button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-base transition-all shadow-md flex items-center justify-center gap-4 cursor-pointer mt-2"
              >
                <Plus className="w-5 h-5 stroke-[3]" />
                <span>{t('حفظ وإضافة خطة الاشتراك')}</span>
              </button>
            </form>
          </div>
        </section>

        {/* Plans List Column */}
        <section className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-6 border-b-2 border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-4">
                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <span>{t('خطط الاشتراكات الحالية للنظام')}</span>
                <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full border border-slate-200 dark:border-slate-700">
                  ({packages.length})
                </span>
              </h2>
            </div>

            <div className="p-6">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-6">
                <button
                  type="button"
                  onClick={() => setPackageDurationFilter(1)}
                  className={`flex-1 py-3 px-3 sm:px-4 rounded-xl text-sm font-black transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap ${
                    packageDurationFilter === 1 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <span className="whitespace-nowrap">1 {t('يوم')}</span>
                  <span className="text-[10px] font-bold opacity-60 whitespace-nowrap">({t('يومي')})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPackageDurationFilter(15)}
                  className={`flex-1 py-3 px-3 sm:px-4 rounded-xl text-sm font-black transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap ${
                    packageDurationFilter === 15 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <span className="whitespace-nowrap">15 {t('يوم')}</span>
                  <span className="text-[10px] font-bold opacity-60 whitespace-nowrap">({t('نصف شهر')})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPackageDurationFilter(30)}
                  className={`flex-1 py-3 px-3 sm:px-4 rounded-xl text-sm font-black transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap ${
                    packageDurationFilter === 30 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <span className="whitespace-nowrap">30 {t('يوم')}</span>
                  <span className="text-[10px] font-bold opacity-60 whitespace-nowrap">({t('شهر')})</span>
                </button>
              </div>

              <div className="space-y-8">
                {displayedPackages.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {displayedPackages.map(pkg => {
                      const info = getCleanPackageInfo(pkg);
                      const hasDiscount = Boolean(pkg.discountValue && pkg.discountValue > 0);
                      const finalPrice = hasDiscount ? Math.round(pkg.price * (1 - (pkg.discountValue || 0) / 100)) : pkg.price;

                      return (
                        <div 
                          key={pkg.id} 
                          className="p-5 bg-slate-50 dark:bg-slate-800/80 border-2 border-slate-200 dark:border-slate-700/90 rounded-3xl hover:border-emerald-500 dark:hover:border-emerald-500 transition-all flex flex-col justify-between shadow-sm space-y-4"
                        >
                          {/* Header Row: Plan Name + Badges + Actions */}
                          <div className="flex justify-between items-center gap-2">
                            <h4 className="font-black text-slate-900 dark:text-white text-base sm:text-lg leading-tight truncate">
                              {pkg.name}
                            </h4>

                            <div className="flex items-center gap-2 shrink-0">
                              {hasDiscount && (
                                <span className="text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                  خصم {pkg.discountValue}%
                                </span>
                              )}
                              <button 
                                type="button"
                                onClick={() => {
                                  setConfirmDialog({
                                    isOpen: true,
                                    title: t('حذف خطة اشتراك'),
                                    message: `هل أنت متأكد من حذف خطة الاشتراك "${pkg.name}"؟`,
                                    confirmText: t('حذف'),
                                    cancelText: t('تراجع'),
                                    type: 'danger',
                                    onConfirm: async () => {
                                      try {
                                        await firestoreService.deletePackage(pkg.id);
                                      } catch (err) {
                                        console.error(err);
                                      } finally {
                                        setConfirmDialog((prev: any) => ({ ...prev, isOpen: false }));
                                      }
                                    }
                                  });
                                }}
                                className="w-8 h-8 bg-red-100 hover:bg-red-600 text-red-600 hover:text-white dark:bg-red-900/30 dark:hover:bg-red-600 dark:text-red-400 dark:hover:text-white rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0"
                                title={t('حذف الخطة')}
                              >
                                <Trash2 className="w-4 h-4 stroke-[2]" />
                              </button>
                            </div>
                          </div>

                          {/* Price Row: High-Contrast Monospace Display */}
                          <div className="flex items-baseline gap-2 font-mono">
                            <span className="text-2xl sm:text-3xl font-black text-amber-500 dark:text-amber-400">
                              {finalPrice.toLocaleString('en-US')}
                            </span>
                            <span className="text-xs sm:text-sm font-black text-amber-500/80 dark:text-amber-400/80">ج.م</span>
                            {hasDiscount && (
                              <span className="text-xs font-bold text-slate-400 line-through mr-1.5">
                                بدلاً من {pkg.price.toLocaleString('en-US')} ج.م
                              </span>
                            )}
                          </div>

                          {/* Feature / Capacity & Duration Row */}
                          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <Car className="w-3.5 h-3.5" />
                              </div>
                              <span>
                                {info.isUnlimited ? 'سعة مفتوحة بدون حد أقصى للسيارات يومياً' : `سعة استيعاب حتى ${info.dailyCapacity} سيارة يومياً`}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                              <div className="w-6 h-6 rounded-lg bg-slate-200/50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                                <Clock className="w-3.5 h-3.5" />
                              </div>
                              <span>صلاحية الخطة: {pkg.durationDays || 30} يوماً</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center text-slate-400 dark:text-slate-500 font-bold">
                    <Zap className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-500" />
                    <p>{t('لا توجد خطط اشتراكات مسجلة حالياً في هذه الفئة')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
