# RQ Safe Backend Migration Plan — Project-Specific Edition

**Author:** Manus AI
**Repository:** `tarekhamada875-droid/RQ-`
**Current frontend:** React 19 and Vite, deployed on Cloudflare Pages
**Current backend:** Express 5 serverless API, deployed on Vercel
**Current database and authentication:** Firebase Authentication and Firestore with Firebase Admin SDK on the server

## Executive decision

RQ should be migrated toward a **deterministic event ledger with rebuildable projections**, but the migration must preserve the current user interface and the current production model until the replacement proves equivalent.

The first migration target is not a complete rewrite of the UI and not immediate deletion of vehicle documents. The first target is a safer server domain layer that makes every critical operation explicit, idempotent, auditable, and mathematically testable.

The migration must follow this order:

```text
measure → formalize rules → extract pure domain logic → record events transactionally → reconcile → pilot → expand → retire redundancy
```

No critical event may be written as an untracked background side effect. If a vehicle check-in succeeds but its event is lost, the new ledger is corrupted. Therefore the event and the critical state mutation must be committed atomically whenever Firestore transaction limits permit. Only rebuildable projections may be processed asynchronously after the authoritative event exists.

## 1. What exists today

RQ is already partly server-authoritative. Critical operations are handled by Express routes using Firebase Admin SDK, while the React client calls those routes through service modules. Other screens still use Firestore listeners for realtime operational state and selected historical data.

The current production model includes:

| Area | Current responsibility |
|---|---|
| `server/app.ts` | Authentication-aware API routes, authorization, pricing, vehicle lifecycle, subscriber operations, recharge operations, delegate operations, and business-rule enforcement. |
| `server/validation.ts` | Request validation, identifiers, numbers, plates, date ranges, and idempotency keys. |
| `server/idempotency.ts` | Transactional duplicate-operation protection with expiry handling. |
| `server/firebaseAdmin.ts` | Server-side Firebase Admin initialization and Firestore access. |
| `src/services/vehicleService.ts` | Vehicle mutation client calls and optimistic synchronization. |
| `src/services/adminService.ts` | Admin subscriber and administrative mutation calls. |
| `src/services/delegateService.ts` | Delegate operations, recharge history, and settlement calls. |
| Firestore listeners | Active vehicles, garage state, subscribers, delegates, and selected history. |
| Cloudflare Pages | Static React frontend. It points to `https://parqv2.vercel.app`. |
| Vercel | Production Express/serverless API. |

The vehicle document is currently more than a duplicate-check record. It supports the live inside list, checkout, pricing, refunds, deletion/correction, staff attribution, counters, and parts of reporting. It must not be deleted on checkout until those dependencies have been replaced and reconciled.

## 2. Business rules that the new backend must preserve

The migration is not allowed to weaken the agreed business rules:

| Rule | Required behavior |
|---|---|
| Sensitive garage settings | Admin-only. Garage owners and supervisors must not receive unauthorized settings capability. |
| Subscriber management | Admin-only where the current approved rules require it. Subscriber dates must pass strict server-side validation. |
| Supervisor scope | Supervisors manage delegates only. They do not manage garages, recharge balances, or sensitive garage settings. |
| Delegate garage creation | Server-enforced maximum of three garages per delegate per day. |
| Trial capacity | Fixed at 100 cars per day. |
| PINs | Six-digit PIN policy for the approved account flows. |
| Subscriber operations | Free of billing behavior and validated by date range. |
| Vehicle lifecycle | Check-in, checkout, refund, correction, and deletion must remain consistent across devices. |
| Delegate settlement | Settlement resets the current accounting cycle, not historical records. Historical records remain available. |
| Idempotency | Repeated requests caused by taps, retries, or mobile network behavior create at most one business effect. |
| Audit logging | Critical activity logs are server-generated. Generic client-side activity logging must not be treated as authoritative. |

