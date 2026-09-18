# RQ Next Structural Rebuild Handoff

**Purpose:** Continue the major backend rebuild of RQ without repeating the previous investigation.  
**Repository:** `tarekhamada875-droid/RQ-`  
**Current branch:** `main`  
**Latest reviewed commit:** `732ad1b` — `feat(delegate): add transaction and event logging to settlement`

## Current production state

RQ currently uses a React 19/Vite frontend on Cloudflare Pages and an Express 5 API on Vercel. Firebase Authentication and Firestore are used for persistence, with Firebase Admin SDK handling server-authoritative mutations.

The latest Vercel deployment for commit `732ad1b` is `READY`. The latest validation passed:

```text
36 test files
215 tests
TypeScript check: passed
Production build: passed
CI production gate: passed
```

The current implementation is safe to treat as a **shadow event-ledger foundation**, but it is not yet the completed backend structural rebuild.

## What has already been implemented

The repository now contains `server/events.ts` and transactionally records events for:

```text
vehicle_entered
vehicle_exited
vehicle_refunded
vehicle_deleted
subscriber_created
subscriber_renewed
subscriber_updated
subscriber_deleted
delegate_settled
```

The current vehicle documents remain in place. No delete-on-exit migration has occurred.

The following routes were also added or extended:

```text
POST /api/garages/reconciliation
POST /api/garages/rebuild-projections
POST /api/delegates/settle-account
```

The existing idempotency implementation is used by several vehicle and subscriber operations.

## Important review findings to fix first

### 1. Delegate settlement event scope is wrong

The settlement event currently uses:

```ts
garageId: `delegate_${id}`
```

This writes delegate financial events under a fake garage path:

```text
garages/delegate_<id>/events/{eventId}
```

A delegate can serve multiple garages, so this is not a valid long-term scope. Use one of these designs instead:

```text
delegates/{delegateId}/events/{eventId}
```

or:

```text
financial_events/{eventId}
```

The chosen scope must be consistent for recharge, commission, and settlement events.

### 2. Delegate settlement needs idempotency

`POST /api/delegates/settle-account` does not currently accept and store an idempotency key. A repeated admin click can therefore create repeated settlement events.

The corrected operation must:

1. Read the idempotency key from the request body or supported headers.
2. Check it inside the same transaction.
3. Return the stored result for a duplicate request.
4. Store the settlement result in the same transaction.
5. Write exactly one settlement event for one operation key.

### 3. Reconciliation does not include event mismatches in its final consistency result

The reconciliation endpoint returns event-derived figures, but `isConsistent` currently compares only current vehicle state, garage counters, and daily statistics.

Return separate results:

```text
operationalStateConsistent
dailyStatsConsistent
eventLedgerConsistent
overallConsistent
```

`overallConsistent` must be false if any event-derived amount differs from the corresponding stored amount.

### 4. Reconciliation reads only the latest 500 events

The current query uses a latest-500 limit. A busy garage can have more than 500 events in one day, producing incomplete totals.

Use a Cairo-day date range:

```text
occurredAt >= startOfDay
occurredAt < startOfNextDay
```

Use pagination for unusually large result sets. Do not scan unrelated dates.

### 5. Projection rebuild scans the entire event history

The current rebuild route loads all events for a garage and then filters in application code. This will become expensive as history grows.

The rebuild must use a date-bounded Firestore query and record a stable processing watermark. A document count is not a watermark.

Use a stable combination such as:

```text
lastProcessedOccurredAt
lastProcessedEventId
projectionVersion
```

### 6. Refund accounting semantics must be defined

Before rebuilding financial projections, decide whether a refund affects:

- The original checkout date.
- The refund date.
- Both, using separate gross, refund, and net fields.

Do not silently choose a policy that makes rebuilt totals disagree with the existing business meaning.

### 7. Event payloads are not sufficiently typed

`server/events.ts` currently uses:

```ts
payload: Record<string, any>
```

Replace this with event-specific payload types and runtime validation. The event writer must reject unsupported event types, invalid aggregate/event combinations, missing required fields, and oversized or sensitive payloads.

Use Firestore timestamps or another server-authoritative timestamp representation rather than relying only on client-like ISO strings.

The current top-level-only redaction of `pin`, `password`, and `token` is insufficient for nested payloads.

## The actual major rebuild still required

The ledger is only the foundation. The target architecture is:

```text
Existing React UI
        ↓
Existing service method names
        ↓
New versioned server API contracts
        ↓
Application services
        ↓
Pure deterministic domain engine
        ↓
Transactional events + operational state
        ↓
Rebuildable projections and reports
```

The UI should remain mostly unchanged during the backend migration.

## Next implementation phases

### Phase A — Correct and test the current ledger foundation

Complete the seven fixes above before adding more migration surface.

Add direct tests for:

