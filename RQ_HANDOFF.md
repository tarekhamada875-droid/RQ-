# RQ Continuity Handoff

_Last updated: 2026-10-20._

## What RQ is

RQ is a bilingual garage-management PWA. The production path is Cloudflare Pages for the website, a Cloudflare Worker running Hono for the API, and Firebase Authentication/Firestore for identity and data. Garage entry is prepaid-credit based. Admin confirms external payment and grants credits through a server-authoritative transaction; vehicle entry consumes the defined credit amount. Monthly subscribers are a separate garage-owned product. Admin package templates are credit-bundle templates, not customer checkout.

The owner’s priorities are: preserve Egyptian license-plate identity, favor functional and understandable code, use atomic Firestore transactions, control unnecessary Firebase reads/writes, keep the current visual design unless explicitly asked otherwise, and explain progress simply. Financial and authorization decisions must remain in the Worker/API, transactional, idempotent, and auditable.

## Handoff trigger and current status

This handoff began from the owner’s `tokens ending` continuity trigger. The Garage/Admin audit and ALF-01 work are complete. ALF-01 merged in PR #212 at `44d19571e48d5c196f4f751c54230dc98213f3fa`; its initial rules release is historical and has been superseded by the package-catalog rules below. The owner-approved credit-bundle-only catalog was merged in PR #214 as `9d6a787f17fae7b09b3dfbd1b08ffe515bf041ad`; post-merge Production Gate run `39377196821` passed, and the Worker reports that commit. The separately deployed package rules are active as ruleset `619f1ca8-3d09-44b0-b361-a17601f645bc`, read back exactly with SHA-256 `1eb5698024002f10e19df415ae4c5c0bfb2d57db7bf0755fb68ff59f3d299bb9`. Existing legacy package documents remain stored; no deletion or migration occurred. The separate monthly-subscriber product is unchanged. Open PR #211 remains open on stale base `9b7c4497b0d2071992891617e614a7f77333ebf0` and modifies `README.md` and `RQ_HANDOFF.md` with outdated ALF-01-only instructions; the owner has since authorized ALF-12. Do not merge it without refreshing its base and reconciling overlapping handoff text. It was not modified by this ALF-12 work.

## Start here — do not repeat completed work

