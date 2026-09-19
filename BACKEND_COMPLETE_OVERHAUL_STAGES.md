# RQ- Complete Backend Overhaul Stages

**Status:** Planning baseline

**Scope:** Replace the current backend architecture incrementally while preserving the permanent deployment boundary: Cloudflare Pages serves the frontend, Railway runs the backend, and Firebase Authentication and Cloud Firestore remain the identity and data platform.

**Primary objective:** Build a strict, contract-first, maintainable backend that minimizes Firestore reads, writes, deletes, index work, listener reconnect cost, and rule-evaluation cost without weakening authorization, financial correctness, or auditability.

**Migration rule:** Build the new architecture beside the current implementation. Do not perform an all-at-once rewrite, destructive migration, or production cutover without a rollback path.

## 1. Architectural decision

The target system should keep Firebase and use Railway as the only server-side API boundary. Cloudflare Pages must continue to call Railway directly. The frontend must not call Firestore directly for protected business data after the migration; it should call typed Railway endpoints. Railway will authenticate Firebase ID tokens, enforce application authorization and sessions, execute domain commands, and access Firestore through server-side repositories.

The target flow is:

```text
Cloudflare Pages React frontend
        │ HTTPS + Firebase ID token + X-Session-ID
        ▼
Railway Node.js/TypeScript API
        │ authentication, authorization, validation, commands
        ▼
Application services and domain invariants
        │ repositories, transactions, idempotency, projections
        ▼
Cloud Firestore + Firebase Authentication
```

The backend must use the Firebase Admin SDK through a narrowly configured service identity. Firestore Security Rules protect direct client access and act as a second boundary, but they do not protect server-side Admin SDK calls. The Railway service therefore requires IAM restrictions, application authorization, audit logging, and secret isolation in addition to Firestore Rules. [1]

## 2. Design principles

### 2.1 Make invalid states difficult to represent

Use strict TypeScript and runtime schemas at every external boundary. Data from `req.body`, query parameters, Firebase tokens, Firestore documents, webhooks, and third-party services enters the program as `unknown`. Parse it into a named schema before domain code receives it.

Use these compiler rules in the new backend package:

```json
{
  "strict": true,
  "noImplicitAny": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "useUnknownInCatchVariables": true,
  "noFallthroughCasesInSwitch": true
}
```

Use Zod or an equivalent schema library for runtime validation. Infer TypeScript types from schemas where practical. Do not replace `any` with `as SomeType` without runtime evidence; that only hides the same defect.

### 2.2 Separate authority from projection

Every business fact must have one authoritative write location. Derived dashboards, counts, histories, summaries, and search documents are projections. A projection may be rebuilt from authoritative data and must never become the only source of truth for money, ownership, session validity, or deletion state.

This distinction permits cost-efficient denormalization without creating contradictory business state.

### 2.3 Optimize expected cost, not only document count

For an operation class, model the expected daily Firestore cost as:

```text
C = cr·R + cw·W + cd·D + ci·I + cs·S + cb·B
```

where `R` is document reads, `W` is document writes, `D` is deletes, `I` is index-entry reads, `S` is stored data, and `B` is bandwidth. The coefficients are the current project prices for the selected region and billing plan. Firestore charges for documents and index entries read, writes, deletes, storage, and bandwidth; listeners can incur reads when result documents are added, updated, removed from a result set, or re-read after reconnects. [2]

For each endpoint, also record:

```text
readAmplification  = documents_read / useful_entities_returned
writeAmplification = documents_written / authoritative_business_events
listenerExposure   = result_documents × expected_updates × reconnect_factor
```

The goal is not zero reads or zero denormalization. The goal is to minimize `C` subject to correctness, security, latency, and operability constraints. A single summary write that prevents thousands of repeated reads is often cheaper. A projection that duplicates every large event on every mutation is often not.

### 2.4 Prefer deterministic algorithms

Use algorithms whose work and cost can be bounded before execution. Every list endpoint must have a hard page size, a cursor, and a maximum traversal budget. Every bulk operation must be resumable, idempotent, and checkpointed. Every mutation must have a deterministic idempotency key or a server-generated operation ID.

Do not use offsets for pagination. Firestore charges for skipped documents when offsets are used; cursor-based pagination avoids paying for documents that are only skipped. [2]

