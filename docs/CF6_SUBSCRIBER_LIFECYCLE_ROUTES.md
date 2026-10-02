# CF6 Subscriber Lifecycle Routes Report

**Date:** 2026-10-02  
**Branch:** `cloudflare-worker-migration`  
**Status:** Implemented, Tested, and Verified

---

## 1. Overview

Checkpoint CF6 migrated subscriber lifecycle operations from Express into the permanent Cloudflare Worker routing pipeline:
1. `POST /api/subscribers/add`
2. `POST /api/subscribers/renew`
3. `POST /api/subscribers/update`
4. `POST /api/subscribers/delete`

All 4 endpoints leverage the pure subscriber lifecycle domain logic (`server/domain/subscriberLifecycle.ts`), enforce deterministic plate-based IDs, enforce garage scope authorization, and record transactional domain events.

---

## 2. Implemented Route Contracts

### A. Subscriber Registration (`POST /api/subscribers/add`)
- Validates date range (`startDate` <= `endDate`) and plate characters (`validatePlate`).
- Derives deterministic subscriber document ID `plate_<base64url(plateRaw)>`.
- Checks for existing records in transaction to prevent duplicates.
- Executes `decideSubscriberAdd` and writes subscriber document atomically.
- Records `subscriber_created` domain event.

### B. Subscriber Renewal (`POST /api/subscribers/renew`)
- Validates date range and garage scope.
- Reads current subscriber state in transaction (`subscriberDocumentToState`).
- Executes `decideSubscriberRenew` to calculate updated subscription bounds.
- Atomically updates `startDate` and `endDate`.
- Records `subscriber_renewed` domain event.

### C. Subscriber Profile Update (`POST /api/subscribers/update`)
- Prevents plate mutation (`SUBSCRIBER_PLATE_IMMUTABLE`).
- Merges profile data (e.g. ownerName, phone, notes) and validates updated dates.
- Executes `decideSubscriberUpdate` and writes transition updates.
- Records `subscriber_updated` domain event.

### D. Subscriber Deletion (`POST /api/subscribers/delete`)
- Validates garage authorization.
- Executes `decideSubscriberDelete` in transaction and removes subscriber document.
- Records `subscriber_deleted` domain event.

---

## 3. Local Verification Results

- `npx vitest run src/__tests__/cloudflareWorker*.test.ts src/__tests__/phase1FoundationAndRouting.test.ts`: **36 / 36 tests passed**.
- `npm run lint` (`tsc --noEmit`): **PASS** (0 errors).
- `npm run maintainability:check`: **PASS**.
- `npm run build:cloudflare`: **PASS**.

---

## 4. Rollback Instructions

```bash
git revert <CF6_COMMIT_SHA>
```
Worker fallback continues handling unmigrated routes via the underlying adapter.
