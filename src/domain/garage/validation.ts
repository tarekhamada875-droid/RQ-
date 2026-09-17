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
  
  if (typeof data.pin !== 'string' || !/^\d{8}$/.test(data.pin)) {
    errors.push('رمز الدخول يجب أن يكون 8 أرقام');
  }
  
  const hourly = data.hourlyRate !== undefined && data.hourlyRate !== null && data.hourlyRate !== '' ? Number(data.hourlyRate) : 0;
  const overnight = data.overnightRate !== undefined && data.overnightRate !== null && data.overnightRate !== '' ? Number(data.overnightRate) : 0;

  if (isNaN(hourly) || hourly < 0) {
    errors.push('سعر الساعة يجب أن يكون صفر أو أكبر');
  }
  
  if (isNaN(overnight) || overnight < 0) {
    errors.push('سعر المبيت يجب أن يكون صفر أو أكبر');
  }

  if (hourly <= 0 && overnight <= 0) {
    errors.push('يجب تحديد سعر الساعة أو سعر المبيت على الأقل');
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
