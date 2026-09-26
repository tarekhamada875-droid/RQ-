import { ValidationError } from '../validation';
import { AuthRequest } from '../middleware';
import { canManageGarageScopedData as decideGarageScope } from '../domain/authorization';

/**
 * Domain Error Status Code Resolver
 */
export function mapDomainErrorToStatus(err: any): { statusCode: number; code: string; message: string } {
  if (err instanceof ValidationError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message };
  }

  const errMsg = String(err?.message || err || '');

  if (errMsg.includes('GARAGE_NOT_FOUND') || errMsg.includes('VEHICLE_NOT_FOUND') || errMsg.includes('REQUEST_NOT_FOUND') || errMsg.includes('PACKAGE_NOT_FOUND') || errMsg.includes('SUBSCRIBER_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: 'The requested resource was not found.' };
  }

  if (
    errMsg.includes('REQUEST_ALREADY_PROCESSED') ||
    errMsg.includes('IDEMPOTENCY_KEY_REUSE') ||
    errMsg.includes('VEHICLE_ALREADY_INSIDE') ||
    errMsg.includes('VEHICLE_ALREADY_OUTSIDE') ||
    errMsg.includes('INSUFFICIENT_BALANCE') ||
    errMsg.includes('CAPACITY_LIMIT_REACHED') ||
    errMsg.includes('FAIR_USE_LIMIT_REACHED') ||
    errMsg.includes('DAILY_DELETION_LIMIT_REACHED') ||
    errMsg.includes('GARAGE_DELETION_IN_PROGRESS') ||
    errMsg.includes('reached_daily_deletion_limit') ||
    errMsg.includes('PIN_ALREADY_TAKEN') ||
    errMsg.includes('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION') ||
    errMsg.includes('MONTHLY_SUBSCRIBER_NOT_CHECKED_IN') ||
    errMsg.includes('NO_REFERRAL_REWARDS_AVAILABLE') ||
    errMsg.includes('SUBSCRIPTION_EXPIRED') ||
    errMsg.includes('SUBSCRIBER_ALREADY_EXISTS') ||
    errMsg.includes('SUBSCRIBER_PLATE_IMMUTABLE')
  ) {
    return { statusCode: 409, code: 'CONFLICT', message: 'The requested operation conflicts with the current state.' };
  }

  if (
    errMsg.includes('FORBIDDEN') ||
    errMsg.includes('UNAUTHORIZED_GARAGE_ACCESS') ||
    errMsg.includes('GARAGE_SCOPE_MISMATCH') ||
    errMsg.includes('ADMIN_ONLY') ||
    errMsg.includes('GARAGE_CANNOT_RECHARGE_OTHERS') ||
    errMsg.includes('ADMIN_OR_SUPERVISOR_ONLY')
  ) {
    return { statusCode: 403, code: 'FORBIDDEN', message: 'You are not authorized to perform this operation.' };
  }

  if (errMsg.includes('UNAUTHORIZED') || errMsg.includes('INVALID_ID_TOKEN') || errMsg.includes('SESSION_INACTIVE')) {
    return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication is required.' };
  }

  return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'An internal server error occurred.' };
}

export function canManageGarageScopedData(req: AuthRequest, garageId: string): boolean {
  return decideGarageScope(req.user, garageId);
}
