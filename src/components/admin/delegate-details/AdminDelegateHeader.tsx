import React, { memo, useRef, useEffect, useState } from 'react';
import { ChevronRight, MoreVertical, Sun, Moon, Trash2 } from 'lucide-react';
import { Delegate } from '../../../types';
import { useTheme } from '../../../utils/ThemeContext';
import { useAdminTranslation } from '../../../utils/adminTranslations';

interface AdminDelegateHeaderProps {
  delegate: Delegate;
  onBack: () => void;
  onDelete: () => void;
}

export const AdminDelegateHeader: React.FC<AdminDelegateHeaderProps> = memo(({
  delegate,
  onBack,
  onDelete
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme, adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 sticky top-0 z-30 transition-colors">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl hover:bg-slate-800 dark:hover:bg-amber-500 outline-none cursor-pointer transition-colors shadow-sm shrink-0"
            title={t('رجوع')}
          >
            <ChevronRight className={`w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5] ${adminLang === 'en' ? 'rotate-180' : ''}`} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t('بيانات المندوب')}</h1>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{delegate.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative" ref={menuRef}>
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all outline-none border-2 ${showMenu ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'}`}
          >
            <MoreVertical className="w-5 h-5 text-slate-600 dark:text-slate-400 stroke-[3]" />
          </button>

          {showMenu && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-40 bg-slate-900/10 dark:bg-black/35" 
                onClick={() => setShowMenu(false)}
              />
              
              <div className={`absolute top-14 ${adminLang === 'en' ? 'right-0' : 'left-0'} w-64 bg-white dark:bg-slate-900 border-2 border-emerald-500/40 dark:border-emerald-500/40 shadow-2xl shadow-slate-300 dark:shadow-slate-950/80 rounded-[2rem] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200`}>
                <div className="p-4 flex flex-col gap-2">
                  <span className={`font-bold text-xs text-slate-400 dark:text-slate-500 pr-1 select-none ${adminLang === 'en' ? 'text-left' : 'text-right'}`}>{t('وضع الشاشة:')}</span>
                  <div className="flex gap-2">
                    {/* Light Mode Button */}
                    <button 
                      type="button"
                      onClick={() => {
                        if (theme !== 'light') toggleTheme();
                        setShowMenu(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border transition-all outline-none font-bold text-xs ${
                        theme === 'light'
                          ? 'bg-amber-500 border-amber-500 text-slate-800 scale-[1.02]'
                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Sun className={`w-3.5 h-3.5 ${theme === 'light' ? 'stroke-[2.5px]' : ''}`} />
                      <span>{t('النهاري')}</span>
                    </button>

                    {/* Dark Mode Button */}
                    <button 
                      type="button"
                      onClick={() => {
                        if (theme !== 'dark') toggleTheme();
                        setShowMenu(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border transition-all outline-none font-bold text-xs ${
                        theme === 'dark'
                          ? 'bg-amber-500 border-amber-500 text-slate-855 scale-[1.02]'
                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Moon className={`w-3.5 h-3.5 ${theme === 'dark' ? 'stroke-[2.5px]' : ''}`} />
                      <span>{t('الليلي')}</span>
                    </button>
                  </div>
                </div>

                <div className="p-2 space-y-1 border-t border-slate-100 dark:border-slate-800/60">
                  <button 
                    onClick={() => {
                      onDelete();
                      setShowMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 ${adminLang === 'en' ? 'text-left' : 'text-right'} hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 rounded-2xl transition-colors group`}
                  >
                    <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-sm">{t('سحب الصلاحية')}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
});

AdminDelegateHeader.displayName = 'AdminDelegateHeader';
