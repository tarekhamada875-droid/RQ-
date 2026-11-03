import React, { memo } from 'react';

interface BorderShimmerProps {
  isActive: boolean;
  color?: string;
  dur?: string;
  mode?: 'continuous' | 'alternate-first' | 'alternate-second';
  /** 'default' = 5/3.25/2.25px ring padding (large cards).
   *  'compact' = 2.5/1.5/1px ring padding (small elements like digit tiles). */
  size?: 'default' | 'compact';
}

/**
 * Animated border glow around a card.
 *
 * Previously this rendered an SVG whose gradient coordinates (y1/y2) were
 * driven by SMIL <animate> elements — every frame re-computed the gradient
 * and re-painted the whole SVG on the main thread. The identical sweep is
 * now a CSS transform: one gradient-filled layer translating -100% → 100%
 * of its own height inside three static ring-masked layers (mirroring the
 * original 8 / 4.5 / 2.5px strokes at 0.15 / 0.35 / 1.0 opacity). Same
 * stops, widths, timing and alternate modes — but the animation runs on the
 * compositor instead of forcing an SVG repaint per frame. The ring radius
 * follows the host element's border-radius, exactly like the old
 * `rounded-[inherit]` overflow clip did.
 */
export const BorderShimmer: React.FC<BorderShimmerProps> = memo(({
  isActive,
  color = '#10b981',
  dur = '4.0s',
  mode = 'continuous',
  size = 'default',
}) => {
  if (!isActive) return null;

  return (
    <div className={`border-shimmer${size === 'compact' ? ' border-shimmer--compact' : ''}`} aria-hidden="true">
      <div
        className={`border-shimmer-sweep${mode !== 'continuous' ? ` border-shimmer-sweep--${mode}` : ''}`}
        style={{ '--shimmer-color': color, animationDuration: dur } as React.CSSProperties}
      >
        <div className="border-shimmer-ring border-shimmer-ring--glow" />
        <div className="border-shimmer-ring border-shimmer-ring--halo" />
        <div className="border-shimmer-ring border-shimmer-ring--core" />
      </div>
    </div>
  );
});

BorderShimmer.displayName = 'BorderShimmer';