Every rule must have a positive test, a negative test, a role test, and a retry test before the corresponding migration phase is released.

## 3. Target architecture

### 3.1 Authoritative domain operations

Each critical operation becomes one explicit server operation with a deterministic decision function:

```text
check-in
check-out
refund or delete vehicle
create or renew subscriber
approve or reject recharge
settle delegate cycle
change garage settings
```

The decision function must be independent of React, Express, Firebase, and browser state. It receives validated facts and returns a decision plus the events and state changes required to apply it.

### 3.2 Immutable event ledger

Create a new subcollection:

```text
garages/{garageId}/events/{eventId}
```

The event ledger is append-only. It is the authoritative history for migrated operations.

A typed event envelope should contain:

```text
eventId
schemaVersion
garageId
aggregateType
aggregateId
eventType
occurredAt
recordedAt
actorUid
actorRole
idempotencyKey
payload
```

The payload must be typed by event type. Do not use an unvalidated `Record<string, any>` as the long-term contract.

Initial vehicle event payloads should preserve the facts needed later for pricing, refunds, reports, and audit:

```text
plateNumber
plateNumberRaw
vehicleType
isSubscriber
entryTime
exitTime when applicable
enteredByUid
enteredByName
exitedByUid and exitedByName when applicable
totalCost when applicable
paymentMethod when applicable
```

Do not place PINs, authentication tokens, or unnecessary personal data in events.

### 3.3 Current operational state

Keep a small, realtime operational representation for the screens that staff use while working:

```text
garages/{garageId}/vehicles/{normalizedPlate}
garages/{garageId}/state/current
garages/{garageId}/subscribers/{subscriberId}
```

The first migration does not replace the current vehicle document. A future `active_vehicles` representation may be introduced only in shadow mode.

### 3.4 Rebuildable projections

Keep summary documents for fast screens, but treat them as derived views:

```text
garages/{garageId}/daily_stats/{date}
garages/{garageId}/monthly_stats/{month}
delegates/{delegateId}/settlements/{settlementId}
```

The existing `daily_stats` documents must remain during migration. Their values must be compared with event-derived values before any asynchronous projection model replaces them.

## 4. Mathematical invariants

The new system must be judged by invariants, not only by whether individual buttons return success.

### Active vehicle invariant

For a garage and time `t`:

```text
active vehicles = entered vehicles with no later valid exit, refund, or deletion
```

Therefore:

```text
garage.currentVehicleCount = number of active vehicles
0 <= garage.currentVehicleCount <= garage.capacity
```

### Revenue invariant

For a bounded period `P`:

```text
revenue(P) = sum(valid vehicle_exited costs in P)
              - sum(valid refund amounts in P)
```

### Delegate cycle invariant

After settlement cutoff `S`:

```text
current cycle = eligible financial events with occurredAt > S
```

Settlement must never erase historical events.

### Idempotency invariant

For operation key `K`:

```text
number of committed business effects for K <= 1
```

A retry must return the same stored result or a deterministic conflict response.

### Tenant and authorization invariant

A request must not read or write a garage, delegate, subscriber, or financial record outside the authenticated user’s permitted scope.

## 5. Migration phases

### Phase 0 — Establish a contract baseline

Create a route-to-rule matrix for the current server routes. For each route, record:

```text
route
client service caller
allowed roles
garage scope
documents read
documents written
activity log emitted
idempotency behavior
expected success response
expected failure responses
```

The matrix must cover vehicle operations, garage creation, subscribers, recharge requests, delegate management, settlement, PIN changes, settings, and reports.

**Gate:** No critical route has an undocumented authorization or financial side effect.

### Phase 1 — Measure the actual production workload

Add privacy-safe server metrics for:

- Check-in request count and latency.
- Checkout request count and latency.
- Transaction retry and conflict counts.
- Idempotency-hit counts.
- Failed authorization and validation counts.
- Report and history request counts.
- Reconciliation mismatches.
- Projection lag after an accepted event.

