# RQ Maintainability Handoff

## Current checkpoint: RQ-TG-04 merged, deployed, and verified (2026-10-18)

PR [#129](https://github.com/tarekhamada875-droid/RQ-/pull/129) merged at `d9c52509c85ebdc4e8d4ea852a921efdc7f673e7`; at the TG-04 release checkpoint, `main` and the deployed Worker were at this commit. PR Production Gate [39106750461](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39106750461) passed; main Production Gate [39106925290](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39106925290) passed verification, deployment, and strict live smoke. A fresh read-only health check returned `status=ok`, version `1.0.0-production`, and the exact TG-04 release SHA. A later documentation-only merge may advance `main` without changing the Worker. No customer-facing application behavior or Firebase data/rules changed.

RQ-TG-04 pins `firebase-tools` at `15.34.0`, switches `test:rules` to the project-local Firebase CLI, and includes the Firestore rules emulator matrix in canonical local `npm run ci:check`, matching the production gate. The CI Java 21 setup remains unchanged.

Local clean-install `npm run ci:check` passed (136 test files / 888 tests, Firestore rules matrix, production build, and artifact checks); the installed CLI reported `15.34.0`. `npm run maintainability:check` and `git diff --check` passed. The release workflow’s live smoke verified SHA `d9c52509c85ebdc4e8d4ea852a921efdc7f673e7`.

**Faster release workflow:** PR [#127](https://github.com/tarekhamada875-droid/RQ-/pull/127) removed the duplicate feature-push gate; the feature-branch push started no run, while the PR got one required check. Only an older check for the same PR may be cancelled; main releases are never cancelled. Documentation-only PR [#128](https://github.com/tarekhamada875-droid/RQ-/pull/128) also passed its fast text-only gate without redeploying the Worker. The master roadmap now includes a verified step-by-step continuation procedure for future agents.

**Single next step:** start RQ-TG-05—import and smoke-test the built Worker artifact before deployment.

## Previous checkpoint: F3 RQ classifier isolation (2026-10-17; merged PR #119 and deployed)

F3 removes the obsolete duration/capacity/unlimited/fair-use classifier from active RQ access behavior. The Worker vehicle-entry decision no longer receives or evaluates classifier state; the frontend no longer applies daily-capacity or legacy subscription-expiry gates to prepaid garages; prepaid dashboard depletion uses paid/referral/trial credits; Admin package creation accepts only credit bundles; and both fair-use extension aliases return HTTP 410 without writes. Garage-owned monthly parking subscriptions remain date-based, and historical records remain readable.

Focused F3 regressions passed. Full `npm run ci:check` passed with 132 test files / 866 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, balances, or configuration was changed. PR #119 merged at `7f7778c`; its Production Gate [39054718882](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054718882) and guarded Worker deployment/health smoke [39054719171](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054719171) passed. `main` and `origin/main` were clean and matched at that checkpoint.

## Previous checkpoint: F2 Cairo-day reconciliation (2026-10-17; merged PR #117)

The focused branch `fix/f2-cairo-day-reconciliation` implements the next JARVIS task. `server/projections.ts` now owns the shared `getCairoDateKey` helper, which safely handles ISO strings, numbers, `Date` values, Firestore-like `toDate()` values, and malformed timestamps. Daily projection and `server/domain/garageReconciliation.ts` use the same Cairo-date predicate, so off-day and invalid events cannot affect today’s counts or revenue. `totalRecordedEvents` intentionally remains the raw input-array length for diagnostic visibility.

Regression coverage includes previous-day, next-day, Cairo boundary, missing, invalid, and non-date timestamps plus projection/reconciliation parity. Focused coverage passed (63 tests across reconciliation, projection, parity, and Worker garage-route tests). Full `npm run ci:check` passed with 132 test files / 871 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, configuration, or deployment was changed.

PR #117 merged at `eaca8db`; the post-merge Production Gate and guarded Worker deployment/health smoke passed. The single next JARVIS task is F3: remove or isolate the obsolete RQ duration/capacity/unlimited classifier without affecting garage-owned date-based monthly subscriptions.

## Previous checkpoint: legacy garage billing retirement (merged PR #114)

The owner confirmed that current garages/data are test-only and approved retiring the old time-based garage plan and EGP-wallet model without preserving active compatibility behavior. PR #114 makes new garages prepaid-credit-only with `{ paid: 0, referral: 0, trial: 0 }`, removes the garage package purchase UI, makes vehicle check-in ignore legacy expiry/daily-capacity/fair-use billing gates, and returns `LEGACY_BILLING_MODEL_RETIRED` (HTTP 410) from the old recharge, wallet top-up, self-subscribe, and referral-day endpoints. Monthly subscriptions sold by garages to their own customers remain separate and are not removed. Historical records are not deleted or rewritten. PR gates, post-merge Production Gate, and guarded Worker deployment/health smoke passed. Local validation passed at 132 test files / 870 tests, TypeScript, production build, maintainability, and diff checks.
