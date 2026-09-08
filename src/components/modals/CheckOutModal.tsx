import React, { memo } from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';
import { EgyptianPlate } from '../ui/EgyptianPlate';
import { Spinner } from '../ui/Spinner';
import { safeDate, calculateCost, formatEntryTimeParts } from '../../utils';
import { Vehicle, Garage, Staff } from '../../types';
import { motion, AnimatePresence } from 'motion/react';

interface CheckOutModalProps {
  selectedVehicle: Vehicle;
  garage: Garage;
  currentStaff?: Staff | null;
  isLoading: boolean;
  loadingType: string | null;
  now: Date;
  onConfirm: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export const CheckOutModal: React.FC<CheckOutModalProps> = memo(({
  selectedVehicle,
  garage,
  currentStaff,
  isLoading,
  loadingType,
  now,
  onConfirm,
  onDelete,
  onCancel
}) => {
  const entryDate = selectedVehicle.entryTime ? safeDate(selectedVehicle.entryTime) : now;
  const diffMs = Math.max(0, now.getTime() - entryDate.getTime());
  const isInitialMinute = !selectedVehicle.isSubscriber && diffMs <= 300000; // 5 minutes grace period for entry errors (matches refund logic)
  const isOwner = currentStaff 
    ? (typeof selectedVehicle.staffId === 'string' && selectedVehicle.staffId === currentStaff.id) 
    : (selectedVehicle.staffId == null);

  const [confirmingSide, setConfirmingSide] = React.useState<'left' | 'right' | null>(null);
  const [showLargeButton, setShowLargeButton] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleGuardedConfirm = () => {
    if (isLoading || isConfirming) return;
    setIsConfirming(true);
    onConfirm();
  };

  const [isGenerating, setIsGenerating] = React.useState(true);
  const [generationProgress, setGenerationProgress] = React.useState(0);

  const loadingStatus = React.useMemo(() => {
    if (generationProgress < 50) return 'جاري الحساب...';
    return 'جاري الإصدار...';
  }, [generationProgress]);

  React.useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 2000; // 2 seconds
    
    const animate = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(100, (elapsed / duration) * 100);
      
      setGenerationProgress(Math.floor(progress));
      
      if (elapsed < duration) {
        requestAnimationFrame(animate);
      } else {
        setIsGenerating(false);
      }
    };
    
    const animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const [isLargeScreen, setIsLargeScreen] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    setIsLargeScreen(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const handleButtonClick = (side: 'left' | 'right') => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setConfirmingSide(side);
    setShowLargeButton(true);
    timerRef.current = setTimeout(() => {
      setConfirmingSide(null);
      setShowLargeButton(false);
    }, 10000);
  };

  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const modalHeight = React.useMemo(() => {
    if (isGenerating) {
      return isLargeScreen ? 380 : 320;
    }
    if (isLargeScreen) {
      if (confirmingSide) return 520;
      return isInitialMinute ? 720 : 774;
    }
    if (confirmingSide) return 360;
    return isInitialMinute ? 480 : 520;
  }, [isGenerating, confirmingSide, isInitialMinute, isLargeScreen]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <style>{`
        @keyframes snake-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .snake-border-wrapper {
          position: relative;
          z-index: 0;
          overflow: hidden;
        }
        .snake-border-wrapper::before {
          content: '';
          position: absolute;
          z-index: -1;
          left: -100%;
          top: -100%;
          width: 300%;
          height: 300%;
          background: conic-gradient(from 0deg, transparent 120deg, #ff0000 360deg);
          animation: snake-rotate 1.6s linear infinite;
        }
        .dark .snake-border-wrapper::before {
          background: conic-gradient(from 0deg, transparent 120deg, #ffffff 360deg);
        }
      `}</style>
      
      <motion.div 
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 1 }}
        onClick={() => !isLoading && onCancel()}
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80"
        style={{ willChange: 'opacity', transform: 'translate3d(0, 0, 0)', backfaceVisibility: 'hidden' }}
        transition={{ duration: 0 }}
      />
      
