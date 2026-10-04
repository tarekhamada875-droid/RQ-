# CF0 Baseline and Migration Freeze Report

**Date:** 2026-10-02  
**Branch:** `cloudflare-worker-migration`  
**Base Commit (HEAD & origin/main):** `cae936b27486115b7291f671d21aefead79020de`  
**Latest Cloudflare Pages Deployment Commit:** `cae936b`  
**Status:** Completed and Frozen

---

## 1. Executive Summary

This historical report establishes the verified starting baseline for the migration of the RQ backend from Railway Express to a dedicated Cloudflare Worker API. The current architecture and next migration work are governed by `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`.

All mandatory documents have been read:
1. `RQ_PROJECT_KNOWLEDGE_BASE.md`
2. `AGENTS.md`
3. `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`
4. `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`
5. `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md`

All feature development, UI redesigns, and unrelated refactoring are frozen.

---

## 2. Git & Working Tree State

- **Repository:** `https://github.com/tarekhamada875-droid/RQ-.git`
- **Branch:** `cloudflare-worker-migration` (checked out from `main` at `cae936b`)
- **HEAD Commit SHA:** `cae936b27486115b7291f671d21aefead79020de`
- **Tracked files:** Clean relative to the baseline contract.
- **Lockfile discipline:** Removed stray `bun.lock`; repository is standardized strictly on `npm` (`npm@10.8.2`).

---

## 3. Exhaustive Backend API Route Inventory

The following 38 endpoints represent the complete authoritative API surface currently implemented in `server/app.ts` and `server/routes/`:

### A. Health & System Configuration (`server/app.ts`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Process & Firebase Admin SDK readiness check (`{ status, timestamp, adminSdk, version }`). |
| `GET` | `/api/system-config` | Public | Global system config (flat fees, trial days, wallet number, maintenance status). |
| `POST` | `/api/admin/update-system-config` | `admin` | Update global system settings (`system_config/global`). |
| `POST` | `/api/admin/garages/:id/extend-fair-use` | `admin` | Admin extension of fair-use allowance for unlimited packages. |
| `POST` | `/api/recharge-requests/create` | `garage`, `delegate` | Idempotent creation of balance topup or subscription recharge request. |
| `POST` | `/api/activity-logs/add` | `any` | Returns 403 (`SERVER_GENERATED_ONLY`). |

### B. Authentication & Session Authority (`server/routes/auth.ts` -> `server/auth/*`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/verify-pin` | Firebase Auth | Universal PIN verification for all roles with brute-force rate limiting. |
| `POST` | `/api/auth/check-pin-availability` | Firebase Auth | Check if a proposed PIN is already assigned to any active entity. |
| `POST` | `/api/auth/verify-admin-pin` | Firebase Auth | Verify master admin PIN. |
| `POST` | `/api/auth/claim-admin-session` | Firebase Auth | Admin multi-device session claim and token minting. |
| `POST` | `/api/auth/release-admin-session` | Firebase Auth | Graceful admin session termination. |
| `POST` | `/api/admin/update-pin` | `admin` | Admin master PIN update. |
| `POST` | `/api/auth/validate-or-refresh-session` | Firebase Auth | Validates session token, checks 24h timeout, updates heartbeat. |
| `POST` | `/api/auth/release-session` | Firebase Auth | Normal session logout / release. |
| `GET` | `/api/auth/sessions` | Required | List active multi-device sessions for calling entity. |
| `DELETE` | `/api/auth/sessions/:sessionKey` | Required | Revoke a specific active session. |
| `POST` | `/api/auth/invalidate-all-sessions` | Required | Invalidate all sessions for calling entity. |

### C. Personnel & Role Management (`server/app.ts`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/api/supervisors/create` | `admin` | Create new supervisor account with unique PIN check. |
| `POST` | `/api/supervisors/update` | `admin` | Update supervisor profile / permissions. |
| `POST` | `/api/supervisors/delete` | `admin` | Delete supervisor account. |
| `POST` | `/api/staff/create` | `admin`, `garage` | Create garage staff member with unique PIN check. |
| `POST` | `/api/staff/update` | `admin`, `garage` | Update staff member profile / permissions. |
| `POST` | `/api/staff/delete` | `admin`, `garage` | Delete staff member. |
| `POST` | `/api/people/update-pin` | Scoped | PIN rotation for garages, supervisors, delegates, staff. |