## 3. Target codebase structure

Create the new backend as an isolated package or directory first. Do not mix new domain code into legacy route handlers.

```text
server-v2/
  app.ts                         # Railway process and HTTP composition
  config/
    env.ts                       # typed, fail-fast environment parsing
  http/
    routes/                      # thin transport adapters
    middleware/                  # auth, correlation, errors, rate limits
    contracts/                   # request/response schemas and OpenAPI metadata
  application/
    commands/                    # state-changing use cases
    queries/                     # read use cases
    policies/                    # authorization decisions
  domain/
    garage/
    vehicle/
    subscriber/
    package/
    wallet/
    commission/
    session/
    deletion/
    reporting/
  infrastructure/
    firebase/
      admin.ts
      repositories/
      converters/
      transactions/
    idempotency/
    projections/
    telemetry/
  shared/
    result.ts
    errors.ts
    pagination.ts
    money.ts
    time.ts
```

A route should perform only transport work:

```text
parse request → authenticate → authorize → call use case → map result to response
```

A use case should coordinate a business operation. A domain service should enforce a business invariant. A repository should own Firestore paths and query shapes. No React component, Express route, or report renderer should construct Firestore paths directly.

## 4. Data model strategy for low Firestore cost

### 4.1 Use bounded tenant-oriented paths

Use predictable, tenant-scoped paths with bounded query surfaces:

```text
/garages/{garageId}
/garages/{garageId}/vehicles/{vehicleId}
/garages/{garageId}/subscribers/{subscriberId}
/garages/{garageId}/activity/{activityId}
/garages/{garageId}/dailySummaries/{dateKey}
/garages/{garageId}/readModels/{modelName}
/garages/{garageId}/walletLedger/{eventId}
/garages/{garageId}/idempotency/{keyHash}
/sessions/{sessionId}
/pinReservations/{lookupHash}
/packages/{packageId}
/financialEvents/{eventId}
/operations/{operationId}
```

The exact final paths must be confirmed by an inventory of the current database. The important constraints are that a tenant query does not require a collection-wide scan, deletion can enumerate known subcollections, and authorization can derive ownership from a small number of documents.

### 4.2 Keep authoritative documents small

A garage document should contain current identity and operational state that is needed on most requests. It should not contain unbounded activity, vehicle history, report rows, or large arrays. Large or unbounded data belongs in subcollections or immutable event documents.

Use a small set of stable fields for hot decisions:

```text
ownerUid
status
isLocked
isSuspended
isDeleting
currentSessionId
activePackageId
packageExpiresAt
balance
balanceVersion
carsInside
stateVersion
updatedAt
```

Do not update unrelated fields in the same hot document for every event. Hot documents create contention and multiply transaction retries.

### 4.3 Use an immutable financial ledger plus a materialized balance

Money operations should produce an append-only ledger event and update a materialized wallet account in the same Firestore transaction. The transaction must verify the expected account version, enforce non-negative balance where required, record the idempotency key, and create the canonical event exactly once.

```text
wallet account:
  balance
  version
  lastLedgerEventId
  updatedAt

wallet ledger event:
  eventId
  garageId
  kind
  amountMinorUnits
  balanceBefore
  balanceAfter
  referenceType
  referenceId
  idempotencyKeyHash
  actorUid
  createdAt
```

Store money as integer minor units, not floating-point values. Use explicit decimal conversion at the API boundary and integer arithmetic inside the domain. Enforce the invariant:

```text
balance_after = balance_before + sum(ledger_effects)
```

A reconciliation job must compare the materialized balance with the ledger for sampled and full historical ranges. Reports should read daily financial summaries for normal views and use the ledger for audit and reconciliation.

### 4.4 Denormalize only bounded, rebuildable read models

Create read models for high-frequency screens such as the garage dashboard, admin queue summary, daily activity summary, and package catalog. A read model must state:

- Its source events or authoritative documents.
- Its rebuild algorithm.
- Its maximum document size.
- Its update trigger.
- Its acceptable staleness.
- Its owner and deletion policy.

Prefer one bounded summary document per garage/day or garage/view rather than repeatedly reading every event. Do not duplicate full event payloads into every projection. Store IDs, totals, status, and the small fields needed by the screen.

### 4.5 Bound listeners

