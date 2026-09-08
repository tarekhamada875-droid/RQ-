import { useRef, useCallback } from 'react';
import { Garage, Package } from '../types';
import { firestoreService } from '../services';
import { getCleanPackageInfo } from '../constants/packages';
import { calculateFinalPrice, createAsyncLock } from '../utils';

interface UseGarageSubscriptionProps {
  allGarages: Garage[];
  delegate: any | null;
  subscriberFlatFee: number;
  systemReferralFee?: number;
  delegateCommissions?: { daily: number; weekly: number; biweekly: number; monthly: number };
  isOnline: boolean;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function useGarageSubscription({
  allGarages,
  delegate,
  subscriberFlatFee,
  systemReferralFee,
  delegateCommissions,
  isOnline,
  showToast,
}: UseGarageSubscriptionProps) {
  const rechargeLock = useRef(createAsyncLock());

  const handleDelegateRecharge = useCallback(async (
    garageId: string,
    amount: number,
    pkg?: Package,
    discountInfo?: { discountAmount?: number; originalRevenueAmount?: number }
  ) => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى المحاولة عند عودة النت.', 'error');
      return;
    }
    const lockResult = await rechargeLock.current(async () => {
      try {
        const g = allGarages.find(gar => gar.id === garageId);
        if (!g || !delegate) return;

        const pendingRequests = await firestoreService.getPendingRechargeRequestsForGarage(garageId, delegate?.id);
        if (pendingRequests.length > 0) {
          showToast('يوجد طلب شحن معلق بالفعل لهذا الجراج', 'error');
          return;
        }
        
        const cleanPkg = pkg ? getCleanPackageInfo(pkg) : null;
        const durationDays = cleanPkg ? cleanPkg.durationDays : 30;
        const effCap = cleanPkg ? (cleanPkg.isUnlimited ? 0 : (cleanPkg.dailyCapacity || 40)) : 0;
        
        const referrerId = g.referrerId || g.createdByDelegateId || delegate.id || null;
        const effectiveReferralFee = (g.referrerId || g.createdByDelegateId) ? (delegateCommissions || systemReferralFee || 50) : 0;

        let revenueIncrement = amount;
        let originalRev = amount;
        let discountVal = 0;

        if (pkg) {
          const priceCalc = calculateFinalPrice(
            pkg, 
            g.hasMonthlySubscribers || false, 
            subscriberFlatFee, 
            effectiveReferralFee
          );
          revenueIncrement = priceCalc.finalPrice;
          originalRev = priceCalc.displayBasePrice;
          // Exact discount deducted from the base price
          const baseAfterSubscriberFee = priceCalc.displayBasePrice;
          const discountedBeforeCommission = priceCalc.finalPrice - priceCalc.actualReferralFee;
          discountVal = Math.max(0, baseAfterSubscriberFee - discountedBeforeCommission);
        } else if (discountInfo?.discountAmount && discountInfo.discountAmount > 0) {
          discountVal = discountInfo.discountAmount;
          originalRev = discountInfo.originalRevenueAmount !== undefined ? discountInfo.originalRevenueAmount : amount;
          revenueIncrement = Math.max(0, amount - discountInfo.discountAmount);
        }

        const rechargePayload: any = {
          garageId: garageId,
          garageName: g.name,
          delegateId: delegate.id,
          delegateName: delegate.name,
          referrerId: referrerId,
          packageId: pkg?.id || 'custom',
          packageName: pkg?.name || 'مبلغ مخصص',
          amount: revenueIncrement,
          durationDays: durationDays,
          carsCount: effCap,
          dailyCapacity: effCap,
          revenueAmount: revenueIncrement,
          originalRevenueAmount: originalRev,
          discountAmount: discountVal
        };

        await firestoreService.createRechargeRequest(rechargePayload);
      } catch (error) {
        showToast('فشل في إرسال طلب الشحن', 'error');
        throw error;
      }
    });

    if (lockResult === null) {
      showToast('جاري إرسال الطلب... يرجى الانتظار', 'info');
    }
  }, [isOnline, allGarages, delegate, subscriberFlatFee, systemReferralFee, delegateCommissions, showToast]);

  const handleDelegateBalanceTopupRequest = useCallback(async (
    garageId: string,
    amount: number
  ) => {
    if (!isOnline) {
      showToast('لا يوجد اتصال بالإنترنت. يرجى المحاولة عند عودة النت.', 'error');
      return;
    }
    if (!amount || amount <= 0) {
      showToast('يرجى تحديد مبلغ الشحن', 'error');
      return;
    }

    const lockResult = await rechargeLock.current(async () => {
      try {
        const g = allGarages.find(gar => gar.id === garageId);
        if (!g || !delegate) return;

        const pendingRequests = await firestoreService.getPendingRechargeRequestsForGarage(garageId, delegate?.id);
        if (pendingRequests.length > 0) {
          showToast('يوجد طلب معلق بالفعل لهذا الجراج', 'error');
          return;
        }

        const referrerId = g.referrerId || g.createdByDelegateId || delegate.id || null;

        const rechargePayload: any = {
          requestType: 'balance_topup',
          garageId: garageId,
          garageName: g.name,
          delegateId: delegate.id,
          delegateName: delegate.name,
          referrerId: referrerId,
          packageId: 'balance_topup',
          packageName: `شحن رصيد (${amount} ج.م)`,
          amount: amount,
          durationDays: 0,
          carsCount: 0,
          dailyCapacity: 0,
          revenueAmount: amount,
          originalRevenueAmount: amount,
          discountAmount: 0
        };

        await firestoreService.createRechargeRequest(rechargePayload);
        showToast(`تم إرسال طلب شحن رصيد بقيمة ${amount} ج.م بنجاح`, 'success');
      } catch (error) {
        showToast('فشل في إرسال طلب شحن الرصيد', 'error');
        throw error;
      }
    });

    if (lockResult === null) {
      showToast('جاري إرسال الطلب... يرجى الانتظار', 'info');
    }
  }, [isOnline, allGarages, delegate, showToast]);

  return {
    handleDelegateRecharge,
    handleDelegateBalanceTopupRequest,
  };
}
