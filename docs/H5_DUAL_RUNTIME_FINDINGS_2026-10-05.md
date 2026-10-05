# H5 Dual-Runtime Findings — 2026-10-05

## Scope

This checkpoint compares the current Express runtime with the canonical Hono application through synthetic Fetch/HTTP requests. It does not call production endpoints and does not use real credentials or production Firestore data.

The executable comparison is [`server/h5DualRuntime.contract.test.ts`](../server/h5DualRuntime.contract.test.ts).

## Evidence

- H5 comparison test: **4 tests passed**.
- Hono and Express health responses agree on the stable operational contract.
- Allowed CORS preflight behavior agrees for `https://rq-acg.pages.dev`.
- Unauthenticated vehicle and subscriber mutations both return HTTP 401 and a failed response on both runtimes.
- The synthetic Firebase/Firestore stub prevents any real data writes. Express operation traces are also redirected to an in-memory no-op stub.

## Findings requiring reconciliation

### 1. Express does not expose `/api/version`

| Runtime | Result |
|---|---:|
| Hono | `200`, operational version envelope |
| Express | `404`, API route-not-found envelope |

This is an Express compatibility gap. The production authority is the Worker/Hono runtime, so the eventual resolution should either add an Express compatibility route or explicitly document Express as unsupported for this endpoint before Express retirement.

### 2. Backend operator token has different mutation policy

For synthetic `POST` requests with the configured backend operator token and an invalid empty body:

| Runtime | Result |
|---|---:|
| Hono | `403` — operator-token mutations are blocked before route handling |
| Express | `400` — operator identity is accepted and route validation runs |

The Hono behavior is the safer production policy. Express currently has broader operator authority and must not be treated as behaviorally equivalent for mutation routes.

No mutation was committed by the comparison: the body was intentionally invalid, and the synthetic database stub recorded no real writes.

### 3. Unauthorized envelopes carry different metadata

Both runtimes return HTTP 401 and `success: false`, but Express includes additional fields (`code`, `statusCode`, and timestamp) and uses a different message than Hono. The H5 harness compares the stable semantic authorization outcome while retaining the difference as a known envelope mismatch for later standardization.

## Decision

H5 is **not yet an equivalence pass**. The harness is green as a discovery gate, but the migration cannot claim Express/Hono parity until the version route and operator-token policy are reconciled and the error-envelope contract is intentionally standardized or documented.

## Next action

Reconcile the Express compatibility behavior to the production Worker contract in a focused checkpoint, then rerun this harness and the full repository gate. Do not deploy the migration branch to production or change the production Pages configuration as part of H5.