- Event envelope creation.
- Event payload validation.
- Sensitive-field redaction, including nested objects.
- Event transaction failure behavior.
- Delegate settlement idempotency.
- Duplicate settlement retries.
- Event-scope correctness.
- Reconciliation mismatch detection.
- Date-bounded projection rebuilds.
- Projection rebuild idempotency.

Acceptance criteria:

```text
one operation key creates at most one event
no critical event is written outside the authoritative mutation transaction
reconciliation fails when event totals disagree
rebuild reads only the requested date range
no sensitive data enters the event payload
```

### Phase B — Build the pure domain engine

Create server-side modules with no React, Express, Firebase, or browser imports. Recommended structure:

```text
server/domain/authorization.ts
server/domain/vehicleLifecycle.ts
server/domain/pricing.ts
server/domain/subscribers.ts
server/domain/recharge.ts
server/domain/delegateAccounting.ts
server/domain/invariants.ts
```

Implement deterministic functions for:

```text
authorizeGarageAction()
decideVehicleCheckIn()
calculateVehicleCheckout()
decideVehicleRefund()
validateSubscriberDates()
validateTrialCapacity()
validateDelegateGarageLimit()
calculateRechargeCommission()
calculateDelegateCycle()
decideDelegateSettlement()
```

The functions must return decisions and data, not write Firestore documents.

They must preserve the approved RQ rules:

- Sensitive garage settings are Admin-only.
- Supervisors manage delegates only.
- Supervisors do not manage garages, balances, or sensitive settings.
- Delegates may create a maximum of three garages per day.
- Trial capacity is fixed at 100 cars per day.
- PINs use the approved six-digit policy.
- Subscriber operations are free and date-validated server-side.
- Delegate settlement resets the current cycle without deleting history.
- Duplicate requests produce at most one business effect.

Acceptance criteria:

```text
no Firebase imports in domain modules
all approved business rules have positive and negative tests
pricing and settlement calculations are deterministic
boundary and retry scenarios are covered
```

### Phase C — Build application services

Create services that coordinate infrastructure around the pure domain functions:

```text
server/services/vehicleLifecycleService.ts
server/services/subscriberService.ts
server/services/rechargeService.ts
server/services/delegateAccountingService.ts
server/services/garageAuthorizationService.ts
```

Each service operation must follow this sequence:

```text
authenticate
authorize
validate
check idempotency
read only required scoped documents
call pure domain decision
write event and critical state atomically
write or enqueue rebuildable projection
store idempotency result
return definitive result
```

Do not duplicate pricing, commission, settlement, or authorization calculations in route handlers.

### Phase D — Introduce versioned APIs behind existing UI services

Keep existing frontend method names and redirect their implementations gradually to new server contracts:

```text
POST /api/v2/vehicles/check-in
POST /api/v2/vehicles/check-out
POST /api/v2/vehicles/refund
POST /api/v2/subscribers/renew
POST /api/v2/recharges/approve
POST /api/v2/recharges/reject
POST /api/v2/delegates/settle
```

Every route must have API contract tests for:

```text
success
validation failure
forbidden role
wrong garage scope
not found
duplicate retry
transaction conflict
server failure
```

Do not migrate all routes in one release.

### Phase E — Complete financial event coverage

Add typed, transactional events for:

```text
recharge_requested
recharge_approved
recharge_rejected
commission_earned
commission_adjusted
vehicle_refund_applied
delegate_settled
```

The ledger must support these calculations:

```text
gross recharge total
commission total
refund total
company net revenue
historical settled total
current unsettled cycle total
```

Settlement must create a permanent settlement record containing:

```text
settlementId
delegateId
cutoffTime
previousCycleTotal
settledByUid
settledAt
idempotencyKey
```

### Phase F — Build real projections and reconciliation

Create rebuildable projections for:

```text
garages/{garageId}/daily_stats/{date}
garages/{garageId}/monthly_stats/{month}
delegates/{delegateId}/cycle_stats/{cycleId}
```

Every projection must include:

```text
projectionVersion
lastProcessedOccurredAt
lastProcessedEventId
rebuiltAt
rebuiltBy
```

Reconciliation must compare:

```text
active vehicle state versus event-derived active state
current counters versus event-derived count
daily stats versus event-derived gross/refund/net totals
delegate current cycle versus financial events after settlement cutoff
```

Mismatch reports must not silently overwrite financial data.

### Phase G — Feature-flagged pilot

Add a server-side garage-level feature flag. Select two to five pilot garages.

Run the new path through the existing UI and compare old and new results for at least seven operating days.

Cover:

- Multiple staff devices.
- Rapid repeated taps.
- Mobile retries.
- Peak check-in and checkout periods.
- Subscriber vehicles.
- Refunds and corrections.
- Recharge approval.
- Delegate settlement.
- Historical reports.
- Permission restrictions.