Realtime listeners should be used only for small, high-value result sets: the current garage document, a bounded pending queue, or a small recent-activity window. Every listener needs an explicit unsubscribe path, a query limit, a lifecycle owner, and a reconnect cost estimate.

Do not listen to an entire activity collection or an unbounded report. Firestore bills reads as listener result documents change and can re-read results after reconnects. [2]

## 5. Algorithms and consistency patterns

### 5.1 Idempotency algorithm

For every mutation, require a client-provided idempotency key or create one at the command boundary. Compute:

```text
fingerprint = SHA-256(canonicalJson(method, route, actor, tenant, payload))
keyRecord = (tenantId, actorId, idempotencyKey)
```

In a transaction:

1. Read the idempotency record.
2. If it exists with a different fingerprint, reject with a conflict.
3. If it exists with a completed result, return the stored result without replaying side effects.
4. If it is pending and unexpired, reject or retry according to the operation policy.
5. Otherwise create the pending record, perform the authoritative state change, append events, store the response summary, and mark the record complete.

Do not store entire large responses in idempotency records. Store a bounded response envelope and a reference to the authoritative result.

### 5.2 Optimistic concurrency and transaction sizing

Use Firestore transactions when a value is read and then conditionally changed. Read all required documents before writes, keep the transaction short, and avoid network calls inside it. Firestore can retry a transaction when a read document changes, so transaction functions must be deterministic and must not mutate external application state. Transactions also have size, lock, idle, and total-time limits. [3]

Use batched writes when no read-dependent decision is required. Batches provide atomicity, but each document write still counts as a write; batching improves consistency and round trips, not billing by itself. [3]

Keep hot transactions to the minimum document set:

```text
wallet account + idempotency record + canonical financial event
```

Do not include a large report, full vehicle list, or unrelated projection in the same transaction.

### 5.3 Sharded counters only for true hotspots

Use a single counter document when write frequency is low and contention is bounded. Use a fixed number of shard documents when many concurrent writers update one aggregate. Read the shards only for aggregate views, and maintain a small materialized total when the screen is read frequently.

Choose shard count from observed contention, not guesswork. Increase it only through a migration that supports old and new shard layouts. A sharded counter reduces contention but increases reads, so its expected cost must be measured.

### 5.4 Cursor pagination

Every list query should return:

```text
items
nextCursor
hasMore
pageSize
```

Use a stable ordering such as `(createdAt desc, documentId desc)` so equal timestamps do not create duplicates or omissions. The cursor must encode the complete ordering tuple. Reject unbounded requests and cap page sizes server-side.

### 5.5 Projection and repair algorithms

Use an event-to-projection worker or explicit post-transaction projection queue. Each projection update must be idempotent:

```text
projectionVersion = lastAppliedEventSequence
if event.sequence <= projectionVersion: ignore
if event.sequence == projectionVersion + 1: apply
if event.sequence > projectionVersion + 1: mark gap and repair
```

Because Firestore does not provide a general relational join or a global transaction across arbitrary asynchronous workers, projections must track version, last event, and repair status. The authoritative ledger remains the recovery source.

### 5.6 Deterministic time and money

Use one server-side timezone boundary helper for Cairo business dates. Store timestamps as Firestore timestamps or UTC instants. Derive a `businessDateKey` at the command boundary and persist it on events and daily summaries. Never calculate a financial day by scattered fixed offsets.

Use integer minor units for all money calculations. Define discount order, rounding, capacity, trial, refund, and commission rules as pure functions with property-based tests.

## 6. Firebase Security Rules and IAM model

### 6.1 Client access policy

The preferred client policy is deny-by-default for business data. The frontend authenticates with Firebase, sends the ID token and canonical `X-Session-ID` to Railway, and does not directly write wallet, package, session, financial, deletion, or administrative documents.

If the client must read a narrow document directly, the rule must validate tenant ownership, role, document shape, and query constraints. Every query must be designed so that all potential returned documents satisfy the rule; Firestore Rules are not post-query filters. [4]

### 6.2 Server access policy

The Railway Admin SDK bypasses Firestore Rules and authenticates with Google Application Default Credentials/IAM. [4] Therefore:

