import React, { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface MovingBalanceArrowsProps {
  transitionType: 'increase' | 'decrease' | null;
}

export const MovingBalanceArrows: React.FC<MovingBalanceArrowsProps> = memo(({ transitionType }) => {
  if (!transitionType) return null;

  const isDecrease = transitionType === 'decrease';
  const colorClass = isDecrease 
    ? 'text-red-600 dark:text-red-500' 
    : 'text-emerald-500 dark:text-emerald-400';

  // 6 columns defined by responsive positions:
  // 3 on the left (Inner, Middle, Outer) and 3 on the right (Inner, Middle, Outer)
  // Each has a customized delay for a beautiful staggered wave effect.
  const columns = [
    // LEFT SIDE COLUMN S
    {
      id: 'left-inner',
      positionClass: 'left-[26%] sm:left-[28%] md:left-[30%] lg:left-[33%]',
      delay: 0,
    },
    {
      id: 'left-middle',
      positionClass: 'left-[16%] sm:left-[18%] md:left-[20%] lg:left-[22%]',
      delay: 0.1,
    },
    {
      id: 'left-outer',
      positionClass: 'left-[6%] sm:left-[8%] md:left-[10%] lg:left-[11%]',
      delay: 0.2,
    },
    // RIGHT SIDE COLUMNS
    {
      id: 'right-inner',
      positionClass: 'right-[26%] sm:right-[28%] md:right-[30%] lg:right-[33%]',
      delay: 0,
    },
    {
      id: 'right-middle',
      positionClass: 'right-[16%] sm:right-[18%] md:right-[20%] lg:right-[22%]',
      delay: 0.1,
    },
    {
      id: 'right-outer',
      positionClass: 'right-[6%] sm:right-[8%] md:right-[10%] lg:right-[11%]',
      delay: 0.2,
    },
  ];

  return (
    <AnimatePresence mode="popLayout">
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[1.75rem]" id="balance_arrows_container">
        {columns.map((col) => (
          <div 
            key={col.id} 
            className={`absolute ${col.positionClass} top-y bottom-0 w-10 sm:w-12 top-0 bottom-0 flex flex-col items-center justify-center overflow-visible`}
          >
            <motion.div
              key={`${transitionType}-${col.id}`}
              initial={{ y: isDecrease ? '-120%' : '120%', opacity: 0 }}
              animate={{ 
                y: isDecrease ? ['-120%', '130%'] : ['120%', '-130%'],
                opacity: [0, 1, 1, 0]
              }}
              transition={{
                duration: 0.95,
                ease: 'easeInOut',
                delay: col.delay,
              }}
              className={`absolute ${colorClass}`}
              style={{ willChange: 'transform, opacity' }}
            >
              {isDecrease ? (
                <svg className="w-8 h-8 sm:w-10 sm:h-10 md:w-[44px] md:h-[44px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3V21M12 21L4 13M12 21L20 13" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg className="w-8 h-8 sm:w-10 sm:h-10 md:w-[44px] md:h-[44px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 21V3M12 3L4 11M12 3L20 11" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </motion.div>
          </div>
        ))}
      </div>
    </AnimatePresence>
  );
});
