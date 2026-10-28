import { describe, expect, it } from 'vitest';
import { getGaragePinUpdateErrorMessage } from './AdminGarageDetailsView';

describe('getGaragePinUpdateErrorMessage', () => {
  it('translates the duplicate PIN error to Arabic', () => {
    expect(getGaragePinUpdateErrorMessage(new Error('PIN_ALREADY_TAKEN'))).toBe('الرمز مستخدم بالفعل');
  });

  it('preserves an existing Arabic server message', () => {
    expect(getGaragePinUpdateErrorMessage(new Error('تعذر التحقق من الرمز'))).toBe('تعذر التحقق من الرمز');
  });

  it('does not expose unknown English server errors', () => {
    expect(getGaragePinUpdateErrorMessage(new Error('PERMISSION_DENIED'))).toBe(
      'تعذر تحديث رمز دخول الجراج. يرجى المحاولة مرة أخرى.',
    );
  });

  it('uses the Arabic fallback for non-Error values', () => {
    expect(getGaragePinUpdateErrorMessage({ code: 'INTERNAL_ERROR' })).toBe(
      'تعذر تحديث رمز دخول الجراج. يرجى المحاولة مرة أخرى.',
    );
  });
});
