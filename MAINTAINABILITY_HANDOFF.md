# Maintainability Handoff

**Status:** Active
**Production frontend:** Cloudflare Pages — `https://rq-acg.pages.dev`
**Production backend:** Cloudflare Worker — `https://rq.tarekhamada875.workers.dev`
**Data/authentication:** Firebase Authentication and Firestore

## Current source of truth

`main` is the production source of truth. Cloudflare Pages deploys the frontend from `main`; the guarded GitHub Actions workflow deploys the Worker after validation. The branch and release policy is documented in [`BRANCHING_AND_RELEASES.md`](./BRANCHING_AND_RELEASES.md).

The application is a React/Vite static PWA on Cloudflare Pages connected to a Fetch-native Hono Worker. The Worker uses the Worker-compatible Firebase Auth/Firestore REST adapter. Firebase credentials remain protected Worker secrets and never enter frontend assets or Git.

## Current build contract

- Cloudflare frontend build: `npm run build:web`, publish `dist`.
- Cloudflare Worker build: `npm run build:cloudflare`.
- Cloudflare Worker deployment: `.github/workflows/cloudflare-worker-deploy.yml`.
- Live health check: `https://rq.tarekhamada875.workers.dev/api/health`.
- Live frontend check: `https://rq-acg.pages.dev`.

## Validation gate

