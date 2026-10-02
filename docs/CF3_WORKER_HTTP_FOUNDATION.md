# CF3 Worker HTTP Foundation Report

**Date:** 2026-10-02  
**Branch:** `cloudflare-worker-migration`  
**Status:** Implemented, Tested, and Verified

---

## 1. Overview

Checkpoint CF3 establishes the shared HTTP foundation for the Cloudflare Worker architecture before porting full business logic routes:
1. Standardized pipeline: Correlation ID, Operation ID, request timing, error normalization, and scoped CORS.
2. Operator diagnostics: `X-Backend-Operator-Token` verification without compromising browser Auth tokens.
3. Worker authentication middleware: `requireWorkerAuth` extracting and validating Bearer tokens against Firebase Auth.
4. Direct Foundation Routes:
   - `GET /api/health`
   - `GET /api/version`
   - `GET /api/system-config`
   - `POST /api/admin/update-system-config`
5. Updated maintainability check and regression tests for the Cloudflare Worker target contract.

---

## 2. Middleware Architecture

### A. Correlation & Operation IDs
- Extracts `X-Correlation-ID` (or `X-Request-ID`) or auto-generates `corr_<timestamp>_<random>`.
- Extracts `X-Operation-ID` or auto-generates `op_<timestamp>_<random>`.
- Guarantees both headers are set on all responses (successes and errors).

### B. Error Normalization (`workerApp.onError`)
- Formats all uncaught errors into the standardized JSON envelope:
  ```json
  {
    "success": false,
    "error": "ERROR_MESSAGE",
    "statusCode": 500,
    "correlationId": "corr_...",
    "timestamp": "2026-10-02T..."
  }
  ```

### C. Scoped Multi-Tenant CORS
- Explicit allowlist via `isAllowedOrigin`:
  - Production Pages origin (`https://rq-acg.pages.dev`).
  - Allowed custom preview origins.
  - Rejects unapproved origins for authenticated operations (no wildcard `origin: '*'` on protected endpoints).

### D. Operator & Worker Authentication
- `X-Backend-Operator-Token`: Allows diagnostic tool access (`Backend Operator`, `admin` role) when matching `BACKEND_OPERATOR_TOKEN`.
- Bearer ID token: Validates Firebase Auth ID token and loads user profile (`admin`, `garage`, `staff`, `worker`).

---

## 3. Wired Foundation Endpoints

1. **`GET /api/health`**
   - Reports process status, `adminSdk: boolean`, environment, and timestamp.
2. **`GET /api/version`**
   - Reports `version: '1.0.0'`, runtime, operational status.
3. **`GET /api/system-config`**
   - Direct read from `system_config/global` in Firestore, returning default fallback configuration if document does not exist yet.
4. **`POST /api/admin/update-system-config`**
   - Enforces admin role. Updates wallet number, trial days, flat fees, and maintenance status.

---

## 4. Maintainability & Test Updates

- **`tools/maintainability-check.ts`**: Updated to assert that `wrangler.toml` exists, is non-empty, and targets `server/cloudflareWorker.ts` with `nodejs_compat`. Retains check for `package.json` package manager (`npm@`) and `build:cloudflare`.
- **`src/__tests__/phase1FoundationAndRouting.test.ts`**: Updated test 1 to assert deployment configuration (`wrangler.toml`).
- **`src/__tests__/cloudflareWorkerFoundation.test.ts`**: Added 6 tests verifying correlation IDs, system config, admin updates, operator token authorization, and CORS policy.

---

## 5. Local Validation Results

- `npx vitest run src/__tests__/cloudflareWorker*.test.ts src/__tests__/phase1FoundationAndRouting.test.ts`: **21 / 21 tests passed**.
- `npm run lint` (`tsc --noEmit`): **PASS** (0 errors).
- `npm run maintainability:check`: **PASS**.
- `npm run build:cloudflare`: **PASS** (6.8 MB uncompressed / 1.26 MB gzipped).

---

## 6. Pending Connected-Agent Actions

1. Deploy updated Worker foundation:
   ```bash
   npx wrangler deploy -e preproduction
   ```
2. Verify live edge responses:
   ```bash
   curl -i https://rq-backend-pre.<subdomain>.workers.dev/api/health
   curl -i https://rq-backend-pre.<subdomain>.workers.dev/api/system-config
   ```

---

## 7. Rollback Instructions

```bash
git revert <CF3_COMMIT_SHA>
```
Railway backend remains running and unaffected during this stage.
