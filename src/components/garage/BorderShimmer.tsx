import React, { memo } from 'react';

interface BorderShimmerProps {
  isActive: boolean;
  rx?: number;
  ry?: number;
  color?: string;
  dur?: string;
  mode?: 'continuous' | 'alternate-first' | 'alternate-second';
}

export const BorderShimmer: React.FC<BorderShimmerProps> = memo(({ 
  isActive, 
  rx = 28, 
  ry = 28, 
  color = '#10b981',
  dur = '4.0s',
  mode = 'continuous',
}) => {
  if (!isActive) return null;

  // Stable unique ID for SVG gradient definitions
  const uId = React.useId().replace(/:/g, '');

  let y1Anim: { from?: string; to?: string; values?: string; keyTimes?: string } = {
    from: '-100%',
    to: '100%',
  };
  let y2Anim: { from?: string; to?: string; values?: string; keyTimes?: string } = {
    from: '0%',
    to: '200%',
  };

  if (mode === 'alternate-first') {
    // Moves downwards during first half (0% - 50%), then rests invisibly below during second half (50% - 100%)
    y1Anim = { values: '-100%; 100%; 100%', keyTimes: '0; 0.5; 1' };
    y2Anim = { values: '0%; 200%; 200%', keyTimes: '0; 0.5; 1' };
  } else if (mode === 'alternate-second') {
    // Rests invisibly below during first half (0% - 50%), then moves upwards during second half (50% - 100%)
    y1Anim = { values: '100%; 100%; -100%', keyTimes: '0; 0.5; 1' };
    y2Anim = { values: '200%; 200%; 0%', keyTimes: '0; 0.5; 1' };
  }

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-10 rounded-[inherit] overflow-hidden"
      style={{ transform: 'translate3d(0, 0, 0)', backfaceVisibility: 'hidden', willChange: 'transform' }}
    >
      <svg 
        className="absolute inset-0 w-full h-full" 
        style={{ overflow: 'visible', transform: 'translate3d(0, 0, 0)', backfaceVisibility: 'hidden' }}
      >
        <defs>
          <linearGradient 
            id={`shimmerGrad-${uId}`} 
            x1="0%" 
            y1="-100%" 
            x2="0%" 
            y2="100%"
          >
            {y1Anim.values ? (
              <animate
                attributeName="y1"
                values={y1Anim.values}
                keyTimes={y1Anim.keyTimes}
                dur={dur}
                repeatCount="indefinite"
              />
            ) : (
              <animate
                attributeName="y1"
                from={y1Anim.from}
                to={y1Anim.to}
                dur={dur}
                repeatCount="indefinite"
              />
            )}
            {y2Anim.values ? (
              <animate
                attributeName="y2"
                values={y2Anim.values}
                keyTimes={y2Anim.keyTimes}
                dur={dur}
                repeatCount="indefinite"
              />
            ) : (
              <animate
                attributeName="y2"
                from={y2Anim.from}
                to={y2Anim.to}
                dur={dur}
                repeatCount="indefinite"
              />
            )}
            {/* Soft, rich metallic sheen sweep */}
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="35%" stopColor={color} stopOpacity="0.2" />
            <stop offset="50%" stopColor={color} stopOpacity="1" />
            <stop offset="65%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Soft, outer ambient glow simulation (No expensive blur filter used for ultimate mobile performance) */}
        <rect
          x="1"
          y="1"
          style={{ width: 'calc(100% - 2px)', height: 'calc(100% - 2px)' }}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={`url(#shimmerGrad-${uId})`}
          strokeWidth="8"
          className="opacity-15"
        />
        {/* Mid-level glow halo */}
        <rect
          x="1"
          y="1"
          style={{ width: 'calc(100% - 2px)', height: 'calc(100% - 2px)' }}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={`url(#shimmerGrad-${uId})`}
          strokeWidth="4.5"
          className="opacity-35"
        />
        {/* Sharp shining overlay */}
        <rect
          x="1"
          y="1"
          style={{ width: 'calc(100% - 2px)', height: 'calc(100% - 2px)' }}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={`url(#shimmerGrad-${uId})`}
          strokeWidth="2.5"
        />
      </svg>
    </div>
  );
});
