# RQ- Complete Backend Overhaul Master Plan

**Document status:** Implementation blueprint

**Repository:** `tarekhamada875-droid/RQ-`

**Permanent deployment boundary:** Cloudflare Pages is the frontend, Railway is the backend, and Firebase Authentication plus Cloud Firestore remain the identity and data platform.

**Purpose:** Replace the current backend’s weak data boundaries with a strict, contract-first, cost-measured architecture that is safe for financial operations, secure under Firebase’s rules model, maintainable by future contributors, and scalable without uncontrolled Firestore reads, writes, deletes, listeners, or transaction contention.

> This document describes what must be built. It does not claim that the overhaul is already implemented. The current backend remains the production system until each stage has passed its exit criteria and the migration is deliberately approved.

---

## 1. Executive decision

The project should not attempt a one-step rewrite of the current backend. It should build a **versioned backend platform beside the current implementation**, migrate one bounded capability at a time, compare the new behavior with the old behavior, and remove the old path only after the new path is authoritative and rollback has been proven.

The new platform should be a strict TypeScript application running on Railway. It should expose a versioned HTTP API to the Cloudflare Pages frontend. It should verify Firebase Authentication tokens, enforce application-level authorization and sessions, validate every external payload at runtime, execute domain commands, and access Firestore only through typed repositories and transaction services.

The target architecture is:

```text
Cloudflare Pages
  React frontend
  Typed API client
  UI state and server-state adapters
  No protected business writes directly to Firestore
                    │
                    │ HTTPS
                    │ Firebase ID token + canonical session header
                    ▼
Railway
  Node.js + TypeScript API
  Configuration and secret validation
  Correlation IDs, structured logs, rate limits
  Firebase token verification
  Session and authorization policies
  Contract validation
  Commands and queries
  Domain rules and invariants
  Idempotency and transaction orchestration
  Typed Firestore repositories
                    │
                    ▼
Firebase
  Firebase Authentication
  Cloud Firestore
  Emulator-tested Rules
  IAM-protected Admin SDK access
  Bounded indexes and query shapes
```

The target system has two types of data:

1. **Authoritative state and events.** These determine ownership, access, balances, purchases, sessions, and other business facts.
2. **Rebuildable read models.** These make dashboards and reports cheap and fast but can be regenerated from authoritative data.

No read model, cache, or frontend state may become the hidden authority for money, identity, ownership, or authorization.

---

## 2. What this overhaul is intended to fix

The current `no-explicit-any` findings, Hook findings, repeated route logic, and expensive Firestore access patterns are symptoms of weak boundaries. The central problems to remove are structural:

- External request data is not always validated before business logic uses it.
- Firestore documents can enter the application with an uncertain shape.
- Frontend and backend response contracts are not defined once and shared.
- Route handlers sometimes combine transport, authorization, business rules, persistence, and response formatting.
- Financial values and financial events require stronger authority and replay guarantees.
- Long-running lists and listeners can become expensive as usage grows.
- Derived dashboards and reports can repeatedly reconstruct data that should have a bounded projection.
- Authorization can require more rule lookups than necessary.
- Large mutable documents can become contention hotspots.
- Tests do not yet enforce a cost budget or prevent accidental N+1 reads.
- Legacy compatibility logic spreads weak types into otherwise unrelated modules.

The overhaul fixes these problems at their entry points rather than masking them with type assertions or broad ESLint exclusions.

---

## 3. Non-negotiable platform constraints

The following constraints are architectural requirements, not preferences.

### 3.1 Cloudflare Pages remains the frontend

Cloudflare Pages serves the React application and static assets. It must not receive Firebase Admin credentials, Railway private credentials, or Firestore service-account keys. The browser may hold a Firebase client session and an ID token, but it must not be trusted as the authority for prices, balances, roles, ownership, or financial outcomes.

The frontend calls Railway over HTTPS. CORS must allow only the approved Cloudflare Pages origins and explicitly approved local development origins. The backend must reject unknown origins for credentialed requests.

### 3.2 Railway remains the backend

Railway runs the API process, background repair workers if needed, migrations, and operational endpoints. Railway environment variables hold secrets and deployment configuration. Production secrets must not be committed to GitHub, embedded in Cloudflare assets, or returned through diagnostic endpoints.

The Railway process must fail fast when required configuration is missing or malformed. Development defaults must never silently activate in production.

### 3.3 Firebase remains the identity and database platform

Firebase Authentication remains the initial identity provider. Cloud Firestore remains the primary operational database. Firebase Admin SDK access is server-side only.

The backend must recognize that Admin SDK calls bypass Firestore Security Rules. Rules are therefore essential for direct client access, but they are not a complete authorization layer for Railway. Railway requires its own authentication, authorization, IAM, audit, and secret controls. [4]

### 3.4 No big-bang production rewrite

The current backend remains available until the v2 path has passed characterization, contract, emulator, security, cost, migration, and rollback tests. Financial writes are migrated last, not first.

---

## 4. Architecture rules for future contributors

Every new backend capability must follow these rules.

### Rule A: External data enters as `unknown`

The types of `req.body`, query strings, headers, decoded custom claims, Firestore documents, webhook payloads, and third-party responses are not trusted automatically. They enter the system as `unknown` and are parsed into a named schema.

```ts
const input: unknown = request.body;
const command = CreateGarageCommandSchema.parse(input);
```

`as SomeType` is not validation. It is allowed only when a documented invariant has already established the shape, and it must not replace parsing at a trust boundary.

### Rule B: Routes are adapters, not business logic

A route may authenticate, parse, authorize, call a use case, and map the result to HTTP. It must not calculate package prices, mutate wallet balances, construct arbitrary Firestore paths, or implement deletion traversal inline.

### Rule C: Repositories own Firestore

Only the infrastructure layer knows collection paths, converters, indexes, query order, pagination cursors, transaction reads, and Firestore-specific sentinel values. Domain services receive typed objects and repository interfaces.

### Rule D: Every mutation is replay-safe

A state-changing command must define its idempotency behavior before implementation. Financial and lifecycle commands must reject ambiguous replay rather than guessing.

### Rule E: Every list is bounded

A list endpoint must have a maximum page size, a stable order, a cursor, and a server-side traversal limit. Offsets and unbounded listeners are prohibited for new code.

### Rule F: Every denormalized document is rebuildable

A projection must identify its authoritative source, version, rebuild algorithm, repair procedure, maximum size, and acceptable staleness.

### Rule G: Every cost is observable

High-volume repositories must expose read, write, delete, retry, and projection metrics in tests and in production telemetry.

---

## 5. Target repository structure

The new implementation should be isolated from legacy handlers until the migration is mature.

