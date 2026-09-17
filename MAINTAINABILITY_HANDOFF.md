# RQ Maintainability Handoff

**Purpose:** Durable execution plan for improving maintainability, onboarding, deployment safety, and feature velocity in `tarekhamada875-droid/RQ-`.

**Last updated:** 2026-09-17
**Current branch:** `main`
**Current commit at handoff update:** `afb417e` plus the uncommitted M1 maintainability changes described below.

## Resume first

```bash
cd /home/ubuntu/RQ-
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short
git log -3 --oneline --decorate
```

Read this file before changing architecture. Update the status and validation log after every completed milestone.

## Current architecture

The browser frontend is built with Vite and deployed to Cloudflare Pages at `https://rq-acg.pages.dev`. The backend is an Express application bundled as a Vercel serverless function and deployed at `https://parqv2.vercel.app`. Cloudflare Pages is configured with `VITE_BACKEND_API_URL=https://parqv2.vercel.app`.

`api/index.js` is a generated but currently required Vercel function bundle. It is tracked in Git because Vercel must discover the `/api` function during deployment. Do not edit it manually. Change `server/`, `serverless/`, or shared source files, run `npm run build`, and commit the regenerated bundle with the source change.

## Baseline findings

- `api/index.js`: approximately 6.7 MB and approximately 152,000 generated lines.
- `server/app.ts`: 1,669 lines and contains too many route and business responsibilities.
- Largest UI files include `AdminGarageDetailsView.tsx`, `GarageDashboardView.tsx`, `DelegateDashboardView.tsx`, and `SubscribersView.tsx`.
- `package.json` declares npm as the package manager. `package-lock.json` is authoritative; `bun.lock` is legacy and should not be used for CI or deployment.
- Automated baseline: 41 test files and 248 tests passed; TypeScript and production build passed.

## Execution plan

### M1 — Durable documentation and repository policy

Status: **completed; commit pending**

- [x] Create this handoff file.
- [x] Add a root README with setup, architecture, environment, commands, deployment, generated-file, security, and smoke-test guidance.
- [x] Add contributor guidance for safe feature work and generated artifacts.
- [x] Decide and document npm as the supported package manager; remove the unused Bun lockfile.
- [x] Add CI checks for required generated artifacts, rewrite ordering, documentation, and embedded secrets.

Validation completed: `npm test` passed 41 files and 248 tests; `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check` passed.

### M2 — Backend boundary refactor

Status: **completed; commit pending**

Extracted authentication and session routes from `server/app.ts` without changing route paths, middleware order, response contracts, CORS behavior, or authorization checks. Existing authentication and session tests remained the contract during the move.

- [x] Added `server/routes/auth.ts` with the authentication and session handlers.
- [x] Mounted the router under `/api`, preserving existing `/api/auth/*` paths.
- [x] Removed stale authentication-only imports from `server/app.ts`.
- [x] Reduced `server/app.ts` from 1,669 lines to 887 lines.

Suggested target modules:

- `server/routes/auth.ts`
- `server/routes/sessions.ts`
- `server/routes/systemConfig.ts`
- `server/routes/admin.ts`

Keep `server/app.ts` focused on application construction, middleware, route mounting, and global error handling.

Validation completed: `npm run lint`, `npm test`, `npm run build`, `npm run maintainability:check`, and `git diff --check` passed. The generated `api/index.js` was regenerated with the refactor.

### M3 — UI component boundary refactor

Status: **in progress; first screen split completed**

Split the largest dashboards by responsibility rather than by arbitrary line count. Preserve visual behavior, Arabic translations, mobile layout, and existing test contracts.

- [x] Extracted garage dashboard overlays and modal rendering into `GarageDashboardOverlays.tsx`.
- [x] Kept data fetching, state ownership, and callbacks in `GarageDashboardView.tsx`.
- [x] Reduced `GarageDashboardView.tsx` from 1,172 to 1,059 lines.
- [ ] Split `AdminGarageDetailsView.tsx`.
- [ ] Split `DelegateDashboardView.tsx`.
- [ ] Split `SubscribersView.tsx`.

Suggested first targets:

