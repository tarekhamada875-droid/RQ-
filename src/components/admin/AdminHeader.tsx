import React from 'react';
import {
  Shield,
  MoreVertical,
  X,
  Sliders,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { Supervisor } from '../../types';

interface AdminHeaderProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  showMenu: boolean;
  setShowMenu: (show: boolean) => void;
  currentSupervisor: Supervisor | null;
  adminLang: 'ar' | 'en';
  setAdminLang: (lang: 'ar' | 'en') => void;
  onOpenAppearanceSettings: () => void;
  onLogout: () => void;
  menuRef: React.RefObject<HTMLDivElement>;
  t: (key: string) => string;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeTab,
  setActiveTab,
  showMenu,
  setShowMenu,
  currentSupervisor,
  adminLang,
  setAdminLang,
  onOpenAppearanceSettings,
  onLogout,
  menuRef,
  t,
}) => {
  return (
    <>
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 transition-colors w-full shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            {activeTab !== 'menu' && (
              <button 
                type="button"
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveTab('menu');
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveTab('menu');
                }}
                className="flex items-center justify-center w-10 h-10 bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 rounded-xl hover:bg-slate-800 dark:hover:bg-amber-500 outline-none cursor-pointer transition-colors shadow-sm shrink-0"
                title={t('رجوع')}
              >
                <ChevronRight className={`w-5.5 h-5.5 text-amber-400 dark:text-slate-950 stroke-[3.5] ${adminLang === 'en' ? 'rotate-180' : ''}`} />
              </button>
            )}
            <div className="hidden sm:flex w-10 h-10 bg-slate-900 dark:bg-slate-800 rounded-xl items-center justify-center text-white">
              <Shield className="w-6 h-6 stroke-[3]" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">
              {t('لوحة تحكم النظام')}
            </h1>
          </div>
          <div className="flex items-center gap-4 relative" ref={menuRef}>
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all outline-none border-2 ${
                showMenu 
                  ? 'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/80 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-100/50 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <MoreVertical className="w-5 h-5 stroke-[3]" />
            </button>

            {showMenu && (
              <>
                <div 
                  onClick={() => setShowMenu(false)}
                  className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70 z-50 pointer-events-auto"
                />
                
                <div 
                  className={`fixed top-4 bottom-3 ${adminLang === 'en' ? 'right-3' : 'left-3'} w-[290px] xs:w-[330px] max-w-[calc(100vw-24px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 z-50 flex flex-col overflow-hidden pointer-events-auto`}
                  dir={adminLang === 'en' ? 'ltr' : 'rtl'}
                >
                  {/* Drawer Header - Clean Profile Box matching Garage Sidebar */}
                  <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800/60 font-sans">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-400 dark:bg-amber-400 flex items-center justify-center text-slate-950 font-extrabold shadow-sm shrink-0">
                          <Shield className="w-6 h-6 stroke-[2.5]" />
                        </div>
                        <div className={`flex flex-col ${adminLang === 'en' ? 'text-left' : 'text-right'}`}>
                          <span className="text-mobile-wrap text-sm font-black text-slate-900 dark:text-slate-100 max-w-[150px] leading-snug">
                            {currentSupervisor ? currentSupervisor.name : t('مالك النظام')}
                          </span>
                        </div>
                      </div>
                      
                      <button 
                        type="button"
                        onClick={() => setShowMenu(false)}
                        className="w-10 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl flex items-center justify-center transition-colors outline-none cursor-pointer shrink-0"
                      >
                        <X className="w-6 h-6 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>

                  {/* Drawer Content Area */}
                  <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 custom-scrollbar-slate font-sans">

                    {/* Display Language Selection */}
                    <div className="space-y-2">
                      <span className="font-bold text-xs text-slate-400 dark:text-slate-500 pr-1 select-none block">
                        {currentSupervisor ? t('لغة العرض:') : t('لغة العرض (الآدمن فقط):')}
                      </span>
                      <div className="flex gap-2">
                        {/* Arabic Button */}
                        <button 
                          type="button"
                          onClick={() => {
                            setAdminLang('ar');
                            setShowMenu(false);
                          }}
                          className={`flex-1 flex items-center justify-center py-2.5 px-3 rounded-xl border-2 transition-all outline-none font-bold text-sm cursor-pointer ${
                            adminLang === 'ar'
                              ? 'bg-amber-400 border-amber-400 text-slate-950 shadow-sm'
                              : 'bg-[#faf9f6] dark:bg-slate-900 border-slate-150 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>{t('العربية')}</span>
                        </button>

                        {/* English Button */}
                        <button 
                          type="button"
                          onClick={() => {
                            setAdminLang('en');
                            setShowMenu(false);
                          }}
                          className={`flex-1 flex items-center justify-center py-2.5 px-3 rounded-xl border-2 transition-all outline-none font-bold text-sm cursor-pointer ${
                            adminLang === 'en'
                              ? 'bg-amber-400 border-amber-400 text-slate-950 shadow-sm'
                              : 'bg-[#faf9f6] dark:bg-slate-900 border-slate-150 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>{t('English')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Appearance Settings Button */}
                    <button 
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onOpenAppearanceSettings();
                      }}
                      className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 transition-all outline-none cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                          <Sliders className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                        </div>
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{t('إعدادات المظهر')}</span>
                      </div>
                    </button>
                  </div>

                  {/* Logout Button in Bottom Bar */}
                  <div className="p-3.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/40">
                    <button 
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onLogout();
                      }}
                      className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all font-black text-sm outline-none cursor-pointer"
                    >
                      <LogOut className="w-5 h-5 rotate-180" />
                      <span>{t('تسجيل الخروج')}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Fixed Quranic Verse */}
      <div className="w-full text-center py-2.5 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800/80 hidden-on-print shrink-0 z-10">
        <p className="text-[11px] sm:text-xs md:text-sm font-semibold text-amber-600 dark:text-amber-400 tracking-wide font-serif leading-tight dir-rtl">
          « إِنَّا فَتَحْنَا لَكَ فَتْحًا مُبِينًا ۝ لِيَغْفِرَ لَكَ اللَّهُ مَا تَقَدَّمَ مِنْ ذَنْبِكَ وَمَا تَأَخَّرَ »
        </p>
      </div>
    </>
  );
};
