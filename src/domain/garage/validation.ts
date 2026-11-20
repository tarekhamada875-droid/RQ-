export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface GarageCreationValidationOptions {
  /**
   * Delegate path (audit fix 2026-11-21): the Worker GENERATES the PIN
   * server-side and rejects any client-provided pin for delegate-created
   * garages, so the 5-digit requirement must not apply there. Without this
   * flag every delegate "open a new garage" attempt failed client-side with
   * رمز الدخول يجب أن يكون 5 أرقام before ever reaching the server.
   */
  skipPinRequirement?: boolean;
}

export const validateGarageCreation = (data: any, options: GarageCreationValidationOptions = {}): ValidationResult => {
  const errors: string[] = [];
  
  if (!data.name || data.name.trim().length < 2) {
    errors.push('اسم الجراج مطلوب (حرفين على الأقل)');
  }
  
  if (!options.skipPinRequirement && (typeof data.pin !== 'string' || !/^\d{5}$/.test(data.pin))) {
    errors.push('رمز الدخول يجب أن يكون 5 أرقام');
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