- Use a dedicated service account for the Railway backend.
- Grant only the required Firestore and Firebase Auth permissions.
- Keep credentials in Railway secrets, never in Git or frontend variables.
- Separate production and non-production projects where possible.
- Log actor, tenant, operation, correlation ID, and result for sensitive commands.
- Do not trust a client-supplied role, garage ID, balance, package price, or session ownership claim.

### 6.3 Rule access-call budget

Security Rules that call `get()`, `exists()`, or `getAfter()` consume access calls and can also incur billed reads. A single-document or query request has a 10-call limit; multi-document reads, transactions, and batches have a 20-call total limit while retaining a 10-call per-operation limit. [4]

Design authorization so it can be proven from the target document and one small, stable ownership document. Avoid deeply nested rule lookups. Prefer server-mediated commands for complex authorization rather than making every client write depend on many rule reads.

### 6.4 Rules testing

Create Emulator Suite tests for every collection and operation. Test both the rule and the query shape. Include:

- Owner can read only the owner’s tenant data.
- Delegate scope cannot cross garages.
- Client cannot mutate wallet balances or ledger events.
- Client cannot forge session ownership.
- Client cannot bypass deletion locks.
- Admin-only operations reject normal users.
- Invalid field additions and type changes are rejected.
- Batch and transaction rule-call budgets remain within limits.

## 7. API and contract design

Use a versioned API with explicit request and response schemas. The new API should expose commands and queries rather than raw Firestore operations.

```text
GET  /v2/garages/{garageId}
GET  /v2/garages/{garageId}/dashboard
GET  /v2/garages/{garageId}/vehicles?cursor=...
POST /v2/garages/{garageId}/vehicles/check-in
POST /v2/garages/{garageId}/vehicles/check-out
POST /v2/garages/{garageId}/wallet/top-ups
POST /v2/garages/{garageId}/packages/purchases
POST /v2/admin/recharges/{requestId}/approve
POST /v2/garages/{garageId}/deletion
GET  /v2/reports/financial?garageId=...&from=...&to=...
```

Every response should use a stable envelope:

```json
{
  "ok": true,
  "data": {},
  "requestId": "..."
}
```

Every error should include a stable machine-readable code, a safe human message, and the request ID. Do not expose Firestore paths, stack traces, tokens, or private credentials.

Generate an OpenAPI document from the contract schemas. Generate or hand-maintain a typed frontend client from that contract. The frontend should not know Firestore collection names.

## 8. Staged implementation plan

### Stage 0 — Freeze, inventory, and cost baseline

Record the current route list, auth/session behavior, Firestore collections, indexes, security rules, listeners, scheduled work, and deployment variables. Capture representative read/write/delete counts for dashboard loads, check-in, checkout, package purchase, recharge approval, reports, and deletion. Record latency, document sizes, listener result counts, and transaction retries.

**Exit criteria:** a versioned behavior catalog exists; current production remains unchanged; each high-value operation has a cost baseline and a characterization test.

### Stage 1 — Create the v2 workspace and strict foundations

Create `server-v2` or a separate backend package. Add strict TypeScript, typed environment parsing, structured errors, request IDs, safe logging, schema validation, test fixtures, and CI commands. Do not connect it to production traffic.

**Exit criteria:** the new package builds with no explicit `any` in new code; an invalid environment fails at startup; unit tests cover schema errors, error mapping, money arithmetic, pagination, and idempotency fingerprints.

### Stage 2 — Define contracts and domain invariants

Define schemas and types for authentication, sessions, garages, vehicles, subscribers, packages, wallet operations, recharges, commissions, reports, and deletion. Write pure domain functions for price, discount, trial, capacity, commission, refund, and business-date rules.

Use property-based tests for invariants such as conservation of wallet value, idempotent replay, non-negative balance, stable pagination, and monotonic ledger sequences.

**Exit criteria:** contract fixtures are shared by backend tests and the generated frontend client; the domain test suite can run without Firebase.

### Stage 3 — Build Firebase repositories and converters

Implement repository interfaces and Firebase Admin implementations. Each converter must validate Firestore input and produce a typed domain object. Each repository must expose bounded methods instead of arbitrary collection access.

Add query explain/cost review for high-volume queries. Use cursors, limits, selective projections where supported, and indexes that match actual query shapes. Do not use offsets or unbounded listeners.

