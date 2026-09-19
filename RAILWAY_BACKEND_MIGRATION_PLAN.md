# RQ Railway Backend Migration Plan

**Status:** Authoritative migration document  
**Repository:** `tarekhamada875-droid/RQ-`  
**Current branch:** `main`  
**Current baseline commit:** `8cda064` — `Fix generated API bundle production gate`  
**Frontend:** React/Vite on Cloudflare Pages  
**Current backend:** Express on Vercel  
**Target backend:** Express service on Railway  
**Database and authentication:** Firebase Authentication and Firestore remain unchanged

## Purpose and safety promise

This plan migrates only the backend hosting platform. It does **not** rewrite the application, change the user interface, migrate Firebase data, change Firestore collections, reset accounts, rotate credentials, or delete customer/test records.

The migration is successful only when the Railway backend is proven equivalent to the current backend through automated checks, live API checks, operation-trail checks, and owner-performed UI checks. The Cloudflare frontend must continue to use the old Vercel backend until the Railway staging and production gates pass.

> **Non-negotiable rule:** Never switch the Cloudflare frontend to Railway merely because Railway reports that a deployment is running. The switch requires a passing `/api/health` check, authentication/CORS checks, critical UI workflows, operation-trail evidence, and a tested rollback path.

## Current state and known issue

The repository currently contains a conventional Express server in `server.ts` and `server/app.ts`. The production build also produces a Vercel-specific `api/index.js` bundle. The current Cloudflare-to-Vercel arrangement has a live-routing problem: `https://parqv2.vercel.app/api/health` was observed returning the frontend HTML instead of backend JSON. The GitHub Production Gate correctly blocked release at the live smoke-check step.

This migration uses Railway to give the backend its own service URL. The desired separation is:

```text
Cloudflare Pages frontend
        |
        | HTTPS API requests through VITE_BACKEND_API_URL
        v
Railway Express backend
        |
        | Firebase Admin SDK
        v
Firebase Authentication + Firestore
```

Vercel remains available as the rollback backend until Railway has completed the post-cutover observation period.

## What must not change

The migration agent must preserve the following contracts:

- Existing API route paths, HTTP methods, request validation, response shapes, and error codes.
- Firebase project, Firestore database, Firestore rules, indexes, Authentication users, and existing data.
- Role behavior for admin, supervisor, delegate, garage owner, and staff.
- Session claim, release, expiry, and heartbeat behavior.
- Vehicle check-in, check-out, refund, deletion, and correction semantics.
- Recharge, package, subscriber, delegate settlement, and financial idempotency behavior.
- Correlation IDs, operation IDs, operation traces, domain events, activity logs, and projection updates.
- Cloudflare frontend behavior and URLs until the explicit cutover step.
- The existing Vercel deployment and rollback target until Railway is verified.

Do not introduce a database migration as part of this hosting migration. Do not run cleanup scripts. Do not change PINs, passwords, Firebase rules, billing settings, or production data.

## Success criteria

The migration may be declared successful only when all of the following are true:

1. Railway builds and starts the current backend from the approved commit.
2. Railway exposes a stable HTTPS backend URL.
3. Railway health checks use `/api/health` and receive backend JSON, not the SPA HTML.
4. The health response reports `status: ok`, `adminSdk: true`, and a non-unknown release version.
5. CORS accepts the production Cloudflare origin and rejects unapproved origins.
6. Unauthenticated API requests return the expected JSON error responses.
7. Authenticated owner/admin/delegate/staff workflows work in a controlled test account.
8. Firebase records are written to the existing project and expected collections.
9. Operation traces, domain events, activity logs, idempotency records, and projections remain linked and correct.
10. The owner completes the manual UI test matrix and confirms the visible results.
11. The Cloudflare frontend can switch to Railway by changing only `VITE_BACKEND_API_URL`.
12. A rollback to Vercel is documented, available, and tested.
13. The repository’s automated Production Gate passes, including the live release smoke check against the actual backend URL.

## Migration phases

### Phase 0 — Freeze the baseline

Before creating or changing any Railway service:

- [ ] Confirm the working tree is clean.
- [ ] Confirm the checked-out branch is `main`.
- [ ] Confirm the baseline commit is recorded in this document.
- [ ] Run `git fetch origin` and confirm the migration starts from the current `origin/main`.
- [ ] Save the current Vercel deployment URL and its last known-good deployment/commit.
- [ ] Confirm Cloudflare currently points to the Vercel backend and record that value.
- [ ] Confirm no Firebase data mutation is planned.
- [ ] Create a migration evidence folder outside Git or in the approved release records. Never place secrets in it.