```bash
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

Live smoke checks target the Cloudflare Worker directly and confirm JSON responses, `status: ok`, `adminSdk: true`, and the deployed Worker version.

## Structural rules

Keep business rules in focused domain modules and route modules. Preserve Firebase token verification, role and garage scoping, session lifecycle, CORS, idempotency, correlation IDs, operation traces, immutable events, and financial reconciliation.

Firestore remains authoritative. Dashboard summaries, projection buckets, cached counters, and telemetry are rebuildable read models. Do not make Node process memory authoritative and do not remove compatibility writes until reconciliation proves the replacement read model equivalent.

Do not mutate or delete production Firestore records without explicit scope and confirmation. Do not commit secrets or restore retired provider-specific deployment artifacts.

## Architecture direction

The active production architecture is **Cloudflare Pages → Cloudflare Worker → Firebase**. Railway deployment configuration and service references have been retired. Do not change production data or traffic outside an approved checkpoint and its validation gate.

## Garage deletion workflow and production verification

Garage deletion is Admin-only and server-authoritative:

- `POST /api/garages/delete` claims the job in a Firestore transaction, marks the garage as deleting, and applies a separate limit of three new starts per Admin per minute. Repeated starts while a client-step job is active reuse its lease token rather than creating another cleanup job.
- The Cloudflare Firestore adapter's `runTransaction<T>` must return the callback value **after commit**. The start and step routes depend on these values; `server/firebaseWorkerAdmin.test.ts` guards this contract.
- `POST /api/garages/delete-step` handles at most one page of 200 documents per request and commits deletions with the progress checkpoint in the same transaction. It scans the garage subcollections `vehicles`, `subscribers`, `daily_counts`, `daily_stats`, `events`, and `projection_buckets`, plus linked top-level records in `activity_logs`, `recharge_requests`, `staff`, `garage_sessions`, `private_pins`, and `pin_reservations`. Finalization occurs only after every configured query is empty; it writes an audit record, removes the garage document, and marks the job complete.
- `GET /api/garages/delete-status` is read-only. The UI checks this endpoint after ambiguous network, timeout, invalid-response, or HTTP 5xx outcomes so a committed job is not incorrectly reported as “not started.”

**Production audit — 2026-10-13:** the approved test garage `H6 Staff Trial 20261008` (`306d58b4-796d-4a6f-90cc-c64e3a8ef4fb`) first exposed a Worker transaction-result bug: the claim committed but its value was discarded, producing HTTP 500 and leaving a stale job at 0 processed records. The failed attempts persisted only claim/rate-limit state and the garage's `isDeleting` marker; no cleanup records were deleted. [PR #28](https://github.com/tarekhamada875-droid/RQ-/pull/28) corrected the adapter and added ambiguous-500 status recovery. After deployment and the Worker health smoke test, the approved cleanup completed: job status `completed` / phase `complete`, **6 records processed**; the garage document returned 404; the targeted `vehicles` and `staff` queries both returned zero; and searching the Admin garage list by the exact name returned no match. The completed worker job also confirms all configured cleanup queries were exhausted before finalization.

## Worker Firestore API compatibility

`tools/build-cloudflare.mjs` aliases the production Worker imports of `firebaseAdmin` to `server/firebaseWorkerAdmin.ts`. Keep that REST adapter's method surface compatible with the Firebase Admin methods used by Worker routes. Node route tests use a mock/SDK-style Firestore that may implement methods missing from the Worker adapter, so add contract tests directly against `firebaseWorkerAdmin.ts` for production-only methods.

**Production create bug — 2026-10-13:** Admin announcement, coupon, and subscription-plan creation routes call `collection.add()`, but the Worker adapter previously lacked that method. The Worker therefore returned a server error; the plan form caught every error and incorrectly blamed the internet. The adapter now implements `add(data)` using an auto-ID document plus `set()`, and the form distinguishes true network errors, ambiguous timeouts (check for an existing plan before retrying), and server failures with a correlation reference.

## Cross-role failure feedback follow-up — 2026-10-13

- `src/utils/apiFailure.ts` centralizes API failure classification for real network errors, timeouts, HTTP server failures, rejected requests, and unknown failures. Admin package, delegate, Admin PIN, and staff-PIN actions use it to avoid presenting every failure as an internet problem.
- `authService.checkPinAvailability()` previously swallowed request failures and returned `{ taken: false }`. It now propagates API errors and rejects malformed success responses. The server remains authoritative for uniqueness, and account forms stop when the availability check cannot be confirmed. All current callers were checked for visible error handling.
- Generic login/session catches no longer say the connection is refreshing unless an explicit offline guard detected that state. Vehicle check-in’s blank-error fallback is also neutral. Remaining explicit offline messages are on `isOnline` preflight guards.
- Regression coverage verifies API classification, PIN-check failure propagation, delegate creation stopping after an availability failure, and server-vs-network messages. This source-level sweep reduces recurrence risk; it is not a guarantee that every button across every role has received a manual end-to-end test.

**Local validation:** 663 tests passed across 109 files; TypeScript, maintainability checks, the frontend production build, and the Cloudflare Worker build all passed. No production data was changed for this follow-up.

## Financial report read bounding — 2026-10-13

- The Worker financial report now applies the same inclusive-start / exclusive-end date range in Firestore queries for both immutable events and settlements. This avoids reading records outside the requested report period; requests without dates retain the existing all-history behavior.
- A regression test verifies both the report total and lower mock Firestore reads for a bounded period.
- The two obsolete, manually dispatchable preview/rehearsal workflows were removed; the Firestore rules header and release guidance now reflect that there is no active preview deployment path.
- The Production Gate now runs the existing Firestore rules test against the demo-project emulator and labels the subscriber lifecycle check accurately.

**Local validation for this change:** 664 tests passed across 109 files; TypeScript, production build, `ci:check`, and maintainability checks passed. The Firestore rules emulator test passed using `demo-rq-unified-hono`; no production Firebase project was contacted by that test.

## Last verified local baseline

The full Vitest suite, TypeScript validation, production build, maintainability check, and Cloudflare live smoke gate must pass after every source change.


## Owner-authorized Express runtime retirement — 2026-10-13

- The owner reauthorized final Express removal after the broader Hono migration had been closed. PR #32 removed the Express and `cors` packages/types, the old app/middleware and Node bundle, the Dockerfile, and Express-only characterization tests; it is merged on `main` as `1aa48a8`.
- Hono remains the production API. Local development keeps a small Node HTTP adapter only to connect Vite to the same Hono Fetch application; the production build now emits the Cloudflare Pages frontend and Worker artifacts only.
- CORS, route availability, authentication, and correlation tests now call Hono directly. Event correlation context remains available to Hono domain events; the retired Express middleware's unused trace writer is removed.
- Archived migration notes remain as history; they do not imply Express remains in the runtime.
- The final gate passed: 105 test files / 636 tests, TypeScript, Cloudflare Pages + Worker production build, and artifact checks. Maintainability checks passed, and the Firestore rules suite passed against the local `demo-rq-unified-hono` emulator. A local smoke test returned HTTP 200 for both the Vite frontend and Hono `/api/health`.
- The post-removal production dependency audit reports 11 advisories (0 critical, 5 high, 6 moderate), primarily involving Firebase-related packages; dependency remediation remains a separate tested task.
- GitHub's main-branch Production Gate and Cloudflare Worker deployment both succeeded. Live Worker health/version and Pages smoke checks returned HTTP 200. No production Firebase records were changed.


## Owner working agreement and active-session security — 2026-10-14

- `PROJECT_WORKING_AGREEMENT.md` records how future agents and contributors should work with Tarek: communicate plainly, decide routine engineering details autonomously within authorized scope, and explain each completed item with a practical example, benefit, test evidence, and release status. This tracked document carries project preferences forward; it does not imply future accounts retain private chat memory.
- The approved JARVIS roadmap is active. **AUTH-01** was completed in PR #35 (`e53b2cba40218fc694de2528db71f45791cf629c`): protected Admin, Delegate, Garage, and Staff Worker requests require an active server-issued session. The Worker only reads the session collection for the verified role. The normal API client sends its canonical session ID in `X-Session-ID`.
- Local verification passed: 105 test files / 645 tests, `npm run ci:check`, `npm run maintainability:check`, production Pages/Worker build, and `git diff --check`. GitHub's main Production Gate passed, including Firestore security rules emulator tests and live smoke checks; the Cloudflare Worker deployment succeeded. The live Pages, Worker health, and Worker version endpoints returned HTTP 200.
- No Firestore production records were migrated or deleted by this change. The owner last confirmed synthetic pre-production on 2026-10-14; reconfirm before future tasks rely on that status.

## Firestore owner/staff rules — 2026-10-14

- **RULES-01 / scoped TEST-01:** merged to `main` in PR #37 at `2f3a61c67a8f93395cae9069d2fd2d1e71071808`. It separates an active garage-owner session from a same-garage staff session. Staff can no longer directly modify peer staff, create/delete staff records, change role/PIN/garage assignment, or change garage rates/trial fields. Direct owner/Admin staff edits are limited to validated name/phone fields; sensitive changes remain on the Worker, which also cleans up private PIN records on deletion. Owner/Admin sessions retain the protected garage-setting path, and the narrow `lastActive` heartbeat remains available.
- The emulator suite is now `tools/firestore-rules-security.test.mjs`; `npm run test:rules` runs it against the local `demo-rq-unified-hono` emulator. It verifies actual allow/deny behavior for Admin, garage owner, Staff, Delegate, sessions, `system_config`, cross-garage boundaries, and retired Supervisor records. The full local gate passed: 105 test files / 645 tests, `npm run ci:check`, TypeScript, Pages/Worker build, maintainability check, `git diff --check`, and the Firestore rules emulator matrix.
- Direct write inventory found no active client-side staff profile mutations; staff management already uses Worker routes. The legacy `garageService.claimOrRefreshGarageSession` transaction has no call sites. Session claim fallback code still exists, but direct security-session creation is already denied by rules and was not changed in this task.
- **Firebase publication — 2026-10-14:** after the owner's explicit approval, the exact `main:firestore.rules` file (39,098 bytes; SHA-256 `8404b6a6cd833deaa4192e164a43cf2f2916e38840ce52fbce650feac4634d24`) was published through Firebase Console to project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`. A fresh reload of that Security page returned the same source hash and showed no unpublished draft. This was a rules-only change; no Firestore documents were changed. It applies only to this exact target—do not assume any other Firebase project/database was updated.
- **Release boundary:** the PR Production Gate passed, as did the post-merge main Production Gate and Cloudflare Worker workflow. Cloudflare does not deploy Firestore rules; this separate Firebase publication was explicitly authorized and independently verified. Reconfirm the exact Firebase target before any future rules deployment or data operation.


