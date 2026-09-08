import React, { useEffect, useState, useRef, memo } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number; // Duration of animation in ms
  formatter?: (val: number) => string;
  className?: string;
  disableColorChange?: boolean;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = memo(({ 
  value, 
  duration = 800, 
  formatter = (val) => Math.floor(val).toString(),
  className = "",
  disableColorChange = false
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  const [deltaState, setDeltaState] = useState<{
    type: 'increase' | 'decrease' | null;
    amount: number;
  }>({ type: null, amount: 0 });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Compute delta and show visual indicators on value change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevValueRef.current = value;
      return;
    }

    if (disableColorChange) {
      prevValueRef.current = value;
      return;
    }

    const startValue = prevValueRef.current;
    const endValue = value;

    if (startValue !== endValue) {
      const diff = endValue - startValue;
      if (diff > 0) {
        setDeltaState({ type: 'increase', amount: diff });
        // NOTE: For increase, we do not clear here. It will clear automatically when the animation finishes counting up to the new value!
      } else {
        setDeltaState({ type: 'decrease', amount: Math.abs(diff) });

        // For decrease (red), it returns to normal after exactly 3 seconds (3000ms)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setDeltaState({ type: null, amount: 0 });
        }, 3000);
      }
    }
  }, [value, disableColorChange]);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    let startTime: number | null = null;
    let animationFrameId: number;
    // For increase (adding credit), use a 3-second (3000ms) animation. Otherwise, use standard duration.
    const activeDuration = endValue > startValue ? 3000 : duration;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / activeDuration, 1);
      
      // Easing function (easeOutQuad) for smooth deceleration
      const easeProgress = progress * (2 - progress);
      
      const current = startValue + (endValue - startValue) * easeProgress;
      setDisplayValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        prevValueRef.current = endValue;
        
        // Once increase counting reaches the final target value, shut down the green indicator
        setDeltaState(prev => {
          if (prev.type === 'increase') {
            return { type: null, amount: 0 };
          }
          return prev;
        });
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [value, duration]);

  // Ensure latest value is always mirrored to ref on changes
  useEffect(() => {
    prevValueRef.current = value;
  }, [value]);

  // Clean up any remaining timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <span className="relative inline-flex items-center justify-center [direction:ltr] select-none align-middle overflow-visible transition-all duration-300">
      {/* Absolute Green Capsule Badge on the left, positioned outside flow to prevent shifting the main number */}
      {deltaState.type === 'increase' && !disableColorChange && (
        <span className="absolute right-[115%] top-1/2 -translate-y-1/2 whitespace-nowrap z-20 inline-flex items-center gap-1 px-[0.45em] py-[0.1em] text-[0.35em] font-sans font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20 shadow-[0_2px_10px_rgba(16,185,129,0.1)] select-none">
          <span>+{formatter(deltaState.amount)}</span>
          <span className="text-[0.8em] font-black">↑</span>
        </span>
      )}

      {/* Symmetrical Left Slot:
          - For increase: Green up arrow ↑
          - For decrease: Red down arrow ↓ */}
      {deltaState.type === 'increase' && !disableColorChange && (
        <span className="z-10 inline-flex text-emerald-500 dark:text-emerald-400 font-extrabold text-[0.45em] self-center leading-none mr-2 transition-all duration-300 select-none">
          ↑
        </span>
      )}
      {deltaState.type === 'decrease' && !disableColorChange && (
        <span className="z-10 inline-flex text-red-500 dark:text-red-400 font-black text-[0.45em] self-center leading-none mr-2 transition-all duration-300 select-none">
          ↓
        </span>
      )}

      {/* 2. Main Number Counter with dynamic text colors depending on state change */}
      <span 
        className={`z-10 transition-all duration-500 ${className} ${
          deltaState.type === 'increase' && !disableColorChange
            ? 'text-emerald-500 dark:text-emerald-400 font-bold' 
            : deltaState.type === 'decrease' && !disableColorChange
            ? 'text-red-500 dark:text-red-400 font-bold'
            : ''
        }`}
      >
        {formatter(displayValue)}
      </span>

      {/* Symmetrical Right Slot:
          - For increase: Green up arrow ↑
          - For decrease: Red down arrow ↓ */}
      {deltaState.type === 'increase' && !disableColorChange && (
        <span className="z-10 inline-flex text-emerald-500 dark:text-emerald-400 font-extrabold text-[0.45em] self-center leading-none ml-2 transition-all duration-300 select-none">
          ↑
        </span>
      )}
      {deltaState.type === 'decrease' && !disableColorChange && (
        <span className="z-10 inline-flex text-red-500 dark:text-red-400 font-black text-[0.45em] self-center leading-none ml-2 transition-all duration-300 select-none">
          ↓
        </span>
      )}
    </span>
  );
});

