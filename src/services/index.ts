import { garageService } from './garageService';
import { vehicleService } from './vehicleService';
import { delegateService } from './delegateService';
import { adminService } from './adminService';
import { authService } from './authService';

export const firestoreService = {
  ...garageService,
  ...vehicleService,
  ...delegateService,
  ...adminService,
  ...authService,
};

export {
  garageService,
  vehicleService,
  delegateService,
  adminService,
  authService
};
