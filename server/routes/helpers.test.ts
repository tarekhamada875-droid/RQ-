import { describe, expect, it } from 'vitest';
import { mapDomainErrorToStatus } from './helpers';

describe('domain money error responses', () => {
  it('maps invalid calculated checkout money to an unprocessable response', () => {
    expect(mapDomainErrorToStatus(new Error('INVALID_MONEY_AMOUNT'))).toEqual({
      statusCode: 422,
      code: 'INVALID_MONEY_AMOUNT',
      message: 'قيمة مالية غير صالحة'
    });
  });

  it('maps unknown errors to an internal-error fallback', () => {
    expect(mapDomainErrorToStatus(new Error('SOMETHING_UNEXPECTED'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'حدث خطأ غير متوقع في الخادم'
    });
  });
});