### D. Vehicle Operations (`server/routes/vehicles.ts`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/api/vehicles/check-in` | `garage`, `staff` | Authoritative check-in with capacity check, fair-use allowance, idempotency, event log, projection. |
| `POST` | `/api/vehicles/check-out` | `garage`, `staff` | Authoritative checkout with duration calculation, balance deduction, idempotency, event log, projection. |
| `POST` | `/api/vehicles/delete` | `garage`, `admin` | Cancel / delete vehicle parking record. |

### E. Subscriber Management (`server/routes/subscribers.ts`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/api/subscribers/add` | `garage`, `staff` | Add monthly subscriber with immutable plate validation and expiry calculation. |
| `POST` | `/api/subscribers/renew` | `garage`, `staff` | Renew subscriber package. |
| `POST` | `/api/subscribers/update` | `garage`, `staff` | Update subscriber details. |
| `POST` | `/api/subscribers/delete` | `garage`, `staff` | Delete subscriber record. |

### F. Delegate Operations (`server/routes/delegates.ts`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `GET` | `/api/delegates/dashboard` | `delegate` | Scoped server-side read of assigned garages, requests, and commission stats. |
| `POST` | `/api/delegates/create` | `admin` | Create delegate profile. |
| `POST` | `/api/delegates/update` | `admin` | Update delegate profile. |
| `POST` | `/api/delegates/settle-account` | `admin` | Settle earned commission ledger. |
| `POST` | `/api/delegates/delete` | `admin` | Delete delegate profile. |

### G. Financial Transactions & Recharges (`server/routes/recharges/*` -> `/api/transactions`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/api/transactions/recharge-garage` | `admin`, `delegate` | Direct balance recharge with atomic transaction, ledger write, idempotency. |
| `POST` | `/api/transactions/approve-recharge-request` | `admin` | Approve recharge request, apply balance, compute commission, write ledger. |
| `POST` | `/api/transactions/reject-recharge-request` | `admin` | Reject recharge request with reason. |
| `POST` | `/api/transactions/admin-topup-balance` | `admin` | Manual balance topup. |
| `POST` | `/api/transactions/garage-self-subscribe` | `garage` | Purchase package using available garage balance. |
| `POST` | `/api/transactions/use-referral-reward` | `garage` | Claim / apply referral credit reward. |

### H. Garage Management (`server/routes/garages.ts`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/api/garages/create` | `admin` | Create garage, initialize trial, assign package, save PIN. |
| `POST` | `/api/garages/update` | `admin`, `garage` | Update garage profile. |
| `POST` | `/api/garages/delete` | `admin` | Soft delete garage with vehicle deletion locking. |
| `POST` | `/api/garages/trial-decision` | `admin` | Approve, extend, or reject garage trial period. |
| `POST` | `/api/garages/recalculate-cars-inside` | `garage`, `admin` | Reconcile active cars inside count. |
| `POST` | `/api/garages/reconciliation` | `admin` | Garage balance and subscription reconciliation. |
| `POST` | `/api/garages/dashboard-summary/rebuild` | `admin` | Rebuild aggregated dashboard summary. |
| `GET` | `/api/garages/:id/dashboard-summary` | Scoped | Fetch cached dashboard summary. |
| `POST` | `/api/garages/rebuild-projections` | `admin` | Rebuild delta projection records. |
| `POST` | `/api/garages/:id/extend-fair-use` | `admin` | Garage-specific fair-use extension. |