      <motion.div 
        initial={{ y: 0, opacity: 1 }}
        animate={{ 
          y: 0,
          height: modalHeight
        }}
        exit={{ y: 0, opacity: 1 }}
        transition={{ 
          duration: 0
        }}
        className="relative bg-[#faf9f6] dark:bg-slate-900 w-full max-w-sm sm:max-w-xl md:max-w-2xl lg:max-w-3xl xl:max-w-4xl rounded-t-[3.5rem] sm:rounded-[3.5rem] md:rounded-[4rem] p-6 sm:p-8 md:p-10 lg:p-12 pt-12 text-center border-t sm:border border-x border-slate-200 dark:border-slate-800 flex flex-col max-h-[92dvh] overflow-hidden shadow-2xl" 
        style={{ willChange: 'transform, height, opacity', transform: 'translate3d(0, 0, 0)', backfaceVisibility: 'hidden' }}
        dir="rtl"
      >
        {/* Handle Bar Area */}
        <button 
          onClick={onCancel}
          className="w-full h-14 absolute top-0 left-0 flex items-start justify-center pt-5 group outline-none z-20"
          aria-label="إغلاق"
        >
          <div className="w-14 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full group-hover:bg-slate-300 dark:group-hover:bg-slate-700 transition-colors" />
        </button>

