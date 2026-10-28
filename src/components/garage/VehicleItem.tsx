import { memo } from 'react';
import { EgyptianPlate } from '../ui/EgyptianPlate';
import { Vehicle } from '../../types';

interface VehicleItemProps {
  vehicle: Vehicle;
  onCheckOut: (v: Vehicle) => void;
}

export const VehicleItem = memo(({ vehicle, onCheckOut }: VehicleItemProps) => {
  return (
    <div className="py-8 md:py-12 px-6 flex items-center justify-center border-b border-slate-100 dark:border-slate-800 last:border-0 font-sans">
      <button 
        onClick={() => onCheckOut(vehicle)}
        className="relative cursor-pointer outline-none block transition-transform active:scale-[0.98] hover:scale-[1.01]"
        title="تسجيل خروج"
      >
        <EgyptianPlate 
          plateNumber={vehicle.plateNumber} 
          size="md" 
          className="mx-0 shrink-0 shadow-sm" 
          hideCountryLabels={true}
          customBarHeightClass="h-3.5 md:h-5"
          customSizeClasses="w-64 h-24 text-xl border-[3px] md:w-[28rem] md:h-44 md:text-5xl md:border-[4px]"
        />
        {vehicle.isSubscriber && (
          <div className="absolute -top-3 -right-3 px-3 py-1 bg-emerald-600 text-[10px] md:text-xs font-black text-white rounded-full border-2 border-white dark:border-slate-900 z-10 whitespace-nowrap shadow-sm">
            مشترك
          </div>
        )}
      </button>
    </div>
  );
});
