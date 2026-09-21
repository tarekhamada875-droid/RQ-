# Migration Safety Runbook

This runbook applies to **read-only legacy/v2 comparison work in non-production environments**. The migration utilities are pure: they normalize records, compare read results, redact sensitive diff values, and decide rollback policy. They do not change flags, write financial data, delete records, deploy services, or cut over frontend traffic.

## Required evidence before a preview drill

Record the **current non-production preview URL and exact commit SHA** together. Do not rely on a stale preview link, an unpinned branch, or an old deployment. The URL must identify the currently tested build and the commit must be available for review.

Use a dedicated **Firebase test account** with the minimum permissions needed for the read endpoints. Record the account identifier in the test evidence, but never place credentials, tokens, passwords, or authorization headers in comparison artifacts. Confirm the garage and tenant scope used by the account.

For every paired legacy/v2 request, retain the **request ID** from each side, the endpoint, garage/tenant scope, and the **data version or projection version** reported by the service. The comparison artifact should include deterministic normalized ordering, the configured timestamp tolerance, equality, and redacted mismatches. Financial and authorization mismatches are hard stops even when the difference appears small or is otherwise explainable.

> A stale Cloudflare preview does not establish that the current frontend is calling the intended build. An unauthenticated Railway health check does not establish authenticated frontend-to-Railway success. Likewise, an unauthenticated frontend or backend health response is not evidence that Firebase authentication, garage/tenant authorization, and the read path work together.

## Comparison evidence

Run the same read scenario against legacy and v2 with the same Firebase test account, scope, and request inputs. Preserve the request IDs and data version for each pair. Compare by stable record ID rather than array position; allow only the explicitly documented timestamp tolerance. Treat missing records, changed business fields, changed authorization scope, and changed financial fields as meaningful mismatches. Store only redacted structured diffs in the review artifact.

A reviewer should be able to answer: which current preview URL and commit were tested; which authenticated test account and garage/tenant scope were used; which endpoint and request IDs were paired; which data version was read; what timestamp tolerance was configured; and whether any financial or authorization hard flag was raised.

## Fallback drill

With the v2 preview flag disabled, verify that reads fail closed to the legacy path. Repeat with preview authentication disabled. Confirm that the legacy fallback is available and that no delete operation is performed. The rollback policy must remain pure and must report a blocked decision if fallback is unavailable, a delete is requested, or dual financial writes are requested.

Do not use a rollback drill to “clean up” data. The invariant is **no delete**. The invariant is also **no dual financial write**: comparison and fallback exercises must not write financial records through both paths, and read-only migration work must not introduce financial writes at all.

## Rollback ownership and sign-off

Name one accountable **rollback owner** before the drill begins. The owner must have authority to disable the preview flag, confirm the legacy fallback, stop the exercise, and record the final decision. Include the owner, date/time, current commit, preview URL, test account, request IDs, data version, comparison result, fallback result, and any hard flags in the sign-off record.

A rollback is complete only when the owner confirms that the v2 preview is off or unauthenticated, legacy reads are serving the test scenario, no deletes occurred, no dual financial writes occurred, and the evidence is attached for review. Frontend cutover, Cloudflare configuration, production flags, deployment changes, and financial writes are outside this runbook and must not be performed as part of the pure migration-safety utility work.
