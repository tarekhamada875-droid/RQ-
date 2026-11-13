import { memo } from 'react';
import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import type { GarageReportStats } from './garageReportStats';

/**
 * GarageStaffPerformanceCard
 *
 * The collapsible "Staff shifts today" list in the reports view (Row 2).
 * Shows each staff member's name, count of checkouts handled, and revenue.
 *
 * Pure presentational — collapse state is owned by the parent (passed as
 * `isCollapsed` + `onToggle`). Memoized so it only re-renders when the
 * staffPerformance array, collapse state, or toggle identity changes.
 *
 * Extracted Stage 2 of the structural refactor. Previously this block was
 * ~48 lines of inline JSX in GarageReportsView.tsx.
 */

interface GarageStaffPerformanceCardProps {
  staffPerformance: GarageReportStats['staffPerformance'];
  isCollapsed: boolean;
  onToggle: () => void;
}

export const GarageStaffPerformanceCard = memo(function GarageStaffPerformanceCard({
  staffPerformance,
  isCollapsed,
  onToggle,
}: GarageStaffPerformanceCardProps) {
  return (
    <div className="bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden ">
      <button
        onClick={onToggle}
        className="w-full p-3 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-900/40 cursor-pointer select-none outline-none"
      >
        <div className="flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5 text-purple-500" />
          <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
            ورديات الموظفين اليوم
          </h3>
        </div>
        <div>
          {isCollapsed ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 stroke-[3]" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 stroke-[3]" />
          )}
        </div>
      </button>

      {!isCollapsed && (
        <div className="p-4 py-2 divide-y divide-slate-100 dark:divide-slate-800/50">
          {staffPerformance.map((staff, idx) => (
            <div key={staff.name} className="flex items-center justify-between py-2.5 ">
              <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500">#{idx + 1}</span>
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">{staff.name}</h4>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">مغادر: {staff.count} سيارة</span>
                </div>
              </div>

              <div className="text-left font-mono">
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                  {staff.revenue} ج.م
                </span>
              </div>
            </div>
          ))}

          {staffPerformance.length === 0 && (
            <div className="text-center py-6 text-slate-400 dark:text-slate-600 font-bold text-[11px]">
              لا يوجد معاملات بيع مسجلة لأي موظف اليوم.
            </div>
          )}
        </div>
      )}
    </div>
  );
});

GarageStaffPerformanceCard.displayName = 'GarageStaffPerformanceCard';
