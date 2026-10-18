# RQ Maintainability Handoff

## Current checkpoint: RQ-TG-03 in PR #125 (2026-10-18)

`main` remains at `c9bac505d211f6922719135bd9e19ab52d781fbc`; the focused branch is `test/rq-tg-03-strict-release-smoke`, code commit `e51c53336f31c06c1b4a0b2b68da0cc998c8d5fa`, in PR [#125](https://github.com/tarekhamada875-droid/RQ-/pull/125). GitHub Production Gate checks are pending. RQ-TG-02 remains live at `5010281e90a8ff572dd741f2e3575df09634de87`; main run [39096100434](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39096100434) and its direct health read passed exact-SHA verification. RQ-TG-01 also remains complete: PR [#121](https://github.com/tarekhamada875-droid/RQ-/pull/121) and main run [39063103597](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39063103597) passed.

RQ-TG-03 moves health-response rules into a shared helper used by the release smoke, with deterministic fixtures for healthy, unhealthy, incomplete, unknown/stale version, malformed/non-JSON, HTTP failure, and frontend failure cases. The workflow test confirms smoke runs after deploy, stays GET-only, preserves its configured retry window, and has no separate write-method request. This is test/release-check hardening; no production endpoint was called and no Firebase data/rules changed.

RQ-TG-03 local validation passed: focused smoke/workflow tests (3 files / 16 tests), `npm run ci:check` (136 test files, production build and artifact verification), `npm run lint`, `npm run test:rules` on the demo emulator, `npm run maintainability:check`, and `git diff --check`. Existing Vite dependency-optimization warning is non-blocking; Firestore permission-denial logs are expected emulator negative cases. No production endpoint was called. No Firebase data/rules changed. PR #125’s GitHub checks are pending; the code is not yet merged or live.

**Single next step:** follow PR #125 until its required checks pass, merge under the normal rules, and confirm the post-merge Production Gate and live smoke. Then proceed to RQ-TG-04. Do not start RQ-TG-04 before reporting RQ-TG-03 complete.

## Previous checkpoint: F3 RQ classifier isolation (2026-10-17; merged PR #119 and deployed)

F3 removes the obsolete duration/capacity/unlimited/fair-use classifier from active RQ access behavior. The Worker vehicle-entry decision no longer receives or evaluates classifier state; the frontend no longer applies daily-capacity or legacy subscription-expiry gates to prepaid garages; prepaid dashboard depletion uses paid/referral/trial credits; Admin package creation accepts only credit bundles; and both fair-use extension aliases return HTTP 410 without writes. Garage-owned monthly parking subscriptions remain date-based, and historical records remain readable.

Focused F3 regressions passed. Full `npm run ci:check` passed with 132 test files / 866 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, balances, or configuration was changed. PR #119 merged at `7f7778c`; its Production Gate [39054718882](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054718882) and guarded Worker deployment/health smoke [39054719171](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054719171) passed. `main` and `origin/main` were clean and matched at that checkpoint.

## Previous checkpoint: F2 Cairo-day reconciliation (2026-10-17; merged PR #117)

The focused branch `fix/f2-cairo-day-reconciliation` implements the next JARVIS task. `server/projections.ts` now owns the shared `getCairoDateKey` helper, which safely handles ISO strings, numbers, `Date` values, Firestore-like `toDate()` values, and malformed timestamps. Daily projection and `server/domain/garageReconciliation.ts` use the same Cairo-date predicate, so off-day and invalid events cannot affect today’s counts or revenue. `totalRecordedEvents` intentionally remains the raw input-array length for diagnostic visibility.

Regression coverage includes previous-day, next-day, Cairo boundary, missing, invalid, and non-date timestamps plus projection/reconciliation parity. Focused coverage passed (63 tests across reconciliation, projection, parity, and Worker garage-route tests). Full `npm run ci:check` passed with 132 test files / 871 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, configuration, or deployment was changed.

PR #117 merged at `eaca8db`; the post-merge Production Gate and guarded Worker deployment/health smoke passed. The single next JARVIS task is F3: remove or isolate the obsolete RQ duration/capacity/unlimited classifier without affecting garage-owned date-based monthly subscriptions.

## Previous checkpoint: legacy garage billing retirement (merged PR #114)

The owner confirmed that current garages/data are test-only and approved retiring the old time-based garage plan and EGP-wallet model without preserving active compatibility behavior. PR #114 makes new garages prepaid-credit-only with `{ paid: 0, referral: 0, trial: 0 }`, removes the garage package purchase UI, makes vehicle check-in ignore legacy expiry/daily-capacity/fair-use billing gates, and returns `LEGACY_BILLING_MODEL_RETIRED` (HTTP 410) from the old recharge, wallet top-up, self-subscribe, and referral-day endpoints. Monthly subscriptions sold by garages to their own customers remain separate and are not removed. Historical records are not deleted or rewritten. PR gates, post-merge Production Gate, and guarded Worker deployment/health smoke passed. Local validation passed at 132 test files / 870 tests, TypeScript, production build, maintainability, and diff checks.
