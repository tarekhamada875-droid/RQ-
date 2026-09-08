import React from 'react';
import { Building2, Phone, KeyRound, Calendar, ChevronLeft } from 'lucide-react';
import { Garage } from '../../types';
import { safeDate, isSubscriptionExpired, formatDisplayPin } from '../../utils';

interface AdminGarageListProps {
  garages: Garage[];
  isLoading: boolean;
  onSelectGarage: (garage: Garage) => void;
  garagePage: number;
  setGaragePage: (page: React.SetStateAction<number>) => void;
  totalGarages: number;
  GARAGES_PER_PAGE: number;
}

export const AdminGarageList: React.FC<AdminGarageListProps> = ({
  garages,
  isLoading,
  onSelectGarage,
  garagePage,
  setGaragePage,
  totalGarages,
  GARAGES_PER_PAGE
}) => {
  if (isLoading && garages.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div key={n} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 animate-pulse h-48" />
        ))}
      </div>
    );
  }

  if (garages.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center">
        <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">لا توجد جراجات مطابقة للبحث</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {garages.map((garage) => {
          const expired = isSubscriptionExpired(garage);
          const expiryDate = garage.balanceExpiry ? safeDate(garage.balanceExpiry) : null;
          const displayPin = formatDisplayPin(garage.ownerPin || garage.pin);

          return (
            <div
              key={garage.id}
              onClick={() => onSelectGarage(garage)}
              className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-800 p-5 hover:border-emerald-500/50 transition-all cursor-pointer shadow-sm hover:shadow-md group relative flex flex-col justify-between space-y-4"
            >
              {/* Header: Icon + Garage Name + Owner + Status Badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-black text-slate-900 dark:text-white text-base leading-tight truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {garage.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-0.5 truncate">
                      المالك: <span className="text-slate-700 dark:text-slate-300">{garage.ownerName || 'غير محدد'}</span>
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 whitespace-nowrap ${
                    expired
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {expired ? 'منتهي الاشتراك' : 'نشط'}
                </span>
              </div>

              {/* Hero Stat: PIN Badge & Phone in prominent monospace */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-2xl px-3.5 py-2.5 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-slate-400">PIN:</span>
                  <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 tracking-wider">
                    {displayPin}
                  </span>
                </div>

                {garage.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono font-bold" dir="ltr">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{garage.phone}</span>
                  </div>
                )}
              </div>

              {/* Feature / Footer Row */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {expiryDate ? (
                    <span className="truncate">
                      ينتهي: <span className="font-mono text-slate-700 dark:text-slate-300">
                        {expiryDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </span>
                  ) : (
                    <span>اشتراك غير محدد</span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-black shrink-0 group-hover:translate-x-[-2px] transition-transform">
                  <span>إدارة</span>
                  <ChevronLeft className="w-4 h-4" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {totalGarages > (garagePage + 1) * GARAGES_PER_PAGE && (
        <button
          onClick={() => setGaragePage((p: number) => p + 1)}
          className="w-full mt-4 py-3.5 text-sm font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl hover:opacity-90 transition-opacity shadow-sm cursor-pointer whitespace-nowrap min-h-[48px] flex items-center justify-center gap-1.5"
        >
          <span>تحميل المزيد</span>
          <span className="opacity-50">•</span>
          <span className="font-mono">{totalGarages - (garagePage + 1) * GARAGES_PER_PAGE}</span>
          <span>جراج متبقي</span>
        </button>
      )}
    </div>
  );
};

export default AdminGarageList;