**Exit criteria:** repository tests run against the Firebase Emulator Suite; every query has a documented result bound and authorization assumption.

### Stage 4 — Build authentication, sessions, and authorization

Verify Firebase ID tokens in Railway. Reuse the existing canonical `X-Session-ID` behavior while replacing route-specific checks with one typed authorization policy layer. Model session ownership, expiry, role, tenant, and revocation explicitly.

Use a small session document and avoid reading multiple role documents on every request. Cache only safe, short-lived verification results and invalidate on revocation-sensitive operations.

**Exit criteria:** emulator and integration tests prove owner isolation, role isolation, session freshness, logout, revocation, and replay resistance.

### Stage 5 — Build wallet, ledger, packages, and idempotency

Implement financial commands before migrating financial routes. Use integer minor units, authoritative package catalog data, transactionally updated wallet accounts, append-only ledger events, idempotency records, and reconciliation queries.

Do not migrate the frontend to the new financial endpoints until duplicate requests, conflicting idempotency keys, insufficient balances, concurrent purchases, refunds, commission events, and failure recovery are tested.

**Exit criteria:** model-based tests prove ledger conservation and exactly-once command effects under retries; a reconciliation report matches the current system for a controlled fixture set.

### Stage 6 — Build operational commands

Migrate garage profile changes, vehicle check-in/out, subscriber updates, corrections, delegates, trial decisions, lock/suspension, and deletion locks. Use short transactions for state decisions. Keep activity events separate from hot state documents.

For permanent deletion, create a resumable operation document with a phase, cursor, attempt count, and last error. Delete known subcollections in bounded batches. Mark the tenant unavailable before cleanup and make every retry idempotent.

**Exit criteria:** every command has a typed request, authorization policy, idempotency policy, transaction boundary, audit event, and rollback or repair procedure.

### Stage 7 — Build read models and reports

Define dashboard and report read models from authoritative events and state. Use daily summaries for common date ranges and ledger/event scans only for audit or reconciliation. Use bounded pagination and server-side aggregation. Avoid loading all activity into the browser.

For each report, specify whether it is strongly consistent, transactionally current, or eventually consistent. Display the as-of timestamp when a projection is eventually consistent.

**Exit criteria:** representative dashboard and report workloads meet read-budget targets and reconcile against authoritative fixtures.

### Stage 8 — Connect the existing Cloudflare frontend through an adapter

Add a typed API adapter that can route one feature at a time to v2. Keep the current UI and user flows initially. Remove direct business Firestore calls from migrated features. Keep the old endpoint behind a feature flag for rollback.

**Exit criteria:** the frontend can switch each migrated feature between legacy and v2 without changing user-visible contracts; Cloudflare-to-Railway CORS and session headers remain correct.

### Stage 9 — Shadow, compare, and migrate data

Run v2 reads in shadow mode for safe read endpoints. Compare normalized responses, not raw document ordering. For writes, use a controlled dual-write only when the operation has a deterministic idempotency key and a repair plan; never create two independent financial authorities.

Backfill projections from authoritative data in resumable batches. Record source version, destination version, batch cursor, checksum, and error state. Pause when read/write budget or error rate exceeds the stage threshold.

**Exit criteria:** v2 and legacy results agree within documented eventual-consistency windows; all backfills are resumable and verified.

### Stage 10 — Progressive production cutover

Route internal/admin traffic first, then a small garage cohort, then larger cohorts. Monitor request errors, authorization denials, transaction retries, read/write counts, latency, listener reconnects, projection lag, reconciliation differences, and rollback events.

Keep the legacy path available until the final cohort has completed a stable observation window. Do not delete legacy data or collections during the traffic migration.

**Exit criteria:** all cohorts meet SLO and cost budgets; financial reconciliation is continuously green; rollback has been tested in a non-production environment and remains possible.

### Stage 11 — Retire legacy paths and enforce the new architecture

Remove old frontend Firestore access, old route handlers, duplicate projection writers, and compatibility shims only after traffic is fully migrated and data retention requirements are satisfied. Update Rules, IAM, indexes, runbooks, and the project continuation documents.

Enable the complete lint and type gates for new code. Keep narrow documented exceptions only where external SDK boundaries or test doubles require them.

