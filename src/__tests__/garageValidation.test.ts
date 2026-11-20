import { describe, expect, it } from 'vitest';
import { validateGarageCreation } from '../domain/garage/validation';

// Audit regression (2026-11-21): delegate garage creation was broken
// end-to-end — the delegate path strips data.pin (the Worker generates one
// server-side and rejects client-provided pins), but creation validation
// unconditionally demanded a 5-digit PIN, so every delegate "open a new
// garage" attempt failed client-side with رمز الدخول يجب أن يكون 5 أرقام
// before ever reaching the server.

const validGarageBody = {
  name: 'جراج الاختبار',
  hourlyRate: 10,
  overnightRate: 20
};

describe('validateGarageCreation — delegate PIN skip (audit 2026-11-21)', () => {
  it('rejects a missing PIN on the default (admin) path', () => {
    const result = validateGarageCreation({ ...validGarageBody });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('رمز الدخول يجب أن يكون 5 أرقام');
  });

  it('accepts a valid 5-digit PIN on the default path', () => {
    const result = validateGarageCreation({ ...validGarageBody, pin: '12345' });
    expect(result.valid).toBe(true);
  });

  it('skips the PIN requirement for the delegate path (Worker generates the PIN)', () => {
    const result = validateGarageCreation({ ...validGarageBody }, { skipPinRequirement: true });
    expect(result.valid).toBe(true);
    expect(result.errors).not.toContain('رمز الدخول يجب أن يكون 5 أرقام');
  });

  it('still validates name and rates on the delegate path', () => {
    const result = validateGarageCreation(
      { name: 'ج', hourlyRate: -5, overnightRate: '' },
      { skipPinRequirement: true }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('اسم الجراج');
    expect(result.errors.join(' ')).toContain('سعر الساعة');
  });
});