Baseline commands:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short
git log -1 --oneline --decorate
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm test -- --maxWorkers=1
npm run build
npm run maintainability:check
git diff --check
```

**Gate:** all checks pass and the baseline commit is recorded.

### Phase 1 — Prepare the Railway service without changing source behavior

Create a Railway project with separate environments if available:

- `staging` for migration validation.
- `production` for the final cutover.

Connect Railway to the GitHub repository and configure deployment from the migration branch or selected commit. Do not point the production Cloudflare frontend to Railway yet.

Recommended Railway settings:

| Setting | Required value |
|---|---|
| Source | `tarekhamada875-droid/RQ-` |
| Branch for staging | Dedicated migration/staging branch or approved commit |
| Build command | `npm run build:server` or `npm run build` according to the chosen artifact strategy |
| Start command | `npm start` |
| Runtime | Node.js 22 or the project’s supported Node version |
| Port | Railway-provided `PORT`; the server must bind to `0.0.0.0` |
| Healthcheck path | `/api/health` |
| Healthcheck expectation | HTTP 200 JSON with `status: ok` and `adminSdk: true` |
| Region | Select the region closest to the primary users, subject to Railway availability |
| Replicas | Start with one replica; increase only after load evidence supports it |
| Sleep/serverless mode | Do not enable during the first production pilot if cold-start behavior could affect operations |

The existing `server.ts` already listens on `0.0.0.0` and uses `process.env.PORT`, which is compatible with Railway’s service model. Verify this in the deployed logs rather than assuming it.

### Phase 2 — Configure secrets safely

Set secrets in Railway’s Variables interface. Never commit values to GitHub, this plan, screenshots, or chat.

Required or conditionally required variables must be reviewed against the current `.env.example`, `server/firebaseAdmin.ts`, and production configuration:

| Variable | Purpose | Handling |
|---|---|---|
| `NODE_ENV=production` | Production runtime behavior | Set in Railway |
| `PORT` | Service port | Let Railway provide it unless Railway requires an explicit value |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK server credential | Store only as a Railway secret; validate JSON format |
| `APP_URL` | Canonical backend/application URL where used | Set to the intended Railway backend URL if the application requires it |
| `ALLOWED_ORIGINS` | Explicit CORS allowlist | Include the Cloudflare production origin and approved staging origin only |
| `GIT_COMMIT_SHA` or equivalent | Health/version evidence when platform injection is unavailable | Set through deployment configuration only if needed |
| `GEMINI_API_KEY` | Only if a server-side feature genuinely uses it | Never expose it to the browser; do not add it merely for migration |
| `VITE_BACKEND_API_URL` | Frontend build-time API URL | Set in Cloudflare, not Railway; leave unchanged until cutover |

Before deployment, compare the exact production variable names with the current Vercel variables. Do not copy values into a local file. Verify that Firebase Admin initialization selects the intended Firebase project.

**Gate:** Railway logs show successful Firebase Admin initialization for the intended project without exposing credential material.

### Phase 3 — Deploy the Railway staging backend

Deploy the backend without changing Cloudflare. Obtain the Railway public HTTPS URL, for example:

```text
https://<service>.up.railway.app
```

Do not use an example URL in configuration. Record the actual URL in the private release evidence.

Run these checks against the Railway staging URL:

```bash
curl -i "$RAILWAY_BASE_URL/api/health"
curl -i "$RAILWAY_BASE_URL/api/system-config"
curl -i -X POST "$RAILWAY_BASE_URL/api/auth/verify-pin" \
  -H 'Content-Type: application/json' \
  --data '{}'
curl -i -X OPTIONS "$RAILWAY_BASE_URL/api/auth/verify-pin" \
  -H 'Origin: https://rq-acg.pages.dev' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type, authorization'