```text
server-v2/
  app.ts
  bootstrap.ts

  config/
    env.ts
    featureFlags.ts

  http/
    routes/
      authRoutes.ts
      garageRoutes.ts
      vehicleRoutes.ts
      subscriberRoutes.ts
      packageRoutes.ts
      walletRoutes.ts
      rechargeRoutes.ts
      reportRoutes.ts
      deletionRoutes.ts
    middleware/
      authenticateFirebase.ts
      requireSession.ts
      authorize.ts
      requestContext.ts
      rateLimit.ts
      errorHandler.ts
    contracts/
      common.ts
      auth.ts
      garages.ts
      vehicles.ts
      packages.ts
      wallet.ts
      recharges.ts
      reports.ts
      deletion.ts

  application/
    commands/
      claimSession.ts
      createGarage.ts
      updateGarage.ts
      checkInVehicle.ts
      checkOutVehicle.ts
      purchasePackage.ts
      topUpWallet.ts
      approveRecharge.ts
      rejectRecharge.ts
      deleteGarage.ts
    queries/
      getGarageDashboard.ts
      listVehicles.ts
      listSubscribers.ts
      listActivity.ts
      getFinancialReport.ts
    policies/
      garageAccessPolicy.ts
      adminPolicy.ts
      delegatePolicy.ts
      sessionPolicy.ts

  domain/
    garage/
    vehicle/
    subscriber/
    package/
    wallet/
    recharge/
    commission/
    session/
    deletion/
    reporting/
    shared/
      money.ts
      businessDate.ts
      invariants.ts

  infrastructure/
    firebase/
      adminApp.ts
      firestore.ts
      converters/
      repositories/
      transactionRunner.ts
      emulator.ts
    idempotency/
    projections/
    audit/
    telemetry/

  shared/
    errors.ts
    result.ts
    pagination.ts
    hashing.ts
    clock.ts
    logging.ts
```

The exact directory names may change, but the dependency direction must remain:

```text
HTTP → Application → Domain
                  ↓
             Interfaces
                  ↑
Infrastructure implements interfaces
```

Domain code must not import Express, Firebase, Firestore types, React, or environment variables.

---

## 6. Contract-first API platform

### 6.1 One contract, three uses

Each endpoint contract must serve three purposes:

1. Runtime validation of requests and responses.
2. Compile-time TypeScript types for the backend and frontend.
3. Documentation and compatibility checks.

Use Zod or an equivalent runtime schema library. Generate OpenAPI metadata from the same schemas where practical. The frontend should consume a generated or centrally typed client rather than manually reconstructing URLs and payload types.

### 6.2 Common response envelope

Successful responses should use a stable envelope:

```ts
const SuccessResponse = <T extends z.ZodTypeAny>(data: T) => z.object({
  ok: z.literal(true),
  data,
  requestId: z.string(),
});
```

Errors should use a stable structure:

```ts
{
  "ok": false,
  "error": {
    "code": "WALLET_INSUFFICIENT_BALANCE",
    "message": "The wallet balance is not sufficient for this operation.",
    "retryable": false,
    "requestId": "..."
  }
}
```

The public message must be safe. Stack traces, Firestore paths, credentials, PIN values, and internal query details must remain server-side.

### 6.3 Versioning

Use `/v2` for the new contract. Do not silently change `/api` behavior while the migration is in progress. A v2 endpoint may call the legacy repository during an early adapter stage, but the contract must be new and typed so the migration can change persistence without changing the frontend again.

### 6.4 Command and query separation

A **command** changes state and must define authorization, idempotency, transaction boundaries, audit behavior, and retry behavior.

A **query** reads state and must define consistency level, result bound, pagination, and cost target.

Examples:

```text
Command: ApproveRecharge
Query:   GetGarageDashboard
Command: PurchasePackage
Query:   ListGarageActivity
Command: TopUpWallet
Query:   GetFinancialReport
```

Do not make a query mutate state merely to update a cache. If a projection is missing, repair it through an explicit operation or a bounded fallback.

---

## 7. Canonical domain model

The domain model must distinguish current state, immutable events, projections, and operational metadata.

### 7.1 Garage aggregate

The garage document contains small, frequently used operational state:

```text
id
name
normalizedName
ownerUid
status                 active | suspended | pending | deleting | deleted
isLocked
isTrial
activePackageId
packageExpiresAt
balanceMinor
balanceVersion
carsInside
currentSessionId
stateVersion
createdAt
updatedAt
```

It must not contain unbounded vehicles, activity logs, report rows, or arrays that grow over time.

### 7.2 Vehicle aggregate

A vehicle document should represent current operational state:

```text
id
garageId
plateNormalized
plateDisplay
status                  inside | outside | archived
subscriberId
checkInAt
checkOutAt
currentVisitId
stateVersion
createdAt
updatedAt
```

Historical visits belong in bounded visit/activity documents. A check-in must not scan all vehicles if a unique normalized plate path or bounded query can resolve the vehicle.

### 7.3 Package catalog

Package definitions are configuration, not transaction history:

```text
id
name
normalizedName
priceMinor
durationDays
capacity
isActive
version
createdAt
updatedAt
```

A purchase event must copy the authoritative price, package ID, duration, discount, and rule version used at the moment of purchase. Later catalog changes must not rewrite historical financial facts.

### 7.4 Wallet account and ledger

The wallet account is a materialized current state. The ledger is append-only authority for movement.

```text
walletAccounts/{garageId}
  balanceMinor
  version
  lastLedgerEventId
  updatedAt

walletLedger/{eventId}
  eventId
  garageId
  kind
  amountMinor
  balanceBeforeMinor
  balanceAfterMinor
  referenceType
  referenceId
  actorUid
  idempotencyKeyHash
  businessDateKey
  createdAt
```

Money must use integer minor units. Floating-point values must not enter financial domain calculations.

The invariant is:

```text
balanceAfterMinor
  = balanceBeforeMinor + signedAmountMinor
```

A reconciliation process must verify that the materialized balance equals the ledger-derived balance for a defined range. Any mismatch becomes an operational incident, not a silent correction.

### 7.5 Session model

Sessions must be explicit and owner-checked:

```text
sessions/{sessionId}
  sessionId
  uid
  role
  garageId
  status                 active | revoked | expired
  issuedAt
  lastActiveAt
  expiresAt
  version
```

The protected request must carry the Firebase ID token and the canonical session ID. A session ID alone must never authorize a request.

### 7.6 Audit events

Every security-sensitive and financial command emits a bounded audit event:

```text
auditEvents/{eventId}
  eventId
  actorUid
  actorRole
  tenantId
  operation
  targetId
  outcome
  requestId
  idempotencyKeyHash
  createdAt
```

Do not copy sensitive request bodies or secrets into audit logs.

---

## 8. Firestore cost architecture

### 8.1 Cost equation

For each operation class, measure expected daily cost as:

```text
C = cr × R
  + cw × W
  + cd × D
  + ci × I
  + cs × S
  + cb × B
```

Where:

- `R` is document reads.
- `W` is document writes.
- `D` is document deletes.
- `I` is index-entry reads.
- `S` is stored data.
- `B` is outbound bandwidth.
- `c*` are the current regional price coefficients.

Firestore billing includes document reads, writes, deletes, index-entry reads, storage, and bandwidth. Query listeners can create additional reads when result documents change or reconnect behavior causes results to be read again. [2]

A cost budget must include more than the first request. Model:

```text
expectedReads
  = initialReads
  + updateReadsPerHour × activeHours
  + reconnectReads × reconnectRate
  + retryReads × transactionRetryRate
```

For write operations:

```text
expectedWrites
  = authoritativeWrites
  + requiredAuditWrites
  + requiredProjectionWrites
  + retryOrRepairWrites
```

The design should minimize total expected cost, not merely the number of calls in the happy path.

### 8.2 Cost rules

New code must not:

