# RQ Continuity Handoff

_Last updated: 2026-10-20._

## What RQ is

RQ is a bilingual garage-management PWA. The production path is Cloudflare Pages for the website, a Cloudflare Worker running Hono for the API, and Firebase Authentication/Firestore for identity and data. Garage entry is prepaid-credit based. Admin confirms external payment and grants credits through a server-authoritative transaction; vehicle entry consumes the defined credit amount. Monthly subscribers are a separate garage-owned product. Admin package templates are credit-bundle templates, not customer checkout.

The owner’s priorities are: preserve Egyptian license-plate identity, favor functional and understandable code, use atomic Firestore transactions, control unnecessary Firebase reads/writes, keep the current visual design unless explicitly asked otherwise, and explain progress simply. Financial and authorization decisions must remain in the Worker/API, transactional, idempotent, and auditable.

## Handoff trigger and current status

This handoff was activated by the owner’s `tokens ending` continuity trigger. The bounded audit task is complete. The Garage and Admin business-logic audits were read-only: no source code, Firestore rules, stored records, payments, or production data were changed.

## Start here — do not repeat completed work

Do **not** recreate the deleted UI plan, redo the UI performance audit, repeat the checkout/recharge-history fixes, clean branches or documentation, or start ALF-12/GLF work. Those items are complete and verified. Do **not** change the UI. The only implementation task authorized by this handoff is **ALF-01** below: block direct client writes to `garages.creditBalance` and add the matching Firestore emulator regression test. First re-verify the current repository state, then inspect the ALF-01 code paths; do not make a broad audit or cleanup pass.

Current verified state after the handoff merge:

- Local branch: `main`.
- Local `main` and `origin/main`: synchronized at `e942ead18df654dfb2a1e9c72c29dc92a208c226`.
- Working tree: clean.
- Open PRs: none.
- Latest successful main Production Gate: run `39369384415`, for SHA `e942ead18df654dfb2a1e9c72c29dc92a208c226`; it passed the documentation-only validation path and skipped Worker deployment as expected.
- Latest deployed Worker identity: `/api/health` and `/api/version` reported commit `77a12276756c874f8fc57c4082614f1b1ac4a2c2`, version `1.0.0-production`, environment `production`, runtime `cloudflare-worker`, status `operational`. The later plan/documentation commits did not deploy a new Worker.
- Protected decision branch: `readiness/firestore-decision-gate` at `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`.
- Handoff PR #207 is merged; no open PRs remain. Re-verify these values again before beginning ALF-01 rather than relying on embedded documentation alone.

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

## Single next task

Implement **ALF-01: block direct client `creditBalance` writes and add the Firestore regression test**.

Scope for the next agent:

1. Re-read the complete `BUSINESS_LOGIC_FIX_PLAN.md` and confirm ALF-01’s exact delete/replace/proof requirements.
2. Inspect the existing Firestore rule for `garages/{garageId}` updates and the Worker credit-grant route before editing.
3. Add a synthetic emulator regression proving an Admin client cannot directly mutate `creditBalance`.
4. Preserve valid reads, Worker-authoritative grants/debits/refunds, ledger entries, events, activity logs, referral behavior, idempotency, and all current visuals.
5. Do not implement trial, cash-accounting, package, or settlement policy changes in the ALF-01 task; those have explicit unresolved decisions in the plan.
6. Do not delete stored data, migrate records, change production rules manually, or broaden permissions without separate explicit approval.

“Done” means a direct client balance mutation is denied while a valid Worker grant still performs one atomic, auditable, idempotent balance transition and its focused rules/route tests pass.

## Unresolved decisions and safety boundaries

Before implementing policy-dependent items, record decisions about: whether trials are active or should be removed with their unreachable metrics; whether prepaid money belongs in cash/net/partner totals; whether one EGP always equals one credit; whether Admin package templates must be selectable in manual grants; whether multi-device sessions are allowed; whether delegate-created and referred garages should be combined everywhere; staff subscriber permissions; garage-owner overrides for entrant-only deletion; legacy vehicles without entrant metadata; refund clamp/reject policy; one-month duration semantics; and notification triggers.

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

For ALF-01, use a short-lived focused branch from synchronized `main`. Add focused synthetic rules and route regressions first. Run the focused tests, then `npm run lint`, `npm run maintainability:check`, `npm run ci:check`, and `git diff --check`. Review the diff for accidental visual, data, or authorization scope changes.

Push the branch and open a PR targeting `main`. Wait for the required Production Gate. Merge only after the required checks pass; do not bypass protected checks. After merging, verify the merged commit, local `main == origin/main`, clean working tree, post-merge Production Gate/deployment result, live Worker health/version identity, open PR count, and protected decision branch. Stop and report ALF-01 before starting ALF-12 or any later Business Logic Fix item.
