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

The next agent should follow [`BUSINESS_LOGIC_FIX_PLAN.md`](./BUSINESS_LOGIC_FIX_PLAN.md), beginning with ALF-01: block direct client credit-balance writes and add the Firestore regression test. Then continue with the coordinated Admin/Garage order in the plan. Delete confirmed bad runtime logic rather than preserving it as archived, retired, or compatibility behavior. Preserve the exact current visuals, valid financial semantics, authorization boundaries, bilingual behavior, RTL/LTR behavior, and valid stored records. Do not delete stored data without separate explicit approval.

## Current release state

The repository’s release state must be verified from GitHub and the working tree before each task; do not rely on an embedded commit from an earlier documentation merge. Confirm synchronized `main`, the latest successful Production Gate and deployment, live `/api/health` and `/api/version`, open PR count, and the protected decision branch. No stored-data deletion is authorized by this guide.
