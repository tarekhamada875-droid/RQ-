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

## Last verified local baseline

The full Vitest suite, TypeScript validation, production build, maintainability check, and Cloudflare live smoke gate must pass after every source change.