- Use `offset` for pagination.
- Read an entire collection to find one entity.
- Load all activity to render a recent-activity panel.
- Re-read a static package catalog on every component render.
- Maintain an unbounded realtime listener.
- Write a large document for every small event.
- Update unrelated hot fields in the same transaction.
- Recompute a report from every historical event on every page load.
- Use a count query repeatedly when a maintained bounded summary is cheaper.

Use cursor pagination. Firestore charges reads for documents skipped by offsets, while cursors and limits avoid paying for skipped documents. [2]

### 8.3 Read amplification

For each screen, calculate:

```text
readAmplification = documentsRead / usefulEntitiesReturned
```

A dashboard returning one garage summary but reading hundreds of activity documents is a design failure even if the final response is small.

### 8.4 Write amplification

Calculate:

```text
writeAmplification = documentsWritten / authoritativeBusinessEvents
```

A financial operation may legitimately write a wallet account, ledger event, idempotency record, audit event, and bounded projection. That write set must be explicit. Repeated unrelated writes are not acceptable.

### 8.5 Listener exposure

Calculate:

```text
listenerExposure
  = resultDocumentCount
  × expectedChangeFrequency
  × activeListenerCount
  × reconnectFactor
```

A listener must have a lifecycle owner, a query limit, an unsubscribe path, and a reason that realtime delivery is worth its cost.

---

## 9. Firestore data layout and query design

### 9.1 Tenant-scoped paths

Use predictable tenant-scoped paths where the security and query model benefits from them:

```text
/garages/{garageId}
/garages/{garageId}/vehicles/{vehicleId}
/garages/{garageId}/subscribers/{subscriberId}
/garages/{garageId}/activity/{activityId}
/garages/{garageId}/dailySummaries/{dateKey}
/garages/{garageId}/walletLedger/{eventId}
/garages/{garageId}/idempotency/{keyHash}
/sessions/{sessionId}
/pinReservations/{lookupHash}
/packages/{packageId}
/financialEvents/{eventId}
/operations/{operationId}
```

The final path map must be produced by Stage 0 inventory. The design must ensure that a tenant query is bounded and that deletion can enumerate known subcollections.

### 9.2 Hot document policy

A document is a hot document when many concurrent commands update it. Hot documents require special treatment:

- Keep fields small.
- Update only fields needed by the command.
- Use `stateVersion` for optimistic concurrency.
- Avoid unrelated counters in the same transaction.
- Use shards only when observed contention justifies extra reads.
- Record retry rates by document family.

### 9.3 Index policy

Every composite index must be justified by a query contract. The repository documentation must state:

```text
query name
collection path
filters
orderBy tuple
page limit
expected result bound
index required
rule assumptions
cost risk
```

Do not add indexes merely because a query fails. First confirm that the query is necessary, bounded, tenant-scoped, and not an accidental full scan.

### 9.4 Small documents and large payloads

Do not store unbounded arrays in hot documents. Do not duplicate full activity payloads into dashboard projections. Store only fields required by the read model. If a payload is large and not needed for Firestore queries, evaluate Firebase Storage with metadata in Firestore, while preserving the same Railway authorization boundary.

---

## 10. Transaction and batch algorithms

### 10.1 Transaction protocol

A transaction must follow this order:

```text
1. Validate command input outside the transaction.
2. Resolve deterministic document references.
3. Read all decision documents.
4. Verify preconditions and versions.
5. Compute the new state using pure functions.
6. Queue only bounded writes.
7. Commit atomically.
8. Emit or schedule repairable projections after commit.
```

Firestore transactions must read before writing. They may run more than once when concurrently read documents change, so transaction functions must be deterministic and must not mutate external application state. Transactions also have request-size, lock, idle, and total-time limits. [3]

### 10.2 Transaction boundaries

Keep financial transactions small:

```text
idempotency record
wallet account
wallet ledger event
purchase or recharge event
```

Do not include report generation, notification delivery, network calls, or large list reads inside the transaction.

Keep vehicle state transactions small:

```text
vehicle state
garage counters if required
visit/event record
idempotency record if the command is replayable
```

If an external notification is required, record an outbox event in the transaction and deliver it after commit. Do not call an external service inside the transaction function.

### 10.3 Batched writes

Use a batch when no read-dependent decision is required. Batches are atomic, but each document write still counts as a write; batching improves atomicity and round trips rather than reducing per-document billing. [3]

For deletion and backfills, use bounded batches and checkpoint progress in an operation document. Never place an entire garage history into one transaction or one unbounded batch.

### 10.4 Retry policy

Classify errors:

```text
retryable: transaction contention, transient network, temporary service unavailable
nonRetryable: validation, authorization, insufficient funds, conflict fingerprint
operatorAction: invariant mismatch, schema corruption, projection gap, unknown state
```

Retries must use bounded exponential backoff with jitter. A retry must reuse the same idempotency key and request fingerprint. The backend must not generate a new financial operation on each retry.

---

## 11. Idempotency algorithm

Every state-changing endpoint must document its idempotency policy. Financial and destructive commands must require a client-provided idempotency key or a server-generated operation token that the client can reuse after timeout.

Compute a canonical request fingerprint:

```text
fingerprint = SHA-256(
  canonicalJson({
    method,
    route,
    actorUid,
    tenantId,
    normalizedPayload
  })
)
```

Canonicalization must sort object keys, normalize numeric money values, normalize IDs, and exclude transport noise such as request IDs.

Within a transaction:

```text
1. Read (tenantId, actorUid, idempotencyKeyHash).
2. If absent, create a pending record with fingerprint.
3. If present with a different fingerprint, reject with conflict.
4. If present and complete, return the stored bounded result.
5. If present and pending, apply the operation-specific pending policy.
6. Apply authoritative state changes.
7. Append canonical event and audit record.
8. Store a bounded result envelope.
9. Mark the record complete.
```

Do not store large response bodies in idempotency records. Store status, result reference, result code, and a bounded response summary.

Idempotency tests must prove:

```text
same key + same fingerprint → same result, one business effect
same key + different fingerprint → conflict, zero second effect
new key + same business data → separate operation only when allowed
retry after timeout → no duplicate ledger event
```

---

## 12. Financial architecture

Financial operations receive the highest safety priority because a type error or replay bug can directly change money.

### 12.1 Integer money

Use integer minor units:

```ts
type MoneyMinor = number & { readonly __brand: 'MoneyMinor' };
```

At the API boundary, parse a decimal amount, validate precision and sign, convert to minor units deterministically, and reject values that cannot be represented exactly. Domain code performs only integer arithmetic.

### 12.2 Ledger-first authority

A wallet command must not only update `balance`. It must create an immutable event that explains the movement.

For a debit:

```text
newBalance = oldBalance - debitMinor
```

For a credit:

```text
newBalance = oldBalance + creditMinor
```

The transaction must reject insufficient balance, invalid package state, stale version, duplicate idempotency key, or mismatched actor scope.

### 12.3 Package purchase

The command must snapshot the rule inputs used:

```text
packageId
packageVersion
listPriceMinor
discountMinor
finalPriceMinor
durationDays
capacity
couponCode if applicable
pricingRuleVersion
```

Changing the package catalog later must not alter the historical purchase.

### 12.4 Commissions and refunds

Commission and refund events must reference the original business event. A correction must be an explicit compensating event, never an in-place edit that destroys history.

Use:

```text
originalEventId
correctionReason
correctionType
actorUid
approvedBy if required
```

