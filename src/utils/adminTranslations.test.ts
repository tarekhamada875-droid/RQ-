import { describe, it, expect } from 'vitest';
import { useAdminTranslation } from './adminTranslations';

describe('Admin translation helper (Arabic-only)', () => {
  it('preserves Arabic interface text', () => {
    const t = useAdminTranslation('ar');
    expect(t('الجراجات')).toBe('الجراجات');
    expect(t('تعذر تحميل قائمة الجراجات.')).toBe('تعذر تحميل قائمة الجراجات.');
    expect(t('نص غير معروف')).toBe('نص غير معروف');
  });

  it('keeps shared interface copy Arabic-only', () => {
    const t = useAdminTranslation('ar');
    expect(t('الجراجات')).toBe('الجراجات');
    expect(t('إعادة المحاولة')).toBe('إعادة المحاولة');
  });
});
