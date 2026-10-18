# RQ Maintainability Handoff

## Current checkpoint: RQ-TG-03 merged and deployed (2026-10-18)

RQ-TG-03 merged at `49386aba0d8139fa8e4be5edb55786b64eb26b2e` in PR [#125](https://github.com/tarekhamada875-droid/RQ-/pull/125). The current `main` is clean at `7ca1438ba124f66e63f6130e60eaf0417b17407c`, squash merge of workflow-efficiency PR [#127](https://github.com/tarekhamada875-droid/RQ-/pull/127). Its required PR check [39105649832](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39105649832) and protected main release [39105794248](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39105794248) passed. The live health endpoint reports `status=ok`, version `1.0.0-production`, and the exact current main SHA.

RQ-TG-03 moves health-response rules into a shared helper used by the release smoke, with deterministic fixtures for healthy, unhealthy, incomplete, unknown/stale version, malformed/non-JSON, HTTP failure, and frontend failure cases. The workflow test confirms smoke runs after deploy, stays GET-only, preserves its configured retry window, and has no separate write-method request. No Firebase data/rules changed.

RQ-TG-03 local validation passed: focused smoke/workflow tests (3 files / 16 tests), `npm run ci:check` (136 test files, production build and artifact verification), `npm run lint`, `npm run test:rules` on the demo emulator, `npm run maintainability:check`, and `git diff --check`. Existing Vite dependency-optimization warning is non-blocking; Firestore permission-denial logs are expected emulator negative cases. The merged Worker health response reports the exact main SHA; no Firebase data/rules changed.

**CI efficiency improvement completed (2026-10-18; PR #127):** Push-triggered gates now run only on `main`; full validation remains required on PRs, and newer commits can cancel older checks for the same PR. Main releases cannot be cancelled. The feature-branch push produced no workflow run and the PR produced one required check, as intended. The protected main run still passed verification, Worker deployment, and live smoke. Regression tests cover the trigger and cancellation rules. Local focused tests (5), full `npm run ci:check`, YAML parsing, demo-emulator `npm run test:rules`, maintainability, and whitespace checks passed. No application behavior or Firebase data/rules changed.

**Single next step:** resume RQ-TG-04—pin Firebase CLI and align the local rules gate.

## Previous checkpoint: F3 RQ classifier isolation (2026-10-17; merged PR #119 and deployed)

F3 removes the obsolete duration/capacity/unlimited/fair-use classifier from active RQ access behavior. The Worker vehicle-entry decision no longer receives or evaluates classifier state; the frontend no longer applies daily-capacity or legacy subscription-expiry gates to prepaid garages; prepaid dashboard depletion uses paid/referral/trial credits; Admin package creation accepts only credit bundles; and both fair-use extension aliases return HTTP 410 without writes. Garage-owned monthly parking subscriptions remain date-based, and historical records remain readable.

Focused F3 regressions passed. Full `npm run ci:check` passed with 132 test files / 866 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, balances, or configuration was changed. PR #119 merged at `7f7778c`; its Production Gate [39054718882](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054718882) and guarded Worker deployment/health smoke [39054719171](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054719171) passed. `main` and `origin/main` were clean and matched at that checkpoint.

## Previous checkpoint: F2 Cairo-day reconciliation (2026-10-17; merged PR #117)

The focused branch `fix/f2-cairo-day-reconciliation` implements the next JARVIS task. `server/projections.ts` now owns the shared `getCairoDateKey` helper, which safely handles ISO strings, numbers, `Date` values, Firestore-like `toDate()` values, and malformed timestamps. Daily projection and `server/domain/garageReconciliation.ts` use the same Cairo-date predicate, so off-day and invalid events cannot affect today’s counts or revenue. `totalRecordedEvents` intentionally remains the raw input-array length for diagnostic visibility.

Regression coverage includes previous-day, next-day, Cairo boundary, missing, invalid, and non-date timestamps plus projection/reconciliation parity. Focused coverage passed (63 tests across reconciliation, projection, parity, and Worker garage-route tests). Full `npm run ci:check` passed with 132 test files / 871 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, configuration, or deployment was changed.

PR #117 merged at `eaca8db`; the post-merge Production Gate and guarded Worker deployment/health smoke passed. The single next JARVIS task is F3: remove or isolate the obsolete RQ duration/capacity/unlimited classifier without affecting garage-owned date-based monthly subscriptions.

## Previous checkpoint: legacy garage billing retirement (merged PR #114)

The owner confirmed that current garages/data are test-only and approved retiring the old time-based garage plan and EGP-wallet model without preserving active compatibility behavior. PR #114 makes new garages prepaid-credit-only with `{ paid: 0, referral: 0, trial: 0 }`, removes the garage package purchase UI, makes vehicle check-in ignore legacy expiry/daily-capacity/fair-use billing gates, and returns `LEGACY_BILLING_MODEL_RETIRED` (HTTP 410) from the old recharge, wallet top-up, self-subscribe, and referral-day endpoints. Monthly subscriptions sold by garages to their own customers remain separate and are not removed. Historical records are not deleted or rewritten. PR gates, post-merge Production Gate, and guarded Worker deployment/health smoke passed. Local validation passed at 132 test files / 870 tests, TypeScript, production build, maintainability, and diff checks.
