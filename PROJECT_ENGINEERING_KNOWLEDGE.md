# RQ Engineering Knowledge

_Last updated: 2026-10-20_

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

## Current focus and next planned task

ALF-01 remains merged in PR #212 at `44d19571e48d5c196f4f751c54230dc98213f3fa`; its direct-credit-balance protection remains live. The owner-approved credit-bundle-only Admin catalog was implemented in PR #214 (source commit `5542d0c0bb128ae59788eed485afbc86e4147c53`), merged as `9d6a787f17fae7b09b3dfbd1b08ffe515bf041ad`, and released after Production Gate run `39377196821` passed. The app/API accept and surface canonical credit bundles only; the separate garage-owned monthly-subscriber product is unchanged. Existing legacy package documents were not deleted or migrated.

ALF-12 is complete in PR #216, merged as `3832f0b2902b8748d53e3bd18b95e5d1de5d10f5`. The post-merge Production Gate run `39383241961` passed, including full tests and Firestore rules emulator tests; production `/api/health` and `/api/version` report that commit. After separate owner approval, the Firestore rules for project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`, were deployed and read back exactly as ruleset `a835ccf0-df94-4908-b9bc-8f1f95aaf35a`, SHA-256 `b70a5b05c33e7a08e596f90c938baab6026cf5d3e9a7eda4cde6a5cbeca84a74`. The Worker exposes only the four approved system-config fields, subscriber mutations go through Worker routes, and vehicle corrections use the confirmed same-entrant stable-entity policy. No stored records were changed or deleted.

GLF-07 is complete and live in PR [#218](https://github.com/tarekhamada875-droid/RQ-/pull/218), merged as `df6dd9182580d25574089ab184441dc5aa0d3980`. The audit confirmed that the client routes subscriber mutations through the Worker and Firestore denies direct mutations. A regression test exposed that deleting an expired subscriber failed to decrement its expired-summary count; the Worker delta helper now treats deletion as absence. The focused subscriber suite passed 11/11; lint, maintainability, Firestore rules emulator, full CI, and diff checks passed. Main Production Gate run `39387778329` passed, deployed/smoke-tested the Worker, and live `/api/health` and `/api/version` report commit `df6dd9182580d25574089ab184441dc5aa0d3980`. No UI, Firestore rules, role policy, or stored data changed. Staff subscriber-management authority remains an unresolved policy decision. GLF-10 (prevent ledger audit collisions) is next; stop and report before starting it.

## Current release state

At GLF-07 application release verification on 2026-10-20, local `main` and `origin/main` matched `df6dd9182580d25574089ab184441dc5aa0d3980`, the working tree was clean, and Production Gate run `39387778329` succeeded. The gate deployed and smoke-tested the verified Worker artifact; live `/api/health` and `/api/version` report `1.0.0-production`, environment `production`, runtime `cloudflare-worker`, and commit `df6dd9182580d25574089ab184441dc5aa0d3980`. The last separately verified production Firestore rules release remains ALF-12 ruleset `a835ccf0-df94-4908-b9bc-8f1f95aaf35a` (SHA-256 `b70a5b05c33e7a08e596f90c938baab6026cf5d3e9a7eda4cde6a5cbeca84a74`); GLF-07 changed no rules. The open-PR snapshot at code release showed only stale documentation PR #211; do not merge it without refreshing and reconciling its content. The protected decision branch was `readiness/firestore-decision-gate` at `d2e0d2c7c904745a672734f5cbde0b7664d1efa2`. A documentation-only status refresh may advance `main` without deploying another Worker, so verify current GitHub and working-tree state before the next task. No stored-data deletion is authorized by this guide.
