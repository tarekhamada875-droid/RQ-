/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo } from 'react';
import { 
  Wallet, 
  Calendar, 
  Loader2, 
  Users, 
  Shield, 
  Gift 
} from 'lucide-react';
import { safeDate } from '../../../utils';
import { Garage } from '../../../types';
import { BALANCE_PRESET_AMOUNTS } from '../../../constants/packages';

interface AdminGarageFinancialsSectionProps {
  garage: Garage;
  t: (key: string) => string;
  adminLang: string;
  remainingDays: number;
  showClearBalanceConfirm: boolean;
  setShowClearBalanceConfirm: (val: boolean) => void;
  isLoading: boolean;
  onClearBalance: () => Promise<void>;
  subscriberFlatFee: number;
  onToggleMonthlySubscribers: () => Promise<void>;
  selectedTopupAmount: number | null;
  setSelectedTopupAmount: (amt: number) => void;
  onOpenTopupModal: () => void;
  allGarages: Garage[];
  onReferredByChange: (refId: string) => Promise<void>;
}

export const AdminGarageFinancialsSection = memo(({
  garage,
  t,
  adminLang: _adminLang,
  remainingDays,
  showClearBalanceConfirm,
  setShowClearBalanceConfirm,
  isLoading,
  onClearBalance,
  subscriberFlatFee,
  onToggleMonthlySubscribers,
  selectedTopupAmount,
  setSelectedTopupAmount,
  onOpenTopupModal,
  allGarages,
  onReferredByChange
}: AdminGarageFinancialsSectionProps) => {
  return (
    <section className="space-y-6">
      {/* Subscription & Wallet Hero Card */}
      <div className="bg-slate-900 dark:bg-slate-900/90 text-white rounded-3xl border border-slate-800 p-6 sm:p-8 relative overflow-hidden shadow-md">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Wallet Balance Hero */}
          <div className="lg:col-span-6 bg-slate-800/50 border border-slate-700/60 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-300 text-xs font-black uppercase tracking-wider block">
                  {t('رصيد المحفظة الحالي')}
                </span>
                <span className="text-[11px] text-slate-400 font-bold">
                  {t('رصيد الدفع المسبق')}
                </span>
              </div>
            </div>

            <div className="flex items-baseline gap-1.5 font-mono shrink-0">
              <span className="text-4xl sm:text-5xl font-black tracking-tight text-amber-400">
                {(garage.balance || 0).toLocaleString('en-US')}
              </span>
              <span className="text-base font-bold text-amber-300/80">{t('ج.م')}</span>
            </div>
          </div>

          {/* Subscription Remaining */}
          <div className="lg:col-span-6 bg-slate-800/30 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-slate-400 text-xs font-black uppercase tracking-wider block mb-1">
                  {t('الاشتراك المتبقي للجراج')}
                </span>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>
                    {t('تاريخ انتهاء الاشتراك:')} {(() => {
                      const expiry = garage.balanceExpiry;
                      if (!expiry) return '-';
                      const expiryDate = safeDate(expiry);
                      return expiryDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                    })()}
                  </span>
                </div>
              </div>

              <div className="flex items-baseline gap-1.5 font-mono shrink-0">
                <span className={`text-4xl sm:text-5xl font-black tracking-tight ${
                  remainingDays <= 0 ? 'text-rose-400' : remainingDays <= 3 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {remainingDays}
                </span>
                <span className="text-base font-bold text-slate-400">{t('يوم')}</span>
              </div>
            </div>

            {/* Zero Balance / Clear Wallet Action */}
            <div className="pt-2 border-t border-slate-700/40 flex justify-end">
              {!showClearBalanceConfirm ? (
                <button 
                  onClick={() => setShowClearBalanceConfirm(true)}
                  className="w-full sm:w-auto px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 rounded-xl font-bold text-xs border border-rose-500/20 transition-all cursor-pointer"
                >
                  {t('تصفير المحفظة وإنهاء الاشتراك')}
                </button>
              ) : (
                <div className="flex gap-2 p-1.5 bg-slate-800/90 rounded-xl border border-slate-700">
                  <button 
                    disabled={isLoading}
                    onClick={onClearBalance}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    <span>{isLoading ? t('جاري التصفير...') : t('تأكيد')}</span>
                  </button>
                  <button 
                    disabled={isLoading}
                    onClick={() => setShowClearBalanceConfirm(false)} 
                    className="px-3 py-1.5 text-slate-400 hover:text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
                  >
                    {t('إلغاء')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Subscribers Surcharge Toggle */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>{t('خدمة المشتركين الشهريين / الإيواء')}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
            {t('عند تفعيل هذا الخيار تضاف')} {subscriberFlatFee} {t('ج.م ثابتة تلقائياً على قيمة أية باقة أو اشتراك بالجراج.')}
          </p>
        </div>
        <button 
          type="button"
          onClick={onToggleMonthlySubscribers}
          className={`w-14 h-8 rounded-full p-1 transition-all duration-300 relative shrink-0 cursor-pointer ${
            garage.hasMonthlySubscribers ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-800'
          }`}
        >
          <div className={`w-6 h-6 bg-white rounded-full transition-all duration-300 transform ${
            garage.hasMonthlySubscribers ? (_adminLang === 'en' ? 'translate-x-6' : '-translate-x-6') : 'translate-x-0'
          }`} />
        </button>
      </div>

      {/* Direct Wallet Balance Top-Up Panel */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <h3 className="font-black text-slate-900 dark:text-white text-base">
              {t('شحن رصيد المحفظة')}
            </h3>
          </div>
        </div>

        {/* Presets Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BALANCE_PRESET_AMOUNTS.map((amt) => {
            const isSelected = selectedTopupAmount === amt;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => setSelectedTopupAmount(amt)}
                className={`py-3.5 px-3 rounded-2xl font-black transition-all flex flex-col items-center justify-center gap-1 border-2 cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md scale-[1.03]'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700/60 hover:border-amber-400 dark:hover:border-amber-500/60'
                }`}
              >
                <span className="text-xl font-mono leading-none">
                  {amt.toLocaleString('en-US')}
                </span>
                <span className={`text-[10px] font-bold ${isSelected ? 'text-slate-900' : 'text-slate-400'}`}>
                  {t('ج.م')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Summary & Submit Action */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
            <div>
              <span className="text-slate-400 block text-[10px]">{t('الرصيد الحالي')}:</span>
              <span className="font-mono text-sm font-black text-slate-900 dark:text-white">
                {(garage.balance || 0).toLocaleString('en-US')} {t('ج.م')}
              </span>
            </div>
            {selectedTopupAmount ? (
              <>
                <span className="text-slate-400 font-black">+</span>
                <div>
                  <span className="text-amber-600 dark:text-amber-400 block text-[10px]">{t('المبلغ المضاف')}:</span>
                  <span className="font-mono text-sm font-black text-amber-600 dark:text-amber-400">
                    {selectedTopupAmount.toLocaleString('en-US')} {t('ج.م')}
                  </span>
                </div>
                <span className="text-slate-400 font-black">=</span>
                <div>
                  <span className="text-emerald-600 dark:text-emerald-400 block text-[10px]">{t('الرصيد الجديد')}:</span>
                  <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                    {((garage.balance || 0) + selectedTopupAmount).toLocaleString('en-US')} {t('ج.م')}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <button
            type="button"
            disabled={!selectedTopupAmount || isLoading}
            onClick={onOpenTopupModal}
            className="w-full sm:w-auto min-h-[48px] px-5 sm:px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
          >
            <Shield className="w-4 h-4 shrink-0" />
            {selectedTopupAmount ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span>{t('شحن الرصيد الآن')}</span>
                <span className="opacity-40">•</span>
                <span className="font-mono">{selectedTopupAmount.toLocaleString('en-US')}</span>
                <span>{t('ج.م')}</span>
              </span>
            ) : (
              <span className="whitespace-nowrap">{t('اختر مبلغ الشحن')}</span>
            )}
          </button>
        </div>
      </div>

      {/* Referral System Box */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Gift className="w-4 h-4 text-emerald-500" />
            <span>{t('نظام مكافآت الإحالة')}</span>
          </h3>
          <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
            {t('أيام المكافآت:')} {garage.totalReferralRewardDays || 0} {t('يوم')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Who referred this garage */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {t('تم ترشيح هذا الجراج بواسطة:')}
            </label>
            <select
              value={garage.referredByGarageId || ''}
              onChange={(e) => onReferredByChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500"
            >
              <option value="">{t('غير مُرشَّح من جراج آخر (مباشر)')}</option>
              {allGarages
                .filter(g => g.id !== garage.id && g.status !== 'pending')
                .map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.phone || 'بدون هاتف'})
                  </option>
                ))}
            </select>
          </div>

          {/* Garages referred by this garage */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('الجراجات التي رشحها هذا الجراج:')}
              </span>
              <span className="text-xs font-black text-emerald-600 font-mono">
                {allGarages.filter(g => g.referredByGarageId === garage.id).length} {t('جراج')}
              </span>
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1.5 custom-scrollbar-slate">
              {allGarages.filter(g => g.referredByGarageId === garage.id).map(rg => (
                <div key={rg.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white dark:bg-slate-900">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{rg.name}</span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {t('مُسجّل بالترشيح')}
                  </span>
                </div>
              ))}
              {allGarages.filter(g => g.referredByGarageId === garage.id).length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-2">{t('لا توجد إحالات مسجلة')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
