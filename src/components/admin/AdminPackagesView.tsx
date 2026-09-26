import React, { useState } from 'react';
import { Plus, Zap, Tag, Trash2, Car, Clock, X } from 'lucide-react';
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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
      setIsAddModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const displayedPackages = packages.filter(p => packageDurationFilter === 30 ? (p.durationDays === 30 || !p.durationDays) : p.durationDays === packageDurationFilter);

  return (
    <div className="space-y-6 dir-rtl text-right font-sans max-w-6xl mx-auto">
      {/* Top Header Card with Action Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center shrink-0 border border-amber-500/20">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
              {t('خطط الاشتراكات')}
            </h2>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              {t('إدارة وتحديد باقات وأسعار النظام')}
            </p>
          </div>
        </div>

        <button
          id="btn_open_add_package_modal"
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-2xl text-xs transition-all shadow-sm cursor-pointer active:scale-98"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>{t('إضافة باقة جديدة')}</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setPackageDurationFilter(1)}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center cursor-pointer whitespace-nowrap ${
            packageDurationFilter === 1 
              ? 'bg-amber-400 text-slate-950 shadow-sm font-black' 
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>1 {t('يوم')}</span>
        </button>
        <button
          type="button"
          onClick={() => setPackageDurationFilter(15)}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center cursor-pointer whitespace-nowrap ${
            packageDurationFilter === 15 
              ? 'bg-amber-400 text-slate-950 shadow-sm font-black' 
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>15 {t('يوم')}</span>
        </button>
        <button
          type="button"
          onClick={() => setPackageDurationFilter(30)}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center cursor-pointer whitespace-nowrap ${
            packageDurationFilter === 30 
              ? 'bg-amber-400 text-slate-950 shadow-sm font-black' 
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <span>30 {t('يوم')}</span>
        </button>
      </div>

      {/* Packages Grid */}
      <div>
        {displayedPackages.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedPackages.map(pkg => {
              const info = getCleanPackageInfo(pkg);
              const hasDiscount = Boolean(pkg.discountValue && pkg.discountValue > 0);
              const finalPrice = hasDiscount ? Math.round(pkg.price * (1 - (pkg.discountValue || 0) / 100)) : pkg.price;

              return (
                <div 
                  key={pkg.id} 
                  className="p-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all flex flex-col justify-between shadow-sm space-y-4"
                >
                  {/* Header Row: Plan Name + Discount + Delete */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-900 dark:text-white text-base leading-tight truncate">
                        {pkg.name}
                      </h4>
                      {hasDiscount && (
                        <span className="inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          خصم {pkg.discountValue}%
                        </span>
                      )}
                    </div>

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
                      className="w-8 h-8 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white dark:bg-rose-950/40 dark:hover:bg-rose-600 dark:text-rose-400 dark:hover:text-white rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 border border-rose-200/60 dark:border-rose-900/40"
                      title={t('حذف الخطة')}
                    >
                      <Trash2 className="w-4 h-4 stroke-[2]" />
                    </button>
                  </div>

                  {/* Price Display */}
                  <div className="flex items-baseline gap-1.5 font-mono bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                      {finalPrice.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-sans">ج.م</span>
                    {hasDiscount && (
                      <span className="text-xs font-bold text-slate-400 line-through mr-2">
                        {pkg.price.toLocaleString('en-US')} ج.م
                      </span>
                    )}
                  </div>

                  {/* Capacity & Duration Info */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <div className="w-5 h-5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Car className="w-3 h-3" />
                      </div>
                      <span>
                        {info.isUnlimited ? 'سعة مفتوحة بدون حد أقصى' : `سعة استيعاب حتى ${info.dailyCapacity} سيارة/يوم`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                      <div className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                        <Clock className="w-3 h-3" />
                      </div>
                      <span>المدة: {pkg.durationDays || 30} يوماً</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-bold space-y-2">
            <Zap className="w-10 h-10 mx-auto opacity-30 text-amber-500" />
            <p>{t('لا توجد خطط اشتراكات مسجلة حالياً في هذه الفئة')}</p>
          </div>
        )}
      </div>

      {/* On-Demand Add Package Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-emerald-600 text-white rounded-xl flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {t('إضافة خطة اشتراك جديدة')}
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    أدخل تفاصيل الباقة لتفعيلها في النظام
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitNewPackage} className="space-y-4">
              {/* Plan Name */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                  {t('اسم خطة الاشتراك')} <span className="text-red-500">*</span>
                </label>
                <input 
                  name="pkgName" 
                  placeholder={t('مثال: الباقة الفضية')} 
                  required 
                  className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 outline-none font-bold text-xs sm:text-sm transition-all" 
                />
              </div>

              {/* Price */}
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                  {t('سعر الاشتراك الدوري (ج.م)')} <span className="text-red-500">*</span>
                </label>
                <input 
                  name="pkgPrice" 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="800" 
                  required 
                  className="w-full py-2.5 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 outline-none font-black font-mono text-sm sm:text-base transition-all" 
                />
              </div>

              {/* Duration & Daily Capacity */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    {t('مدة الاشتراك (بالأيام)')}
                  </label>
                  <select 
                    name="pkgDurationDays" 
                    defaultValue="30"
                    className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold font-mono text-xs outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="1">1 {t('يوم')}</option>
                    <option value="15">15 {t('يوم')}</option>
                    <option value="30">30 {t('يوم')}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                    {t('السعة اليومية (سيارة/يوم)')}
                  </label>
                  <select 
                    name="pkgDailyCapacity" 
                    defaultValue=""
                    className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold font-mono text-xs outline-none focus:border-emerald-500 cursor-pointer" 
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
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('نسبة الخصم التشجيعي (%)')}</span>
                </label>
                <select 
                  name="pkgDiscountValue"
                  className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">{t('بدون خصم (0%)')}</option>
                  {[10, 15, 20, 25, 30, 50].map((num) => (
                    <option key={num} value={num}>
                      خصم {num}%
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black text-xs sm:text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>{t('حفظ وإضافة خطة الاشتراك')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
