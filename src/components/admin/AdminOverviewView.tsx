/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, memo } from 'react';
import {
  Car,
  Plus,
  Download,
} from 'lucide-react';
import { Garage } from '../../types';
import { PlateLookupModal } from '../modals/PlateLookupModal';
import { ActivityLogExportModal } from '../modals/ActivityLogExportModal';
import { useTheme } from '../../utils/ThemeContext';

interface AdminOverviewViewProps {
  allGarages: Garage[];
  onOpenAddGarage?: () => void;
  isSupervisor?: boolean;
}

export const AdminOverviewView = memo(({
  allGarages,
  onOpenAddGarage,
  isSupervisor = false
}: AdminOverviewViewProps) => {
  const [showPlateLookupModal, setShowPlateLookupModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  return (
    <div dir="rtl" className="space-y-6 text-right font-sans max-w-6xl mx-auto px-2 sm:px-4 pb-12">
      {!isSupervisor && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
              لوحة قيادة النظام
            </h2>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              إجراءات النظام السريعة
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn_open_plate_lookup"
              onClick={() => setShowPlateLookupModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black px-4 py-2.5 rounded-2xl text-xs border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-98"
            >
              <Car className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>استعلام عن لوحة</span>
            </button>

            <button
              id="btn_export_activity_logs"
              onClick={() => setShowExportModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black px-4 py-2.5 rounded-2xl text-xs border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-98"
              title="تحميل سجل النشاط"
            >
              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>تصدير CSV</span>
            </button>

            {onOpenAddGarage && (
              <button
                id="btn_quick_add_garage"
                onClick={onOpenAddGarage}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-2xl text-xs transition-all shadow-sm cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>إضافة جراج جديد</span>
              </button>
            )}
          </div>
        </div>
      )}

      {!isSupervisor && showPlateLookupModal && (
        <PlateLookupModal
          allGarages={allGarages}
          onClose={() => setShowPlateLookupModal(false)}
        />
      )}

      {!isSupervisor && showExportModal && (
        <ActivityLogExportModal
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
});

export default AdminOverviewView;