## Vehicle delete/refund retry protection — 2026-10-14

- **F1 / PR #40:** merged to `main` at `c7d452c2bc5f354052d986dd58a9db804cc28749`. Delete and refund now use a dedicated shared idempotency scope across their route aliases, with a fingerprint for garage, vehicle, semantic action, and normalized requested refund amount. A true retry replays its result without additional writes; reusing the key for a different action, vehicle, or amount returns HTTP 409 with `IDEMPOTENCY_KEY_REUSE` instead of silently looking successful.
- Route-level transaction tests cover a refund retry across aliases (including equivalent numeric spellings), exactly-once event/accounting effects, and mismatched action/vehicle/amount reuse in both request orders.
- **Verification:** local full gate passed (`npm run ci:check`, 106 test files / 647 tests, lint, production build, maintainability, and Firestore rules emulator). The PR Production Gate passed on rerun; the post-merge Production Gate run `38601844831` and Worker deployment run `38601844911` both succeeded on the merge commit. The Production Gate's live Worker smoke check passed.
- **CI note:** the first PR-only attempt timed out after five seconds in the existing subscriber-pagination UI test; the single rerun and post-merge gate both passed. No F1 code change was needed for that unrelated timeout.
- **Boundary:** this Worker change modified no Firebase rules or Firestore documents. The tests confirm a valid retry causes no extra document writes; no broader Firebase cost reduction is claimed.