        {/* Action Buttons Layer */}
        <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
          <AnimatePresence>
            {!confirmingSide && !isGenerating ? (
              <>
                {/* Left Button */}
                {!isInitialMinute && (
                  <motion.div
                    initial={{ x: -25, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -100, opacity: 0, rotate: -30, scale: 0.7 }}
                    transition={{ duration: 0 }}
                    className="absolute top-12 sm:top-14 md:top-18 lg:top-24 xl:top-28 left-3 sm:left-6 md:left-8 lg:left-12 xl:left-16 pointer-events-auto"
                  >
                    <button 
                      onClick={() => handleButtonClick('left')}
                      disabled={isLoading}
                      className="w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-32 lg:w-32 lg:h-40 xl:w-36 xl:h-44 rounded-2xl sm:rounded-[1.75rem] md:rounded-[2.25rem] lg:rounded-[3rem] xl:rounded-[3.5rem] bg-red-500 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-500/15"
                    >
                      <LogOut className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10 xl:w-12 xl:h-12 rotate-180 stroke-[3] text-white" />
                    </button>
                  </motion.div>
                )}
                
                {/* Right Button */}
                {!isInitialMinute && (
                  <motion.div 
                    initial={{ x: 25, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 100, opacity: 0, rotate: 30, scale: 0.7 }}
                    transition={{ duration: 0 }}
                    className="absolute top-12 sm:top-14 md:top-18 lg:top-24 xl:top-28 right-3 sm:right-6 md:right-8 lg:right-12 xl:right-16 pointer-events-auto"
                  >
                    <button 
                      onClick={() => handleButtonClick('right')}
                      disabled={isLoading}
                      className="w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-32 lg:w-32 lg:h-40 xl:w-36 xl:h-44 rounded-2xl sm:rounded-[1.75rem] md:rounded-[2.25rem] lg:rounded-[3rem] xl:rounded-[3.5rem] bg-red-500 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-500/15"
                    >
                      <LogOut className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10 xl:w-12 xl:h-12 stroke-[3] text-white" />
                    </button>
                  </motion.div>
                )}
              </>
            ) : showLargeButton && (
              <div className="absolute inset-x-0 bottom-0 top-10 flex items-center justify-center pointer-events-none p-6 md:p-12">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 120 }}
                  animate={{ scale: 1.15, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 50 }}
                  transition={{ duration: 0 }}
                  className="snake-border-wrapper w-60 h-28 sm:w-96 sm:h-52 rounded-2xl sm:rounded-2xl p-[6px] pointer-events-auto shadow-xl"
                >
                  <button 
                    onClick={handleGuardedConfirm}
                    disabled={isLoading || isConfirming}
                    className="relative w-full h-full rounded-[2.1rem] sm:rounded-[2.4rem] bg-slate-950 dark:bg-red-500 flex flex-col items-center justify-center z-10 outline-none transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingType === 'checkout' || isConfirming ? (
                      <Spinner />
                    ) : (
                      <LogOut className="w-12 h-12 sm:w-24 sm:h-24 -rotate-90 stroke-[4] text-white" />
                    )}
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Content Area - Instant collapse to reduce resource usage */}
        <AnimatePresence>
          {!confirmingSide && (
            <motion.div
              initial={{ opacity: 1, y: 0 }}
              exit={{ 
                opacity: 0, 
                transition: { duration: 0 }
              }}
              className="flex-1 flex flex-col items-center overflow-y-auto scrollbar-hide max-h-[calc(92vh-90px)] max-h-[calc(92dvh-90px)] w-full px-1"
            >
              {isGenerating ? (
                <div className="flex-1 flex flex-col items-center justify-center py-6 sm:py-8 w-full">
                  <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center mb-6">
                    {/* SVG circular loader */}
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      {/* Underlay */}
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        className="stroke-slate-100 dark:stroke-slate-800/80 fill-none"
                        strokeWidth="6"
                      />
                      {/* Progress Circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        className="stroke-red-500 dark:stroke-red-500 fill-none transition-all duration-75"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 42}
                        strokeDashoffset={2 * Math.PI * 42 * (1 - generationProgress / 100)}
                      />
                    </svg>
                    {/* Centered Percentage */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 font-mono">
                        {generationProgress}%
                      </span>
                    </div>
                  </div>
                  
                  {/* Status Texts */}
                  <div className="text-center px-4">
                    <h3 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight transition-all">
                      {loadingStatus}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold mt-1.5 uppercase tracking-wider">
                      يرجى الانتظار أثناء حساب الفاتورة
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {!selectedVehicle.isSubscriber && diffMs < 300000 ? null : (
                <div className="flex flex-col items-center justify-center mt-2 sm:mt-4 md:mt-6 h-20 sm:h-32 md:h-36 mb-2 sm:mb-4 shrink-0">
                  {selectedVehicle.isSubscriber ? (
                    <div className="flex flex-col items-center">
                      <div className="px-5 py-2.5 sm:px-8 sm:py-5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl sm:rounded-[2rem] border border-emerald-200 dark:border-emerald-800 text-lg sm:text-3xl font-black tracking-tight mb-2">
                        مشترك شهري
                      </div>
                      <span className="text-[10px] sm:text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">لا توجد رسوم خروج</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-[5rem] sm:text-[7rem] md:text-[8rem] lg:text-[9rem] font-black text-slate-900 dark:text-slate-100 font-mono tracking-tighter leading-none">
                        {calculateCost(selectedVehicle, garage, now)}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* License Plate Display */}
              <div className="flex items-center justify-center mb-3 sm:mb-4 md:mb-5 text-center scale-[0.95] sm:scale-110 md:scale-120 origin-center sm:my-3 md:my-4 shrink-0">
                <EgyptianPlate 
                  plateNumber={selectedVehicle.plateNumber} 
                  size={isLargeScreen ? "lg" : "md"} 
                  hideCountryLabels={true}
                />
              </div>

              {/* Ticket Card Container */}
              <div className="w-full bg-slate-50/50 dark:bg-slate-950/20 border-2 md:border-[3px] border-slate-900 dark:border-black rounded-xl p-3 sm:p-4 mb-2 sm:mb-4 shadow-sm overflow-hidden shrink-0">
                
                {/* Grid / Bento layout for 4 items without icons to maximize text size */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  
                  {/* Item 1: الفئة / النوع (النوع) */}
                  <div className="flex flex-col h-[90px] sm:h-[110px] md:h-[130px] bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-2xl shadow-sm text-center overflow-hidden">
                    {/* Header Block */}
                    <div className="py-1.5 sm:py-2 px-3 bg-slate-100/70 dark:bg-slate-950/50 border-b border-slate-150 dark:border-slate-800/60 shrink-0">
                      <span className="text-xs sm:text-sm font-black text-slate-500 dark:text-slate-400 tracking-wide">النوع</span>
                    </div>
                    {/* Body Block */}
                    <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-3">
                      <span className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-none font-sans">
                        {selectedVehicle.isSubscriber ? (
                          'مشترك'
                        ) : selectedVehicle.type === 'overnight' ? (
                          <>
                            {garage.overnightRate} <span className="text-xs sm:text-lg font-black font-sans">× المبيت</span>
                          </>
                        ) : (
                          <>
                            {garage.hourlyRate} <span className="text-xs sm:text-lg font-black font-sans">× الساعة</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Item 2: مدة الانتظار (المدة) */}
                  <div className="flex flex-col h-[90px] sm:h-[110px] md:h-[130px] bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-2xl shadow-sm text-center overflow-hidden">
                    {/* Header Block */}
                    <div className="py-1.5 sm:py-2 px-3 bg-slate-100/70 dark:bg-slate-950/50 border-b border-slate-150 dark:border-slate-800/60 shrink-0">
                      <span className="text-xs sm:text-sm font-black text-slate-500 dark:text-slate-400 tracking-wide">المدة</span>
                    </div>
                    {/* Body Block */}
                    <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-3">
                      <div className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-emerald-600 dark:text-emerald-400 font-sans flex flex-col items-center justify-center gap-1 leading-tight">
                        {(() => {
                          const totalMinutes = Math.floor(diffMs / 60000);
                          const totalHours = Math.floor(totalMinutes / 60);
                          const days = Math.floor(totalHours / 24);
                          const hours = totalHours % 24;
                          const minutes = totalMinutes % 60;

                          if (days > 0) {
                            return (
                              <>
                                <span>{days} يوم</span>
                                {(hours > 0 || minutes > 0) && (
                                  <span className="text-xs sm:text-sm md:text-base text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                                    {hours > 0 && <span>{hours} س</span>}
                                    {minutes > 0 && <span>{minutes} د</span>}
                                  </span>
                                )}
                              </>
                            );
                          }

                          if (hours > 0) {
                            return (
                              <>
                                <span>{hours} س</span>
                                {minutes > 0 && <span className="text-xs sm:text-sm md:text-base text-emerald-600 dark:text-emerald-400 font-bold">{minutes} د</span>}
                              </>
                            );
                          }

                          return <span>{minutes} د</span>;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Item 3: وقت الدخول (الوصول) */}
                  <div className="flex flex-col h-[90px] sm:h-[110px] md:h-[130px] bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-2xl shadow-sm text-center overflow-hidden">
                    {/* Header Block */}
                    <div className="py-1.5 sm:py-2 px-3 bg-slate-100/70 dark:bg-slate-950/50 border-b border-slate-150 dark:border-slate-800/60 shrink-0">
                      <span className="text-xs sm:text-sm font-black text-slate-500 dark:text-slate-400 tracking-wide">الوصول</span>
                    </div>
                    {/* Body Block */}
                    <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-3">
                      <div className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 leading-tight">
                        <span className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white font-sans">
                          {formatEntryTimeParts(selectedVehicle.entryTime || now, now).main}
                        </span>
                        {(() => {
                          const parts = formatEntryTimeParts(selectedVehicle.entryTime || now, now);
                          if (parts.isToday) {
                            return <span className="text-[10px] sm:text-xs md:text-sm text-slate-400 dark:text-slate-500 font-black leading-none mt-[-1px] sm:mt-0">اليوم</span>;
                          }
                          return <span className="text-[10px] sm:text-xs md:text-sm text-emerald-600 dark:text-emerald-400 font-bold leading-none mt-[-1px] sm:mt-0">{parts.sub}</span>;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Item 4: الموظف المسؤول (المسؤول) */}
                  <div className="flex flex-col h-[90px] sm:h-[110px] md:h-[130px] bg-[#faf9f6] dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-2xl shadow-sm text-center overflow-hidden">
                    {/* Header Block */}
                    <div className="py-1.5 sm:py-2 px-3 bg-slate-100/70 dark:bg-slate-950/50 border-b border-slate-150 dark:border-slate-800/60 shrink-0">
                      <span className="text-xs sm:text-sm font-black text-slate-500 dark:text-slate-400 tracking-wide">المسؤول</span>
                    </div>
                    {/* Body Block */}
                    <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-3">
                      <span className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-none">
                        {selectedVehicle.staffName?.split(' ')[0] || 'أمين'}
                      </span>
                    </div>
                  </div>

                </div>

              </div>

              {isInitialMinute && isOwner && (
                <button 
                  onClick={onDelete}
                  disabled={isLoading}
                  className="w-full h-14 sm:h-16 bg-red-50 dark:bg-red-900/10 text-red-500 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 border-2 border-red-100 dark:border-red-900/20 border-dashed shrink-0 disabled:opacity-50 active:scale-95 transition-all duration-150 cursor-pointer shadow-sm"
                >
                  {isLoading && loadingType === 'delete' ? (
                    <Spinner className="!text-red-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
                  )}
                  {isLoading && loadingType === 'delete' ? 'جاري حذف السيارة...' : 'حذف السيارة (خطأ إدخال)'}
                </button>
              )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});
