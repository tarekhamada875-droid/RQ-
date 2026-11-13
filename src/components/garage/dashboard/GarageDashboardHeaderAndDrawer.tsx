/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import {
  LogOut,
  X as XIcon,
  Users,
  PieChart,
  Crown,
  FileText,
  History,
  Menu,
} from 'lucide-react';
import { Garage, Staff } from '../../../types';
import { IconButton } from '../../ui/IconButton';

interface GarageDashboardHeaderAndDrawerProps {
  garage: Garage;
  currentStaff: Staff | null;
  isInputFocused: boolean;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  expiringSubscribersCount: number;
  hasNewCreditGrant: boolean;
  onNavigateOverlay: (overlay: string) => void;
  onLogout: () => void;
}

export const GarageDashboardHeaderAndDrawer = memo(({
  garage,
  currentStaff,
  isInputFocused,
  isMenuOpen,
  setIsMenuOpen,
  expiringSubscribersCount,
  hasNewCreditGrant,
  onNavigateOverlay,
  onLogout,
}: GarageDashboardHeaderAndDrawerProps) => {
  return (
    <>
      {!isInputFocused && (
        <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 z-40 w-full shrink-0">
          <div className="max-w-4xl mx-auto flex justify-between items-center w-full">
            <div className="flex items-center">
              <div className="h-11 px-4 bg-slate-900 dark:bg-slate-800 border border-slate-900 dark:border-slate-800 text-white rounded-2xl flex items-center justify-center font-black text-xs select-none">
                <span className="text-slate-100 dark:text-slate-200">
                  {garage?.name}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <IconButton
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-label={isMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
                className={`relative w-11 h-11 border rounded-2xl flex items-center justify-center outline-none ${
                  isMenuOpen
                    ? 'bg-red-600 text-white border-red-700'
                    : 'bg-slate-900 dark:bg-slate-800 text-white border-slate-900 dark:border-slate-800 '
                }`}
              >
                {(expiringSubscribersCount > 0 || hasNewCreditGrant) && !isMenuOpen && (
                  <span
                    className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                      expiringSubscribersCount > 0 ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                  />
                )}
                {isMenuOpen ? (
                  <XIcon className="w-6 h-6 stroke-[3]" />
                ) : (
                  <Menu className="w-6 h-6 stroke-[3]" />
                )}
              </IconButton>
            </div>
          </div>
        </header>
      )}

      {/* Slide-out Drawer Menu (instant conditional render — no animation) */}
      {isMenuOpen && (
        <React.Fragment>
            <div
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70 z-[150] pointer-events-auto"
            />
            <div
              className="fixed top-3 bottom-3 left-3 w-[220px] xs:w-[245px] max-w-[calc(100vw-24px)] bg-[#faf9f6] dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800/80 z-[150] flex flex-col overflow-hidden pointer-events-auto"
              dir="rtl"
            >
              <div className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center font-extrabold shrink-0 ">
                      <Crown className="w-5 h-5 text-amber-400 dark:text-slate-950" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-mobile-wrap text-xs font-black text-slate-900 dark:text-slate-100 max-w-[120px] leading-snug">
                        {currentStaff ? currentStaff.name : 'مدير الجراج'}
                      </span>
                    </div>
                  </div>
                  <IconButton
                    type="button"
                    onClick={() => setIsMenuOpen(false)}
                    aria-label="إغلاق القائمة"
                    className="w-8 h-8 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg flex items-center justify-center outline-none shrink-0"
                  >
                    <XIcon className="w-5 h-5" />
                  </IconButton>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar-slate">
                {/* Section: Operational */}
                <div className="px-1 pt-1 pb-0.5">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">عمليات</span>
                </div>
                <div className="space-y-2">
                  {!currentStaff && (
                    <button
                      onClick={() => onNavigateOverlay('reports')}
                      className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-200 dark:border-slate-800 outline-none cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 ">
                          <PieChart className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                        </div>
                        <span className="font-bold text-sm">التقارير</span>
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => onNavigateOverlay('history')}
                    className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-200 dark:border-slate-800 outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 ">
                        <History className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                      </div>
                      <span className="font-bold text-sm">تاريخ الشحن</span>
                    </div>
                    {hasNewCreditGrant && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-xs font-black">جديد</span>
                    )}
                  </button>

                  {!currentStaff && garage?.hasMonthlySubscribers && (
                    <button
                      onClick={() => onNavigateOverlay('subscribers')}
                      className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-200 dark:border-slate-800 outline-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 ">
                          <Users className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                        </div>
                        <span className="font-bold text-sm">الاشتراكات</span>
                      </div>
                      {expiringSubscribersCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-red-600 text-white dark:bg-red-500 dark:text-slate-950 text-xs font-black">
                          {expiringSubscribersCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Section: Settings */}
                <div className="px-1 pt-3 pb-0.5">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">إعدادات</span>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => onNavigateOverlay('terms')}
                    className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-200 dark:border-slate-800 outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ">
                        <FileText className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-sm">الشروط والأحكام</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-3.5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/40">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-red-600 text-white rounded-xl font-black text-sm outline-none"
                >
                  <LogOut className="w-5 h-5" />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            </div>
        </React.Fragment>
      )}
    </>
  );
});
