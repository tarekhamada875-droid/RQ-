/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, memo } from 'react';
import { 
  ChevronRight,
  Phone, 
  Calendar, 
  History,
  Trash2,
  Lock,
  Plus,
  Percent,
  Wallet,
  Check,
  Loader2,
  Sun,
  Moon,
  MoreVertical,
  ChevronDown,
  RotateCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Delegate, ActivityLog, RechargeRequest } from '../../types';
import { firestoreService } from '../../services';
import { Spinner } from '../ui/Spinner';
import { safeDate, formatDisplayPin } from '../../utils';
import { 
  calculateApprovedCommission, 
  calculateApprovedRechargeTotal, 
  getAvailableRequestMonths 
} from '../../utils/delegateCommissionCalculations';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { serverTimestamp } from 'firebase/firestore';

interface AdminDelegateDetailsViewProps {
  delegate: Delegate;
  setView: (view: any) => void;
  setSelectedDelegate: (delegate: Delegate | null) => void;
  removeDelegate: (id: string) => Promise<any>;
}

export const AdminDelegateDetailsView = memo(({
  delegate,
  setView,
  setSelectedDelegate,
  removeDelegate
}: AdminDelegateDetailsViewProps) => {
  const [recharges, setRecharges] = useState<ActivityLog[]>([]);
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [pinInput, setPinInput] = useState(delegate.pin && delegate.pin.length === 64 ? '' : (delegate.pin || ''));
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'success';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const { theme, toggleTheme, adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);

  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const [logsData, reqsData] = await Promise.all([
          firestoreService.getDelegateRecharges(delegate.id),
          firestoreService.getDelegateRechargeRequests(delegate.id)
        ]);
        setRecharges(logsData || []);
        setRequests(reqsData || []);
        
        // Calculate sum from history for initial display if totalRechargedAmount is missing or 0
        const items = (logsData || []).filter(log => log.actionType === 'recharge');
        const sum = items.reduce((acc, log) => {
          if (typeof log.amount === 'number' && !isNaN(log.amount)) return acc + log.amount;
          return acc;
        }, 0);
        setHistoryTotal(sum);
      } catch (error) {
        console.error('Failed to fetch delegate recharges:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [delegate.id]);

  const handleDelete = async () => {
    setConfirmDialog({
      isOpen: true,
      title: t('سحب الصلاحية'),
      message: adminLang === 'en' 
        ? `Are you sure you want to revoke delegate "${delegate.name}"'s permissions? They will not be able to log in or recharge balances.`
        : `هل أنت متأكد من سحب صلاحية المندوب "${delegate.name}"؟ لن يتمكن من تسجيل الدخول أو شحن الأرصدة مرة أخرى.`,
      confirmText: t('تأكيد السحب'),
      cancelText: t('تراجع'),
      type: 'danger',
      onConfirm: async () => {
        try {
          await removeDelegate(delegate.id);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
          setSelectedDelegate(null);
          setView('admin_dashboard');
        } catch (err) {
          setConfirmDialog({
            isOpen: true,
            title: t('خطأ'),
            message: t('فشل سحب الصلاحية. يرجى المحاولة مرة أخرى.'),
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
            confirmText: t('حسناً'),
            type: 'danger'
          });
        }
      }
    });
  };

  // Active dataset preference: recharge requests if available, fallback to activity logs
  const activeDataset = React.useMemo(() => {
    if (requests && requests.length > 0) return requests;
    return recharges;
  }, [requests, recharges]);

  // Monthly calculations logic
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('current');

  const getCurrentMonthKey = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const currentMonthKey = getCurrentMonthKey();

  const formatMonthName = (key: string) => {
    if (key === 'all') return adminLang === 'en' ? 'All Time' : 'جميع الأوقات';
    if (!key) return '';
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const d = new Date(year, month, 1);
    if (isNaN(d.getTime())) return key;
    return d.toLocaleDateString(adminLang === 'en' ? 'en-US' : 'ar-EG', { month: 'long', year: 'numeric' });
  };

  // Unique list of months with recharge activity
  const availableMonths = React.useMemo(() => {
    return getAvailableRequestMonths(activeDataset, currentMonthKey);
  }, [activeDataset, currentMonthKey]);

  const activeMonthKey = selectedMonthKey === 'current' ? currentMonthKey : selectedMonthKey;

  const totalRecharged = React.useMemo(() => {
    if (activeMonthKey === 'all') {
      const calculated = calculateApprovedRechargeTotal(activeDataset, 'all');
      return Math.max(calculated, delegate.totalRechargedAmount || 0, historyTotal);
    }
    return calculateApprovedRechargeTotal(activeDataset, activeMonthKey);
  }, [activeDataset, activeMonthKey, delegate.totalRechargedAmount, historyTotal]);

  const allTimeTotal = React.useMemo(() => {
    const calculated = calculateApprovedRechargeTotal(activeDataset, 'all');
    return Math.max(calculated, delegate.totalRechargedAmount || 0, historyTotal);
  }, [activeDataset, delegate.totalRechargedAmount, historyTotal]);

  const commissionValue = React.useMemo(() => {
    if (activeMonthKey === 'all') {
      const calculated = calculateApprovedCommission(activeDataset, 'all');
      return calculated > 0 ? calculated : (delegate.totalCommissionEarned || 0);
    }
    return calculateApprovedCommission(activeDataset, activeMonthKey);
  }, [activeDataset, activeMonthKey, delegate.totalCommissionEarned]);

  const allTimeCommission = React.useMemo(() => {
    const calculated = calculateApprovedCommission(activeDataset, 'all');
    return calculated > 0 ? calculated : (delegate.totalCommissionEarned || 0);
  }, [activeDataset, delegate.totalCommissionEarned]);

  // Unsettled total since last manual settlement
  const unsettledCycleTotal = (() => {
    if (!delegate.lastSettledAt) {
      return typeof delegate.totalRechargedAmount === 'number' ? delegate.totalRechargedAmount : historyTotal;
    }
    const settleDate = safeDate(delegate.lastSettledAt);
    const filteredItems = activeDataset.filter(item => {
      const rawDate = (item as any).resolvedAt || (item as any).createdAt || (item as any).timestamp;
      const itemDate = safeDate(rawDate);
      return itemDate > settleDate;
    });
    return calculateApprovedRechargeTotal(filteredItems, 'all');
  })();

  const handleSettleAccount = () => {
    setConfirmDialog({
      isOpen: true,
      title: t('تصفية الحساب يدويًا'),
      message: adminLang === 'en'
        ? `Are you sure you want to mark current accounts of delegate "${delegate.name}" as settled? This will record a manual settlement timestamp.`
        : `هل أنت متأكد من تصفية الحساب الحالي للمندوب "${delegate.name}"؟ سيتم تسجيل تاريخ التسوية اليدوية مع حفظ كافة السجلات التاريخية.`,
      confirmText: t('تصفية وتسوية الآن'),
      cancelText: t('تراجع'),
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsLoading(true);
        try {
          await firestoreService.updateDelegate(delegate.id, {
            lastSettledAt: serverTimestamp(),
            totalRechargedAmount: 0
          });
        } catch (err) {
          setConfirmDialog({
            isOpen: true,
            title: t('خطأ'),
            message: t('فشل تصفية حساب المندوب. يرجى المحاولة مرة أخرى.'),
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
            confirmText: t('حسناً'),
            type: 'danger'
          });
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  const formatCurrency = (val: number) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className={`h-screen w-full bg-[#faf9f6] dark:bg-slate-950 flex flex-col font-sans ${adminLang === 'en' ? 'text-left' : 'text-right'}`} dir={adminLang === 'en' ? 'ltr' : 'rtl'}>
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 sticky top-0 z-30 transition-colors">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setSelectedDelegate(null);
                setView('admin_dashboard');
              }}
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
                {/* Backdrop to prevent the menu from melting into the background */}
                <div 
                  className="fixed inset-0 z-40 bg-slate-900/10 dark:bg-black/35" 
                  onClick={() => setShowMenu(false)}
                />
                
                <div className={`absolute top-14 ${adminLang === 'en' ? 'right-0' : 'left-0'} w-64 bg-white dark:bg-slate-900 border-2 border-emerald-500/40 dark:border-emerald-500/40 shadow-2xl shadow-slate-300 dark:shadow-slate-950/80 rounded-[2rem] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200`}>
                  <div className="p-4 flex flex-col gap-2">
                    <span className={`font-bold text-xs text-slate-400 dark:text-slate-500 pr-1 select-none ${adminLang === 'en' ? 'text-left' : 'text-right'}`}>{t('وضع الشاشة:')}</span>
                    <div className="flex gap-2">
                      {/* النهارى (Light Mode) Button */}
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

                      {/* الليلى (Dark Mode) Button */}
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
                        handleDelete();
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

      <main className="flex-1 overflow-y-auto w-full p-4 sm:p-6 pb-24">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Profile Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-100 dark:border-slate-800 p-8 transition-colors">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-1 text-center sm:text-right space-y-2">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">{delegate.name}</h2>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-600 dark:text-slate-400 text-sm font-bold transition-colors">
                    <Phone className="w-4 h-4" />
                    <span dir="ltr">{delegate.phone}</span>
                  </div>
                  {isEditingPin ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl">
                      <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={pinInput}
                        maxLength={6}
                        onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                        className="w-16 bg-transparent text-blue-600 dark:text-blue-400 text-sm font-black text-center focus:outline-none focus:ring-0 border-0 p-0 font-mono"
                        placeholder="••••"
                      />
                      <button
                        onClick={async () => {
                          if (pinInput.length < 4) {
                            alert(adminLang === 'en' ? 'PIN must be at least 4 digits' : 'يجب أن يكون الرمز 4 أرقام على الأقل');
                            return;
                          }
                          setIsUpdatingPin(true);
                          try {
                            const cleanPin = pinInput.trim();
                            const pinCheck = await firestoreService.isPinTaken(cleanPin, delegate.id);
                            if (pinCheck.taken) {
                              alert(adminLang === 'en' 
                                ? `This PIN is already used by another account (${pinCheck.name} - ${pinCheck.role})`
                                : `هذا الرمز مستخدم بالفعل في حساب آخر: (${pinCheck.name} - ${pinCheck.role})`);
                              setIsUpdatingPin(false);
                              return;
                            }

                            await firestoreService.updateDelegate(delegate.id, { pin: cleanPin });
                            delegate.pin = cleanPin;
                            setIsEditingPin(false);
                          } catch (err) {
                            alert(adminLang === 'en' ? 'Failed to update PIN' : 'فشل تحديث الرمز');
                          } finally {
                            setIsUpdatingPin(false);
                          }
                        }}
                        disabled={isUpdatingPin}
                        className="w-5 h-5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center cursor-pointer"
                      >
                        {isUpdatingPin ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                      <button
                        onClick={() => {
                          setPinInput(delegate.pin && delegate.pin.length === 64 ? '' : (delegate.pin || ''));
                          setIsEditingPin(false);
                        }}
                        className="text-xs font-bold text-slate-400 px-1 hover:underline"
                      >
                        {t('إلغاء')}
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsEditingPin(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl text-blue-600 dark:text-blue-400 text-sm font-black transition-all hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer"
                    >
                      <Lock className="w-4 h-4" />
                      <span>{t('الرمز:')} {formatDisplayPin(delegate.pin)}</span>
                      <span className="text-[10px] text-blue-400 dark:text-blue-500 font-bold underline mr-1 hover:text-blue-600">{t('تعديل')}</span>
                    </button>
                  )}
                  {delegate.canCreateGarage && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/20 rounded-2xl text-emerald-700 dark:text-emerald-400 text-sm font-bold transition-colors">
                      <Plus className="w-4 h-4" />
                      <span>{t('إنشاء جراجات')}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-bold text-slate-400 dark:text-slate-500 mt-4 transition-colors">
                  <Calendar className="w-4 h-4" />
                  <span>{t('تاريخ الانضمام:')} {delegate.createdAt ? (adminLang === 'en' ? safeDate(delegate.createdAt).toLocaleDateString('en-US') : safeDate(delegate.createdAt).toLocaleDateString('ar-EG')) : t('غير معروف')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Automatic Monthly Filter Header */}
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <h3 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{t('تجميع إحصائيات الشحن والعمولات شهرياً')}</span>
              </h3>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 shrink-0">{t('الفترة:')}</span>
              <select
                value={selectedMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value)}
                className="flex-1 sm:flex-initial bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-black text-xs px-3 py-2 rounded-xl outline-none focus:border-amber-400 transition-colors cursor-pointer"
              >
                <option value="current">
                  {t('الشهر الحالي')} ({formatMonthName(currentMonthKey)})
                </option>
                {availableMonths.filter(m => m !== currentMonthKey).map(m => (
                  <option key={m} value={m}>
                    {formatMonthName(m)}
                  </option>
                ))}
                <option value="all">
                  {t('جميع الأوقات (التاريخ الكلي)')}
                </option>
              </select>
            </div>
          </div>

          {/* Commission & Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Gross Sales Card */}
            <div className="bg-slate-900 dark:bg-slate-900 rounded-2xl p-6 text-white space-y-4 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/10 to-transparent pointer-events-none" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
                      {t('إجمالي مبيعات المندوب')}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {selectedMonthKey === 'current' ? t('الشهر الحالي') : formatMonthName(activeMonthKey)}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-2" dir="ltr">
                  <span className="text-3xl font-black font-sans tracking-tight text-white">
                    {formatCurrency(totalRecharged)}
                  </span>
                  <span className="text-sm font-bold text-slate-400">{t('ج.م')}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 text-[11px] text-slate-400">
                <span>{t('إجمالي التاريخ الكلي:')} </span>
                <strong className="text-white font-mono">{formatCurrency(allTimeTotal)} {t('ج.م')}</strong>
              </div>
            </div>

            {/* 2. Delegate Commission Card */}
            <div className="bg-slate-900 dark:bg-slate-900 rounded-2xl p-6 text-white space-y-4 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                    <Percent className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
                      {t('عمولة المندوب المستحقة')}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {selectedMonthKey === 'current' ? t('الشهر الحالي') : formatMonthName(activeMonthKey)}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-2" dir="ltr">
                  <span className="text-3xl font-black font-sans tracking-tight text-amber-400">
                    {formatCurrency(commissionValue)}
                  </span>
                  <span className="text-sm font-bold text-slate-400">{t('ج.م')}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 text-[11px] text-slate-400">
                <span>{t('العمولات التاريخية:')} </span>
                <strong className="text-amber-400 font-mono">{formatCurrency(allTimeCommission)} {t('ج.م')}</strong>
              </div>
            </div>

            {/* 3. Company Net Revenue Card */}
            <div className="bg-slate-900 dark:bg-slate-900 rounded-2xl p-6 text-white space-y-4 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                      {t('صافي دخل الشركة')}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {selectedMonthKey === 'current' ? t('الشهر الحالي') : formatMonthName(activeMonthKey)}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-baseline gap-2" dir="ltr">
                  <span className="text-3xl font-black font-sans tracking-tight text-emerald-400">
                    {formatCurrency(Math.max(0, totalRecharged - commissionValue))}
                  </span>
                  <span className="text-sm font-bold text-slate-400">{t('ج.م')}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <div className="text-slate-400">
                    <span>{t('الصافي التاريخي:')} </span>
                    <strong className="text-emerald-400 font-mono">{formatCurrency(Math.max(0, allTimeTotal - allTimeCommission))} {t('ج.م')}</strong>
                  </div>

                  <button
                    onClick={handleSettleAccount}
                    className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 active:scale-[0.98] text-amber-400 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all outline-none leading-none border border-amber-500/30 cursor-pointer"
                    title={t('صرف عمولة المندوب وتسوية حسابه')}
                  >
                    <RotateCw className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{t('صرف / تسوية العمولة')}</span>
                  </button>
                </div>
                {delegate.lastSettledAt && (
                  <p className="text-[10px] text-slate-400">
                    {t('عمولة غير مسبوق صرفها:')} <strong className="text-amber-400 font-mono">{formatCurrency(unsettledCycleTotal)} {t('ج.م')}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* History Section */}
          <div className="space-y-4">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="w-full h-16 bg-white dark:bg-slate-900 rounded-[1.5rem] border-2 border-slate-100 dark:border-slate-800 px-6 flex items-center justify-between hover:border-amber-200 dark:hover:border-amber-900/40 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <History className="w-5 h-5" />
                </div>
                <div className="text-right">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">{t('سجل الشحن')}</h3>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">View Last 50 Transactions</p>
                </div>
              </div>
              <div className={`w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 transition-all ${showHistory ? 'rotate-180' : ''}`}>
                <ChevronDown className="w-4 h-4" />
              </div>
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] border-2 border-slate-100 dark:border-slate-800 overflow-hidden transition-colors">
                    {isLoading ? (
                      <div className="py-20 flex flex-col items-center gap-4">
                        <Spinner className="w-10 h-10 text-emerald-500" />
                        <p className="text-slate-400 font-bold">{t('جاري تحميل السجل...')}</p>
                      </div>
                    ) : recharges.length === 0 ? (
                      <div className="py-20 flex flex-col items-center gap-4 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center text-slate-200 dark:text-slate-700 transition-colors">
                          <History className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="text-slate-900 dark:text-white font-bold">{t('لا يوجد سجلات شحن')}</h4>
                          <p className="text-slate-400 text-xs mt-1">{t('لم يقم المندوب بأي عمليات شحن بعد')}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y-2 divide-slate-50 dark:divide-slate-800 transition-colors">
                        {recharges.map((log) => (
                          <div key={log.id} className="p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <p className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                                  {log.plateNumber}
                                </p>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 transition-colors">
                                  <Calendar className="w-3 h-3" />
                                  <span>{adminLang === 'en' ? safeDate(log.timestamp).toLocaleString('en-US') : safeDate(log.timestamp).toLocaleString('ar-EG')}</span>
                                </div>
                              </div>
                              <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-black transition-colors uppercase tracking-widest">
                                SUCCESS
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Custom Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps" dir={adminLang === 'en' ? 'ltr' : 'rtl'}>
          <div 
            className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 animate-popup-30fps"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8 text-center">
              <div className={`w-20 h-20 mx-auto rounded-xl flex items-center justify-center mb-6 ${
                confirmDialog.type === 'danger' ? 'bg-red-50 text-red-600' : 
                confirmDialog.type === 'warning' ? 'bg-amber-50 text-amber-600' : 
                'bg-emerald-50 text-emerald-600'
              }`}>
                {confirmDialog.type === 'danger' ? <Trash2 className="w-10 h-10" /> : 
                 confirmDialog.type === 'warning' ? <History className="w-10 h-10" /> : 
                 <Check className="w-10 h-10" />}
              </div>
              
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{confirmDialog.title}</h3>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                {confirmDialog.message}
              </p>

              <div className="flex gap-3">
                {confirmDialog.cancelText && (
                  <button
                    onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all outline-none"
                  >
                    {confirmDialog.cancelText}
                  </button>
                )}
                <button
                  onClick={confirmDialog.onConfirm}
                  className={`flex-1 py-4 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all outline-none ${
                    confirmDialog.type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 
                    confirmDialog.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 
                    'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {confirmDialog.confirmText || t('تأكيد')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
