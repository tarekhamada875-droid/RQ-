/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LogOut,
  X as XIcon,
  Users,
  Zap,
  PieChart,
  Sliders,
  Clock,
  Crown,
  Megaphone,
  FileText,
} from 'lucide-react';
import { Garage, Staff, Announcement } from '../../../types';

interface GarageDashboardHeaderAndDrawerProps {
  garage: Garage;
  currentStaff: Staff | null;
  isInputFocused: boolean;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  visibleAnnouncement: Announcement | null;
  onOpenAnnouncement: (announcement: Announcement) => void;
  expiringSubscribersCount: number;
  hasNewRecharge: boolean;
  onNavigateOverlay: (overlay: string) => void;
  onLogout: () => void;
}

export const GarageDashboardHeaderAndDrawer = memo(({
  garage,
  currentStaff,
  isInputFocused,
  isMenuOpen,
  setIsMenuOpen,
  visibleAnnouncement,
  onOpenAnnouncement,
  expiringSubscribersCount,
  hasNewRecharge,
  onNavigateOverlay,
  onLogout,
}: GarageDashboardHeaderAndDrawerProps) => {
  return (
    <>
      {!isInputFocused && (
        <header className="relative bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 z-40 w-full shrink-0">
          <div className="max-w-4xl mx-auto flex justify-between items-center w-full">
            <div className="flex items-center">
              {!visibleAnnouncement ? (
                <div className="h-11 px-4 bg-slate-900 dark:bg-slate-800 border border-slate-900 dark:border-slate-800 text-white rounded-2xl flex items-center justify-center shadow-sm font-black text-xs select-none">
                  <span className="text-slate-100 dark:text-slate-200">
                    {garage?.name}
                  </span>
                </div>
              ) : (
                <div
                  className="h-11 w-11 bg-slate-900 dark:bg-slate-800 border border-slate-900 dark:border-slate-800 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm select-none pointer-events-none"
                  title={garage?.name}
                >
                  <Crown className="w-5 h-5 text-white" />
                </div>
              )}
            </div>

            {visibleAnnouncement && (
              <button
                type="button"
                aria-label="عرض الإعلان المهم"
                onClick={() => onOpenAnnouncement(visibleAnnouncement)}
                className="absolute left-1/2 -translate-x-1/2 h-11 max-w-[min(60vw,280px)] px-4 bg-[#f8f6f0] dark:bg-slate-800 border-2 border-[#1a1915] dark:border-slate-700 rounded-2xl shadow-[2px_2px_0px_0px_#1a1915] dark:shadow-none font-black text-xs truncate transition-transform active:translate-y-[2px] active:shadow-none flex items-center justify-center"
              >
                <span className={`inline-flex items-center gap-2 truncate ${
                  visibleAnnouncement.priority === 'urgent' ? 'text-red-600 dark:text-red-400' :
                  visibleAnnouncement.priority === 'important' ? 'text-amber-600 dark:text-amber-400' :
                  'text-[#1a1915] dark:text-amber-400'
                }`}>
                  <Megaphone className="w-4 h-4 shrink-0" />
                  <span className="truncate">إعلان مهم</span>
                </span>
              </button>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`relative w-11 h-11 border rounded-2xl flex items-center justify-center transition-all outline-none ${
                  isMenuOpen
                    ? 'bg-red-600 text-white border-red-700'
                    : 'bg-slate-900 dark:bg-slate-800 text-white border-slate-900 dark:border-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700'
                }`}
              >
                {(expiringSubscribersCount > 0 || hasNewRecharge) && !isMenuOpen && (
                  <span
                    className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                      hasNewRecharge ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                )}
                {isMenuOpen ? (
                  <XIcon className="w-6 h-6 stroke-[3]" />
                ) : (
                  <Users className="w-6 h-6 stroke-[3]" />
                )}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Slide-out Drawer Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <React.Fragment>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70 z-[150] pointer-events-auto"
              style={{
                willChange: 'opacity',
                transform: 'translate3d(0, 0, 0)',
                backfaceVisibility: 'hidden',
              }}
            />
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{
                type: 'spring',
                damping: 26,
                stiffness: 220,
              }}
              className="fixed top-3 bottom-3 left-3 w-[220px] xs:w-[245px] max-w-[calc(100vw-24px)] bg-[#faf9f6] dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800/80 z-[150] flex flex-col overflow-hidden pointer-events-auto"
              style={{
                willChange: 'transform, opacity',
                transform: 'translate3d(0, 0, 0)',
                backfaceVisibility: 'hidden',
              }}
              dir="rtl"
            >
              <div className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center font-extrabold shrink-0 shadow-sm">
                      <Crown className="w-5 h-5 text-amber-400 dark:text-slate-950" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-mobile-wrap text-xs font-black text-slate-900 dark:text-slate-100 max-w-[120px] leading-snug">
                        {currentStaff ? currentStaff.name : 'مدير الجراج'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(false)}
                    className="w-8 h-8 bg-red-500 dark:bg-red-600 text-white rounded-lg flex items-center justify-center hover:bg-red-600 dark:hover:bg-red-700 transition-colors outline-none shrink-0"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar-slate">
                <div className="space-y-2">
                  {!currentStaff && garage?.hasMonthlySubscribers && (
                    <button
                      onClick={() => onNavigateOverlay('subscribers')}
                      className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 transition-all outline-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
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

                  {!currentStaff && (
                    <button
                      onClick={() => onNavigateOverlay('reports')}
                      className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 active:scale-95 transition-all duration-150 outline-none cursor-pointer animate-fade-in"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                          <PieChart className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                        </div>
                        <span className="font-bold text-sm">التقارير الذكية</span>
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => onNavigateOverlay('packages')}
                    className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 active:scale-95 transition-all duration-150 outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                        <Zap className="w-4 h-4 fill-current text-amber-400 dark:text-slate-950" />
                      </div>
                      <span className="font-bold text-sm">شحن الرصيد والباقات</span>
                    </div>
                  </button>

                  <button
                    onClick={() => onNavigateOverlay('history')}
                    className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 active:scale-95 transition-all duration-150 outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                        <Clock className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                      </div>
                      <span className="font-bold text-sm">تاريخ الشحن</span>
                    </div>
                    {hasNewRecharge && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-xs font-black flex items-center gap-1">
                        <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                        شحن جديد
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => onNavigateOverlay('appearance')}
                    className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 transition-all outline-none"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                        <Sliders className="w-4 h-4 text-amber-400 dark:text-slate-950" />
                      </div>
                      <span className="font-bold text-sm">إعدادات المظهر</span>
                    </div>
                  </button>

                  <button
                    onClick={() => onNavigateOverlay('terms')}
                    className="w-full flex items-center justify-between p-2.5 bg-[#faf9f6] dark:bg-slate-900 hover:bg-slate-100/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl border-2 border-slate-150 dark:border-slate-800 transition-all outline-none cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm">
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
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all font-black text-sm outline-none"
                >
                  <LogOut className="w-5 h-5 rotate-180" />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>
    </>
  );
});