**Exit criteria:** one authoritative write path exists for each business fact; all production routes use typed contracts; the repository has no unowned compatibility layer.

## 9. Cost budgets and observability

Define budgets per user action before implementation. Example starting budgets should be measured and then adjusted from real data:

| Operation | Read budget target | Write budget target | Notes |
|---|---:|---:|---|
| Garage dashboard open | One garage state plus bounded summaries | Zero | Avoid loading full history or all vehicles unless requested. |
| Vehicle check-in | Small fixed transaction set | Small fixed event/state set | Do not scan all subscribers or vehicles. |
| Vehicle checkout | Small fixed transaction set | Small fixed event/state set | Use authoritative vehicle ID. |
| Package purchase | Catalog read plus wallet/idempotency reads | Wallet, ledger, purchase, projection writes | Exact count must be measured. |
| Recharge approval | Request, package, wallet/idempotency reads | Approval, ledger, audit, projection writes | Must be exactly-once under replay. |
| Financial report | Bounded summary reads | Zero | Use ledger only for explicit reconciliation. |
| Deletion page | Bounded page reads | Bounded batch deletes | Resumable with a cursor. |

Instrument each request with:

```text
requestId
actorUid
tenantId
route
operation
latencyMs
firestoreReads
firestoreWrites
firestoreDeletes
transactionRetries
projectionLagMs
resultCode
```

Do not log tokens, PINs, passwords, authorization headers, private credentials, or full financial payloads. Aggregate metrics by route and operation rather than logging every document.

## 10. Testing strategy

The overhaul must use several test layers. Unit tests prove pure domain mathematics. Contract tests prove request and response schemas. Repository tests run against the Firebase Emulator Suite. Security-rule tests prove client access. Integration tests prove Railway middleware, repositories, and use cases together. Property-based tests explore money, pagination, idempotency, and concurrent retry invariants. Cost tests count repository calls and reject accidental N+1 behavior.

A change is not complete when it compiles. It is complete when it has:

1. A domain or contract test.
2. A repository or emulator test where Firebase behavior matters.
3. A Rules test where client access matters.
4. A cost-bound test for high-volume queries.
5. A migration or rollback note if data shape changes.
6. Full TypeScript, tests, build, maintainability, diff, and safe smoke checks.

## 11. Non-negotiable constraints

- Cloudflare Pages remains the frontend deployment.
- Railway remains the backend deployment.
- Firebase Authentication remains the identity provider unless a separate approved migration is created.
- Firestore remains the primary database.
- The frontend does not receive Admin SDK credentials.
- The frontend does not write financial, session, deletion, or administrative state directly.
- Security Rules remain deny-by-default and are tested in the Emulator Suite.
- Railway server authorization remains necessary because Admin SDK calls bypass Firestore Rules. [4]
- No migration may create two competing financial authorities.
- No bulk operation may depend on one unbounded transaction or one unbounded query.
- No production cutover may occur without a rollback path and read-only smoke verification.

## 12. First implementation slice

The first code slice should not be a broad rewrite. It should create the new foundation without changing production behavior:

1. Add `server-v2` with strict TypeScript and typed environment parsing.
2. Add shared schemas for `Garage`, `Package`, `WalletAccount`, `FinancialEvent`, `Session`, and common API envelopes.
3. Add pure money, discount, trial, pagination, and idempotency modules.
4. Add Firebase Emulator Suite setup and repository interfaces.
5. Add cost-counting test doubles that fail on unbounded reads, missing limits, offsets, or N+1 repository calls.
6. Add a health endpoint and a typed read-only package-catalog endpoint on a non-production Railway environment.
7. Do not migrate writes until the contract, repository, Rules, and cost tests pass.

This first slice creates the foundation for the overhaul while the current system remains available. It also gives future contributors a clear place to add typed code instead of extending the legacy `any` boundaries.

## References

[1]: https://firebase.google.com/docs/firestore/security/rules-conditions "Writing conditions for Cloud Firestore Security Rules"
[2]: https://firebase.google.com/docs/firestore/pricing "Understand Cloud Firestore billing"
[3]: https://firebase.google.com/docs/firestore/manage-data/transactions "Transactions and batched writes"
[4]: https://firebase.google.com/docs/firestore/security/rules-conditions "Firestore Rules, server libraries, and access-call limits"
