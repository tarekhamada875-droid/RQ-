import type { Router } from 'express';
import { activeSessionsRouter } from '../auth/activeSessions';
import { pinAuthRouter } from '../auth/pinAuth';
import { adminAuthRouter } from '../auth/adminAuth';
import { sessionLifecycleRouter } from '../auth/sessionLifecycle';

export function registerAuthRoutes(router: Router) {
  router.use(activeSessionsRouter);
  router.use(pinAuthRouter);
  router.use(adminAuthRouter);
  router.use(sessionLifecycleRouter);
}

export default registerAuthRoutes;
