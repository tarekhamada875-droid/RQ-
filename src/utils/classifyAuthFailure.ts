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
 * And produced the same Arabic toast messages.
 *
 * Now there's one function: classifyAuthFailure(error) → { type, message }
 *
 * REMOVED (2026-11-23): the `session_occupied` branch and the
 * `isSessionOccupiedError` helper. The Worker never returns
 * SESSION_OCCUPIED / DELEGATE_SESSION_OCCUPIED /
 * ACCESS_DENIED_ACTIVE_SESSION_EXISTS — and never throws the Arabic
 * "مستخدم على جهاز آخر" string. Those codes were leftover from an
 * older single-session design that was refactored away (see
 * server/auth/sessionMarkers.ts and the 2026-11-13 device-doc-authority
 * fix in server/sessionInfrastructure.ts). Multi-device login has been
 * the actual behavior for weeks; the matching code was dead defense
 * that could not fire. Removing it makes the codebase honest about what
 * the Worker actually returns. Affected callers in
 * useAdminAndGarageManagement.ts, useGarageSession.ts, and
 * authSessionService.ts were updated to drop the dead branches.
 */

export type AuthFailureType =
  | 'rate_limited'
  | 'pin_not_unique'
  | 'invalid_credentials'
  | 'connection_error'
  | 'unknown';

export interface AuthFailureClassification {
  type: AuthFailureType;
  message: string;
}

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
 */
export function classifyAuthFailure(error: string | undefined | null): AuthFailureClassification {
  const err = String(error || '').trim();

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