Do not record PINs, plates, names, tokens, or raw customer payloads in metrics.

Use the results to decide whether the immediate constraint is reads, writes, listener count, transaction contention, latency, or incorrect projections. The existence of 1,000 garages does not by itself prove that the current model is too expensive.

**Gate:** A baseline exists for ordinary garages and the heaviest available garages.

### Phase 2 — Optimize historical reads without changing lifecycle logic

Keep realtime listeners for:

- Vehicles currently inside.
- Garage state and capacity.
- Active subscriber changes needed by staff.
- Session state.

Convert historical and reporting screens to bounded API reads:

- Recharge history.
- Long-range activity logs.
- Historical exits.
- Financial reports.
- Exports and analytics.

All such reads must have pagination, date bounds, loading state, empty state, error state, retry behavior, and a visible refresh path. This phase must not alter pricing, checkout, refund, or vehicle deletion behavior.

**Gate:** Historical results remain equivalent and listener/read usage is measured as reduced or controlled.

### Phase 3 — Build the pure RQ domain engine

Create a domain layer with no Firebase or UI imports. It should contain deterministic functions for:

```text
authorization decisions
vehicle check-in
vehicle checkout pricing
refund and deletion
capacity and trial limits
subscriber date validation
recharge approval
commission calculation
delegate settlement
```

Use table-driven tests for boundary cases, including overnight pricing, day caps, subscriber dates, trial capacity, six-digit PINs, delegate daily limits, duplicate requests, transaction conflicts, and settlement cutoffs.

**Gate:** The domain engine passes the approved rule matrix and produces no side effects itself.

### Phase 4 — Add versioned API contracts behind existing services

The existing UI should continue using service methods such as:

```text
vehicleService.checkIn()
vehicleService.checkOut()
delegateService.settleDelegateAccount()
adminService.addSubscriber()
```

Those methods may be redirected internally to versioned server contracts, for example:

```text
POST /api/v2/vehicles/check-in
POST /api/v2/vehicles/check-out
POST /api/v2/vehicles/refund
POST /api/v2/subscribers/renew
POST /api/v2/recharges/approve
POST /api/v2/delegates/settle
```

Every v2 mutation must authenticate, authorize, validate, check idempotency, apply the domain decision, commit the authoritative changes, and return a stable response envelope with correlation information.

**Gate:** API contract tests cover success, validation, forbidden access, duplicate retry, conflict, not found, and server failure behavior.

### Phase 5 — Transactional shadow event recording

This is the first data-model migration phase.

For vehicle check-in and checkout, preserve the current documents and add the new event in the same Firestore transaction whenever possible.

Check-in transaction:

```text
validate and authorize
check idempotency
read the current garage and vehicle state
create or update current vehicle state
create vehicle_entered event
update existing counters and daily stats as required
store idempotency result
commit
```

Checkout transaction:

```text
validate and authorize
check idempotency
read current vehicle state
calculate the price from authoritative entry facts
create vehicle_exited event
update or close current vehicle state
update existing counters and daily stats as required
store idempotency result
commit
```

The current vehicle document must remain during this phase. Do not delete it merely because an event was created.

If a transaction cannot contain every required write because of a documented Firestore limitation, use a durable outbox or reconciliation queue. Never issue a successful mutation while silently dropping the event.

Asynchronous processing is allowed only for rebuildable projections after the event and operational mutation are durably committed.

**Gate:** Every accepted pilot check-in and checkout has exactly one event, exactly one business effect, and a matching old-model result.

### Phase 6 — Add reconciliation and projection rebuilds

Create an admin-only reconciliation operation scoped by garage and date range. It must compare:

```text
current vehicles versus event-derived active vehicles
current garage count versus event-derived active count
existing daily_stats versus event-derived daily totals
existing checkout totals versus event-derived revenue
existing delegate cycle totals versus event-derived financial events
settlement cutoff behavior versus event-derived current-cycle totals
```

