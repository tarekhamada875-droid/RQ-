import React, { useState, memo } from 'react';
import { ChevronRight, Sun, Moon, Check, FileText } from 'lucide-react';
import { useTheme } from '../../utils/ThemeContext';
import { soundManager } from '../../utils/sounds';
import { Garage, Staff } from '../../types';
import { isLightColor, resolveShimmerColor } from '../../utils';
import { TermsAndConditionsModal } from './TermsAndConditionsModal';

interface AppearanceSettingsModalProps {
  garage?: Garage | null;
  currentStaff?: Staff | null;
  onClose: () => void;
  showToast?: (msg: string, type: 'success' | 'error') => void;
  onToggleMenu?: () => void;
  adminColor?: string;
  onUpdateAdminColor?: (color: string) => Promise<void> | void;
}

export const AppearanceSettingsModal: React.FC<AppearanceSettingsModalProps> = memo(({
  onClose,
  adminColor
}) => {
  const { theme, toggleTheme } = useTheme();
  const [showTermsModal, setShowTermsModal] = useState(false);

  const resolvedActiveColor = resolveShimmerColor('#f59e0b', theme);

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

            {/* Small button right after theme buttons - only for garage/staff users, not admin */}
            {!adminColor && (
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowTermsModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 rounded-xl transition-all cursor-pointer border border-slate-200/60 dark:border-slate-800/60 active:scale-95"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  <span>الشروط والأحكام وإخلاء المسؤولية</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Terms & Conditions Modal */}
      {showTermsModal && (
        <TermsAndConditionsModal
          onClose={() => setShowTermsModal(false)}
        />
      )}
    </div>
  );
});
