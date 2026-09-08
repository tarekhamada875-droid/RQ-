import React, { memo } from 'react';
import { Smartphone } from 'lucide-react';
import { Garage } from '../../types';

interface LandscapeMobileViewProps {
  garage: Garage | null;
}

export const LandscapeMobileView: React.FC<LandscapeMobileViewProps> = memo(({ garage }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col w-full h-full select-none overflow-hidden" dir="rtl">
      {garage ? (
        <div className="flex-1 flex flex-row w-full h-full bg-[#ffd43b] dark:bg-slate-950 transition-colors">
          
          {/* Right Pane: Hourly Tariff Block */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
            <div className="w-full flex flex-col items-center max-w-xs">
              <h3 className="flex flex-col items-center gap-0.5 select-none text-slate-950 dark:text-[#ffd43b]">
                <span className="font-sans font-black tracking-wider text-sm sm:text-base md:text-lg">TARIFF PER HOUR</span>
                <span className="font-serif font-black text-xs sm:text-sm md:text-base opacity-90">حساب الساعة</span>
              </h3>
              
              {/* Dynamic Fluid Value containment using viewport heights to lock structural clipping */}
              <div className="flex flex-col items-center justify-center w-full mt-1">
                <span className="font-mono font-black tracking-tighter text-slate-950 dark:text-[#ffd43b] leading-none select-none text-[38vh] sm:text-[44vh]">
                  {garage.hourlyRate}
                </span>
                <span className="font-mono font-black text-xs sm:text-sm uppercase tracking-widest text-slate-950 dark:text-[#ffd43b] opacity-80 mt-1">
                  EGP / جنيه
                </span>
              </div>
            </div>
          </div>

          {/* Left Pane: Overnight Stay Container with prominent border division line */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden border-r-[4px] md:border-r-[6px] border-slate-950 dark:border-[#ffd43b]">
            <div className="w-full flex flex-col items-center max-w-xs">
              <h3 className="flex flex-col items-center gap-0.5 select-none text-slate-950 dark:text-[#ffd43b]">
                <span className="font-sans font-black tracking-wider text-sm sm:text-base md:text-lg">OVERNIGHT STAY</span>
                <span className="font-serif font-black text-xs sm:text-sm md:text-base opacity-90">المبيت / اليوم</span>
              </h3>
              
              <div className="flex flex-col items-center justify-center w-full mt-1">
                <span className="font-mono font-black tracking-tighter text-slate-950 dark:text-[#ffd43b] leading-none select-none text-[38vh] sm:text-[44vh]">
                  {garage.overnightRate}
                </span>
                <span className="font-mono font-black text-xs sm:text-sm uppercase tracking-widest text-slate-950 dark:text-[#ffd43b] opacity-80 mt-1">
                  EGP / جنيه
                </span>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#ffd43b] dark:bg-slate-950 text-slate-950 dark:text-[#ffd43b] text-center">
          <Smartphone className="w-12 h-12 mb-3 animate-bounce opacity-80" />
          <h2 className="text-xl font-black mb-1 font-sans">يرجى تدوير الجهاز</h2>
          <p className="text-xs opacity-80 max-w-xs font-serif font-bold">اقلب الهاتف للوضعية الرأسية لمتابعة تسجيل الدخول</p>
        </div>
      )}
    </div>
  );
});

LandscapeMobileView.displayName = 'LandscapeMobileView';
