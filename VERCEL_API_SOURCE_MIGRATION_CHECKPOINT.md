# Vercel API Source Migration Checkpoint

**Repository:** `tarekhamada875-droid/RQ-`
**Working tree:** `/home/ubuntu/RQ-`
**Branch:** `main`
**Purpose:** Safely migrate Vercel from the tracked generated `api/index.js` bundle to a source-based `api/index.ts` serverless entry point.

## Safety rule

Do **not** remove `api/index.js`, change the production rewrite, or promote a migration until a Vercel preview deployment has passed the complete API and browser validation gates. The current production API is working and must remain the rollback baseline.

## Current production baseline

- Frontend: `https://rq-acg.pages.dev`
- Backend: `https://parqv2.vercel.app`
- Current API entry: tracked generated `api/index.js` (approximately 6.96 MB)
- Current rewrite: `/api/(.*)` → `/api/index.js`
- Baseline checks already observed:
  - `GET /api/health` → HTTP 200 JSON
  - `GET /api/system-config` → HTTP 200 JSON
  - CORS from `https://rq-acg.pages.dev` → allowed
  - unauthenticated `POST /api/auth/verify-pin` → HTTP 401 JSON
  - live browser fetch from Cloudflare to Vercel → received and handled 401 correctly

## Migration stages

### M0 — Checkpoint and baseline

Status: **completed**

- [x] Create this checkpoint file.
- [x] Record production URLs, entry point, rewrite, and rollback rule.
- [x] Confirm repository starts clean before migration work.

### M1 — Direct source entry point

Status: **completed**

- [x] Add `api/index.ts` exporting the existing Express `app` from `server/app`.
- [x] Keep `api/index.js` unchanged and tracked.
- [x] Do not change production configuration yet.
- [x] Run local TypeScript validation and `git diff --check`.
- [x] Update this file after validation passed.

### M2 — Preview configuration

Status: **pending**

- [ ] Prepare a branch/commit for Vercel preview testing.
- [ ] Configure Vercel to discover `/api/index.ts` directly, while preserving the SPA fallback after API routing.
- [ ] Stop generating `api/index.js` only in the migration branch after the direct-source entry is proven locally; do not delete the old artifact until preview succeeds.
- [ ] Ensure preview environment variables contain all Firebase Admin/server secrets.
- [ ] Update this file after local config validation.

### M3 — Local validation

Status: **pending**

Required commands:

```bash
npm ci
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

Required checks:

- API entry compiles from TypeScript source.
- No credentials are embedded in source or generated output.
- Existing `api/index.js` remains available for rollback.
- No route returns SPA HTML instead of API JSON.

### M4 — Vercel preview validation

Status: **pending**

Deploy the migration branch as a Vercel preview. Test the preview URL:

```bash
curl -i https://PREVIEW_URL/api/health
curl -i https://PREVIEW_URL/api/system-config
curl -i -X OPTIONS https://PREVIEW_URL/api/auth/verify-pin \
  -H 'Origin: https://rq-acg.pages.dev' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type, authorization'
curl -i -X POST https://PREVIEW_URL/api/auth/verify-pin \
  -H 'Origin: https://rq-acg.pages.dev' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Expected:

- Health: 200 JSON.
- System config: 200 JSON.
- CORS preflight: 204 with `access-control-allow-origin: https://rq-acg.pages.dev`.
- Unauthenticated auth test: 401 JSON, never HTML.
- Frontend routes: 200 HTML.
- Browser fetch from the Cloudflare frontend can reach the preview API if the preview origin is allowlisted for testing, or equivalent direct-origin API checks pass.
- No Firebase Admin initialization/import/runtime errors in Vercel logs.

### M5 — Production cutover

Status: **blocked until M4 passes**

- [ ] Merge only the validated migration.
- [ ] Confirm production deployment succeeds.
- [ ] Run all production smoke tests again.
- [ ] Monitor runtime errors.
- [ ] Keep the previous deployment available for immediate rollback.
- [ ] Only after successful verification remove `api/index.js`, `serverless/api-entry.ts`, and the old bundle-generation command if they are no longer needed.

## Rollback

If any preview or production check fails:

1. Do not delete the old generated bundle.
2. Restore the rewrite to `/api/index.js`.
3. Restore the prior build command if changed.
4. Redeploy/revert to the last known-good commit.
5. Re-run health, system-config, auth, and CORS smoke tests.

## Resume instructions for the next agent/account

1. Read this file completely.
2. Run `git status --short` and `git log -3 --oneline`.
3. Never assume a stage is complete unless its validation result is recorded here.
4. Continue from the first stage marked `pending`.
5. Update this file immediately after each validated milestone.
6. Do not ask for production approval merely to create a preview; production cutover remains blocked until preview gates pass.

## Validation log

- 2026-09-17: M0 checkpoint created; production baseline recorded.
- 2026-09-17: M1 completed. Added `api/index.ts`; `npm run lint` and `git diff --check` passed. Production `vercel.json` and tracked `api/index.js` remain unchanged.
