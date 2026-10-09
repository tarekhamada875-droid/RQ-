# H5 Dual-Runtime Findings — 2026-10-05

## Scope

This checkpoint compares the current Express runtime with the canonical Hono application through synthetic Fetch/HTTP requests. It does not call production endpoints and does not use real credentials or production Firestore data.

The executable comparison is [`server/h5DualRuntime.contract.test.ts`](../server/h5DualRuntime.contract.test.ts).

## Reconciliation completed

The two concrete parity blockers from the discovery run were fixed in the migration branch:

1. **Express `/api/version` compatibility route** was added with the same stable operational contract as Hono.
2. **Express backend operator-token mutations** are now rejected with HTTP 403 before route validation, matching Hono’s security policy.

## Current evidence

- H5 comparison test: **4 tests passed**.
- Focused reconciliation tests: **9 tests passed**.
- Hono and Express health responses agree on the stable operational contract.
- Hono and Express version responses now agree on status and stable envelope fields.
- Allowed CORS preflight behavior agrees for `https://rq-acg.pages.dev`.
- Unauthenticated vehicle and subscriber mutations both return HTTP 401 and a failed response on both runtimes.
- Backend operator-token mutation attempts return HTTP 403 on both runtimes.
- The synthetic Firebase/Firestore stub prevents any real data writes. Express operation traces are redirected to an in-memory no-op stub.

## Remaining intentional difference

Unauthorized responses still contain different supplementary metadata:

- Both runtimes return HTTP 401 and `success: false`.
- Express includes `code`, `statusCode`, timestamp, and a more specific message.
- Hono returns a smaller error envelope.

The H5 harness compares the stable semantic authorization outcome. Standardizing the complete error envelope is a later compatibility cleanup, not a security blocker, because the frontend uses the stable failure status/error behavior.

## Decision

The initial H5 blockers are **reconciled**. H5 may advance to preview deployment and synthetic smoke testing, while keeping Express available for rollback and continuing to track the supplementary error-envelope difference.

No production Worker, Pages environment, or production database was changed by this checkpoint.
