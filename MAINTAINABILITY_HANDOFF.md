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

- Merged in [PR #46](https://github.com/tarekhamada875-droid/RQ-/pull/46) to `main` as `41ef58aba5b33f24cd54492a5c88201bdcc9d031` and deployed. Worker deployment run [#38704341053](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38704341053) and Production Gate run [#38704341183](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38704341183) succeeded; both live smoke checks passed, and the Worker health and Pages endpoints returned HTTP 200. New financial event amounts use a shared finite, non-negative, two-decimal parser; checkout rejects invalid calculated costs before staging writes, refund requests reject invalid input with HTTP 400, and package prices/fixed discounts follow the same precision policy.
- Historical malformed event and projection money is skipped from aggregates while operation counts remain; no source history is rewritten. Corrupt cached dashboard money is not served, and invalid daily-stat revenue cannot poison the rebuild diagnostic. This policy may understate a total when malformed historical values exist; any repair/quarantine remains a separately audited action.
- Local verification passed: `npm run ci:check` (109 test files / 736 tests, TypeScript, Pages and Worker build), `npm run test:rules` against the local demo emulator, `npm run maintainability:check`, and `git diff --check`. The guarded production deployment changed the Worker; no production Firebase data or rules were changed.

## Delegate garage-request draft preservation — 2026-10-15

- The Delegate garage-request form now prevents native browser submission before online/authorization guards run and closes only when `createNewGarage` returns success. Validation, duplicate-PIN, offline, and API failures therefore leave the entered draft visible for correction or retry.
- Regression tests verify that a false result keeps the form and draft open, successful creation closes it, and native form navigation is prevented.
- **Local verification:** `npm run ci:check` passed (109 test files / 741 tests, TypeScript, and Pages/Worker build); `npm run lint`, `npm run maintainability:check`, `npm run test:rules` against the local demo emulator, and `git diff --check` passed. No production records were changed by this code-only fix.

## JARVIS Phase 1 polling and staff-login read hardening — 2026-10-15

- **FE-003 / PR #50:** `useGarageSync` now keys Delegate polling by stable `delegate.id` instead of the full profile object, so same-ID profile refreshes do not restart the interval. Regression tests cover the five-loads-per-minute ceiling, same-ID refresh, ID changes, timer cleanup, and late responses after unmount. Merged on `main` as `debe379`.
- **FE-004 / PR #51:** staff login now reuses the first linked-garage snapshot after status validation instead of issuing a second `getDoc`, saving one Firestore read and network round trip on successful staff login. Pending/rejected guards, session release, PIN scrubbing, and missing-garage behavior remain covered. Merged on `main` as `ea492c8`.
- **Verification:** FE-003 local validation passed (`npm run ci:check`, 110 test files / 744 tests, lint, maintainability, and Firestore rules emulator); FE-004 passed (`npm run ci:check`, 111 test files / 748 tests, lint, maintainability, and Firestore rules emulator). PR Production Gates passed for both. Post-merge Production Gate and Cloudflare Worker deployment/smoke runs also passed for FE-003 (`38717172898`, `38717172595`) and FE-004 (`38718650321`, `38718650374`).
- **Boundary:** these changes modify client-side polling and read reuse only. No production Firestore records or rules were changed.

## Recharge fallback listener cleanup (FE-005) — 2026-10-15

The recharge-log subscription now owns both the indexed listener and its bounded fallback listener. Closing the view unsubscribes both and releases the listener tracker exactly once; callbacks arriving after close are ignored. The fallback query remains capped at 100 records. Regression tests reproduce the original failure, verify cleanup on both paths, check stale callbacks, and repeat forced index-error open/close 20 times with no residual tracked listener. Full local validation passed: `npm run ci:check` (112 test files / 751 tests, TypeScript, Pages and Worker builds), lint, maintainability, Firestore rules emulator, and `git diff --check`. No production Firestore data or rules were changed.

**Release:** merged in [PR #52](https://github.com/tarekhamada875-droid/RQ-/pull/52) on `main` as `5f72b4f`. The post-merge Production Gate (`38720050603`) and Cloudflare Worker deployment/health smoke (`38720050160`) both succeeded.

## Staff composite index (FS-01) — 2026-10-15

The repository now declares the `staff` collection index `garageId ASC, createdAt DESC`. The Firestore emulator matrix checks that the two-garage query returns only the requested garage in newest-first order, asserts the index configuration so CI detects its removal, and documents that legacy staff records without `createdAt` are omitted by the existing ordered query. New Worker staff writes set `createdAt`; no automatic production backfill is planned. Local verification passed: `npm run ci:check` (112 test files / 751 tests, TypeScript, Pages and Worker builds), lint, maintainability, Firestore rules/index emulator, and `git diff --check`. On 2026-10-15, created the matching index in project `gen-lang-client-0091669619`, named database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`; Firebase Console confirmed **Enabled**, index ID `CICAgOjXh4EK`. This changed no production documents or security rules.


## Activity-log fallback correctness (FS-06) — 2026-10-15
- **Problem and behavior:** the missing-index compatibility path previously removed ordering and capped an arbitrary subset, which could omit the newest activity records. Both live and one-time reads now sort by timestamp descending, break timestamp ties by document ID, apply the 200-record cap only after sorting, and retain Cairo-day filtering. The compatibility fallback runs only for missing-index errors; other failures are logged as structured, non-sensitive events and surfaced as an unavailable state. The live app keeps its last displayed history and shows an Arabic warning instead of silently replacing the screen with an empty list.
- **Coverage:** tests exercise 1,000 deliberately unordered records, newest-200 behavior, Cairo-day filtering, document-ID tie ordering, the 200 cap, indexed/live and one-shot reads, missing-index fallback diagnostics, and explicit errors for non-index/fallback failures. The Firestore emulator test asserts the declared `activity_logs` composite index and checks the garage-scoped newest-200 query.
- **Firebase verification:** read-only inspection of [the exact Firestore Indexes page](https://console.firebase.google.com/project/gen-lang-client-0091669619/firestore/databases/ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759/indexes) confirmed `activity_logs` (`garageId ASC`, `timestamp DESC`) Enabled as `CICAgJiUpoMK`; it also reconfirmed the `staff` composite index `CICAgOjXh4EK` Enabled. No index, rules, or document was changed.
- **Local verification:** `npm run ci:check` passed (112 test files / 759 tests, TypeScript, and Pages/Worker production build); `npm run test:rules` passed against the local demo emulator; `npm run maintainability:check` and `git diff --check` passed.
- **Release:** merged in [PR #54](https://github.com/tarekhamada875-droid/RQ-/pull/54) to `main` at `c1296d7aba9958acdd6714e8f161e74b93fcd827`. Production Gate run [#38772778719](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38772778719), Worker deployment run [#38772778657](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38772778657), and post-deployment live smoke passed. No production Firebase data or security rules changed.

## Private system-config and diagnostic endpoint hardening (RULES-02 / SPIKE-01) — 2026-10-15

- **System config:** The public Worker `GET /api/system-config` now requires an active server session and an Admin, Garage, Staff, or Delegate app role; anonymous and backend diagnostic-viewer requests are denied before the config read. All recognized signed-in roles retain the full document, matching existing Firestore read rules. The admin-only write route is unchanged. Before sign-in, the app skips the private API call and keeps its existing local/default theme and settings behavior; no required pre-login config field was found.
- **Diagnostics:** `/api/test-auth-verify`, `/api/test-firestore-read`, and `/api/test-firestore-write` require an independent `X-RQ-Diagnostic-Token` of at least 32 characters plus an explicit comma-separated environment allowlist. `production` is unconditionally denied. Firebase ID-token verification still needs its own Bearer token. Writes are capped at 2 KiB with a 512-character payload limit and remain confined to `_spike_tests`. No secret/allowlist was added to production configuration, so diagnostics remain disabled there.
- **Coverage:** anonymous config requests fail before Firestore reads; active app-role matrix returns complete synthetic config; operator-viewer access is denied; emulator reads preserve full config for authenticated roles and deny anonymous access. Diagnostic tests cover each endpoint, environment allowlisting, missing/wrong/weak credentials, zero writes on rejection, bounds, and `_spike_tests` isolation.
- **Verification:** `npm run ci:check` passed (112 test files / 764 tests, TypeScript, Pages and Worker builds); `npm run test:rules`, `npm run maintainability:check`, and `git diff --check` passed. PR checks passed; post-merge Production Gate [#38776681656](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38776681656) and Worker deployment/smoke [#38776681671](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38776681671) succeeded.
- **Release boundary:** merged via [PR #55](https://github.com/tarekhamada875-droid/RQ-/pull/55) as `20873e3306d7472621005e4ff20cfcb06e43c9c2`. Live read-only smoke returned HTTP 200 for Pages/Worker health/version, HTTP 401 for anonymous system-config, and HTTP 403 for the production-disabled diagnostic read. No `firestore.rules` change, Firebase document operation, or Cloudflare diagnostic binding/secret change was performed.

## Accessible primary form controls (UI-003) — 2026-10-15

- **UI-002 status correction:** PR #48 is merged at `6c5993fb28fd58311e346ab45c8789eebdba896c`; post-merge Production Gate run `38710169798` and Cloudflare Worker deployment run `38710169831` succeeded. This completes the final open Phase 1 roadmap item.
- **UI-003 behavior:** all six add-garage controls and all five package-creation controls are associated with visible labels via unique IDs/`htmlFor`. The free-trial switch uses its visible text as its accessible name. The transparent plate input has an Arabic name and keyboard-use description; subscriber search has a visually hidden label. Existing visual layout, custom keyboard input, and search/pagination behavior are unchanged.
- **Coverage:** named-role tests cover the 11 admin fields and the plate/search names; the plate virtual-keyboard update and subscriber search filtering are also covered. Focused UI suites passed (4 files / 12 tests).
- **Local verification:** `npm run ci:check` passed (114 test files / 769 tests, TypeScript, and Pages/Worker production builds); `npm run test:rules`, `npm run maintainability:check`, `npm run lint`, and `git diff --check` passed.
- **Release:** merged via [PR #57](https://github.com/tarekhamada875-droid/RQ-/pull/57) at `5f238aee60f3da0aab2a58f4ae6c53d529fe8e39`. Post-merge Production Gate [#38781032792](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38781032792) and Worker deployment [#38781032673](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38781032673) succeeded. Live Pages returned HTTP 200; the [AdminDashboard bundle](https://rq-acg.pages.dev/assets/AdminDashboard-DMBnNefg.js) contains the add-garage/package IDs, and the [GarageDashboardView bundle](https://rq-acg.pages.dev/assets/GarageDashboardView-R3Nk6gHi.js) contains the plate description and subscriber-search ID. Worker health/version returned HTTP 200 and anonymous system-config returned HTTP 401. No Firestore data/rules or Cloudflare production configuration changed.


## Accessible icon-only actions (UI-004) — 2026-10-15

- **Problem and behavior:** Several important controls were represented only by icons or unreliable `title` text. A typed `IconButton` now requires `aria-label` and can include optional visually-hidden text. Checkout’s left/right actions have distinct, meaningful Arabic names; the garage menu and close actions, active-vehicle-list close, subscriber edit/delete actions, and add-garage close/PIN generator also expose names. Existing callbacks, touch targets, layout, and visual icons are preserved.
- **Coverage:** Role/name and callback tests cover checkout’s two-step confirmation and both side choices, menu open/close, active-list close, subscriber edit/delete selection, and PIN generation. The subscriber regression confirms that selecting the delete action does not call the destructive service. Focused UI validation passed (6 files / 11 tests).
- **Local verification:** `npm run ci:check` passed (118 test files / 777 tests, TypeScript, and Pages/Worker production build); `npm run test:rules` passed against the local demo emulator; `npm run maintainability:check` and `git diff --check` passed.
- **Release status:** Merged via [PR #59](https://github.com/tarekhamada875-droid/RQ-/pull/59) at `94cd7f3ae6d227648581f782a6794e5726c9890e`. PR Production Gate [#38786708295](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38786708295), post-merge Production Gate [#38787413682](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38787413682), and Worker deployment [#38787413241](https://github.com/tarekhamada875-droid/RQ-/actions/runs/38787413241) succeeded.
- **Live verification:** Pages home returned HTTP 200; all 26 discovered JavaScript assets returned HTTP 200 and contained the six checked UI-004 labels. Worker `/api/health` and `/api/version` returned HTTP 200 with version `1.0.0-production`; anonymous `/api/system-config` returned the expected HTTP 401. No Firestore data, rules, or production configuration changed.
- **Next:** UI-005 is implemented in [PR #64](https://github.com/tarekhamada875-droid/RQ-/pull/64); complete its review/release checks before starting UI-006 (nested-overlay scroll locking) from a fresh branch based on current `main`.


## Shared garage listeners (UI-005) — 2026-10-16

- **PR:** [#64](https://github.com/tarekhamada875-droid/RQ-/pull/64), branch `fix/ui-005-shared-garage-listeners`; awaiting review/merge. The garage dashboard now owns one garage-ID-scoped recharge listener and one subscriber first-page listener. The recharge badge/history and expiring-subscriber badge/list read from those shared snapshots; overlays no longer subscribe independently.
- **Newest recharge correctness:** Independent review found that an unordered Firestore limit could omit the newest event before client-side sorting. The primary query now orders by `timestamp DESC` before the requested limit (one row for the badge); the bounded 100-row fallback is ordered too. The required three-field composite index already exists in `firestore.indexes.json`, and the emulator test now guards it.
- **Behavior preserved:** recharge notification acknowledgement/freshness, the 50-record subscriber first-page cursor, older-page `getMoreSubscribers` calls, list merging, and mutation services. Garage-switch callbacks are ignored after cleanup.
- **Listener lifecycle:** because dashboard badges require live updates, the dashboard-owned listener remains active when an owner closes an overlay; no overlay adds a duplicate. All listeners are released when the dashboard unmounts. Staff subscriber listening remains conditional on the subscriber overlay.
- **Verification:** 14 focused tests passed, including a dashboard/overlay integration test for repeated open-close cycles, shared badge/list snapshots, listener count, and unmount cleanup. `npm run ci:check` passed (121 files / 785 tests, TypeScript, Pages/Worker build); `npm run test:rules` passed against the local demo emulator; maintainability and `git diff --check` passed.
- **Boundary:** no production Firebase data, rules, or configuration changed; PR #64 is not merged/deployed.
