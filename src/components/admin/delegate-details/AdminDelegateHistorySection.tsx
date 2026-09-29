import React, { memo, useState } from 'react';
import { History, ChevronDown, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ActivityLog } from '../../../types';
import { safeDate } from '../../../utils';
import { Spinner } from '../../ui/Spinner';
import { useAdminTranslation } from '../../../utils/adminTranslations';

interface AdminDelegateHistorySectionProps {
  recharges: ActivityLog[];
  isLoading: boolean;
  adminLang: 'ar' | 'en';
}

export const AdminDelegateHistorySection: React.FC<AdminDelegateHistorySectionProps> = memo(({
  recharges,
  isLoading,
  adminLang
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const t = useAdminTranslation(adminLang);

  return (
    <div className="space-y-4">
      <button 
        onClick={() => setShowHistory(!showHistory)}
        className="w-full h-16 bg-white dark:bg-slate-900 rounded-[1.5rem] border-2 border-slate-100 dark:border-slate-800 px-6 flex items-center justify-between hover:border-amber-200 dark:hover:border-amber-900/40 transition-all group cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
            <History className="w-5 h-5" />
          </div>
          <div className={adminLang === 'en' ? 'text-left' : 'text-right'}>
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
  );
});

AdminDelegateHistorySection.displayName = 'AdminDelegateHistorySection';
