import React, { memo } from 'react';
import { Delete } from 'lucide-react';

interface NumericKeypadProps {
  onKeyPress: (key: string) => void;
  onDelete: () => void;
  className?: string;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = memo(({
  onKeyPress,
  onDelete,
  className = ""
}) => {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [null, '0', 'delete']
  ];

  return (
    <div className={`w-full max-w-sm sm:max-w-md md:max-w-xl mx-auto p-4 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl md:rounded-xl border border-slate-100 dark:border-slate-800 ${className}`} dir="ltr">
      <div className="grid grid-cols-3 gap-3 md:gap-5">
        {rows.flat().map((key, idx) => {
          if (key === null) return <div key={`empty-${idx}`} />;
          
          if (key === 'delete') {
            return (
              <button
                key="delete"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onDelete}
                className="h-14 sm:h-18 md:h-24 flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 rounded-xl md:rounded-2xl outline-none hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-red-500 shadow-sm transition-[background-color,transform] duration-75 active:scale-95 touch-manipulation select-none"
              >
                <Delete className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10" />
              </button>
            );
          }

          return (
            <button
              key={key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onKeyPress(key)}
              className="h-14 sm:h-18 md:h-24 flex items-center justify-center bg-slate-900 dark:bg-slate-700 text-white dark:text-slate-100 rounded-xl md:rounded-2xl font-bold text-2xl sm:text-3xl md:text-5xl outline-none shadow-sm transition-[background-color,transform] duration-75 active:scale-95 touch-manipulation select-none"
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
});
