/**
 * Vehicle routes entry point — one small module per command.
 *
 * Whole-repo audit Phase 3 (owner-approved implementation plan,
 * 2026-11-19): the former monolithic server/vehicleRoutes.ts (784 lines)
 * is split so each command lives in its own file. Registration order
 * matches the original file exactly and no logic changed — every handler
 * body moved verbatim. The exported registerVehicleRoutes(app) signature
 * is unchanged, so cloudflareWorker.ts keeps importing './vehicleRoutes'.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { registerVehicleCheckIn } from './checkIn';
import { registerVehicleCheckOut } from './checkOut';
import { registerVehicleDelete } from './deleteOrRefund';
import { registerVehicleReads } from './reads';

// 7. Vehicle Operations & Operational Flow (CF5)
export function registerVehicleRoutes(app: WorkerApp): void {
  registerVehicleCheckIn(app);
  registerVehicleCheckOut(app);
  registerVehicleDelete(app);
  registerVehicleReads(app);
}
