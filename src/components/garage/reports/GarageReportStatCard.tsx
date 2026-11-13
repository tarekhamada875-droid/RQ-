import { memo, type ReactNode } from 'react';
import { CheckCircle2, TrendingUp } from 'lucide-react';
import { formatArabicDigits } from '../../../utils/plates';

/**
 * GarageReportStatCard
 *
 * A single metric tile in the reports view's top grid (Row 1). Two instances
 * are rendered side-by-side: "today revenue" and "today departures".
 *
 * Pure presentational — no state, no effects. Memoized so it only re-renders
 * when its props change.
 *
 * Extracted Stage 2 of the structural refactor. Previously both tiles were
 * inline in GarageReportsView.tsx (~28 lines each, ~56 lines total) and
 * re-rendered on every parent state change including unrelated ones like
 * the staff-performance collapse toggle.
 */

export type StatCardVariant = 'revenue' | 'departures';

interface GarageReportStatCardProps {
  variant: StatCardVariant;
  /** Primary numeric value to display (already calculated by the parent). */
  value: number;
  /** Optional secondary line shown beneath the value (e.g. "ساعة: 5 • مبيت: 3"). */
  sublabel?: ReactNode;
}

const ICONS = {
  revenue: TrendingUp,
  departures: CheckCircle2,
} as const;

const ICON_COLORS = {
  revenue: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400',
  departures: 'bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400',
} as const;

const LABELS = {
  revenue: 'إيرادات اليوم',
  departures: 'مغادرات اليوم',
} as const;

const UNITS = {
  revenue: 'ج.م',
  departures: 'مغادرة',
} as const;

const ICON_STROKE = {
  revenue: 'stroke-[2.5]' as const,
  departures: 'stroke-[2.3]' as const,
};

export const GarageReportStatCard = memo(function GarageReportStatCard({
  variant,
  value,
  sublabel,
}: GarageReportStatCardProps) {
  const Icon = ICONS[variant];
  return (
    <div className={`p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col ${variant === 'revenue' ? 'justify-between ' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500">{LABELS[variant]}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${ICON_COLORS[variant]}`}>
          <Icon className={`w-3.5 h-3.5 ${ICON_STROKE[variant]}`} />
        </div>
      </div>
      <p className="text-lg font-black text-slate-900 dark:text-white leading-none font-mono">
        {formatArabicDigits(value)} <span className="text-[10px] font-bold text-slate-400">{UNITS[variant]}</span>
      </p>
      {sublabel && (
        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-1.5 leading-none">
          {sublabel}
        </span>
      )}
    </div>
  );
});

GarageReportStatCard.displayName = 'GarageReportStatCard';
