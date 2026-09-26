import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, CheckCircle2, XCircle, Clock, Trash2, Zap, ExternalLink, EyeOff } from 'lucide-react';
import { Garage } from '../../types';
import { safeDate } from '../../utils';
import { adminService } from '../../services/adminService';

interface AdminTrialLeadsViewProps {
  garages: Garage[];
  onSelectGarage: (garage: Garage) => void;
  onDeleteGarage: (garageId: string, garageName: string) => void;
  onRechargeGarage?: (garage: Garage) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AdminTrialLeadsView: React.FC<AdminTrialLeadsViewProps> = ({
  garages,
  onSelectGarage,
  onDeleteGarage,
  onRechargeGarage,
  showToast
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'continued' | 'declined'>('continued');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const continuedGarages = garages.filter(g => g.trialDecision === 'continued');
  const declinedGarages = garages.filter(g => g.trialDecision === 'declined');
  const currentList = activeSubTab === 'continued' ? continuedGarages : declinedGarages;

  const formatRelativeTime = (timestamp: any) => {
    if (!timestamp) return 'غير محدد';
    const date = safeDate(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    return `منذ ${diffDays} يوم`;
  };

  const handleClearDecision = async (garage: Garage) => {
    if (!garage.id || processingId) return;
    setProcessingId(garage.id);
    try {
      await adminService.updateTrialDecision(garage.id, null);
      showToast?.('تمت إزالة العميل من قائمة المتابعة.', 'info');
    } catch (err) {
      console.error('Error clearing trial decision:', err);
      showToast?.('حدث خطأ أثناء تحديث حالة الجراج.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 dir-rtl text-right font-sans max-w-6xl mx-auto px-2 sm:px-4">
      {/* Sleek Minimal Header + Segment Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">نتائج التجربة (Trial Leads)</h2>
            <p className="text-xs font-bold text-slate-400">متابعة طلبات استمرار الجراجات بعد الفترة التجريبية</p>
          </div>
        </div>

        {/* Clean Segment Switcher with Built-in Counts (No Duplication) */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('continued')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer ${
              activeSubTab === 'continued'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>راغبون في الاستمرار</span>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
              activeSubTab === 'continued' ? 'bg-emerald-700/60 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}>
              {continuedGarages.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('declined')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer ${
              activeSubTab === 'declined'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <XCircle className="w-4 h-4 shrink-0" />
            <span>غير راغبين</span>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
              activeSubTab === 'declined' ? 'bg-red-700/60 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}>
              {declinedGarages.length}
            </span>
          </button>
        </div>
      </div>

      {/* List content */}
      {currentList.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <div className="w-14 h-14 mx-auto bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center">
            <Clock className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-slate-800 dark:text-slate-200">لا توجد طلبات في هذه القائمة حالياً</h3>
          <p className="text-xs font-medium text-slate-400">
            عندما تنتهي الفترة التجريبية لأي جراج ويحدد موقفه، ستظهر بياناته هنا تلقائياً.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {currentList.map((garage) => {
              const timeFormatted = formatRelativeTime(garage.trialDecisionAt);

              return (
                <motion.div
                  key={garage.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className={`bg-white dark:bg-slate-900 border-2 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-4 ${
                    activeSubTab === 'continued'
                      ? 'border-emerald-500/30 dark:border-emerald-500/20'
                      : 'border-red-500/30 dark:border-red-500/20'
                  }`}
                >
                  {/* Top Row: Title, Owner & Timestamp */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => onSelectGarage(garage)}
                          className="font-black text-base text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 cursor-pointer text-right"
                        >
                          <span>{garage.name}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </button>
                        {garage.ownerName && (
                          <p className="text-xs font-bold text-slate-400">المالك: {garage.ownerName}</p>
                        )}
                      </div>

                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0 font-mono">
                        <Clock className="w-3 h-3 text-amber-500" />
                        {timeFormatted}
                      </span>
                    </div>

                    {/* Single Unified Phone Call Action (No Duplication) */}
                    {garage.phone && (
                      <a
                        href={`tel:${garage.phone}`}
                        className="w-full py-2.5 px-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-mono font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shadow-sm"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>اتصال الآن ({garage.phone})</span>
                      </a>
                    )}
                  </div>

                  {/* Clean Action Buttons */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      {onRechargeGarage && activeSubTab === 'continued' && (
                        <button
                          type="button"
                          onClick={() => onRechargeGarage(garage)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-98 cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>تجديد الباقة</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={processingId === garage.id}
                        onClick={() => handleClearDecision(garage)}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer disabled:opacity-50"
                        title="إزالتها من قائمة التماس المتابعة"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>تم التواصل / إخفاء</span>
                      </button>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => onDeleteGarage(garage.id, garage.name)}
                        className="text-[11px] font-bold text-red-500 hover:text-red-700 dark:hover:text-red-400 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف الجراج</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default AdminTrialLeadsView;