Rollback must be a flag change, not a data rollback.

### Phase H — Cohort migration and retirement

Expand gradually:

```text
2–5 garages → 10–20 garages → 50 garages → larger cohorts
```

Only after stable reconciliation should the system:

```text
stop old writes
verify
stop old reads
verify
remove obsolete listeners
verify
remove obsolete indexes and rules
```

Do not delete old historical data during the first retirement release.

## Do not do these things yet

Do not:

- Delete vehicle documents on checkout.
- Remove realtime active-vehicle listeners.
- Make `daily_stats` asynchronous-only.
- Treat the current event ledger as complete financial truth.
- Scan all event history for every daily rebuild.
- Create settlement events under fake garage IDs.
- Auto-correct financial mismatches without an explicit reviewed operation.
- Rewrite the UI before the backend service contracts stabilize.
- Deploy the full replacement to all garages at once.

## Definition of completion

The major structural rebuild is complete only when all of the following are true:

```text
pure domain engine exists and is independently tested
application services own critical orchestration
versioned APIs are used behind existing UI service methods
vehicle, subscriber, recharge, commission, and settlement events are complete and typed
critical events are transactional and idempotent
projections are date-bounded, rebuildable, and versioned
reconciliation compares old and event-derived state
pilot garages have zero unexplained critical mismatches
rollback has been exercised
old state can be retired without changing user-visible behavior
```

## Handoff instruction for the next account

Start by reviewing commit `732ad1b` and this file. Do not assume that passing 215 tests means the structural rebuild is complete. First correct the ledger/reconciliation blockers, then implement Phase B: the pure domain engine.

The first coding milestone after the fixes should be a server-side `vehicleLifecycle` domain module with deterministic check-in, checkout, and refund decisions, plus tests. It should not yet delete old vehicle documents or change the UI.

## Final project status

The application is currently suitable for continued shadow-mode development and controlled review. It is not yet ready for the event model to become the sole source of truth, and it is not yet a completed major backend rebuild.

The intended destination remains:

```text
one deterministic domain model
one server authority
one immutable business history
rebuildable reports
scoped realtime operational state
safe garage-by-garage migration
```
EOF


## 2026-09-18 — Phase A ledger hardening pass

Implemented and locally validated:

- Delegate settlement events now write to `delegates/{delegateId}/events` instead of a fake `garages/delegate_{id}/events` path.
- Delegate settlement now accepts body or header idempotency keys, checks and stores the result inside the same Firestore transaction, and returns the cached result for duplicate retries.
- Event creation now validates event/aggregate compatibility, rejects oversized payloads, and recursively removes sensitive fields from nested payloads.
- Reconciliation now queries the complete Cairo calendar day instead of the latest 500 events and reports `operationalStateConsistent`, `dailyStatsConsistent`, `eventLedgerConsistent`, and `overallConsistent` separately.
- Projection rebuild now queries only the requested Cairo calendar day and stores a stable `{ lastProcessedOccurredAt, lastProcessedEventId, projectionVersion }` watermark.
- Added regression coverage for nested sensitive-field redaction and invalid event/aggregate combinations.

Validation completed: focused event tests, full Vitest suite, TypeScript check, production build, CI production gate, maintainability check, and `git diff --check` all passed.

Remaining Phase A decisions before further projection work:

- Define whether refunds affect the original checkout date, refund date, or separate gross/refund/net projections.
- Add explicit projection replay idempotency semantics and tests around the new watermark.
- Add integration tests against Firestore transaction/query mocks for settlement duplicate retries, reconciliation mismatch detection, and date-bounded rebuild behavior.


## 2026-09-18 — Explicit refund accounting policy

The existing operational behavior is now documented and represented in the ledger: refunds are recognized on the **refund date**. The original checkout event remains part of the original day’s gross revenue, while the refund event reduces net revenue on the day the refund is applied. Refund events now carry `accountingDate`, `accountingPolicy: refund_on_refund_date`, and the original checkout timestamp when available. Rebuilt daily projections expose `grossRevenue`, `refundRevenue`, and `netRevenue`; the existing `revenue` field remains the net value for backward compatibility.

The full Vitest suite, TypeScript validation, production build, CI production gate, maintainability check, and diff check passed after this change. No production data was modified.


## 2026-09-18 — Deterministic projection rebuilds

Projection calculation was extracted into the pure `server/projections.ts` module. It rebuilds one Cairo calendar day from event history, ignores malformed or out-of-range timestamps, and derives gross, refund, and net revenue without reading or accumulating prior projection values. The rebuild route now uses this calculator, so repeated rebuilds are deterministic apart from operational metadata such as rebuild time and actor.

Added regression tests for date scoping, replay determinism, no accumulation of prior values, and malformed timestamps. Focused tests, the full Vitest suite, TypeScript validation, production build, CI production gate, maintainability check, and diff check all passed.
