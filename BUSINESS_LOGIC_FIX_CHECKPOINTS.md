# RQ- Business Logic Fix Checkpoints

**Purpose:** Durable continuation plan for resolving the confirmed business-logic defects found in `BUSINESS_LOGIC_AUDIT.md`.

**Repository:** `tarekhamada875-droid/RQ-`
**Current baseline:** `ca8740d` (`fix: allow active trials and preserve garage PINs`)
**Started:** 2026-09-19
**Status:** In progress

## Authoritative product rules

- Only the admin adds balance to garage accounts.
- Garage owners purchase packages using wallet balance; purchase requires `balance >= final package price` and deducts that exact price atomically.
- An active trial or active paid package allows check-in even when wallet balance is zero.
- Only the admin may change a garage trial decision.
- Garage lock/suspension blocks new check-ins only; checkout remains allowed.
- Garage deletion is permanent and must remove all garage-owned operational/reporting data safely, including large collections.
- A delegate may be deleted only when they have no unsettled commission.
- Subscriber plate identity is immutable; subscriber plate numbers cannot be edited.
- Package discounts apply consistently to self-subscription, delegate requests, admin approval, and reporting.
- Delegate-filtered reports include only the selected delegate's events, settlements, and unsettled balances.
- The default trial duration is 2 days everywhere.

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Implemented and verified
- `[!]` Blocked / requires explicit product decision

## Phase 0 — Safety and shared foundations

- [x] 0.1 Create this checkpoint plan.
- [ ] 0.2 Add or update focused regression tests before/alongside each behavior change.
- [ ] 0.3 Run full validation after each phase: tests, TypeScript, build, maintainability, diff check.
- [ ] 0.4 Keep this file updated with commit SHA, validation output, and next action.

## Phase 1 — Critical authentication and authorization

- [x] 1.1 Enforce entity/session ownership and current session ID in `requireAuth` on every protected API request.
- [x] 1.2 Make logout one awaited, server-authoritative, owner-checked release; remove unsafe client-side security-document deletion.
- [x] 1.3 Make PIN uniqueness atomic with a reservation/index keyed by normalized lookup hash.
- [x] 1.4 Make PIN lookup/availability fail closed on Firestore/query errors.
- [ ] 1.5 Treat missing/malformed `lastActive` as invalid/expired under a bounded migration policy.
- [ ] 1.6 Prevent one Firebase UID from retaining conflicting active role sessions; remove fixed-priority role selection.
- [x] 1.7 Require `sessionId` for session-bearing login and return truthful `sessionClaimed` status.
- [ ] 1.8 Make legacy PIN migration awaited/idempotent or make migration state explicit.

## Phase 2 — Wallet, packages, and financial correctness

- [x] 2.1 Implement a dedicated `balance_topup` approval branch that credits wallet balance and does not activate a package/commission.
- [x] 2.2 Ensure package purchase derives an active package and final discounted price from server catalog data only.
- [ ] 2.3 Ensure package purchase atomically checks balance, deducts the final price, and activates the package.
- [ ] 2.4 Apply the same discount/coupon calculation to self-subscription, delegate request approval, and admin purchase paths.
- [ ] 2.5 Require idempotency keys for direct recharge, admin wallet top-up, and self-subscription; bind keys to request fingerprints.
- [ ] 2.6 Emit canonical financial events for every wallet credit, wallet debit, package purchase, commission, and refund.
- [ ] 2.7 Correct financial reports to include all canonical events and historical reconciliation requirements.
- [x] 2.8 Fix delegate request persistence so authorized `delegateId` and display metadata survive creation and pending-state reads.
- [ ] 2.9 Reject inactive/invalid packages on every purchase path; validate package schema and discount/capacity ranges.
- [x] 2.10 Fix delegate-scoped settlement filtering in financial reports.

## Phase 3 — Trial, subscription, and garage state

- [x] 3.1 Make trial decision mutation admin-only.
- [x] 3.2 Enforce lock/suspension on server-side check-in only; allow checkout; never clear admin lock during deletion/correction.
- [x] 3.3 Remove wallet-balance blocking for active paid packages as well as active trials.
- [x] 3.4 Standardize default trial duration to 2 days in API, UI, delegates, admin views, and reports.
- [ ] 3.5 Fix malformed subscription expiry handling in client helpers.
- [ ] 3.6 Fix admin clear-wallet/end-subscription lifecycle operation so it persists through a dedicated authorized endpoint.
- [ ] 3.7 Define and enforce consistent unlimited/fair-use package metadata.

## Phase 4 — Vehicles and subscribers

- [ ] 4.1 Make subscriber lookup authoritative and fail closed inside the check-in transaction.
- [x] 4.2 Make subscriber plate identity immutable in UI and API.
- [ ] 4.3 Add server-side subscriber update allowlist and duplicate protection.
- [ ] 4.4 Canonicalize and validate vehicle plates at the server boundary.
- [ ] 4.5 Align correction/deletion ownership identity between client and server.
- [ ] 4.6 Make vehicle operation idempotency end-to-end and fingerprint-aware across retries.
- [x] 4.7 Stop counting zero-value corrections as refunds; use a distinct correction/deletion event.
- [ ] 4.8 Add subscriber pagination/search and remove or clearly label the 50-record cap.

