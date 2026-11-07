/**
 * Shared auth-failure classifier — one pure function replaces 7+ copies.
 *
 * Audit ref: Phase 7 / D4 (consolidated audit, 2026-11-06).
 *
 * Previously, the same error-string-matching logic was duplicated in:
 *   - useAdminAndGarageManagement.ts (5 copies: handleGarageLogin,
 *     handleDelegateLogin, handleAdminLogin, claimEntitySession catch,
 *     releaseEntitySession catch)
 *   - useGarageSession.ts (2 copies)
 *
 * Each copy checked the same error codes:
 *   SESSION_OCCUPIED, DELEGATE_SESSION_OCCUPIED, ACCESS_DENIED_ACTIVE_SESSION_EXISTS,
 *   'مستخدم على جهاز آخر', RATE_LIMIT_EXCEEDED, RATE_LIMITER_UNAVAILABLE,
 *   PIN_NOT_UNIQUE, 'بيانات الدخول غير صحيحة', INVALID_PIN, 'تعذر الاتصال بخادم التحقق'
 *
 * And produced the same Arabic toast messages.
 *
 * Now there's one function: classifyAuthFailure(error) → { type, message }
 */

export type AuthFailureType =
  | 'session_occupied'
  | 'rate_limited'
  | 'pin_not_unique'
  | 'invalid_credentials'
  | 'connection_error'
  | 'unknown';

export interface AuthFailureClassification {
  type: AuthFailureType;
  message: string;
}

const SESSION_OCCUPIED_ERRORS = new Set([
  'SESSION_OCCUPIED',
  'DELEGATE_SESSION_OCCUPIED',
  'ACCESS_DENIED_ACTIVE_SESSION_EXISTS',
]);

const RATE_LIMIT_ERRORS = new Set([
  'RATE_LIMIT_EXCEEDED',
  'RATE_LIMITER_UNAVAILABLE',
]);

const INVALID_CRED_ERRORS = new Set([
  'بيانات الدخول غير صحيحة',
  'INVALID_PIN',
  'تعذر الاتصال بخادم التحقق',
]);

/**
 * Classifies an auth error string into a typed result with an Arabic toast message.
 * Pure function — no side effects.
 *
 * Usage:
 *   const { type, message } = classifyAuthFailure(err);
 *   if (type !== 'unknown') showToast(message, 'error');
 *   if (type === 'session_occupied') { /* release session logic *\/ }
 */
export function classifyAuthFailure(error: string | undefined | null): AuthFailureClassification {
  const err = String(error || '').trim();

  // Session occupied — account active on another device
  if (
    SESSION_OCCUPIED_ERRORS.has(err) ||
    err.includes('مستخدم على جهاز آخر')
  ) {
    return { type: 'session_occupied', message: 'هذا الحساب نشط حالياً على جهاز آخر' };
  }

  // Rate limited — too many wrong attempts
  if (
    RATE_LIMIT_ERRORS.has(err) ||
    err.includes('RATE_LIMIT')
  ) {
    return { type: 'rate_limited', message: 'محاولات كثيرة خاطئة. انتظر دقيقة ثم حاول مرة أخرى' };
  }

  // PIN not unique — PIN already taken by another account
  if (err === 'PIN_NOT_UNIQUE') {
    return { type: 'pin_not_unique', message: 'رقم السر مكرر؛ برجاء مراجعة الإدارة' };
  }

  // Invalid credentials — wrong PIN or connection issue
  if (INVALID_CRED_ERRORS.has(err)) {
    return { type: 'invalid_credentials', message: 'بيانات الدخول غير صحيحة' };
  }

  // Connection error
  if (err.includes('permission') || err.includes('Permission')) {
    return { type: 'connection_error', message: 'انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً' };
  }

  // Unknown — show generic error
  return { type: 'unknown', message: 'تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى' };
}

/**
 * Returns true if the error indicates the account is occupied on another device.
 * Convenience function for the session-release logic.
 */
export function isSessionOccupiedError(error: string | undefined | null): boolean {
  const err = String(error || '').trim();
  return (
    SESSION_OCCUPIED_ERRORS.has(err) ||
    err.includes('مستخدم على جهاز آخر')
  );
}
