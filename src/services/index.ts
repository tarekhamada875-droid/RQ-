import { garageService } from './garageService';
import { vehicleService } from './vehicleService';
import { delegateService } from './delegateService';
import { adminService } from './adminService';
import { authService } from './authService';
import { garageDeletionService } from './garageDeletionService';
export type { GarageDashboardSummary } from './garageService';
export { isFreshGarageDashboardSummary } from './garageService';

/**
 * @deprecated Use the named sub-service exports below instead — e.g.
 *   `import { garageService } from '../services'`
 *   `garageService.updateGarage(...)`
 * not `firestoreService.updateGarage(...)`.
 *
 * Kept only for backward compatibility with test mocks that still construct
 * `{ firestoreService: ... }` objects. New code must import the specific
 * sub-service it needs — this enables better tree-shaking and makes the
 * dependency graph explicit.
 */
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
