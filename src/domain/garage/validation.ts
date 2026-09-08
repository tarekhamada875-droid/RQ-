import { isSubscriptionExpired, calculateCapacityUsed } from './subscription';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const validateGarageCreation = (data: any): ValidationResult => {
  const errors: string[] = [];
  
  if (!data.name || data.name.trim().length < 2) {
    errors.push('اسم الجراج مطلوب (حرفين على الأقل)');
  }
  
  if (!data.pin || data.pin.length !== 6) {
    errors.push('رمز الدخول يجب أن يكون 6 أرقام');
  }
  
  if (!data.hourlyRate || data.hourlyRate <= 0) {
    errors.push('سعر الساعة يجب أن يكون أكبر من صفر');
  }
  
  if (!data.overnightRate || data.overnightRate <= 0) {
    errors.push('سعر المبيت يجب أن يكون أكبر من صفر');
  }
  
  // Trial validation
  const isTrial = data.isTrial === true || data.isTrial === 'true';
  if (isTrial) {
    // Trial garages should NOT have a package
    if (data.initialPackageId) {
      errors.push('الجراج التجريبي لا يحتاج باقة — سيتم تفعيله تلقائياً');
    }
  } else {
    // Non-trial must have a package or capacity
    if (!data.initialPackageId && !data.dailyCapacity) {
      errors.push('يجب اختيار باقة اشتراك أو تحديد السعة اليومية');
    }
  }
  
  return { valid: errors.length === 0, errors };
};

export const validateRechargeRequest = (data: any): ValidationResult => {
  const errors: string[] = [];
  
  if (!data?.garageId) errors.push('معرف الجراج مطلوب');
  if (!data?.packageId && !data?.packageName) errors.push('الباقة مطلوبة');
  
  const rawAmount = data?.revenueAmount !== undefined ? data.revenueAmount : data?.amount;
  if (rawAmount === undefined || rawAmount === null || isNaN(Number(rawAmount)) || Number(rawAmount) < 0) {
    errors.push('المبلغ غير صالح');
  }
  
  return { valid: errors.length === 0, errors };
};

export const validateVehicleEntry = (garage: any, plateNumber: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!plateNumber || plateNumber.trim().length < 3) {
    errors.push('رقم اللوحة غير صالح');
  }
  
  if (isSubscriptionExpired(garage)) {
    errors.push('اشتراك الجراج منتهي');
  }
  
  // Check daily capacity
  const { used, limit, isUnlimited } = calculateCapacityUsed(garage);
  if (!isUnlimited && used >= limit) {
    errors.push('تم الوصول للحد الأقصى اليومي');
  }
  
  return { valid: errors.length === 0, errors };
};
