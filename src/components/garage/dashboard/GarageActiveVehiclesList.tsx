/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { Car, X as XIcon } from 'lucide-react';
import { VehicleItem } from '../VehicleItem';

interface GarageActiveVehiclesListProps {
  vehicles: any[];
  visibleVehicles: any[];
  totalInsideCount: number;
  hasMoreVehicles: boolean;
  observerTargetRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isSubscriptionExpired: boolean;
  onClose: () => void;
  onCheckOut: (vehicle: any) => void;
  onRegisterNewCar: () => void;
}

export const GarageActiveVehiclesList = memo(({
  vehicles,
  visibleVehicles,
  totalInsideCount,
  hasMoreVehicles,
  observerTargetRef,
  scrollContainerRef,
  isSubscriptionExpired,
  onClose,
  onCheckOut,
  onRegisterNewCar,
}: GarageActiveVehiclesListProps) => {
  return (
    <div className="bg-[#faf9f6] dark:bg-slate-900 rounded-[2rem] border border-slate-150 dark:border-slate-800 overflow-hidden flex flex-col flex-1 min-h-[400px] md:min-h-[500px] transition-colors w-full shadow-sm">
      <div className="p-3 md:p-4 px-4 md:px-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 shrink-0 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 md:w-11 md:h-11 bg-slate-900 dark:bg-slate-800 rounded-lg flex items-center justify-center text-white transition-all">
            <Car className="w-4 h-4 md:w-6 md:h-6" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm md:text-lg uppercase tracking-tight">
              إجمالى العدد {totalInsideCount}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 md:w-11 md:h-11 bg-red-500 dark:bg-red-600 text-white rounded-xl flex shrink-0 items-center justify-center hover:bg-red-600 dark:hover:bg-red-700 transition-colors outline-none shadow-sm"
          >
            <XIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="divide-y divide-slate-100 dark:divide-slate-800 flex-1 overflow-y-auto custom-scrollbar overscroll-contain touch-pan-y bg-[#faf9f6] dark:bg-slate-900 transition-colors"
      >
        {visibleVehicles.map((vehicle) => (
          <VehicleItem
            key={vehicle.id || vehicle.plateNumber}
            vehicle={vehicle}
            onCheckOut={onCheckOut}
          />
        ))}

        {hasMoreVehicles && (
          <div
            ref={observerTargetRef}
            className="py-8 flex justify-center items-center"
          >
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          </div>
        )}

        {vehicles.length === 0 && (
          <div className="py-16 md:py-24 text-center flex flex-col items-center gap-4">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700">
              <Car className="w-10 h-10 md:w-12 md:h-12 text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-lg md:text-xl font-black text-slate-400 dark:text-slate-500">
              لا توجد سيارات حالياً
            </p>
            <p className="text-xs font-bold text-slate-300 dark:text-slate-600">
              اكتب رقم اللوحة واضغط "ساعة" أو "مبيت" لتسجيل أول عربية
            </p>
            {!isSubscriptionExpired && (
              <button
                onClick={onRegisterNewCar}
                className="mt-6 text-sm md:text-base font-black text-emerald-500 uppercase tracking-widest border-b-2 border-emerald-500/20 pb-0.5"
              >
                سجل دخول عربية جديدة
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
