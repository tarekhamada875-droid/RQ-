import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, CheckCircle2, XCircle, Clock, Trash2, Zap, ExternalLink } from 'lucide-react';
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

  // Filter garages by trialDecision
  const continuedGarages = garages.filter(g => g.trialDecision === 'continued');
  const declinedGarages = garages.filter(g => g.trialDecision === 'declined');

  const currentList = activeSubTab === 'continued' ? continuedGarages : declinedGarages;

  // Format relative time in Arabic (e.g., "منذ 15 دقيقة", "منذ 2 ساعة", "منذ 3 أيام")
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
      showToast?.('تمت إزالة العميل من قائمة التماس التجربة.', 'info');
    } catch (err) {
      console.error('Error clearing trial decision:', err);
      showToast?.('حدث خطأ أثناء تحديث حالة الجراج.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 dir-rtl text-right font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/60 rounded-2xl p-6 shadow-xl text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">متابعة نتائج التجربة (Trial Leads)</h2>
              <p className="text-xs text-slate-400 mt-1">
                متابعة الجراجات التي أنهت الفترة التجريبية وحددت موقفها بالاستمرار أو الإلغاء.
              </p>
            </div>
          </div>
        </div>

        {/* Counters */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex-1 md:flex-initial bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 rounded-xl text-center">
            <span className="block text-xs text-emerald-400 font-medium">راغبون في التجديد</span>
            <span className="text-xl font-extrabold text-emerald-400 font-mono">{continuedGarages.length}</span>
          </div>
          <div className="flex-1 md:flex-initial bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl text-center">
            <span className="block text-xs text-red-400 font-medium">غير راغبين</span>
            <span className="text-xl font-extrabold text-red-400 font-mono">{declinedGarages.length}</span>
          </div>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('continued')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
            activeSubTab === 'continued'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>الراغبون في الاستمرار</span>
          <span className="bg-emerald-800/60 text-emerald-200 text-xs px-2 py-0.5 rounded-full font-mono">
            {continuedGarages.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('declined')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
            activeSubTab === 'declined'
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
              : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
          }`}
        >
          <XCircle className="w-4 h-4 text-red-300" />
          <span>غير الراغبين في الاستمرار</span>
          <span className="bg-red-800/60 text-red-200 text-xs px-2 py-0.5 rounded-full font-mono">
            {declinedGarages.length}
          </span>
        </button>
      </div>

      {/* List content */}
      {currentList.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-16 h-16 mx-auto bg-slate-800/80 text-slate-500 rounded-full flex items-center justify-center">
            <Clock className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-300">لا توجد طلبات في هذه القائمة حالياً</h3>
          <p className="text-xs text-slate-500">
            عندما تنتهي فترة جراج تجريبي ويحدد اختياره، ستظهر بياناته هنا فوراً.
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
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`bg-slate-900/90 border rounded-2xl p-5 shadow-lg space-y-4 flex flex-col justify-between transition-all duration-200 ${
                    activeSubTab === 'continued'
                      ? 'border-emerald-500/30 hover:border-emerald-500/60'
                      : 'border-red-500/30 hover:border-red-500/60'
                  }`}
                >
                  {/* Garage header */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 
                          onClick={() => onSelectGarage(garage)}
                          className="font-extrabold text-lg text-white hover:text-emerald-400 cursor-pointer transition-colors flex items-center gap-2"
                        >
                          {garage.name}
                          <ExternalLink className="w-4 h-4 text-slate-500 inline opacity-60" />
                        </h3>
                        {garage.ownerName && (
                          <p className="text-xs text-slate-400 mt-0.5">المالك: {garage.ownerName}</p>
                        )}
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 flex items-center gap-1 font-mono shrink-0">
                        <Clock className="w-3 h-3 text-amber-400" />
                        {timeFormatted}
                      </span>
                    </div>

                    {/* Phone link */}
                    <div className="pt-1">
                      <a
                        href={`tel:${garage.phone}`}
                        className="inline-flex items-center gap-2 text-sm font-mono font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Phone className="w-4 h-4 text-emerald-400" />
                        <span>{garage.phone}</span>
                      </a>
                    </div>
                  </div>

                  {/* Status Banner */}
                  {activeSubTab === 'continued' ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300 font-medium leading-relaxed">
                      🔥 <strong>{garage.name}</strong> يطلب الاستمرار، تواصل معه الآن لإتمام الاشتراك وتفعيل الباقة!
                    </div>
                  ) : (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300 font-medium leading-relaxed">
                      ❌ <strong>{garage.name}</strong> اختار عدم الاستمرار في الخدمة.
                    </div>
                  )}

                  {/* Quick Action Buttons */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${garage.phone}`}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        اتصال الآن
                      </a>

                      {onRechargeGarage && (
                        <button
                          type="button"
                          onClick={() => onRechargeGarage(garage)}
                          className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-amber-600/20"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          تجديد الباقة
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onDeleteGarage(garage.id, garage.name)}
                        className="py-1.5 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-xs transition-colors flex items-center gap-1 border border-red-500/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف الجراج
                      </button>

                      <button
                        type="button"
                        disabled={processingId === garage.id}
                        onClick={() => handleClearDecision(garage)}
                        className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 font-medium text-xs transition-colors"
                        title="إزالة من قائمة المتابعة"
                      >
                        تم التواصل / إخفاء
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
