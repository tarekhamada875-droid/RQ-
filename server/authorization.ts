import type { Response, NextFunction } from 'express';
import { AuthRequest } from './middleware';

/**
 * Centralized Server Authorization Engine
 * Enforces strict role hierarchies, tenant scoping, and operational boundaries.
 */

export class AuthorizationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 403, code = 'FORBIDDEN') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Requires the authenticated actor to have the top-level 'admin' role.
 */
export const requireSystemAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'ADMIN_ONLY: Only system administrators can perform this action'
    });
  }
  next();
};

/**
 * Requires the authenticated actor to be either an admin or a supervisor.
 */
export const requireSupervisorOrAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'supervisor')) {
    return res.status(403).json({
      success: false,
      error: 'ADMIN_OR_SUPERVISOR_ONLY: Action requires supervisor or admin privileges'
    });
  }
  next();
};

/**
 * Requires the authenticated actor to be a delegate or an admin.
 */
export const requireDelegateOrAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'delegate')) {
    return res.status(403).json({
      success: false,
      error: 'DELEGATE_OR_ADMIN_ONLY: Action requires delegate or admin privileges'
    });
  }
  next();
};

/**
 * Requires the authenticated actor to have authorized operational access to a specific garage.
 * Rules:
 * - Admin has global override.
 * - Garage Owner must match target garage ID.
 * - Staff must be assigned to target garage ID.
 * - Supervisors and Delegates are strictly non-operational and CANNOT perform vehicle operations.
 */
export const verifyGarageOperationalAccess = (req: AuthRequest, targetGarageId: string): boolean => {
  if (!req.user || !targetGarageId) return false;
  const { role, garageId } = req.user;

  if (role === 'admin') return true;
  if (role === 'garage') return garageId === targetGarageId;
  if (role === 'staff') return garageId === targetGarageId;

  return false;
};

/**
 * Verifies if the authenticated actor is authorized to correct/delete a vehicle record.
 * Business Rule:
 * - Admin can override.
 * - Garage Owner or assigned Staff can delete ONLY if they created the entry (enteredByUid matches or staffId/creator matches).
 */
export const verifyVehicleCorrectionAccess = (
  req: AuthRequest,
  vehicleData: any,
  targetGarageId: string
): { allowed: boolean; reason?: string } => {
  if (!req.user) return { allowed: false, reason: 'UNAUTHENTICATED' };
  const { role, uid, entityId } = req.user;

  // 1. Must have operational access to garage
  if (!verifyGarageOperationalAccess(req, targetGarageId)) {
    return { allowed: false, reason: 'UNAUTHORIZED_GARAGE_ACCESS' };
  }

  // 2. Admin has system-wide override
  if (role === 'admin') {
    return { allowed: true };
  }

  // 3. For garage owner or staff: verify entrant identity
  // Vehicle document holds enteredByUid, staffId, staffUid, or staffName
  const vehicleEntrantUid = vehicleData.enteredByUid || vehicleData.staffUid || vehicleData.staffId || '';
  
  if (vehicleEntrantUid) {
    const isEntrant = vehicleEntrantUid === uid || vehicleEntrantUid === entityId;
    if (!isEntrant) {
      return {
        allowed: false,
        reason: 'CORRECTION_FORBIDDEN: Only the staff member who entered the vehicle can correct or delete it'
      };
    }
  }

  return { allowed: true };
};