### 12.5 Reconciliation

Build a reconciliation command that compares:

```text
materialized wallet balance
= sum of authoritative ledger effects
```

The command should support a bounded garage/date range, produce a discrepancy report, and never silently mutate balances. Automatic repair must require a separate, audited operator action.

---

## 13. Queries, read models, and reports

### 13.1 Dashboard query

A garage dashboard should read a small, bounded set:

```text
garage current state
current package summary
current vehicle summary or bounded page
recent activity summary
current alerts
```

It must not read the entire activity history, all vehicles, all subscribers, and all package definitions on every render.

### 13.2 Daily summary projection

For frequently used reports, maintain one bounded summary per garage and business date:

```text
dailySummaries/{dateKey}
  checkIns
  checkOuts
  revenueMinor
  walletCreditsMinor
  walletDebitsMinor
  commissionsMinor
  activeSubscribers
  projectionVersion
  asOf
```

The summary is rebuildable from authoritative events. It is not the sole financial authority.

### 13.3 Projection algorithm

Each event must have a monotonic sequence or a deterministic deduplication key for the projection scope.

```text
if event.id already applied:
  ignore
else if event.sequence <= lastAppliedSequence:
  ignore or repair according to ordering policy
else if event.sequence == lastAppliedSequence + 1:
  apply event and advance version
else:
  record a gap and schedule repair
```

Projection updates must be idempotent. A worker crash after applying a write but before recording completion must not double count the event.

### 13.4 Report consistency labels

Every report endpoint must state its consistency mode:

```text
strong: reads authoritative state inside the command boundary
transactional: reads committed summary documents
stale-acceptable: projection may lag within a defined window
reconciled: derived from ledger/events for audit
```

The UI must be able to display an `asOf` timestamp for eventually consistent data.

### 13.5 Search strategy

Do not scan Firestore to implement arbitrary search. For supported search fields, maintain normalized values and queryable prefixes or use a dedicated approved search service later. Every search strategy must state its read bound and security model.

---

## 14. Firebase Security Rules and IAM

### 14.1 Default client posture

The preferred policy is deny-by-default for protected business data. The browser authenticates with Firebase but sends business commands to Railway. The browser must not directly write:

- Wallet balances
- Wallet ledger events
- Package purchases
- Recharge approvals
- Session ownership
- Deletion operations
- Administrative decisions
- Audit events
- Projection control documents

If a direct client read is retained for a narrow document, the rule must guarantee tenant ownership, role scope, field shape, and query compatibility.

### 14.2 Rules are not filters

Firestore Security Rules do not filter out unauthorized documents after a query. A query must be constructed so every document it could return satisfies the rule. [4]

This means each query contract must document its rule predicate. A query that may return both authorized and unauthorized documents must be rejected by the design, not patched after the fact in frontend code.

### 14.3 Rule access-call budget

`get()`, `exists()`, and `getAfter()` in rules consume document access calls and can incur reads even when a request is rejected. Single-document and query requests have a 10-call limit. Multi-document reads, transactions, and batches have a 20-call total limit while retaining a 10-call per-operation limit. [4]

The rule design should derive authorization from the target document and at most a small number of stable ownership documents. Complex authorization belongs in Railway application policies where it can be tested and observed without consuming rule-call budget on every client request.

### 14.4 IAM

Because Railway Admin SDK calls bypass Rules, configure a dedicated service identity with the least required permissions. Separate development, staging, and production credentials. Rotate secrets using Railway’s secret management. Audit every privileged operation at the application layer.

---

## 15. Authentication, sessions, and authorization

### 15.1 Request authentication

The backend must:

1. Extract the Firebase ID token from the approved header.
2. Verify the token with Firebase Admin SDK.
3. Extract the authenticated UID and approved claims.
4. Require the canonical session header for protected routes.
5. Load and validate the session owner, role, tenant, status, and freshness.
6. Apply the operation-specific authorization policy.

A client-supplied `garageId`, role, or delegate scope is an input to validate, not an authority to trust.

### 15.2 Policy objects

Authorization should be explicit:

```ts
interface AuthorizationContext {
  uid: string;
  role: Role;
  sessionId: string;
  tenantId?: string;
  claimsVersion: number;
}

interface PolicyDecision {
  allowed: boolean;
  reasonCode: string;
}
```

Policies must be pure where possible and tested against a matrix of owner, delegate, admin, suspended, locked, expired, and missing-session cases.

### 15.3 Session cache policy

Caching token verification or low-risk configuration can reduce reads, but session revocation and security-sensitive changes must not be hidden by a long cache. Cache only with an explicit TTL and invalidation rule. Never cache a positive authorization decision across tenants or roles without a versioned key.

---

## 16. Operational APIs and lifecycle commands

### 16.1 Vehicle operations

Check-in and checkout must use normalized plate identity, explicit garage scope, current vehicle state, and idempotency. The command must handle duplicate requests deterministically.

The check-in transaction should read only the vehicle or plate reservation, relevant subscriber state, garage lock/status, and idempotency record. It should not scan the whole garage.

### 16.2 Subscriber operations

Use normalized lookup fields, duplicate constraints, and allowlists for updates. Do not permit arbitrary client field merges. Every update command must specify mutable fields and reject unknown fields.

### 16.3 Deletion

Deletion is an operation, not a single request:

```text
requested → locked → enumerating → deleting → verifying → completed
                                      │
                                      └→ failed/retryable
```

Create an operation document with:

```text
operationId
garageId
phase
cursor
attemptCount
lastError
startedAt
updatedAt
completedAt
```

Mark the garage unavailable before deletion begins. Enumerate known subcollections in bounded pages. Delete batches within service limits. Retry from the cursor. Verify references before final completion. Keep an audit record and a retention policy for the operation metadata.

### 16.4 Outbox for external effects

Notifications, emails, analytics, or other external calls must not execute inside Firestore transactions. Write an outbox event atomically with the business state, then deliver it asynchronously with idempotency and retry.

---

## 17. Staged build plan

Each stage below includes what must be built, why it exists, and the gate that permits the next stage.

### Live implementation status — 2026-09-22

This status is maintained for handoff between agents. The current production backend remains authoritative; the v2 tree is a guarded preview and is **not yet a replacement backend**.

