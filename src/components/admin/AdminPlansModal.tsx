import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  X,
  Trash2,
  Loader2,
  Car
} from 'lucide-react';
import { Package } from '../../types';
import { firestoreService } from '../../services';
import { getCleanPackageInfo } from '../../constants/packages';

interface AdminPlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  packages: Package[];
  setConfirmDialog: any;
  adminLang: 'ar' | 'en';
  t: (key: string) => string;
}

export const AdminPlansModal: React.FC<AdminPlansModalProps> = ({
  isOpen,
  onClose,
  packages,
  setConfirmDialog,
  adminLang,
  t,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 dark:bg-slate-950/85 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-2xl transition-colors"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">{t('إدارة خطط الاشتراكات الدوريّة')}</h2>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl flex shrink-0 items-center justify-center transition-colors outline-none cursor-pointer active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 max-h-[75vh] max-h-[75dvh] overflow-y-auto custom-scrollbar-slate">
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              if (isSubmitting) return;
              const form = e.target as HTMLFormElement;
              const name = (form.elements.namedItem('name') as HTMLInputElement).value;
              const price = Number((form.elements.namedItem('price') as HTMLInputElement).value);
              const durationDays = Number((form.elements.namedItem('durationDays') as HTMLInputElement).value) || 30;
              const dailyCapacity = Number((form.elements.namedItem('dailyCapacity') as HTMLInputElement).value) || 100;
              
              setIsSubmitting(true);
              try {
                await firestoreService.addPackage({ 
                  name, 
                  price, 
                  durationDays, 
                  dailyCapacity, 
                  vehiclesCount: dailyCapacity 
                });
                form.reset();
              } catch (err) {
                console.error(err);
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="mb-8 space-y-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 dark:text-slate-400 pr-1">{t('اسم الباقة')}</label>
                <input name="name" placeholder={t('باقة مميزة')} required className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-all text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 dark:text-slate-400 pr-1">{t('السعر')}</label>
                <input name="price" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="200" required className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-mono text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 dark:text-slate-400 pr-1">{t('مدة الاشتراك (أيام)')}</label>
                <input name="durationDays" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="30" required className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 dark:text-slate-400 pr-1">{t('السعة اليومية (سيارة/يوم)')}</label>
                <input name="dailyCapacity" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="100" defaultValue="100" required className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-mono text-sm" />
              </div>
            </div>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full h-14 bg-slate-900 dark:bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-slate-800 dark:hover:bg-emerald-700 active:scale-95 transition-all duration-150 outline-none cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('جاري الإضافة...')}</span>
                </>
              ) : (
                <span>{t('إضافة الباقة')}</span>
              )}
            </button>
          </form>

          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 mb-3">{t('الباقات الحالية')}</h3>
            {packages.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 transition-colors">
                <p className="text-slate-400 dark:text-slate-500 font-bold text-sm">{t('لا يوجد باقات')}</p>
              </div>
            ) : (
              packages.map(pkg => {
                const info = getCleanPackageInfo(pkg);
                return (
                  <div key={pkg.id} className="p-4 sm:p-5 bg-white dark:bg-slate-800/90 border-2 border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col gap-3 group hover:border-emerald-500/30 transition-all shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-black text-slate-900 dark:text-white text-base leading-tight truncate">{pkg.name}</h4>
                      <button 
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: t('حذف باقة'),
                            message: adminLang === 'en' ? `Are you sure you want to delete package "${pkg.name}"?` : `هل أنت متأكد من حذف باقة "${pkg.name}"؟`,
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
                        className="w-8 h-8 bg-red-100 hover:bg-red-600 text-red-600 hover:text-white dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-600 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0"
                        title={t('حذف الخطة')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-baseline gap-1.5 font-mono">
                      <span className="text-xl sm:text-2xl font-black text-amber-500 dark:text-amber-400 font-mono">
                        {pkg.price.toLocaleString('en-US')}
                      </span>
                      <span className="text-xs font-black text-amber-500/80 dark:text-amber-400/80">{t('ج.م')}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/60 pt-2.5">
                      <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Car className="w-3 h-3" />
                      </div>
                      <span>
                        {info.isUnlimited ? t('سعة مفتوحة بدون حد أقصى') : `${info.dailyCapacity} ${t('سيارة/يوم')}`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
