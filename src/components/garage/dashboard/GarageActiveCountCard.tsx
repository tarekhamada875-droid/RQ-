import { memo } from 'react';
import { Car } from 'lucide-react';
import { FlipNumber } from '../../ui/FlipNumber';
import { isLightColor } from '../../../utils/colors';

/**
 * GarageActiveCountCard
 *
 * The orange "active cars" count card on the garage dashboard. Shows the
 * FlipNumber counter (cars currently inside the garage) and a thin orange
 * bar with a Car icon below it. Both elements are clickable and route to
 * the active-vehicles list tab.
 *
 * Pure presentational component — no state, no effects, no back handlers.
 * Memoized so it only re-renders when `count` or `shimmerColor` change.
 * Previously this block lived inline in GarageDashboardView.tsx and
 * re-rendered on every parent state change (menu open/close, tab switch,
 * observer tick, loading state, credit-grant notification, etc.) even
 * when the count hadn't changed.
 *
 * Extracted Stage 1 of the structural refactor — follows the keypad
 * pattern (LicensePlateKeyboard / KeyButton): module-scope component,
 * memo() wrapped, zero hooks, 3 props only.
 */
interface GarageActiveCountCardProps {
  /** Number of cars currently inside the garage. */
  count: number;
  /** Shimmer/accent color for the orange bar — usually garage.shimmerColor. */
  shimmerColor: string;
  /** Click handler — opens the active-vehicles list tab. */
  onClick: () => void;
}

export const GarageActiveCountCard = memo(function GarageActiveCountCard({
  count,
  shimmerColor,
  onClick,
}: GarageActiveCountCardProps) {
  return (
    <div className="bg-[#faf9f6] dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-[2rem] overflow-hidden flex flex-col items-center pt-4 md:pt-10 [@media(max-height:500px)]:pt-2 w-full relative shrink-0">
      <button
        onClick={onClick}
        className="mb-4 md:mb-10 [@media(max-height:500px)]:mb-2 cursor-pointer w-full flex justify-center outline-none"
        aria-label="عرض السيارات النشطة"
      >
        <div className="relative flex flex-col items-center w-full px-4 md:px-8">
          <FlipNumber value={count} size="lg" displayDigits="arabic" />
        </div>
      </button>

      <button
        onClick={onClick}
        className="w-full h-6 md:h-7 [@media(max-height:500px)]:h-5 relative overflow-hidden group outline-none select-none flex items-center justify-center shrink-0"
        style={{
          backgroundColor: shimmerColor,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div
            className={`w-7 h-7 md:w-8 md:h-8 [@media(max-height:500px)]:w-6 [@media(max-height:500px)]:h-6 rounded-full flex items-center justify-center border-2 shadow-md group-hover:scale-110 transition-all ${
              isLightColor(shimmerColor) ? "text-slate-900" : "text-white"
            }`}
            style={{
              backgroundColor: shimmerColor,
              borderColor: `${shimmerColor}80`,
            }}
          >
            <Car
              className={`w-3.5 h-3.5 md:w-4 md:h-4 [@media(max-height:500px)]:w-3 [@media(max-height:500px)]:h-3 group-active:translate-y-0.5 transition-transform ${
                isLightColor(shimmerColor) ? "text-slate-900" : "text-white"
              }`}
            />
          </div>
        </div>
      </button>
    </div>
  );
});

GarageActiveCountCard.displayName = 'GarageActiveCountCard';
