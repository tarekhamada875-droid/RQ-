# RQ Engineering Knowledge

_Last updated: 2026-10-19_

This is the single durable project guide. It describes the current product and the engineering mistakes worth avoiding; completed implementation plans and historical task narratives are intentionally not retained here.

## Current product model

RQ is a bilingual garage-management PWA. Garage access is prepaid-credit based: Admin confirms an external payment and grants credits through the server-authoritative credit-grant flow. Regular vehicle entry consumes the defined credit amount. Monthly parking subscribers remain a separate garage-owned product; their lifecycle is date-based and a successful renewal consumes the defined prepaid-credit amount once. The Admin package catalog provides credit-bundle templates, not customer checkout.

The client must not calculate authority, approve payments, mutate balances, or infer permission from stale browser state. Financial and authorization decisions belong to the Worker/API, are transactional and idempotent, and produce auditable ledger/event records. Paid and referral credits remain separately auditable even where the current eligibility policy treats them as interchangeable for regular entry.

## Boundaries that must not regress

- Keep prepaid credit grants, the credit ledger, credit-bundle validation, vehicle authorization, subscriber CRUD/renewal, delegate settlement, financial reporting, and deletion safety.
- Keep server authentication, role checks, garage scoping, idempotency, rate limits, bounded pagination, and machine-readable error envelopes.
- Keep historical report/event parsing only where it is required by an active report or audit surface; never reinterpret an old monetary value as a current credit balance without an explicit approved migration.
- Do not change Firestore data, indexes, routing, or stored records as a side effect of source cleanup.
- Do not silently broaden an allowlist, merge monetary units, or let a compatibility field become an active business rule.

## Lessons from previous work

1. Inventory callers before deleting a route or type. A route that looked retired still had client callers; first make the boundary fail closed, then remove callers and dead tails in a separately testable change.
2. Distinguish current behavior, historical read compatibility, and migration experiments. Similar names do not imply interchangeable data. Keep conversion logic out of runtime paths unless an explicit, reviewed cutover authorizes it.
3. Make destructive actions resumable, bounded, scoped, and auditable. Test partial failure, retries, expired leases, authorization order, and the guarantee that unrelated records are untouched.
4. Treat financial values as typed domains. EGP payment amounts, prepaid credits, referral credits, commissions, and subscriber fees must remain distinct in storage, APIs, reports, and tests.
5. Prefer one canonical server contract over parallel client/runtime implementations. When extracting routes or services, preserve registration order, auth behavior, response envelopes, and idempotency semantics with parity tests.
6. Validate the exact artifact that will deploy. The production gate must typecheck, run the full suite and rules tests, build Pages and Worker artifacts, smoke-test the built Worker, verify maintainability, upload the artifact, deploy only that artifact, and check live health/version identity against the merge SHA.
7. Keep release records factual and current. A merged release must not continue to be described as local or pre-PR; the repository should have one concise current guide rather than accumulating completed plans.

## Working and release rules

Use a short-lived branch from synchronized `main`, make one bounded change, run focused regressions plus `npm run lint`, `git diff --check`, and `npm run ci:check`, then use a reviewed PR. Merge only after the PR Production Gate passes. After merge, verify `main == origin/main`, the post-merge gate and deployment, live `/api/health` and `/api/version`, open PR count, and the protected decision branch.

Before changing production data or deleting stored records, stop and obtain explicit approval for the exact collections, selection predicate, backup/rollback plan, and verification evidence. Source cleanup and data deletion are separate operations.

## Next planned task

The next agent should continue [`UI_OPTIMIZATION_PLAN.md`](./UI_OPTIMIZATION_PLAN.md) with the single bounded task **UI-OPT-01 — complete the authenticated dashboard baseline matrix**. The local Auth/Firestore fixture workflow is now merged and proven for the real garage keypad login and garage dashboard. Extend that workflow to deterministic admin and delegate sessions, then capture the representative authenticated routes and performance measurements before changing production UI code. This remains measurement-first, not a visual redesign; do not rewrite the theme, grid, `FlipNumber`, or `BorderShimmer` by assumption.

## Current release state

The repository is on synchronized `main` at merge commit `c8dcf09029b85468e46be1849588dc245ed5051b`; the working tree is clean and there are no open PRs. The post-merge Production Gate run `39286574082` for this exact commit passed. This merge contains documentation only, so the guarded deploy step was skipped as designed; the live Worker `/api/health` and `/api/version` correctly remain on the latest deployed application commit `19a49bc04494a6a6c3fd6bb7c6936fbffa769634`. The protected decision branch is `readiness/firestore-decision-gate` at `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`. No stored-data deletion is authorized by this guide.
