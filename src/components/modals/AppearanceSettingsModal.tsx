import React, { useState, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Sun, Moon, Palette, Check, Sparkles } from 'lucide-react';
import { useTheme } from '../../utils/ThemeContext';
import { firestoreService } from '../../services';
import { soundManager } from '../../utils/sounds';
import { Garage, Staff } from '../../types';
import { isLightColor, resolveShimmerColor } from '../../utils';

interface AppearanceSettingsModalProps {
  garage?: Garage | null;
  currentStaff?: Staff | null;
  onClose: () => void;
  showToast?: (msg: string, type: 'success' | 'error') => void;
  onToggleMenu?: () => void;
  adminColor?: string;
  onUpdateAdminColor?: (color: string) => Promise<void> | void;
}

const SHIMMER_COLORS = [
  { value: '#059669', label: 'أخضر زمردي داكن' },
  { value: '#1e40af', label: 'كحلي وقور' },
  { value: '#6d28d9', label: 'بنفسجي ملكي عميق' },
  { value: '#0f766e', label: 'بترولي كلاسيكي' },
  { value: '#f59e0b', label: 'ذهبي دافئ وساطع' },
  { value: '#ea580c', label: 'برتقالي نحاسي' },
  { value: '#ec4899', label: 'رمادي / أوف وايت' },
  { value: '#be123c', label: 'أحمر ياقوتي فاخر' }
];

