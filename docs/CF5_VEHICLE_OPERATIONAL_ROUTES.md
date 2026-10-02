# CF5 Vehicle Operational Routes Report

**Date:** 2026-10-02  
**Branch:** `cloudflare-worker-migration`  
**Status:** Implemented, Tested, and Verified

---

## 1. Overview

Checkpoint CF5 migrated the core operational vehicle flows from Express into the permanent Cloudflare Worker routing pipeline:
1. `POST /api/vehicles/check-in`
2. `POST /api/vehicles/check-out`
3. `POST /api/vehicles/refund`
4. `POST /api/vehicles/delete`
5. `GET /api/vehicles/inside`
6. `GET /api/vehicles/history`

All operations preserve:
- Multi-tenant garage scope isolation (`authorizeVehicleGarageScope`).
- Atomic transactional consistency with Firestore (`adminDb.runTransaction`).
- Dynamic sharded projection bucket recording (`writeProjectionBucket`).
- Event Ledger persistence with zero undefined field corruption.
- Full idempotency replay and request deduplication.
- Unlimited fair-use tier evaluation and dynamic extension logging.

---

## 2. Implemented Route Contracts

### A. Vehicle Check-In (`POST /api/vehicles/check-in`)
- Validates vehicle plate numbers and Cairo timezone date keys.
- Confirms active subscriber status authoritatively from Firestore.
- Enforces daily capacity limits and unlimited fair use tiers.
- Atomically updates vehicle state, increments `carsInside`, updates `todayCount`, logs activity, writes delta projections, and persists domain events.

### B. Vehicle Check-Out (`POST /api/vehicles/check-out`)
- Validates vehicle presence inside the garage.
- Calculates dynamic duration and rate pricing (including subscriber discounts and overnight rates).
- Atomically marks vehicle as `outside`, updates garage `totalRevenue`, `totalVehiclesOut`, and `carsInside`.
- Appends `vehicle_exited` event to domain ledger.

### C. Vehicle Delete / Refund (`POST /api/vehicles/delete` & `POST /api/vehicles/refund`)
- Enforces correction authorization (only entrant staff or admin can delete/correct a record).
- Validates maximum daily deletion threshold (limit of 3 for non-admins).
- Rolls back revenue and active vehicle counters, writing `vehicle_refunded` or `vehicle_deleted` events.

### D. Operational Queries (`GET /api/vehicles/inside` & `GET /api/vehicles/history`)
- `GET /api/vehicles/inside`: Returns active vehicles currently inside the garage sorted by entry time.
- `GET /api/vehicles/history`: Returns activity logs for a specified Cairo date.

---

## 3. Local Verification Results

- `npx vitest run src/__tests__/cloudflareWorker*.test.ts src/__tests__/phase1FoundationAndRouting.test.ts`: **32 / 32 tests passed**.
- `npm run lint` (`tsc --noEmit`): **PASS** (0 errors).
- `npm run maintainability:check`: **PASS**.
- `npm run build:cloudflare`: **PASS**.

---

## 4. Rollback Instructions

```bash
git revert <CF5_COMMIT_SHA>
```
Worker fallback continues handling unmigrated routes via the underlying adapter.
