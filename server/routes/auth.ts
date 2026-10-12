import type { Router } from 'express';
import { pinAuthRouter } from '../auth/pinAuth';
import { adminAuthRouter } from '../auth/adminAuth';

export function registerAuthRoutes(router: Router) {
  router.use(pinAuthRouter);
  router.use(adminAuthRouter);
}

export default registerAuthRoutes;
