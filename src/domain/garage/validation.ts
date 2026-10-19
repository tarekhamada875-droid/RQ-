import { isSubscriptionExpired } from './subscription';

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


export const validateVehicleEntry = (garage: any, plateNumber: string): ValidationResult => {
  const errors: string[] = [];
  
  if (!plateNumber || plateNumber.trim().length < 3) {
    errors.push('رقم اللوحة غير صالح');
  }
  
  if (isSubscriptionExpired(garage)) {
    errors.push('اشتراك الجراج منتهي');
  }
  
  return { valid: errors.length === 0, errors };
};