## Phase 5 — Permanent deletion and lifecycle

- [ ] 5.1 Implement permanent garage deletion across all garage subcollections, events, projections, summaries, daily data, subscribers, vehicles, and related references.
- [ ] 5.2 Make garage deletion paginated/resumable/idempotent and safe over Firestore batch limits.
- [ ] 5.3 Block or safely transition deletion when concurrent mutations are active.
- [ ] 5.4 Prevent delegate deletion when unsettled commission exists.
- [ ] 5.5 Define and implement delegate-linked garage/request/session/history cleanup or deactivation policy consistent with permanent deletion.

## Phase 6 — Reports, projections, and date correctness

- [ ] 6.1 Decrement active projection count for inside-vehicle deletion.
- [ ] 6.2 Derive current cars-inside from authoritative state, not daily movement deltas.
- [ ] 6.3 Include active count in reconciliation and support historical reconciliation dates.
- [ ] 6.4 Fix refund-on-later-day accounting and daily stats creation.
- [ ] 6.5 Replace fixed Cairo offsets with one timezone-aware boundary helper on client and server.
- [ ] 6.6 Fix delegate-filtered settlement totals and current-unsettled rows.
- [ ] 6.7 Remove the 200-activity-log reporting cap or provide complete server-side staff aggregation.
- [ ] 6.8 Reconcile historical financial/activity data after canonical event rollout.

## Phase 7 — Final verification and handoff

- [ ] 7.1 Run complete test suite.
- [ ] 7.2 Run TypeScript/lint, production build, maintainability checks, and diff checks.
- [ ] 7.3 Run API smoke checks for Cloudflare frontend and Railway backend.
- [ ] 7.4 Commit and push each coherent phase to `main`.
- [ ] 7.5 Record final commit SHAs, remaining caveats, and deployment status here.

## Progress log

### 2026-09-19 — Plan created

- Created this file from the read-only audit and the product rules supplied by the owner.
- No code changes made in this step.
- Next action: implement the remaining financial idempotency and canonical-event work.

### 2026-09-19 — First fix batch verified

- Implemented and verified wallet-top-up approval as a wallet-only transaction with a typed `wallet_topup_approved` event.
- Restricted self-subscription to existing active server catalog packages and applied authoritative package discounts to approval/direct recharge paths.
- Made active paid packages, like trials, usable at zero wallet balance in the dashboard.
- Restricted trial decisions to admins and standardized key trial fallbacks to two days.
- Persisted server-derived delegate request metadata and filtered financial settlements by selected delegate.
- Added server-side vehicle plate normalization, check-in lock/suspension enforcement, fail-closed subscriber lookup behavior, and immutable subscriber plate updates.
- Validation passed: 19 focused tests, TypeScript, production build, and `git diff --check`.
- The lock/suspension behavior is now complete; authoritative subscriber lookup still needs to move inside the check-in transaction.
- Next action: add regression tests for this batch, then implement financial idempotency/canonical events and session authorization.

### 2026-09-19 — Lock/refund follow-up verified by inspection

- Removed the vehicle-deletion side effect that set `isLocked` to false.
- Zero-value corrections no longer increment refund counters; positive refunds retain refund accounting.
- The check-in route now rejects locked/suspended garages while checkout remains on its separate path.
- Post-commit validation passed on `d764ebd`: 18 focused tests, TypeScript, and diff checks.
- The audit report remains an untracked read-only artifact; it is intentionally not mixed into the source fix commits.
- Next action: add route-level regression coverage and continue with idempotency/session enforcement.

### 2026-09-19 — Session enforcement batch verified

- Protected API middleware now requires the canonical `X-Session-ID`, validates security-session freshness and identity, and checks the entity `currentSessionId` before authorizing the request.
- The frontend sends its canonical session ID with API requests.
- PIN login now requires a session ID before reporting success.
- Logout no longer deletes security-session documents from the client and awaits the server owner/session-checked release before Firebase sign-out.
- Validation passed: 34 authentication/session tests, TypeScript, and diff checks.
- Commit pending at the end of this checkpoint update; next action is atomic PIN uniqueness/error handling, followed by remaining financial idempotency and canonical events.

### 2026-09-19 — PIN integrity batch verified

- `saveEntityPin` now reserves the normalized lookup hash and writes the private PIN in one Firestore transaction; rotations release the previous reservation only when owned by the same entity.
- PIN lookup and availability no longer swallow Firestore/query failures or report a false `taken: false` result.
- Validation passed: 53 PIN/auth utility tests, TypeScript, and diff checks.
- Next action: require and fingerprint idempotency keys across direct wallet top-ups, direct package purchases, and self-subscription.

## Continuation instructions

1. Read this file first.
2. Inspect the current git status and latest commit.
3. Work only on the first unchecked checkpoint(s) whose dependencies are satisfied.
4. Update the relevant checkbox immediately after implementation and verification.
5. Add a progress-log entry with files changed, tests run, commit SHA, and the next action.
6. Never mark a checkpoint `[x]` without tests or direct verification.
7. If a product decision is required, mark `[!]`, record the exact question, and continue with independent checkpoints.
8. Do not erase this file; it is the continuation contract.