The reconciliation result must identify mismatches and their severity. It must not silently modify financial history.

Create a projection rebuild operation that writes a new projection version and records its input range, event watermark, operator, and timestamp. A rebuild must be idempotent and restartable.

**Gate:** A pilot date range has zero unexplained critical mismatches.

### Phase 7 — Pilot with feature flags

Use a server-side feature flag by garage. Select two to five garages with different traffic and operational patterns.

The pilot must cover:

- Multiple staff devices.
- Rapid repeated taps.
- Slow mobile network retries.
- Check-in and checkout at peak periods.
- Subscriber vehicles.
- Refunds and corrections.
- Delegate recharge and settlement.
- Role restrictions.
- Historical reports.

The existing UI remains in use. A rollback changes the server flag rather than requiring an emergency frontend release.

**Gate:** At least seven consecutive operating days meet the release thresholds.

### Phase 8 — Expand by cohorts

Expand in controlled cohorts:

```text
2–5 garages → 10–20 garages → 50 garages → larger groups
```

Pause expansion when there is an unexplained financial mismatch, lost event, duplicate effect, material latency regression, or authorization regression.

Before reaching approximately fifteen heavy garages, enable the Firebase Blaze plan and configure usage alerts. Blaze gives usage-based capacity; it does not replace query bounds, idempotency, monitoring, or reconciliation.

### Phase 9 — Retire redundant state only after proof

Only after the new model has matched production behavior should the system stop using old vehicle documents for operational decisions.

Retire in separate releases:

```text
stop old writes → verify → stop old reads → verify → remove old listeners → verify → remove obsolete indexes/rules
```

Do not delete historical data during the first retirement release. Keep an auditable read-only retention copy according to the project’s retention policy.

## 6. Rollback design

Rollback must be a feature-flag operation and a documented data procedure.

| Failure | Immediate response | Data response |
|---|---|---|
| New mutation errors increase | Disable the v2 flag for affected garages | Preserve events for diagnosis. |
| An event is missing | Stop rollout | Reconcile the affected operation and repair through a controlled admin tool. |
| Duplicate effect occurs | Disable the affected operation path | Inspect idempotency records and affected records before repair. |
| Financial totals disagree | Freeze financial expansion | Compare events, old records, and projections; require review before correction. |
| Projection is stale | Keep operational state active | Rebuild the projection from events. |
| Listener becomes stale | Restore the existing listener path | Do not replace realtime state with manual refresh during an incident. |
| Deployment is defective | Roll back application version | Do not blindly roll back Firestore data. Use forward repair or projection rebuild. |

Perform a rollback drill in a non-production environment before the first pilot.

## 7. Required tests

A green unit suite is not enough. RQ needs four layers:

| Layer | What it proves |
|---|---|
| Domain tests | Business formulas and invariants are deterministic. |
| API contract tests | Authentication, roles, validation, idempotency, and response contracts are correct. |
| Browser workflow tests | Real UI actions reach the expected server operation and produce visible feedback. |
| Reconciliation tests | Events, current state, counters, reports, and rebuilds agree. |

Critical browser journeys include check-in, checkout, refund, subscriber renewal, recharge approval, delegate settlement, garage creation, settings restrictions, supervisor restrictions, logout, session expiry, and mobile layout.

## 8. Release gates

Initial gates should be adjusted using the Phase 1 baseline, but these failures must always block rollout:

```text
unexplained critical financial mismatch: 0 allowed
duplicate business effects: 0 allowed
lost authoritative events: 0 allowed
unauthorized successful mutation: 0 allowed
checkout calculation disagreement: 0 unexplained
reconciliation coverage: 100% of pilot garages and dates
rollback drill: required before pilot
```

The deployment gate must continue to run type checking, the automated test suite, the production build, artifact checks, and the live `/api/health` version smoke check.

## 9. Cost and scale position

