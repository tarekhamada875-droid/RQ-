/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, memo } from 'react';
import { Trash2, History, Check } from 'lucide-react';
import { Delegate, ActivityLog, RechargeRequest } from '../../types';
import { firestoreService } from '../../services';
import { safeDate } from '../../utils';
import { 
  calculateApprovedCommission, 
  calculateApprovedRechargeTotal, 
  getAvailableRequestMonths 
} from '../../utils/delegateCommissionCalculations';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';
import { AdminDelegateHeader } from './delegate-details/AdminDelegateHeader';
import { AdminDelegateProfileCard } from './delegate-details/AdminDelegateProfileCard';
import { AdminDelegateStatsGrid } from './delegate-details/AdminDelegateStatsGrid';
import { AdminDelegateHistorySection } from './delegate-details/AdminDelegateHistorySection';

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
  const [settledAtOverride, setSettledAtOverride] = useState<Date | null>(null);
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
  const { adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);

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
        } catch {
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

  const effectiveLastSettledAt = settledAtOverride || (delegate.lastSettledAt ? safeDate(delegate.lastSettledAt) : null);
  const currentCycleDataset = React.useMemo(() => {
    if (!effectiveLastSettledAt) return activeDataset;
    return activeDataset.filter(item => {
      const rawDate = (item as any).resolvedAt || (item as any).createdAt || (item as any).timestamp;
      return safeDate(rawDate) > effectiveLastSettledAt;
    });
  }, [activeDataset, effectiveLastSettledAt]);
  const selectedPeriodDataset = activeMonthKey === currentMonthKey ? currentCycleDataset : activeDataset;

  const totalRecharged = React.useMemo(() => {
    if (activeMonthKey === 'all') {
      const calculated = calculateApprovedRechargeTotal(activeDataset, 'all');
      return Math.max(calculated, delegate.totalRechargedAmount || 0, historyTotal);
    }
    return calculateApprovedRechargeTotal(selectedPeriodDataset, activeMonthKey);
  }, [activeDataset, activeMonthKey, delegate.totalRechargedAmount, historyTotal, selectedPeriodDataset]);

  const allTimeTotal = React.useMemo(() => {
    const calculated = calculateApprovedRechargeTotal(activeDataset, 'all');
    return Math.max(calculated, delegate.totalRechargedAmount || 0, historyTotal);
  }, [activeDataset, delegate.totalRechargedAmount, historyTotal]);

  const commissionValue = React.useMemo(() => {
    if (activeMonthKey === 'all') {
      const calculated = calculateApprovedCommission(activeDataset, 'all');
      return calculated > 0 ? calculated : (delegate.totalCommissionEarned || 0);
    }
    return calculateApprovedCommission(selectedPeriodDataset, activeMonthKey);
  }, [activeDataset, activeMonthKey, delegate.totalCommissionEarned, selectedPeriodDataset]);

  const allTimeCommission = React.useMemo(() => {
    const calculated = calculateApprovedCommission(activeDataset, 'all');
    return calculated > 0 ? calculated : (delegate.totalCommissionEarned || 0);
  }, [activeDataset, delegate.totalCommissionEarned]);

  // Unsettled total since last manual settlement
  const unsettledCycleTotal = (() => {
    if (!effectiveLastSettledAt) {
      return typeof delegate.totalRechargedAmount === 'number' ? delegate.totalRechargedAmount : historyTotal;
    }
    return calculateApprovedRechargeTotal(currentCycleDataset, 'all');
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
          await firestoreService.settleDelegateAccount(delegate.id);
          setSettledAtOverride(new Date());
          delegate.totalRechargedAmount = 0;
        } catch {
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

  return (
    <div className={`h-screen w-full bg-[#faf9f6] dark:bg-slate-950 flex flex-col font-sans ${adminLang === 'en' ? 'text-left' : 'text-right'}`} dir={adminLang === 'en' ? 'ltr' : 'rtl'}>
      {/* Header */}
      <AdminDelegateHeader 
        delegate={delegate}
        onBack={() => {
          setSelectedDelegate(null);
          setView('admin_dashboard');
        }}
        onDelete={handleDelete}
      />

      <main className="flex-1 overflow-y-auto w-full p-4 sm:p-6 pb-24">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Profile Card */}
          <AdminDelegateProfileCard 
            delegate={delegate}
            adminLang={adminLang}
          />

          {/* Stats Grid & Monthly Filter */}
          <AdminDelegateStatsGrid 
            selectedMonthKey={selectedMonthKey}
            setSelectedMonthKey={setSelectedMonthKey}
            currentMonthKey={currentMonthKey}
            activeMonthKey={activeMonthKey}
            availableMonths={availableMonths}
            formatMonthName={formatMonthName}
            totalRecharged={totalRecharged}
            allTimeTotal={allTimeTotal}
            commissionValue={commissionValue}
            allTimeCommission={allTimeCommission}
            unsettledCycleTotal={unsettledCycleTotal}
            effectiveLastSettledAt={effectiveLastSettledAt}
            onSettleAccount={handleSettleAccount}
            adminLang={adminLang}
          />

          {/* History Section */}
          <AdminDelegateHistorySection 
            recharges={recharges}
            isLoading={isLoading}
            adminLang={adminLang}
          />
        </div>
      </main>

      {/* Confirmation Dialog */}
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
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all outline-none cursor-pointer"
                  >
                    {confirmDialog.cancelText}
                  </button>
                )}
                <button
                  onClick={confirmDialog.onConfirm}
                  className={`flex-1 py-4 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all outline-none cursor-pointer ${
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

AdminDelegateDetailsView.displayName = 'AdminDelegateDetailsView';