| Stage | Status | What is actually complete | What remains before exit |
|---|---|---|---|
| Stage 0 — Freeze and inventory | **Complete for current slice** | Repository, deployment boundary, existing auth, Railway API, Cloudflare frontend, and operator connector were inspected. | Re-run inventory when production schemas or deployment topology changes. |
| Stage 1 — Strict v2 foundation | **Complete for current slice** | `server-v2` strict TypeScript config, environment parsing, API envelopes, isolated app, tests, CI gate, no-explicit-`any` gate, guarded Railway bootstrap, and `/api/v2` route composition exist. | Extend route coverage only through separately gated slices and keep the bootstrap fail-closed. |
| Stage 2 — Contracts and domain mathematics | **Complete for current slice** | Typed entities, money, dates, pagination, pricing, capacity, trials, commissions, refunds, lifecycle rules, business events, and transaction retry primitives exist with tests. | Characterize any remaining legacy edge cases before production activation. |
| Stage 3 — Typed Firebase infrastructure | **Partial** | Firestore converter boundaries, production package catalog, garage-summary, vehicle, subscriber, and garage-state repositories, pending/activity read models, emulator tests, and returned-read cost accounting exist. | Complete remaining entity converters, indexes, and any uncovered transaction services; local emulator execution remains environment-dependent. |
| Stage 4 — Authentication and policy enforcement | **Partial** | Session, revocation, inactivity, role, garage-scope, audit context, redaction, and rate-limit policies are unit-tested; injectable v2 Firebase token/session adapters, authorization middleware, CORS allowlisting, request-ID/context capture, UID-keyed rate limiting, structured console telemetry, explicit route budgets, and HTTP tests exist. The guarded preview is live on Railway and protected reads return `401` without authentication. | Complete an authenticated Cloudflare preview smoke test without changing production authority. |
| Stage 5 — Financial core | **Partial** | Ledger contracts, wallet math, idempotency, reconciliation, business events, atomic in-memory wallet operations, and financial audit contracts exist. | Connect to Firestore transactions and real routes; make v2 the single financial authority only after reconciliation and rollback testing. |
| Stage 6 — Lifecycle commands | **Partial** | Vehicle check-in/check-out, subscriber create/renew/update/suspend/cancel/tombstone, garage lifecycle, resumable non-destructive deletion jobs, garage profile updates, idempotency, audit events, guarded HTTP routes, and emulator/concurrency tests exist. | Complete broader garage/subscriber management, production repair workers, and any remaining non-financial command coverage; physical deletion remains deferred. |
| Stage 7 — Projections and reports | **Partial** | Projections, bounded read models, pending/activity Firestore repositories, cursor envelopes, emulator tests, daily financial rebuilds, reconciliation, report envelopes, repair-needed states, a production Firestore garage-summary adapter over legacy projection buckets/dashboard summaries, transactional Firestore projection persistence with event-id replay protection, a bounded deterministic rebuild primitive, an explicitly flagged admin-only authenticated repair route with idempotency/audit writes, and an explicitly flagged read-only projection status route with missing/healthy/stale classification exist. | Add production projection workers and remaining real Firestore-backed reports; keep repair/status flags disabled until a controlled preview is authorized. |
| Stage 8 — Cloudflare frontend adapter | **In progress** | Typed read adapter, authenticated `apiFetch` transport, safe flags, route contract tests, preview smoke harness, selected `/api/v2` external boundary, fail-closed Railway preview bootstrap, structured telemetry, explicit route budgets, and a package catalog legacy/v2 provider are in `main`. The Cloudflare Pages preview environment has `VITE_V2_READ_PACKAGE_CATALOG=true`; production remains disabled. | Obtain a real non-production preview deployment, run authenticated Cloudflare-to-Railway tests, compare normalized package results, and keep the production flag disabled until the comparison is understood. |
| Stage 9 — Shadow and compare | **In progress** | Preview-only normalized legacy/v2 providers for package catalog and date-scoped garage summary are wired into `POST /api/v2/shadow/compare` in `2c9186f`; `01286d5` adds in-memory aggregate telemetry for outcomes, bounded latency, and Firestore read totals. Comparisons and telemetry are read-only, redacted, fail-closed, and disabled unless `V2_SHADOW_COMPARISON_ENABLED=true`. Local provider, telemetry, route, emulator, build, and Production Gate validation passed. | Obtain a current Firebase-authenticated non-production Cloudflare preview, run real package and garage-summary comparisons, exercise v2-failure fallback and legacy-failure blocking, classify all differences, and prove no unexplained financial or authorization mismatch. No production shadow traffic is active. |
| Stage 10 — Progressive cutover | **Not started** | No cohort has been migrated. | Internal users → one garage → small cohorts → all traffic, with SLO, cost, reconciliation, and tested rollback gates. |
| Stage 11 — Retire legacy paths | **Not started** | No legacy route or writer has been removed. | Remove legacy paths only after migration completion, retention review, and rollback-window expiration. |

**Latest implementation commit:** `01286d5 feat: add aggregate shadow telemetry`, following the provider wiring in `2c9186f` and gated shadow route in `07308e5`. The full emulator-backed v2 check passes locally with 55 test files and 293 tests; focused provider/telemetry/route tests pass with 16 tests; full application tests pass with 55 files and 296 tests; production build, maintainability checks, and diff checks also pass. Production Gate `35752971109` succeeded. Cloudflare Pages inspection at 2026-09-22 19:09 UTC+3 found no current preview for `main`; the newest preview is the stale 2026-09-19 `feat/backend-operator-mcp-auth` deployment. Aggregate telemetry is wired only into the guarded preview composition; no production shadow traffic is active and no authenticated live comparison is claimed.

**Important safety boundary:** Keep all production `VITE_V2_READ_*` flags false until the matching v2 Railway endpoints are deployed, authenticated, compared with legacy behavior, and rollback-tested. A preview-only package flag may be true as recorded in the handoff; it does not authorize enabling the production flag. Do not mount additional v2 behavior into production, migrate financial writes, delete legacy routes, or delete production data as part of foundation work.

**Next implementation order:** (1) obtain current authenticated Cloudflare preview evidence when a natural non-production deployment and Firebase-authenticated session exist; (2) run normalized package and garage-summary comparisons through the preview-only provider, including fallback/blocking evidence; (3) finish remaining non-financial repository, repair-worker, and route gaps; (4) classify enough shadow results to explain all differences; (5) progressive cutover; (6) financial authority migration only after reconciliation and rollback gates; (7) legacy retirement. Do not manufacture a preview or change production flags.

### Stage 0 — Freeze and inventory the current system

Build a versioned inventory of:

- All frontend API calls.
- All Railway routes and middleware.
- Firebase collections, subcollections, indexes, and Rules.
- Direct frontend Firestore reads and writes.
- Realtime listeners and their result sizes.
- Authentication and session flows.
- Wallet, recharge, purchase, commission, refund, and reporting behavior.
- Deletion and cleanup references.
- Environment variables and deployment dependencies.

Instrument representative flows in a non-production environment. Capture document reads, writes, deletes, listener updates, transaction retries, response size, latency, and error code.

**Exit criteria:** a route-to-data map exists; every high-value operation has a characterization test; no production behavior changes; cost baselines are recorded.

### Stage 1 — Create the strict v2 foundation

Build the isolated `server-v2` package, strict TypeScript configuration, typed environment parser, request context, correlation ID, structured logger, error model, and test harness.

Add a rule that new v2 code cannot use explicit `any`. Add an ESLint configuration for the new package rather than trying to make the legacy tree green immediately.

**Exit criteria:** v2 builds with strict TypeScript; malformed environment configuration fails fast; error responses are stable; unit tests run without Firebase.

### Stage 2 — Define shared contracts and domain mathematics

Build schemas for common envelopes, auth/session data, garages, vehicles, subscribers, packages, wallet operations, recharges, reports, and deletion commands.

Build pure functions for:

- Money parsing and integer arithmetic.
- Package pricing.
- Discount ordering.
- Trial eligibility.
- Capacity rules.
- Commission calculation.
- Refund/correction effects.
- Business date calculation.
- Cursor encoding and decoding.
- Idempotency fingerprinting.

Use table-driven tests and property-based tests. The domain layer must run without Express or Firebase.

**Exit criteria:** contracts are shared by backend tests and the frontend client generation path; invariant tests cover normal, boundary, replay, and invalid cases.

