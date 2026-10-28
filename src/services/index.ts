import { garageService } from './garageService';
import { vehicleService } from './vehicleService';
import { delegateService } from './delegateService';
import { adminService } from './adminService';
import { authService } from './authService';
import { garageDeletionService } from './garageDeletionService';
export type { GarageDashboardSummary, GaragePage } from './garageService';
export { isFreshGarageDashboardSummary } from './garageService';

export const firestoreService = {
  ...garageService,
  ...garageDeletionService,
  ...vehicleService,
  ...delegateService,
  ...adminService,
  ...authService,
};

export {
  garageService,
  garageDeletionService,
  vehicleService,
  delegateService,
  adminService,
  authService
};

export type { GarageDeletionProgress, GarageDeletionStatus, GarageDeletionAttempt } from './garageDeletionService';
export { deleteGarageWithRecovery, garageDeletionFailureMessage } from './garageDeletionService';