export const AppearanceSettingsModal: React.FC<AppearanceSettingsModalProps> = memo(({
  garage = null,
  currentStaff = null,
  onClose,
  showToast,
  adminColor,
  onUpdateAdminColor
}) => {
  const { theme, toggleTheme } = useTheme();
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const defaultColor = adminColor || (garage?.shimmerColor || '#10b981');
  const activeColor = pendingColor !== null ? pendingColor : defaultColor;
  
  const resolvedActiveColor = resolveShimmerColor(activeColor, theme);
  const resolvedPendingColor = pendingColor !== null ? resolveShimmerColor(pendingColor, theme) : null;

  const handleUpdateShimmerColor = async (colorVal: string) => {
    setIsSaving(true);
    try {
      if (onUpdateAdminColor) {
        await onUpdateAdminColor(colorVal);
      }
      if (garage) {
        await firestoreService.updateGarage(garage.id, { shimmerColor: colorVal });
      }
      soundManager.play('setting');
      showToast?.('تم تحديث لون الإضاءة بنجاح', 'success');
      setPendingColor(null);
    } catch (err) {
      console.error('Failed to update shimmer color:', err);
      showToast?.('حدث خطأ أثناء تحديث اللون', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#faf9f6] dark:bg-slate-950 flex flex-col transition-colors duration-300" dir="rtl">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 shrink-0 transition-colors shadow-sm">
        <button 
          type="button"
          onClick={onClose}
          className="w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-amber-500 transition-colors shadow-sm outline-none cursor-pointer shrink-0 active:scale-95"
          aria-label="الرجوع"
          title="رجوع"
        >
          <ChevronRight className="w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5]" />
        </button>
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white leading-none mb-1 transition-colors">إعدادات المظهر</h3>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 overflow-y-auto custom-scrollbar-slate stable-scrollbar flex-1">
        <div className="max-w-md mx-auto w-full space-y-8 py-4">
          
          {/* Theme Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-900">
              <Sun className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <h4 className="text-base font-black text-slate-800 dark:text-slate-100">وضع الشاشة المفضل</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Light Mode Card */}
              <button
                type="button"
                onClick={() => {
                  if (theme !== 'light') toggleTheme();
                  soundManager.play('setting');
                }}
                className={`p-5 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all cursor-pointer text-center outline-none ${
                  theme === 'light'
                    ? 'border-slate-800 dark:border-white bg-white dark:bg-slate-900 shadow-md scale-[1.02]'
                    : 'border-slate-150 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 text-slate-400'
                }`}
              >
                <div 
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    theme === 'light' 
                      ? (isLightColor(resolvedActiveColor) ? 'text-slate-900' : 'text-white') 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-450'
                  }`}
                  style={theme === 'light' ? { backgroundColor: resolvedActiveColor } : {}}
                >
                  <Sun className="w-6 h-6 stroke-[2.5px]" />
                </div>
                <div>
                  <span className={`block font-black text-sm ${theme === 'light' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>الوضع النهاري</span>
                </div>
                {theme === 'light' && (
                  <div 
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                      isLightColor(resolvedActiveColor) ? 'text-slate-900' : 'text-white'
                    }`} 
                    style={{ backgroundColor: resolvedActiveColor }}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3px]" />
                  </div>
                )}
              </button>

              {/* Dark Mode Card */}
              <button
                type="button"
                onClick={() => {
                  if (theme !== 'dark') toggleTheme();
                  soundManager.play('setting');
                }}
                className={`p-5 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all cursor-pointer text-center outline-none ${
                  theme === 'dark'
                    ? 'border-slate-800 dark:border-white bg-white dark:bg-slate-900 shadow-md scale-[1.02]'
                    : 'border-slate-150 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-100/50 dark:hover:bg-slate-900/50 text-slate-400'
                }`}
              >
                <div 
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    theme === 'dark' 
                      ? (isLightColor(resolvedActiveColor) ? 'text-slate-900' : 'text-white') 
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                  style={theme === 'dark' ? { backgroundColor: resolvedActiveColor } : {}}
                >
                  <Moon className="w-6 h-6 stroke-[2.5px]" />
                </div>
                <div>
                  <span className={`block font-black text-sm ${theme === 'dark' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>الوضع الليلي</span>
                </div>
                {theme === 'dark' && (
                  <div 
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                      isLightColor(resolvedActiveColor) ? 'text-slate-900' : 'text-white'
                    }`} 
                    style={{ backgroundColor: resolvedActiveColor }}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3px]" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Shimmer Color Section (Only Admin if garage or adminColor is provided) */}
          {(garage || adminColor) && (
            !currentStaff ? (
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-900">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-900">
                  <Palette className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  <h4 className="text-base font-black text-slate-800 dark:text-slate-100">
                    {adminColor ? 'اللون المميز للإدارة' : 'لون إضاءة الكارت (اللوحة)'}
                  </h4>
                </div>

                <div className="grid grid-cols-4 gap-3 pt-2">
                  {SHIMMER_COLORS.map((item) => {
                    const isSelected = activeColor === item.value;
                    const itemColorResolved = resolveShimmerColor(item.value, theme);
                    return (
                      <button
                        key={item.value}
                        onClick={() => {
                          soundManager.play('setting');
                          if (item.value === defaultColor) {
                            setPendingColor(null);
                          } else {
                            setPendingColor(item.value);
                          }
                        }}
                        title={item.label}
                        className={`h-11 rounded-xl border-2 transition-all cursor-pointer hover:scale-[1.05] active:scale-[0.98] flex items-center justify-center relative ${
                          isSelected 
                            ? 'border-slate-800 dark:border-white scale-[1.03] shadow-md ring-2 ring-slate-800/10' 
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                        style={{ backgroundColor: itemColorResolved }}
                      >
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm">
                            <Check className="w-4 h-4 text-slate-900 stroke-[3px]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Confirm / Change Area */}
                <AnimatePresence>
                  {pendingColor !== null && pendingColor !== defaultColor && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="pt-4"
                    >
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-150 dark:border-slate-800/80 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                          <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {adminColor ? 'هل تود حفظ اللون الجديد للإدارة؟' : 'هل تود حفظ اللون الجديد للجراج؟'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              soundManager.play('setting');
                              setPendingColor(null);
                            }}
                            className="px-3 py-1.5 text-xs font-black text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            disabled={isSaving}
                            onClick={() => handleUpdateShimmerColor(pendingColor)}
                            className={`px-4 py-1.5 text-xs font-black rounded-xl transition-all hover:scale-[1.03] active:scale-[0.97] cursor-pointer shadow-sm disabled:opacity-50 ${
                              isLightColor(resolvedPendingColor || '#10b981') ? 'text-slate-950' : 'text-white'
                            }`}
                            style={{ backgroundColor: resolvedPendingColor || '#10b981' }}
                          >
                            {isSaving ? 'جاري الحفظ...' : 'تأكيد وحفظ'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="pt-6 border-t border-slate-100 dark:border-slate-900 text-center">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 leading-relaxed">
                  تغيير هوية لون إضاءة الكارت متاح فقط لمدير الجراج.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
});