## Broader repository noise audit — 2026-10-15

- Removed the orphaned preview Wrangler file, preview-only Playwright smoke test/config/dependency, retired H9 rehearsal scripts, unused Docker ignore file, obsolete Cloud Run API-host branch, and an unreferenced Firestore/IP rate limiter. Removed the old `preproduction` Wrangler target because no `rq-backend-pre` Worker was deployed and that target pointed to the production Firebase project. The active Worker PIN limiter remains the Cloudflare Durable Object implementation.
- Kept `firebase-applet-preview-config.json` and its selector: `src/firebase.ts` imports the config and tests cover explicit target selection, so deleting it would change supported app behavior. Branch previews remain unsupported.
- Read-only Cloudflare checks found the old `rq-hono-preview` Worker still present, but with workers.dev disabled and no custom domains or routes. It was not deleted or modified; no Cloudflare deployment, Firebase rules change, or Firestore document operation was performed by this cleanup.
- **Verification:** `npm run ci:check` passed (TypeScript, 106 test files / 646 tests, and Pages/Worker build); `npm run maintainability:check` and `npm run test:rules` also passed. The Firestore rules matrix ran against the local demo emulator, not the live project.

## Money-event invariant (F4) — 2026-10-15

- Implemented on branch `fix/f4-money-event-invariants`; [PR #46](https://github.com/tarekhamada875-droid/RQ-/pull/46) is open. Both GitHub Production Gate checks passed on verified head `3e1e209`; review/merge remain pending, so the change is not live. New financial event amounts use a shared finite, non-negative, two-decimal parser; checkout rejects invalid calculated costs before staging writes, refund requests reject invalid input with HTTP 400, and package prices/fixed discounts follow the same precision policy.
- Historical malformed event and projection money is skipped from aggregates while operation counts remain; no source history is rewritten. Corrupt cached dashboard money is not served, and invalid daily-stat revenue cannot poison the rebuild diagnostic. This policy may understate a total when malformed historical values exist; any repair/quarantine remains a separately audited action.
- Local verification passed: `npm run ci:check` (109 test files / 736 tests, TypeScript, Pages and Worker build), `npm run test:rules` against the local demo emulator, `npm run maintainability:check`, and `git diff --check`. No production data or deployment was touched.