### I. Reports & Administration (`server/routes/reports.ts` & `server/app.ts`)
| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `GET` | `/api/reports/financial` | `admin` | Authoritative UTC-month financial summary (`cashCollectedTotal`, recharges, etc.). |
| `POST` | `/api/admin/packages/create` | `admin` | Create package catalog entry. |
| `POST` | `/api/admin/packages/delete` | `admin` | Deactivate package (`isActive: false`). |
| `POST` | `/api/admin/announcements/create` | `admin` | Create system announcement. |
| `POST` | `/api/admin/announcements/delete` | `admin` | Delete announcement. |
| `POST` | `/api/admin/announcements/toggle` | `admin` | Toggle announcement active status. |
| `POST` | `/api/admin/coupons/create` | `admin` | Create promotional coupon. |
| `POST` | `/api/admin/coupons/update` | `admin` | Update coupon parameters. |
| `POST` | `/api/admin/coupons/delete` | `admin` | Delete coupon. |

---

## 4. Frontend API Origin & Environment Variable Inventory

### Origin Determination Logic (`src/api/apiClient.ts`):
1. If running in browser where `window.location.hostname` is `*.run.app`, `localhost`, or `127.0.0.1`:
   - Endpoint URL is relative (`/api/...`).
2. Otherwise:
   - Reads `import.meta.env.VITE_BACKEND_API_URL`.
   - If empty, undefined, or invalid (`https://run.app`):
   - Falls back to `DEFAULT_BACKEND_API_URL` (`https://rq-production-af02.up.railway.app`).

### Relevant Environment Variables:
- `VITE_BACKEND_API_URL`: Target base URL for the backend API (set on Cloudflare Pages).
- `APP_URL`: Canonical origin for CORS validation.
- `ALLOWED_ORIGINS`: Comma-separated list of additional allowed CORS origins.
- `FIREBASE_SERVICE_ACCOUNT`: Service account JSON credential for Firebase Admin SDK.
- `BACKEND_OPERATOR_TOKEN`: Protected token for diagnostic connector access (`X-Backend-Operator-Token`).
- `PROJECTION_OPERATIONS_PER_SECOND`: Tuning parameter for projection sharding.

---

## 5. Baseline Validation Status & Defect Classification

| Verification Check | Result | Details | Classification |
|---|---|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS** | 0 TypeScript errors. | Clean |
| `npm run build` | **PASS** | Builds `dist/index.html`, `dist/server.cjs`, `dist/cloud-run.cjs`, `dist/worker.js`. | Clean |
| `bun.lock` detection | **FIXED** | Deleted stray `bun.lock` to enforce `npm` single package manager rule. | Clean |
| `npm run maintainability:check` | **PASS** (with `railway.json`) / **FAIL** (if missing) | Enforces presence of `railway.json` and `build:railway` in `package.json`. | Migration-caused in commit `cd131f3` |
| `npm test` (`vitest run`) | **PASS 84/84** (with `railway.json`) / **FAIL 1 test** (if missing) | `src/__tests__/phase1FoundationAndRouting.test.ts` asserts `railway.json` existence. | Migration-caused in commit `cd131f3` |

### Failure Classification Note:
In commit `cd131f3`, Railway configuration was deleted without updating the legacy test (`phase1FoundationAndRouting.test.ts`) and maintainability check (`tools/maintainability-check.ts`). When `railway.json` is retained during transition, the test suite is 100% green (84/84 test files, 462/462 tests). In CF1/CF3, these legacy assertions will be replaced with Cloudflare Worker contract checks.

---

## 6. Pending Deployment Checks (Connector-Dependent)

As a code-only agent without deployment connectors, the following items remain **PENDING** verification by the connected agent:
1. Cloudflare account verification and Cloudflare Worker project provisioning.
2. Cloudflare Pages production/preview environment variable binding (`VITE_BACKEND_API_URL`).
3. Cloudflare Worker secrets configuration (`FIREBASE_SERVICE_ACCOUNT`, `ALLOWED_ORIGINS`, etc.).
4. Deployed Worker health check (`$WORKER_URL/api/health`).
5. Live Firebase Authentication token verification and live Firestore transactions from Cloudflare Worker runtime.

---

## 7. Migration Freeze

No unrequested code refactoring, schema changes, or UI modifications will be introduced. The current follow-up work proceeds checkpoint-by-checkpoint following `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`.
