# RQ Maintainability Handoff

## Current work: RQ-TG-01 canonical verification and release artifact (2026-10-17)

Current `main` is clean at `e1c5ca8a745a2c6c2ec15ae8876b7baf00ce6f6d` (PR #120, documentation-only). Work is on branch `chore/rq-tg-01-single-release-verification`; PR [#121](https://github.com/tarekhamada875-droid/RQ-/pull/121) is open. The current code commit is `6e26866`; branch and PR Production Gates are running. No production deployment has occurred.

The old standalone Worker deployment workflow is being removed. The Production Gate now performs the single full install/test/build, uploads the verified `dist/` artifact under a name containing the event SHA, then deploys that exact artifact in a dependent job and runs the strict live smoke only after deployment. The former redundant subscriber-test rerun is removed; it remains covered by the full test suite. Production releases are not cancelled by newer pushes.

Local checks passed: focused workflow test (3 tests), `npm run ci:check` (133 files / 869 tests, production build/artifact checks), `npm run test:rules`, `npm run maintainability:check`, YAML parsing, Wrangler `--no-bundle --dry-run`, and `git diff --check`. Existing test logs include Vite optimization deprecation and React `act(...)` warnings; they did not fail tests. Firestore emulator permission-denial logs are expected from negative security-rule cases; the matrix exited successfully. No Firebase data/rules/configuration changed and no production deployment occurred.

**Single next step:** wait for PR #121’s required Production Gate checks; merge only if they pass, then verify the merged commit and post-merge deploy/smoke result. Do not start RQ-TG-02 until the owner asks to continue.

## Previous checkpoint: F3 RQ classifier isolation (2026-10-17; merged PR #119 and deployed)

F3 removes the obsolete duration/capacity/unlimited/fair-use classifier from active RQ access behavior. The Worker vehicle-entry decision no longer receives or evaluates classifier state; the frontend no longer applies daily-capacity or legacy subscription-expiry gates to prepaid garages; prepaid dashboard depletion uses paid/referral/trial credits; Admin package creation accepts only credit bundles; and both fair-use extension aliases return HTTP 410 without writes. Garage-owned monthly parking subscriptions remain date-based, and historical records remain readable.

Focused F3 regressions passed. Full `npm run ci:check` passed with 132 test files / 866 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, balances, or configuration was changed. PR #119 merged at `7f7778c`; its Production Gate [39054718882](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054718882) and guarded Worker deployment/health smoke [39054719171](https://github.com/tarekhamada875-droid/RQ-/actions/runs/39054719171) passed. `main` and `origin/main` were clean and matched at that checkpoint.

## Previous checkpoint: F2 Cairo-day reconciliation (2026-10-17; merged PR #117)

The focused branch `fix/f2-cairo-day-reconciliation` implements the next JARVIS task. `server/projections.ts` now owns the shared `getCairoDateKey` helper, which safely handles ISO strings, numbers, `Date` values, Firestore-like `toDate()` values, and malformed timestamps. Daily projection and `server/domain/garageReconciliation.ts` use the same Cairo-date predicate, so off-day and invalid events cannot affect today’s counts or revenue. `totalRecordedEvents` intentionally remains the raw input-array length for diagnostic visibility.

Regression coverage includes previous-day, next-day, Cairo boundary, missing, invalid, and non-date timestamps plus projection/reconciliation parity. Focused coverage passed (63 tests across reconciliation, projection, parity, and Worker garage-route tests). Full `npm run ci:check` passed with 132 test files / 871 tests, production build and artifact verification passed, `npm run maintainability:check` passed, and `git diff --check` passed. No Firestore data, rules, configuration, or deployment was changed.

PR #117 merged at `eaca8db`; the post-merge Production Gate and guarded Worker deployment/health smoke passed. The single next JARVIS task is F3: remove or isolate the obsolete RQ duration/capacity/unlimited classifier without affecting garage-owned date-based monthly subscriptions.

## Previous checkpoint: legacy garage billing retirement (merged PR #114)

The owner confirmed that current garages/data are test-only and approved retiring the old time-based garage plan and EGP-wallet model without preserving active compatibility behavior. PR #114 makes new garages prepaid-credit-only with `{ paid: 0, referral: 0, trial: 0 }`, removes the garage package purchase UI, makes vehicle check-in ignore legacy expiry/daily-capacity/fair-use billing gates, and returns `LEGACY_BILLING_MODEL_RETIRED` (HTTP 410) from the old recharge, wallet top-up, self-subscribe, and referral-day endpoints. Monthly subscriptions sold by garages to their own customers remain separate and are not removed. Historical records are not deleted or rewritten. PR gates, post-merge Production Gate, and guarded Worker deployment/health smoke passed. Local validation passed at 132 test files / 870 tests, TypeScript, production build, maintainability, and diff checks.
