/**
 * Garage routes entry point — one small module per concern.
 *
 * Whole-repo audit Phase 3 (owner-approved implementation plan,
 * 2026-11-19): the former monolithic server/garageRoutes.ts (782 lines)
 * is split so each command lives in its own file. Registration order
 * matches the original file exactly and no logic changed — every handler
 * body moved verbatim. The exported registerGarageRoutes(app) signature
 * is unchanged, so cloudflareWorker.ts and the garage route tests keep
 * importing './garageRoutes' with zero edits.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { registerGarageCreate } from './create';
import { registerGarageUpdate } from './update';
import { registerGarageDeletionRoutes } from './deletion';
import { registerGarageList } from './list';
import { registerGarageMaintenance } from './maintenance';
import { registerGarageDashboardSummaryRead } from './dashboardSummaryRead';
import { registerGarageDetail } from './detail';
import { registerStaffRoutes } from '../staffRoutes';
import { registerDelegateRoutes } from '../delegateRoutes';
import { registerCreditGrantRoutes } from '../creditGrantRoutes';

// 10. Garage Management & System Hardening (CF8)
export function registerGarageRoutes(app: WorkerApp): void {
  registerGarageCreate(app);
  registerGarageUpdate(app);
  registerGarageDeletionRoutes(app);
  registerGarageList(app);
  registerGarageMaintenance(app);
  registerGarageDashboardSummaryRead(app);
  registerGarageDetail(app);

  // Staff, delegate, and credit-grant routes are split into focused modules.
  registerStaffRoutes(app);
  registerDelegateRoutes(app);
  registerCreditGrantRoutes(app);
}
