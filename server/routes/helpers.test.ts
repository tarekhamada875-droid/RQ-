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

  it('maps invalid package currency configuration to a client error', () => {
    expect(mapDomainErrorToStatus(new Error('INVALID_PACKAGE_CONFIGURATION'))).toEqual({
      statusCode: 400,
      code: 'INVALID_PACKAGE_CONFIGURATION',
      message: 'إعدادات الباقة غير صالحة'
    });
  });
});
