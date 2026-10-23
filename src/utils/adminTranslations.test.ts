import { describe, it, expect } from 'vitest';
import { useAdminTranslation } from './adminTranslations';

describe('Admin Translations Hook Helper', () => {
  it('returns exact original Arabic string when language is ar', () => {
    const t = useAdminTranslation('ar');
    expect(t('الجراجات')).toBe('الجراجات');
    expect(t('نص غير موجود')).toBe('نص غير موجود');
  });

  it('translates Arabic strings to English when language is en', () => {
    const t = useAdminTranslation('en');
    expect(t('الجراجات')).toBe('Garages');
    expect(t('بدون هاتف')).toBe('No phone');
    expect(t('تعذر تحميل قائمة الجراجات.')).toBe('Could not load the garage list.');
    expect(t('إعادة المحاولة')).toBe('Retry');
    expect(t('جاري تحميل المزيد...')).toBe('Loading more...');
    expect(t('تحميل المزيد من الجراجات')).toBe('Load more garages');
    expect(t('رمز الدخول يجب أن يكون 8 أرقام')).toBe('The PIN must be 8 digits.');
    expect(t('يجب إدخال سعر الساعة أو سعر المبيت على الأقل')).toBe('Enter at least an hourly rate or an overnight rate.');
    expect(t('سعر الساعة')).toBe('Hourly price');
    expect(t('تم حذف الإعلان بنجاح')).toBe('Announcement deleted successfully');
    expect(t('يرجى إدخال اسم وسعر صالحين لخطة الاشتراك')).toBe('Please enter a valid subscription plan name and price');
    expect(t('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.')).toBe('Could not reach the server. Check your internet connection.');
    expect(t('حدث خطأ في الخادم أثناء حفظ الخطة.')).toBe('A server error prevented the plan from being saved.');
    expect(t('أدخل رمز الدخول الحالي للمتابعة.')).toBe('Enter the current PIN to continue.');
    expect(t('رمز الدخول الحالي غير صحيح.')).toBe('The current PIN is incorrect.');
    expect(t('رمز الدخول الجديد يجب أن يتكون من 8 أرقام بالضبط.')).toBe('The new PIN must be exactly 8 digits.');
    expect(t('رمز الدخول الجديد يجب أن يكون مختلفاً عن الرمز الحالي.')).toBe('The new PIN must differ from the current PIN.');
    expect(t('هذا الرمز السري مستخدم بالفعل في حساب آخر:')).toBe('This PIN is already in use by another account:');
    expect(t('تم تغيير رمز الدخول بنجاح.')).toBe('Admin PIN updated successfully.');
    expect(t('أدخل رمز دخول جديداً (8 أرقام)')).toBe('Enter a new PIN (8 digits)');
    expect(t('جارٍ الحفظ...')).toBe('Saving...');
  });

  it('falls back to the provided string if English dictionary key is missing', () => {
    const t = useAdminTranslation('en');
    expect(t('نص غير معروف')).toBe('نص غير معروف');
  });
});