The expected workload at fifteen heavy garages is approximately 4,500–7,500 daily check-ins, with a similar number of checkouts. That is a sensible point to move to Blaze and start paying for measured usage.

At 1,000 garages, the design must remain garage-scoped. A check-in must not scan all garages or all historical vehicles. Historical reports must be paginated and date-bounded. Realtime listeners must be limited to operational state. High-contention documents must be identified through metrics before introducing sharded counters.

The event ledger may initially increase writes because a mutation may write an event, current state, existing stats, and an idempotency record. The expected savings come from fewer unnecessary listeners, bounded historical reads, deterministic retries, and rebuildable reports. Cost must be measured rather than assumed.

## 10. First implementation backlog

The first safe coding batch should be:

1. Add typed event envelopes and payload validators in `server/events.ts`.
2. Add event-type tests and sensitive-field redaction tests.
3. Add server metrics for vehicle mutation latency, retries, conflicts, and idempotency hits.
4. Add transactional `vehicle_entered` recording to the existing check-in route without changing the UI.
5. Add transactional `vehicle_exited` recording to the existing checkout route without deleting current vehicle state.
6. Add an admin-only event/state reconciliation command for a selected garage and date range.
7. Add browser tests that verify check-in and checkout UI feedback and resulting state.
8. Run the new path in shadow mode for pilot garages.

The first batch must not include deleting vehicle documents, removing operational listeners, changing Firestore rules broadly, or making daily projections asynchronous.

## Final recommendation

Gemini’s event-ledger direction is correct, but “quiet background event recording” is not safe for vehicle lifecycle or financial operations. RQ should record authoritative events transactionally with the critical state mutation. Asynchronous work should be reserved for rebuildable projections and reports.

The safest migration for this project is therefore:

```text
current UI
  → existing service methods
  → versioned server domain operations
  → transactional event ledger plus current operational state
  → rebuildable projections and reconciliation
```

This design supports the transition from twenty heavy garages to one thousand or more without requiring a risky big-bang rewrite. It also gives RQ a reproducible answer for every important number: which event created it, which projection calculated it, and whether the result reconciles with current operational state.

## References

[1]: https://firebase.google.com/docs/firestore/manage-data/transactions "Cloud Firestore transactions and batched writes"

[2]: https://firebase.google.com/docs/firestore/transaction-data-contention "Cloud Firestore transaction contention"

[3]: https://firebase.google.com/docs/firestore/real-time_queries_at_scale "Cloud Firestore realtime queries at scale"

[4]: https://firebase.google.com/docs/firestore/query-data/query-cursors "Cloud Firestore query cursor pagination"

[5]: https://firebase.google.com/docs/firestore/monitor-usage "Monitor Cloud Firestore usage"

[6]: https://firebase.google.com/docs/firestore/quotas "Cloud Firestore quotas and limits"

[7]: https://firebase.google.com/docs/firestore/pricing "Cloud Firestore pricing"

[8]: https://firebase.google.com/docs/firestore/security/rules-conditions "Cloud Firestore security rule conditions"

[9]: https://firebase.google.com/docs/firestore/solutions/counters "Cloud Firestore distributed counters"

[10]: https://martinfowler.com/bliki/StranglerFigApplication.html "Strangler Fig application pattern"

[11]: https://martinfowler.com/eaaDev/EventSourcing.html "Event sourcing pattern"

[12]: https://martinfowler.com/articles/patterns-of-distributed-systems/idempotent-receiver.html "Idempotent receiver pattern"

[13]: https://sre.google/sre-book/monitoring-distributed-systems/ "Monitoring distributed systems"

[14]: https://sre.google/sre-book/release-engineering/ "Release engineering"
EOF
wc -l -c SAFE_MIGRATION_PLAN.md && grep -c '^## ' SAFE_MIGRATION_PLAN.md && grep -c '^\[[0-9][0-9]*\]:' SAFE_MIGRATION_PLAN.md