### Stage 3 — Build typed Firebase infrastructure

Implement Admin SDK bootstrap, emulator configuration, Firestore converters, repository interfaces, repository implementations, transaction runner, batch writer, cursor utilities, and query-cost test doubles.

Every converter must reject malformed documents. Every repository method must have a bounded result contract. Every query must declare its expected index and rule assumptions.

**Exit criteria:** emulator tests prove typed reads/writes; cost tests fail on unbounded queries, offsets, and accidental N+1 repository calls; repositories do not expose arbitrary collection access.

### Stage 4 — Build authentication and policy enforcement

Implement Firebase token verification, canonical session validation, authorization context, owner/delegate/admin policy modules, rate limits, and safe audit context.

Reuse the current session behavior where it is correct, but move the policy decision into one typed layer. Test missing, expired, revoked, stale, cross-tenant, and role-mismatch cases.

**Exit criteria:** emulator and integration tests prove tenant isolation and session ownership; protected routes cannot be called with a token alone when a session is required.

### Stage 5 — Build the financial core

Build wallet accounts, immutable ledger events, purchase events, recharge events, commission events, idempotency records, reconciliation, and financial audit events.

Use integer minor units, short Firestore transactions, request fingerprints, and bounded response storage. Build the reconciliation command before migrating financial writes.

**Exit criteria:** concurrent debit tests, insufficient-balance tests, duplicate replay tests, conflict-fingerprint tests, refund tests, and reconciliation tests pass. No financial command is migrated before this stage is complete.

### Stage 6 — Build garage, vehicle, subscriber, and lifecycle commands

Migrate low-risk state commands first, then vehicle operations, subscriber operations, delegates, lock/suspension, and deletion. Use explicit update allowlists. Keep current state separate from history.

Build resumable deletion operations with bounded page cursors and repair handling.

**Exit criteria:** every command has a contract, policy, idempotency decision, transaction boundary, audit behavior, emulator test, and rollback note.

### Stage 7 — Build projections and reports

Build dashboard summaries, daily financial summaries, pending queues, recent activity windows, and other bounded read models. Each projection stores version and `asOf` information.

Build repair and rebuild commands. Make projection updates idempotent. Make report consistency visible to the caller.

**Exit criteria:** dashboards and reports meet measured read budgets; projection lag and repair behavior are observable; authoritative reconciliation remains correct.

### Stage 8 — Build the Cloudflare frontend adapter

Generate or hand-maintain a typed client from v2 contracts. Add a feature adapter that can route a frontend feature to legacy or v2 based on a flag. Preserve the current UI while replacing direct business-data access feature by feature.

Start with read-only package catalog, garage summary, and bounded lists. Do not move financial writes yet.

**Exit criteria:** Cloudflare-to-Railway authentication, CORS, session headers, error mapping, and typed responses work in a deployed test environment.

### Stage 9 — Shadow and compare

For read endpoints, run v2 in shadow mode and compare normalized results with legacy. Ignore ordering only when the contract defines ordering as irrelevant. Record meaningful differences with request ID, tenant, endpoint, and data version.

For writes, avoid independent dual authority. If dual-write is necessary for a non-financial projection, use one idempotency key and an explicit repair queue. For money, one system must be authoritative at all times.

**Exit criteria:** differences are understood and within defined eventual-consistency windows; no unexplained financial or authorization mismatch remains.

### Stage 10 — Progressive cutover

Use feature flags and cohorts:

```text
internal test users
→ one controlled garage cohort
→ small percentage of garages
→ larger cohorts
→ all traffic
```

Monitor error rates, authorization denials, Firestore reads/writes/deletes, transaction retries, listener counts, projection lag, financial reconciliation, latency, and rollback events.

**Exit criteria:** each cohort meets correctness, SLO, and cost budgets; rollback is tested and available; production support has a runbook.

### Stage 11 — Retire legacy paths

Remove legacy routes, direct frontend Firestore business access, duplicate writers, unused indexes, and compatibility shims only after migration completion, retention review, and rollback-window expiration.

Enable strict gates for all new and migrated code. Keep only explicitly documented external-boundary exceptions.

**Exit criteria:** each business fact has one authoritative write path; all production routes use typed contracts; old paths are either removed or formally retired.

---

## 18. Test architecture

### 18.1 Unit tests

Pure domain functions must cover money, pricing, trials, commissions, business dates, pagination, fingerprinting, and state transitions. These tests must be fast and independent of Firebase.

### 18.2 Contract tests

For every endpoint, test valid requests, invalid requests, unknown fields, missing fields, response shape, error code, pagination envelope, and version compatibility.

### 18.3 Emulator tests

Use Firebase Emulator Suite for repositories, transactions, converters, and Rules. Do not rely only on mocks for Firestore semantics.

### 18.4 Security Rules tests

Prove owner isolation, delegate scope, admin-only writes, denial of financial writes, denial of session forgery, field allowlists, invalid types, and query compatibility. Include transaction and batch rule access-call budgets.

### 18.5 Property-based tests

Generate values for:

- Positive and negative money effects.
- Repeated idempotency requests.
- Equal timestamp pagination.
- Concurrent version conflicts.
- Trial and package boundary dates.
- Commission and refund combinations.

The key properties are:

```text
ledger conservation
idempotent replay
monotonic state version
stable cursor pagination
no unauthorized tenant access
no duplicate projection effect
```

### 18.6 Cost tests

Repositories should expose a test instrument that counts reads, writes, deletes, listener subscriptions, and transaction attempts. Tests should fail if a dashboard exceeds its budget or if a new method performs N+1 reads.

### 18.7 Migration tests

Test backfill restart, cursor persistence, partial batch failure, duplicate source events, projection repair, rollback flag behavior, and legacy/v2 response normalization.

---

## 19. Observability and operations

Every request should carry:

```text
requestId
actorUid
tenantId
sessionId hash, not raw secret
route
operation
resultCode
latencyMs
firestoreReads
firestoreWrites
firestoreDeletes
transactionRetries
projectionLagMs
```

Never log Firebase ID tokens, PINs, passwords, authorization headers, service credentials, or unredacted financial payloads.

Create dashboards for:

- Error rate by route and code.
- P95 and P99 latency.
- Firestore reads, writes, deletes, and index reads.
- Transaction retry rate.
- Hot document contention.
- Projection lag and repair count.
- Idempotency conflicts.
- Authorization denials.
- Deletion operation failures.
- Reconciliation discrepancies.

Create runbooks for:

- Credential rotation.
- Failed deployment rollback.
- Ledger discrepancy.
- Projection rebuild.
- Stuck deletion operation.
- Excessive Firestore reads.
- Session revocation incident.
- Firebase Rule deployment rollback.

---

## 20. Cost budgets

The following are starting budget categories, not final numeric promises. Stage 0 must measure current behavior and Stage 3 must validate the target numbers against real data.