```

Expected behavior:

- `/api/health`: HTTP 200 JSON, `status: ok`, `adminSdk: true`, and a known version.
- `/api/system-config`: the documented JSON response without returning SPA HTML.
- Unauthenticated PIN verification: expected HTTP 401 JSON.
- CORS preflight: allows the approved Cloudflare origin and requested headers.
- Unknown API route: JSON error or documented 404, never frontend HTML.
- Root/frontend route: this backend does not need to serve the frontend for the Cloudflare split architecture.

Use the existing `release:smoke` script only after setting the base URL and expected version:

```bash
SMOKE_BASE_URL="$RAILWAY_BASE_URL" \
SMOKE_EXPECTED_VERSION="$EXPECTED_COMMIT_SHA" \
npm run release:smoke
```

If the health endpoint returns HTML, a 200 without JSON, an unknown version, `adminSdk: false`, or a Firebase error, stop. Do not continue to UI testing until the service routing or environment variables are corrected.

### Phase 4 — Run technical and operation-trail validation

Run the complete repository gate against the Railway migration commit:

```bash
npm run ci:check
npm run maintainability:check
npm run release:smoke
```

Run focused live checks for:

- Authentication and session claim/release.
- Role and tenant isolation.
- Vehicle check-in and check-out.
- Duplicate/retry behavior with the same idempotency key.
- Idempotency-key reuse with different parameters.
- Recharge/package operations using controlled test data.
- Subscriber operations.
- Delegate and settlement operations.
- Dashboard summaries and rebuild date validation.
- Admin operations.

For every critical API action, confirm that the Railway backend produces:

```text
API trace
+ correct authenticated actor and garage scope
+ correct status and duration
+ expected business activity log
+ expected domain event where applicable
+ expected projection update where applicable
+ no duplicate effect after retry
```

Check Firebase in the existing project. The migration must not create a second database or write to a development project by accident.

### Phase 5 — Owner manual UI validation

The owner should use a staging frontend configured to call the Railway staging backend. The owner does not need to inspect code, Firebase, or logs.

Test each role that exists in the application:

- Admin login and logout.
- Garage-owner login and logout.
- Delegate login and logout.
- Supervisor login and logout.
- Staff login and logout.

For the garage owner and staff workflows:

- Create or use the approved test garage.
- Add or register a test vehicle.
- Check it in.
- Confirm it appears inside.
- Refresh the page.
- Check it out.
- Confirm counts, time, and financial display are correct.
- Test subscriber actions if applicable.
- Test recharge/package actions if authorized.
- Review the dashboard and reports.

For admin and delegate workflows, test the actions that those roles are allowed to perform. Also test that an unauthorized action is visibly rejected.

The owner’s report can remain simple:

```text
Role: Garage owner
Approximate time: YYYY-MM-DD HH:MM Cairo time
Actions: login, check-in, dashboard, check-out, logout
Visible result: passed / failed
Notes: describe anything unexpected
```

The technical reviewer matches the approximate time and action to the operation trail and business records. A UI pass without matching backend evidence is not a complete pass.

**Gate:** all critical UI workflows pass and the technical operation trail agrees with the visible result.

### Phase 6 — Prepare Railway production

Only after staging passes:

- [ ] Create or select the Railway production environment.
- [ ] Configure production variables from the approved inventory.
- [ ] Confirm the production Firebase project is the intended existing project.
- [ ] Configure `/api/health` as the Railway healthcheck path.
- [ ] Configure a custom backend domain if desired. Use the Railway-generated domain first for validation.
- [ ] Confirm TLS is active.
- [ ] Confirm logs and deployment notifications are visible to the responsible person.
- [ ] Confirm the previous Vercel backend remains available.
- [ ] Record the Railway production URL and exact deployment commit.
- [ ] Deploy the same commit that passed staging. Do not rebuild from an uncommitted local tree.

### Phase 7 — Cut over Cloudflare safely

The Cloudflare frontend uses the build-time variable `VITE_BACKEND_API_URL`. Change it only after Railway production health and smoke tests pass.

Cutover sequence:

1. Verify Railway production `/api/health` returns the expected JSON.
2. Verify Railway production CORS allows the Cloudflare production origin.
3. Set Cloudflare Pages production `VITE_BACKEND_API_URL` to the Railway backend URL.
4. Deploy the frontend from the same approved release commit.
5. Open the Cloudflare production site in a clean browser session.
6. Run the live frontend-to-Railway smoke test.
7. Perform owner UI tests on the production frontend using controlled test data.
8. Inspect Railway logs, operation traces, Firebase events, and activity logs.
9. Keep Vercel available and unchanged during the observation period.

Do not configure the Railway URL as a relative frontend path unless the deployment architecture explicitly changes. The Cloudflare Pages site is frontend-only and must call the separate Railway API URL.

### Phase 8 — Observe and decide

Observe the cutover for at least five operating days or the agreed pilot period before decommissioning Vercel.

Monitor:

- Railway health and deployment status.
- Backend 4xx/5xx rates.
- Request duration and timeout rates.
- Authentication/session failures.
- Firebase Admin initialization errors.
- Vehicle, financial, and projection reconciliation.
- Missing operation traces.
- Firebase reads/writes and billing.
- User-reported problems.

The migration is not complete until the service owner approves the evidence pack and the rollback target remains available.

## Rollback plan

Rollback is a normal safety action, not a failure.

### Application rollback

If the Railway backend is unhealthy but Cloudflare has not yet been switched:

- Leave Cloudflare unchanged.
- Roll back or stop the Railway deployment.
- Fix Railway in staging.

If Cloudflare has already been switched:

1. Restore Cloudflare’s `VITE_BACKEND_API_URL` to the known-good Vercel backend URL.
2. Redeploy Cloudflare Pages.
3. Run the live smoke test against Vercel.
4. Re-run login, check-in, check-out, and one financial smoke test.
5. Keep Railway isolated until the cause is understood.

### Data safety during rollback

Both Railway and Vercel must use the same Firebase project and compatible application version during the migration. Do not roll back to a backend version that cannot understand records written by the newer version.

If any financial or vehicle state is ambiguous:

- Stop further mutations if safe to do so.
- Preserve the operation IDs, correlation IDs, activity records, domain events, and Firebase timestamps.
- Do not manually edit business records without an approved correction procedure.
- Reconcile from the authoritative transaction/event records before resuming service.

## Common failure modes and responses

| Symptom | Likely cause | Response |
|---|---|---|
| `/api/health` returns frontend HTML | Wrong URL, rewrite, or frontend deployed at the backend address | Use the Railway service URL and test the exact `/api/health` path |
| Health returns `adminSdk: false` | Missing/invalid Firebase Admin credentials | Correct Railway variables; do not change application data |
| CORS failure in browser | Cloudflare origin missing from `ALLOWED_ORIGINS` | Add only the exact approved origin and redeploy |
| 401 for all authenticated requests | Firebase project, token, or clock/config mismatch | Verify project ID, Admin credentials, Auth configuration, and logs |
| UI works but no operation trace | Trace write failure or wrong Firebase project | Inspect Railway logs and Firebase project; do not declare evidence complete |
| Duplicate vehicle/financial effect | Idempotency or transaction regression | Stop migration and investigate before customer use |
| 404/405 for API routes | Incorrect start command, route path, or frontend fallback | Check Railway start logs and direct curl responses |
| Deployment healthy but requests time out | Resource sizing, Firebase latency, or platform configuration | Review duration and logs; test before adding replicas |
| Unexpected Firebase cost | Duplicate listeners, trace accumulation, or wrong workload | Verify TTL, read/write counts, and dashboard query paths |

## Files and commands the next agent must know

### Important source files

- `server.ts` — long-running Express entrypoint; binds to `0.0.0.0` and `process.env.PORT`.
- `server/app.ts` — middleware, route mounting, health endpoint, and global app composition.
- `server/firebaseAdmin.ts` — server-side Firebase Admin initialization.
- `server/middleware.ts` — authentication, correlation IDs, timeouts, rate limiting, and authorization context.
- `server/operationTrace.ts` — durable privacy-safe API traces.
- `server/events.ts` — transactional domain events linked to trace context.
- `src/api/apiClient.ts` — frontend API base URL, auth token, correlation ID, and operation ID headers.
- `server/routes/*` — business routes.
- `serverless/api-entry.ts` — Vercel-specific entrypoint; not needed by Railway’s normal `npm start` service.
- `Dockerfile` — existing container build path; use only if Railway is configured for Docker deployment.
- `vercel.json` — legacy Vercel routing; do not modify as part of the initial Railway migration.
- `.env.example` — variable-name reference; it is not a source of secret values.

### Required local checks

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm test -- --maxWorkers=1
npm run build
npm run maintainability:check
npm run release:smoke
npm run ci:check
git diff --check
```

For a local backend check, set safe test variables and run:

```bash
npm start
curl -i http://127.0.0.1:3000/api/health
```

Do not use real production credentials in local shells or commit local environment files.

## Commit and handoff rules

Each migration milestone must be a small, reviewable commit. The commit message must state the migration phase. After each push, record:

- Commit SHA.
- Railway environment and deployment URL.
- Checks run and results.
- Any unresolved risk.
- Whether Cloudflare was changed.
- Whether Firebase data or configuration was changed. The expected answer during this hosting migration is **no**.

At the end of the migration, update this document’s status and validation log. Do not create another competing migration plan.

## Explicit no-go conditions

Do not cut over to Railway if any of the following is true:

- Health returns HTML, unknown version, or `adminSdk: false`.
- CORS is broad, missing, or untested.
- Firebase points to the wrong project.
- Any critical UI action has no matching backend evidence.
- Vehicle or financial data differs after a test or retry.
- Operation traces, domain events, or activity logs are missing unexpectedly.
- Backup/recovery and rollback are not available.
- The owner has not completed the manual role/action tests.
- The Railway deployment commit differs from the validated commit.
- The Vercel rollback target is unavailable.

## References

[1]: https://docs.railway.com/guides/deploy-node-express-api-with-auto-scaling-secrets-and-zero-downtime "Railway Node.js and Express deployment guide"

[2]: https://docs.railway.com/overview/advanced-concepts "Railway deployment, health checks, networking, environments, and observability"

[3]: https://docs.railway.com/pricing "Railway pricing documentation"

[4]: https://firebase.google.com/docs/firestore/ttl "Firebase Firestore TTL policies"

[5]: https://firebase.google.com/docs/firestore/security/rules-conditions "Firebase Firestore Security Rules conditions"