Do **not** recreate the deleted UI plan, redo the UI performance audit, repeat the checkout/recharge-history fixes, or change the visual design. ALF-01 and the credit-bundle-only catalog are complete in source and production (PRs #212 and #214); the active catalog rules release is ruleset `619f1ca8-3d09-44b0-b361-a17601f645bc` with exact payload SHA-256 `1eb5698024002f10e19df415ae4c5c0bfb2d57db7bf0755fb68ff59f3d299bb9`. Do not delete or migrate the old package documents. ALF-12 is currently in progress under the owner’s confirmed same-entrant policy: garage owners and staff may correct/delete only their own entries, identified by stable entity ID plus role. Re-login with a new Firebase UID for the same entity preserves authority; peers cannot correct one another’s entries, and legacy entries lacking stable metadata are Admin-only. No record migration is planned.

Verified state at the start of ALF-01 work (re-check GitHub for current state):

- Local branch: `main` before the ALF-01 feature branch was created.
- Local `main` and `origin/main`: synchronized at `9b7c4497b0d2071992891617e614a7f77333ebf0`.
- Working tree was clean before ALF-01 work.
- Open PRs: one documentation-only PR, #211 (`docs/stabilize-handoff-verification`), with its `verify` check successful and Worker deployment skipped.
- Latest successful main Production Gate: run `39369480257`, for SHA `9b7c4497b0d2071992891617e614a7f77333ebf0`.
- Latest deployed Worker identity: `/api/health` and `/api/version` reported commit `77a12276756c874f8fc57c4082614f1b1ac4a2c2`, version `1.0.0-production`, environment `production`, runtime `cloudflare-worker`, status `operational`. The later plan/documentation commits did not deploy a new Worker.
- Protected decision branch: `readiness/firestore-decision-gate` at `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`.
- The baseline values above are a historical start snapshot, not current status. Re-fetch and verify the exact branch, commit, PR, gate, live endpoints, and protected branch before any release action.

## Completed work

- The lightweight UI modernization plan was completed without a visual redesign.
- Confirmed checkout delete behavior was fixed earlier: one delete action, limited to the first five minutes after check-in.
- Credit history was separated from the main credit card, while the main card retained the credit total.
- Credit-debit arrows were implemented as the requested falling top-to-bottom animation.
- Recharge history was changed to Admin credit-grant history in Egyptian Arabic, with total post-charge balance semantics and light/dark-theme support.
- Garage and Admin business-logic audits were completed and their findings were added to [`BUSINESS_LOGIC_FIX_PLAN.md`](BUSINESS_LOGIC_FIX_PLAN.md).
- The plan explicitly requires deleting bad runtime logic rather than hiding it behind legacy, retired, deprecated, fallback, or compatibility paths. Valid historical stored data must be preserved unless separate destructive-data approval is obtained.

## Confirmed audit scope

The Business Logic Fix plan contains the confirmed Garage findings GLF-01 through GLF-10 and Admin/cross-role findings ALF-01 through ALF-14. Important examples include direct `creditBalance` Firestore writes bypassing the ledger, duplicate Admin grant retries, Admin/Garage summary disagreement, silently discarded trial settings, incomplete delegate settlement history, prepaid cash-report policy ambiguity, broken Admin report date format, duplicate package-management authority, stale Admin detail state, coupled lock/suspension state, stale Admin lists after logout, subscriber/config/vehicle-correction authorization gaps, and fixed-limit credit history.

## ALF-01 implementation result and safety boundaries

- ALF-01’s direct-`creditBalance` protection remains live. Its original production ruleset was `74404046-99eb-4c3a-993c-616ddc0c576f` (SHA-256 `fe576244d299fcf86d7173ef25afc7759db51c9a4c8040e4e75d170f276f37f8`); that initial release has since been superseded by the current credit-bundle-only ruleset documented above, which preserves the balance lock.
- The Worker grant route was not changed. Its combined regression verifies the authorized Admin grant, paid balance, referral reward, ledger entries, domain event, activity logs, and idempotent retry together.
- Focused verification passed: `npm run test:rules` and the 13 tests in `src/__tests__/cloudflareWorkerCreditGrant.test.ts`.
- The frontend search found no Admin UI path that writes `creditBalance` directly; credit changes come from the server response/API path. Your Admin role and ordinary Admin work remain intact; credit grants must use the existing Worker endpoint.
- The Cloudflare workflow does not deploy Firestore rules. ALF-01’s Firebase rules were separately deployed after owner authorization and verified against the exact active production release.
- Do not delete stored data, migrate records, manually change production rules, or implement trial, cash-accounting, package, settlement, or later roadmap policies in ALF-01.

ALF-01 and the owner-approved credit-bundle-only catalog are complete in source, merged, and live. PR #214’s source commit `5542d0c0bb128ae59788eed485afbc86e4147c53` was merged as `9d6a787f17fae7b09b3dfbd1b08ffe515bf041ad`; Production Gate run `39377196821` passed and the live Worker reports that commit. The package-only rules deployment was verified exactly against the active production database (ruleset `619f1ca8-3d09-44b0-b361-a17601f645bc`, SHA-256 `1eb5698024002f10e19df415ae4c5c0bfb2d57db7bf0755fb68ff59f3d299bb9`). Legacy package documents were retained, not deleted or migrated; the separate monthly-subscriber product is unchanged. ALF-12 is now underway under the owner’s confirmed same-entrant policy; Firestore rules rollout still requires separate production authorization and exact live verification.

## Unresolved decisions and safety boundaries

Before implementing policy-dependent items, record decisions about: whether trials are active or should be removed with their unreachable metrics; whether prepaid money belongs in cash/net/partner totals; whether Admin package templates must be selectable in manual grants; whether multi-device sessions are allowed; whether delegate-created and referred garages should be combined everywhere; staff subscriber permissions; refund clamp/reject policy; one-month duration semantics; and notification triggers. The owner has decided the Admin package format must be credit bundles only; do not reinterpret that as authorization to delete existing Firestore documents or change the separate monthly-subscriber product. The ALF-12 vehicle-correction policy is also resolved: only the same garage/staff entity may correct its own entries, while records lacking stable entrant metadata are Admin-only; do not migrate those records.

No stored-data deletion is authorized by this handoff. Source cleanup and data deletion are separate operations. Do not use a compatibility branch to preserve a confirmed-wrong business rule. Do not redesign the UI or change Egyptian plate identity, RTL/LTR behavior, or bilingual behavior as part of the logic fixes.

## Required files to read

Read these from the new `main` state before editing:

- `PROJECT_ENGINEERING_KNOWLEDGE.md` — complete file.
- `AGENTS.md` — complete file, including the continuity and release checklist.
- `PROJECT_WORKING_AGREEMENT.md` — complete file.
- `BRANCHING_AND_RELEASES.md` — complete file.
- `BUSINESS_LOGIC_FIX_PLAN.md` — complete file, especially ALF-01 and the implementation order.
- `firestore.rules` — garage update permissions and adjacent rules.
- `server/garageRoutes.ts` — authoritative credit-grant route.
- `server/domain/prepaidCreditLedger.ts` — ledger transitions and IDs.
- Existing rules and credit-grant tests under `tools/`, `server/`, and `src/__tests__/`.

## Required pre-edit and release workflow

Before editing, fetch GitHub and verify the exact clean `main` SHA, matching `origin/main`, latest successful main gate for that SHA, open PR count, live `/api/health` and `/api/version`, and protected decision-branch SHA. Treat this handoff’s copied status as a snapshot, not authority.

For any next authorized roadmap task, use a short-lived focused branch from synchronized `main`. Add focused synthetic regressions first. Run the focused tests, then `npm run lint`, `npm run maintainability:check`, `npm run ci:check`, and `git diff --check` as applicable. Review the diff for accidental visual, data, or authorization scope changes.

Push the branch and open a PR targeting `main`. Wait for the required Production Gate. Merge only after the required checks pass; do not bypass protected checks. After merging, verify the merged commit, local `main == origin/main`, clean working tree, post-merge Production Gate/deployment result, live Worker health/version identity, open PR count, and protected decision branch. Stop and report the selected task before starting another roadmap item.