| Operation | Target shape | Cost rule |
|---|---|---|
| Dashboard open | Small fixed reads plus bounded lists | Never scan full activity or all history. |
| Vehicle check-in | Small transaction with normalized lookup | No collection-wide plate scan. |
| Vehicle checkout | Small transaction by authoritative vehicle/visit ID | No historical scan. |
| Package catalog | One bounded query or cached server result | Do not fetch catalog per component render. |
| Package purchase | Fixed decision reads and explicit financial writes | Exactly-once effect under replay. |
| Wallet top-up | Fixed wallet/idempotency reads and ledger writes | No mutable-only balance change. |
| Recharge approval | Fixed request/package/wallet reads and bounded writes | Fingerprinted idempotency required. |
| Financial report | Daily summary reads for common views | Ledger scan only for reconciliation. |
| Activity history | Cursor page with explicit limit | No offset and no unbounded listener. |
| Garage deletion | Bounded page reads and batch deletes | Resumable, checkpointed, retryable. |

Each target must be refined with real document sizes, active users, listener duration, retry rate, and expected daily operation volume.

---

## 21. Migration and rollback mechanics

### 21.1 Feature flags

Flags must be server-controlled or securely delivered. A browser-only flag must not decide financial authority. A flag record must include version, owner, rollout cohort, created time, and rollback behavior.

### 21.2 Read shadowing

Read shadowing must not double the user-visible response latency. Use asynchronous comparison where possible. Redact sensitive values in comparison logs. Normalize timestamps, ordering, and compatibility fields before diffing.

### 21.3 Write authority

For every write capability, document:

```text
current authority
new authority
projection writer
read source during migration
rollback direction
duplicate protection
reconciliation method
```

There must never be two independent systems that both believe they own wallet balance or financial event creation.

### 21.4 Backfills

A backfill operation must have:

```text
operationId
source version
target version
collection or tenant scope
cursor
batch size
checksum
processed count
error count
last error
startedAt
updatedAt
completedAt
```

It must be safe to stop and resume. It must not use offsets. It must have a maximum read/write budget per batch.

### 21.5 Rollback

Rollback must be tested before production cutover. It should switch traffic to the previous read/write path without deleting v2 data. If v2 has become authoritative for a financial operation, rollback must use a designed reconciliation path rather than blindly replaying old commands.

---

## 22. Definition of done for a migrated capability

A capability is migrated only when all of the following are true:

1. Its request and response schemas are versioned.
2. Its domain rules are isolated and unit-tested.
3. Its authorization policy is explicit and tested.
4. Its repository methods are bounded and cost-documented.
5. Its idempotency behavior is specified.
6. Its transaction or batch boundary is documented.
7. Its Firestore converters validate stored data.
8. Its Security Rules and IAM assumptions are tested.
9. Its audit behavior is defined.
10. Its read model, if any, is rebuildable.
11. Its migration and rollback path are tested.
12. Its frontend adapter uses the typed contract.
13. Its metrics and runbook exist.
14. Full tests, TypeScript, build, maintainability, and diff checks pass.

---

## 23. First implementation slice

The first code change after approving this plan should create infrastructure without changing production behavior:

1. Create `server-v2` with strict TypeScript.
2. Add typed environment parsing and startup validation.
3. Add common response/error contracts.
4. Add schemas for `Garage`, `Package`, `WalletAccount`, `FinancialEvent`, and `Session`.
5. Add pure money, business-date, pagination, and idempotency modules.
6. Add Firebase Admin emulator configuration.
7. Add repository interfaces and cost-counting test doubles.
8. Add Emulator Suite setup for one read-only package catalog and garage summary query.
9. Add a non-production `/v2/health` endpoint.
10. Add a non-production read-only package catalog endpoint.
11. Add CI gates for new v2 code.

Do not migrate financial writes in the first slice. Do not change the Cloudflare production frontend in the first slice. Do not delete or rename current collections in the first slice.

The first slice is successful when a future contributor can add a new typed endpoint without touching the legacy `any` boundaries, and when its expected Firestore read/write behavior can be tested before deployment.

---

## 24. Final expected result

When the overhaul is complete, the system should have:

- One clear Railway API boundary.
- One typed contract for each endpoint.
- One authorization decision path per operation class.
- One authoritative source for each business fact.
- One replay-safe command implementation for each mutation.
- A ledger and reconciliation process for money.
- Bounded queries and cursor pagination.
- Small, rebuildable projections for dashboards and reports.
- Firebase Rules that are restrictive, query-compatible, and emulator-tested.
- Railway IAM and application policies that protect Admin SDK access.
- Cost instrumentation that reveals read, write, delete, index, listener, and retry behavior.
- A frontend that depends on the API contract rather than Firestore structure.
- A migration history and rollback path that future maintainers can understand.
- Strict typing at new boundaries instead of a growing `any` surface.

The intended result is not a more complicated backend for its own sake. It is a backend in which **correctness, cost, security, and maintainability are explicit properties of the design rather than assumptions hidden inside route handlers and frontend effects**.

---

## References

[1]: https://firebase.google.com/docs/firestore/security/rules-conditions "Writing conditions for Cloud Firestore Security Rules"
[2]: https://firebase.google.com/docs/firestore/pricing "Understand Cloud Firestore billing"
[3]: https://firebase.google.com/docs/firestore/manage-data/transactions "Transactions and batched writes"
[4]: https://firebase.google.com/docs/firestore/security/rules-conditions "Firestore Rules, server libraries, and access-call limits"


---

## 25. Expert-default decisions

This section makes the technical decisions explicit so implementation does not pause for an external architecture committee. These are the recommended defaults for this repository and deployment topology. Stage 0 measures the current system to calibrate quantities, but it does not reopen the fundamental architecture unless a hard platform constraint disproves an assumption.

### Decision 1 — Keep the platform boundary fixed

Use Cloudflare Pages for the React frontend, Railway for the Node.js/TypeScript API and workers, Firebase Authentication for identity, and Cloud Firestore for operational persistence. Do not introduce PostgreSQL, Cloud Run, Vercel Functions, another backend host, or a second authentication provider during this overhaul.

This decision minimizes migration surface, preserves the current deployment model, and avoids moving cost and operational complexity into an unrequested platform change.

### Decision 2 — Make Railway the protected business-data boundary

The browser may authenticate with Firebase and may retain only the narrow direct reads that are proven safe and necessary. All protected commands and all sensitive business reads should move behind Railway. The frontend must not calculate or submit authoritative prices, balances, roles, ownership decisions, commissions, or financial outcomes.

Railway verifies the Firebase token, validates the session, applies the policy, validates the command, executes the domain operation, and returns a typed result.

### Decision 3 — Use a modular monolith before microservices

Build one well-separated Railway service with domain modules rather than multiple independently deployed services. The system is not yet at a scale where network boundaries between microservices provide more benefit than they create in deployment, tracing, consistency, and cost complexity.

The modules must have strict dependency direction so they can be extracted later if measured workload justifies it. Until then, a modular monolith provides lower latency, simpler Firestore transactions, easier local testing, and one authorization boundary.

### Decision 4 — Use contract-first TypeScript with runtime parsing

Use Zod schemas, strict TypeScript, generated or centrally typed API clients, and Firestore converters. New code must not use explicit `any`. Unknown data must be parsed before domain code uses it.

Do not use a global lint disable, mass `as` casting, or an `any` replacement with `unknown` that simply moves unchecked access to another line. The root fix is schema ownership at every external boundary.

### Decision 5 — Use commands and queries, not generic CRUD

Expose business operations such as `approveRecharge`, `purchasePackage`, `checkInVehicle`, and `deleteGarage`. Do not expose generic endpoints that accept arbitrary collection names, arbitrary field merges, or client-selected financial results.

