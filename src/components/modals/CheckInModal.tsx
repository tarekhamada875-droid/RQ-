import React, { memo } from 'react';
import { Clock, Moon, ChevronRight } from 'lucide-react';
import { EgyptianPlate } from '../ui/EgyptianPlate';
import { Spinner } from '../ui/Spinner';
import { APP_TEXT } from '../../constants';
import { Garage } from '../../types';
import { formatPlateNumber } from '../../utils';

interface CheckInModalProps {
  newPlateNumber: string;
  garage: Garage;
  isLoading: boolean;
  loadingType: string | null;
  onCheckIn: (type: 'hourly' | 'overnight') => void;
  onCancel: () => void;
}

export const CheckInModal: React.FC<CheckInModalProps> = memo(({
  newPlateNumber,
  garage,
  isLoading,
  loadingType,
  onCheckIn,
  onCancel
}) => {
  const [isLargeScreen, setIsLargeScreen] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    setIsLargeScreen(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div 
        onClick={() => !isLoading && onCancel()}
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 animate-overlay-30fps"
        style={{ willChange: 'opacity', transform: 'translate3d(0, 0, 0)', backfaceVisibility: 'hidden' }}
      />
      <div 
        className="relative bg-[#faf9f6] dark:bg-slate-900 w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-t-3xl sm:rounded-3xl p-6 sm:p-10 text-center max-h-[90vh] max-h-[90dvh] overflow-y-auto custom-scrollbar-slate stable-scrollbar border border-slate-200/80 dark:border-slate-800 shadow-2xl animate-popup-30fps" 
        style={{ willChange: 'transform, opacity', transform: 'translate3d(0, 0, 0)', backfaceVisibility: 'hidden' }}
        dir="rtl"
      >
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="flex justify-center mb-6">
              <Spinner className="w-12 h-12 sm:w-16 sm:h-16 text-emerald-600" />
            </div>
            <h3 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">جاري التسجيل...</h3>
            <p className="text-slate-400 dark:text-slate-500 text-sm sm:text-base font-bold">يرجى الانتظار لحظة</p>
          </div>
        ) : (
          <>
            <div className="w-12 h-1 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto mb-6 sm:hidden" />
            <h3 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white mb-6 sm:mb-10"> {APP_TEXT.GARAGE.MODAL_TYPE_TITLE} </h3>
            
            <div className="flex items-center justify-center mb-8 sm:mb-14 text-center scale-90 sm:scale-125 origin-center sm:my-8">
              <EgyptianPlate 
                plateNumber={formatPlateNumber(newPlateNumber)} 
                size={isLargeScreen ? "lg" : "md"} 
              />
            </div>
            
            <div className="flex flex-col gap-3 sm:gap-4">
              <button 
                onClick={() => onCheckIn('hourly')}
                disabled={isLoading}
                className="flex items-center gap-4 sm:gap-6 p-4 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 active:scale-[0.98] group disabled:opacity-50 transition-all duration-150 outline-none cursor-pointer shadow-sm"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-sm shrink-0">
                  {loadingType === 'hourly' ? <Spinner /> : <Clock className="w-7 h-7 sm:w-8 sm:h-8" />}
                </div>
                <div className="text-right">
                  <div className="font-black text-xl sm:text-2xl text-slate-900 dark:text-white">{APP_TEXT.GARAGE.TYPE_HOURLY}</div>
                  <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                    <span className="font-mono">{garage.hourlyRate}</span> {APP_TEXT.GARAGE.CURRENCY} / ساعة
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 text-slate-300 dark:text-slate-700 mr-auto group-hover:text-emerald-600 transition-colors" />
              </button>

               <button 
                onClick={() => onCheckIn('overnight')}
                disabled={isLoading}
                className="flex items-center gap-4 sm:gap-6 p-4 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 active:scale-[0.98] group disabled:opacity-50 transition-all duration-150 outline-none cursor-pointer shadow-sm"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-sm shrink-0">
                  {loadingType === 'overnight' ? <Spinner /> : <Moon className="w-7 h-7 sm:w-8 sm:h-8" />}
                </div>
                <div className="text-right">
                  <div className="font-black text-xl sm:text-2xl text-slate-900 dark:text-white transition-colors">{APP_TEXT.GARAGE.TYPE_OVERNIGHT}</div>
                  <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold transition-colors mt-0.5">
                    <span className="font-mono">{garage.overnightRate}</span> {APP_TEXT.GARAGE.CURRENCY} ثابت
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 text-slate-300 dark:text-slate-700 mr-auto group-hover:text-emerald-600 transition-colors" />
              </button>
            </div>

            <button 
              onClick={onCancel}
              className="w-full mt-6 h-14 sm:h-16 text-red-500 dark:text-red-400 font-black text-sm sm:text-base hover:text-red-700 bg-red-50 dark:bg-red-900/20 active:scale-95 rounded-2xl border border-red-100 dark:border-red-900/30 transition-all duration-150 outline-none cursor-pointer flex items-center justify-center shadow-sm"
            >
              {APP_TEXT.GARAGE.CANCEL}
            </button>
          </>
        )}
      </div>
    </div>
  );
});