- `GarageDashboardView.tsx`: header, stats, vehicle operations, subscriber operations, and action panels.
- `AdminGarageDetailsView.tsx`: garage identity, package/balance, PIN/security, and vehicle/subscriber sections.
- `DelegateDashboardView.tsx`: summary, operations, recharge, and activity sections.

Validation required after each screen: full tests, typecheck, build, and manual or browser verification of the affected routes.

### M4 — Generated bundle strategy

Status: **pending investigation**

Do not remove tracked `api/index.js` until a replacement Vercel function layout has been deployed and verified. Investigate a small tracked `api/index.ts` or `api/index.js` wrapper and confirm whether Vercel bundles imports from `serverless/api-entry.ts` correctly. Keep the current known-good arrangement as the fallback.

Success criteria: API routes remain JSON-backed in production, `/api/health` reports the deployed commit, and the generated bundle is no longer required as a large source-controlled artifact.

### M5 — Final validation and handoff

Status: **pending**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Then verify in production:

```bash
curl -i https://parqv2.vercel.app/api/health
curl -i https://parqv2.vercel.app/api/system-config
curl -i -X POST -H 'content-type: application/json' --data '{}' https://parqv2.vercel.app/api/auth/verify-pin
```

Expected results are HTTP 200 JSON for health and system configuration, and HTTP 401 JSON for authentication without a Firebase token.

## Change safety rules

1. Never commit secrets, service-account JSON, private keys, or real credentials.
2. Never delete production data or change authentication credentials without explicit user authorization.
3. Do not edit generated `api/index.js` manually.
4. Keep the frontend/backend deployment split intact unless the replacement has been tested end to end.
5. Update this file after each milestone with the commit SHA, validation commands, and any remaining risk.

## Validation log

### 2026-09-17 — Baseline audit

- Repository audit completed.
- Confirmed largest tracked artifact is `api/index.js` at approximately 6.7 MB.
- Confirmed `server/app.ts` is 1,669 lines.
- Confirmed npm is declared as the package manager.
- Confirmed current production API routing is healthy at commit `afb417e`.
- No source changes made yet for the maintainability work.

### 2026-09-17 — M1 documentation and repository policy

- Added `README.md` with architecture, setup, deployment, API smoke tests, security rules, and generated-file policy.
- Added `CONTRIBUTING.md` with feature-boundary, validation, security, and generated-bundle guidance.
- Added `tools/maintainability-check.ts` and wired it to `npm run maintainability:check` and the Production Gate workflow.
- Removed the unused `bun.lock`; npm remains the supported package manager.
- Validation passed: 41 test files, 248 tests, TypeScript, production build, maintainability check, and diff check.
- The secret scanner was corrected to ignore SDK source literals and public Firebase client-key formats while rejecting embedded PEM blocks and service-account credentials.
- Next milestone is M2: extract authentication/session responsibilities from `server/app.ts` without changing production contracts.

### 2026-09-17 — M2 authentication/session extraction

- Moved `/api/auth/*` handlers into `server/routes/auth.ts`.
- Mounted the extracted router with `app.use('/api', authRouter)` so all production paths remain unchanged.
- Reduced `server/app.ts` from 1,669 to 887 lines.
- Validation passed: TypeScript, 41 test files, 248 tests, production build, maintainability check, and diff check.
- The generated `api/index.js` changed as expected and remains tracked for Vercel discovery.
- Next milestone is M3: split the largest dashboard components by responsibility while preserving UI behavior.

### 2026-09-17 — M3 first garage dashboard split

- Added `src/components/garage/GarageDashboardOverlays.tsx` for the locked-garage overlay and dashboard modal rendering.
- Reduced `GarageDashboardView.tsx` from 1,172 to 1,059 lines without changing parent state ownership.
- Validation passed: TypeScript, 41 test files, 248 tests, production build, maintainability check, and diff check.
- Remaining M3 work is intentionally staged: admin garage details, delegate dashboard, and subscribers view.

## Handoff rule

If work stops because of token, account, or session limits, the next agent must continue from the first unchecked item in this file, validate the completed milestone, commit it, and update this file before starting a new milestone.