Queries should return purpose-built read models. Commands should enforce invariants and produce events. This makes authorization, idempotency, cost, and testing explicit.

### Decision 6 — Use Firestore as an aggregate/event store with projections

Firestore remains authoritative for current aggregate state and immutable business events. Read models are denormalized projections. A projection may be stale within a declared limit and may be rebuilt from authority.

Do not use a relational database migration as a substitute for fixing application boundaries. Do not create a second database simply to avoid designing Firestore documents correctly.

### Decision 7 — Use a materialized wallet balance plus immutable ledger

The wallet account stores the current integer balance for fast authorization and display. Every movement also creates an immutable ledger event in the same transaction. The ledger is the audit and reconciliation source; the balance is the operational projection.

This is the default because it gives constant-time balance checks without sacrificing historical explanation. If contention measurements later prove that one wallet document is a hotspot, introduce a controlled contention strategy only after preserving a deterministic balance authority and reconciliation process.

### Decision 8 — Use integer minor units for all money

The backend converts accepted decimal input into integer minor units at the boundary. All package prices, wallet amounts, discounts, commissions, refunds, and balances use integer arithmetic. Floating-point arithmetic is prohibited in financial domain code.

Every financial event records the applied price, discount, rule version, actor, reference operation, and idempotency hash. Historical events are immutable.

### Decision 9 — Require idempotency for every mutation

All state-changing endpoints receive an idempotency key. Financial, deletion, session-claim, check-in, checkout, approval, and purchase commands reject missing keys. The server computes a canonical fingerprint and rejects reuse of a key with a different meaning.

A retry returns the original bounded result. It never creates a second ledger event, second purchase, second vehicle visit, or second deletion operation.

### Decision 10 — Keep transactions short and deterministic

Use Firestore transactions only for read-dependent decisions. Read all decision documents first, compute the result using pure functions, and write a small bounded set. Never call external services, send notifications, mutate process state, or generate nondeterministic values inside a transaction callback.

Use batched writes for independent writes. Use an outbox document for effects that must occur after commit.

### Decision 11 — Prefer cursor pagination everywhere

Every list uses a stable ordering tuple, a cursor, a hard page limit, and a maximum traversal budget. Offset pagination is not permitted in new code. The cursor includes all fields required to resume the exact ordering.

The default page size should be conservative, such as 25 or 50 records, and may be increased only for a specific screen with measured payload and read budgets.

### Decision 12 — Use bounded listeners only for high-value realtime state

Use listeners for small, frequently changing state such as the current garage summary or a bounded pending queue. Use ordinary cursor queries for history and reports. Every listener has an owner, a limit, an unsubscribe path, and an estimated reconnect cost.

Do not create listeners for full activity histories, unlimited vehicles, or report collections.

### Decision 13 — Use bounded denormalization, not maximal normalization

Duplicate small fields when the duplication removes repeated reads from a high-frequency screen. Do not duplicate large payloads or unbounded arrays. Every projection records its source, version, rebuild method, repair method, maximum size, and staleness budget.

The default dashboard should read a small garage summary, a bounded current-vehicle page, a bounded recent-activity window, and explicit alert summaries. It must not reconstruct the garage from all historical documents.

### Decision 14 — Use daily summaries for common reports

Maintain bounded daily summaries for high-frequency operational and financial views. Use immutable ledger and event data for audit, reconciliation, corrections, and unusual date ranges.

Reports must state whether their result is authoritative, transactional, projected, or reconciled. An `asOf` timestamp is required for eventually consistent projections.

### Decision 15 — Use server-side authorization even when Rules exist

Firestore Rules protect direct client access. Railway authorization protects Admin SDK operations because Admin SDK calls bypass Firestore Rules. Both layers are required.

The preferred Rules design uses deny-by-default, tenant-scoped paths, small ownership lookups, field allowlists, and query-compatible predicates. Complex role decisions belong in Railway policy code, not in deeply nested Rule lookups.

### Decision 16 — Use Firebase Emulator Suite as a required development dependency

Repository, transaction, converter, and Rules tests must run against the Emulator Suite. Mocks may test application orchestration, but they are not sufficient evidence for Firestore concurrency, Rules query compatibility, or atomicity.

A v2 feature is not complete without emulator coverage when it reads or writes Firebase data.

### Decision 17 — Use a modular monolith with one financial authority during migration

During migration, the legacy and v2 systems may coexist, but they may not independently create financial truth. For a financial capability, select one writer and make the other system read-only or adapter-based. Use reconciliation and a controlled cutover to change authority.

Dual writes may be used for rebuildable non-financial projections only when they share an idempotency key and have a repair queue.

### Decision 18 — Use progressive migration with rollback

Build v2 beside legacy, migrate read-only capabilities first, shadow-compare responses, migrate low-risk commands, migrate financial commands last, and retire legacy paths only after the rollback window expires.

Do not change production data shape, traffic authority, or Security Rules as part of the foundation slice.

### Decision 19 — Measure quantities, do not ask for architectural permission

Stage 0 must measure collection names, document sizes, query result sizes, reads, writes, deletes, listener updates, retries, latency, and scale assumptions. The measurements calibrate page sizes, summary frequency, retention, and shard count.

The measurements do not require a new architecture approval. They are implementation inputs. The expert default remains the architecture in this document unless the measurements show a hard contradiction such as a platform limit, unacceptable contention, or an unmeetable security requirement.

### Decision 20 — Optimize with a cost-and-correctness objective

For each candidate design, calculate:

```text
objective = correctnessRisk + securityRisk + operationalComplexity
          + weightedFirestoreCost
          + latencyPenalty
```

Correctness and security are hard constraints, not variables that may be traded away for a small cost reduction. Among designs that satisfy those constraints, choose the one with the lowest measured total cost and the smallest long-term maintenance burden.

The team should reject an optimization if it reduces reads by creating ambiguous authority, unrecoverable projections, excessive write amplification, or rules that cannot prove tenant isolation.

---

## 26. Implementation authority and decision protocol

The implementation agent may proceed without asking for architecture approval when the change follows the expert defaults in Section 25 and stays within the documented migration stage.

The agent must stop and report only when one of these conditions occurs:

- A proposed change would delete or mutate production data.
- A proposed change would change financial authority.
- A required secret, credential, IAM permission, or external approval is missing.
- A Firebase platform limit or Rules limitation contradicts the selected design.
- A migration comparison reveals an unexplained business or financial mismatch.
- A product decision is required, such as changing prices, retention, permissions, or visible behavior.

Normal implementation choices do not require a new approval when they preserve the contracts and defaults in this document. The agent should record the choice, tests, cost estimate, and rollback note in the relevant stage log.

The default implementation sequence is therefore:

```text
Stage 0 inventory
→ Stage 1 strict foundation
→ Stage 2 contracts and pure domain mathematics
→ Stage 3 Firebase repositories and emulator
→ Stage 4 auth and policy
→ Stage 5 financial core
→ Stage 6 operational commands
→ Stage 7 projections and reports
→ Stage 8 typed Cloudflare adapter
→ Stage 9 shadow comparison
→ Stage 10 progressive cutover
→ Stage 11 retirement
```

No one needs to approve the existence of this architecture again. The work still requires normal code review, automated tests, deployment controls, and explicit confirmation before consequential production actions such as destructive data operations or changing financial authority.
