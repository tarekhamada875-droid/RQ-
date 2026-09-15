# RQ Safe Backend Migration Plan

**Author:** Manus AI  
**Scope:** Backend domain logic, Firestore data model, APIs, projections, reconciliation, and operations. The existing React user interface remains in place during the migration.

## Executive decision

RQ should migrate to a deterministic, event-based backend through a staged **strangler migration**. The current production model must remain available until the replacement has demonstrated equivalent results under real workloads.

The migration will not begin by deleting vehicle documents, removing realtime listeners, or changing the user interface. It will begin by formalizing business rules, measuring production behavior, and introducing versioned server APIs behind the existing service methods.

The migration is complete only when the new model can reproduce the current model’s operational, financial, authorization, and reporting results, and when rollback is still possible for every migrated workflow.

## 1. Safety principles

| Principle | Required behavior |
|---|---|
| Single authority | Critical mutations are decided by the server, not by client-side Firestore writes. |
| Immutable history | Business events are append-only and are never silently edited or deleted. |
| Rebuildable views | Counters, daily totals, monthly totals, and current-cycle balances can be regenerated from events. |
| Idempotent mutations | Retrying the same operation produces one business effect. |
| Tenant isolation | Every read and write is scoped to the authenticated garage, delegate, or administrator. |
| Reversible rollout | Every phase has a stop condition and a rollback procedure. |
| Operational realtime | Live vehicles, capacity, garage state, and active work remain realtime. |
| Historical on demand | Reports, exports, recharge history, and long-range activity are loaded with bounded queries. |
| Observable behavior | Latency, retries, errors, mismatches, and usage are measured before optimization decisions. |

> A projection is a fast, derived representation of authoritative events. It may be rebuilt when damaged or outdated; it is not the final source of truth.

## 2. Target architecture

The target system has three logical layers.

### 2.1 Immutable business events

Each completed business action creates one immutable event with a stable identifier, garage scope, actor, timestamp, operation key, schema version, and business payload.

Recommended event types include `vehicle_entered`, `vehicle_exited`, `vehicle_refunded`, `vehicle_deleted`, `subscriber_created`, `subscriber_renewed`, `recharge_approved`, `recharge_rejected`, and `delegate_settled`.

A representative event is:

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

The payload must contain the values required to reproduce the business result. It must not depend on a later mutable vehicle document.

### 2.2 Operational state

Operational state contains only data needed for fast current screens:

```text
garages/{garageId}/active_vehicles/{normalizedPlate}
garages/{garageId}/state/current
garages/{garageId}/subscribers/{subscriberId}
delegates/{delegateId}/current_cycle
```

Active vehicle state can be deleted after checkout only after the immutable exit event and required projections have been committed successfully.

### 2.3 Rebuildable projections

Projections support fast reports and dashboard display:

```text
garages/{garageId}/daily_stats/{yyyy-mm-dd}
garages/{garageId}/monthly_stats/{yyyy-mm}
delegates/{delegateId}/settlements/{settlementId}
```

Every projection must record the event sequence or processing watermark used to produce it. This allows reconciliation to identify whether a projection is current.

## 3. Mathematical invariants

The domain engine must define and test invariants before data migration begins.

### Vehicle state

For a garage and time `t`, the active set is the vehicles whose latest valid lifecycle event is `vehicle_entered` and which have no later valid exit, refund, or deletion event.

```text
activeVehicleCount(garage, t) = |activeVehicles(garage, t)|
```

The garage state must satisfy:

```text
0 <= activeVehicleCount <= capacity
```

A check-in must fail when the vehicle is already active or when capacity would be exceeded. A checkout must fail when no active vehicle exists for the normalized plate.

### Revenue

For a garage and period `P`:

```text
revenue(P) = sum(valid vehicle_exited.totalCost in P)
              - sum(valid vehicle_refunded.amount in P)
```

The calculation must use the immutable event payload and must not depend on a mutable vehicle document that may no longer exist.

### Delegate settlement

If a delegate settlement occurs at timestamp `S`, the current cycle is:

```text
currentCycleAmount = sum(eligible financial events where occurredAt > S)
```

Historical totals remain available and are never reset by overwriting the event history.

### Idempotency

For every mutation operation key `K`:

```text
businessEffects(K) <= 1
```

A retry with the same key returns the stored result or a deterministic conflict. It must not create a second event, charge, refund, commission, or state transition.

## 4. Migration phases and gates

### Phase 0 — Freeze the contract and business rules

**Objective:** Remove ambiguity before changing storage.

Document the authoritative rules for vehicle lifecycle, pricing, refunds, subscribers, recharge approvals, delegate commissions, settlement, capacity, roles, date validation, and idempotency. Each rule must have a deterministic input/output example and a negative case.

Create a route-to-rule matrix that identifies the server endpoint, allowed roles, garage scope, documents read, documents written, event emitted, and idempotency behavior.

**Exit gate:** Product rules are approved, all critical rules have automated tests, and no migration implementation begins while a rule remains undefined.

### Phase 1 — Baseline production behavior

**Objective:** Measure before optimizing.

Add privacy-safe metrics for request count, latency, transaction retries, conflict rate, Firestore read/write counts where available, active listener categories, and reconciliation mismatches. Metrics must not store PINs, license plates, names, or raw customer data.

Capture a representative baseline for at least one normal operating period. The baseline should include ordinary garages and the heaviest available garages.

**Exit gate:** The team can identify the current cost and latency of check-in, checkout, reports, recharge operations, and active listeners. If no material bottleneck exists, skip unnecessary storage redesign.

### Phase 2 — Low-risk read optimization

**Objective:** Reduce waste without changing vehicle correctness.

Keep realtime listeners for active vehicles, garage state, capacity, currently used subscribers, and session state. Convert historical reports, recharge history, exports, and long-range activity pages to bounded on-demand API reads with pagination and date filters.

Every historical screen must display loading, empty, error, retry, and stale-data states. Closing the screen must cancel or stop any associated listener.

**Exit gate:** Read volume decreases or remains controlled, report results remain identical, and no active operational screen becomes stale.

### Phase 3 — Implement the new pure domain engine

**Objective:** Separate business correctness from React and Firestore.

Implement pure functions for authorization, check-in decisions, checkout pricing, refunds, subscriber date rules, recharge approval, commission calculation, and settlement. These functions must not import Firebase, Express, React, or browser APIs.

Use table-driven and property-based tests where useful. Test duplicate requests, retries, simultaneous operations, invalid dates, capacity boundaries, overnight pricing, refunds, and settlement cutoffs.

**Exit gate:** The new engine produces approved results for the complete rule matrix and has no direct infrastructure dependency.

### Phase 4 — Versioned server APIs

**Objective:** Put the new engine behind stable contracts while preserving the current UI.

Add versioned routes such as:

```text
POST /api/v2/vehicles/check-in
POST /api/v2/vehicles/check-out
POST /api/v2/vehicles/refund
POST /api/v2/subscribers/renew
POST /api/v2/recharges/approve
POST /api/v2/delegates/settle
```

Each route must authenticate, authorize, validate, check idempotency, apply the domain decision, write the required state atomically, and return a documented response envelope containing a correlation ID and operation result.

Existing frontend service names may remain unchanged. During migration, they call the v2 route internally, so the UI does not need to be rewritten.

**Exit gate:** Contract tests verify success, validation failure, permission failure, duplicate retry, transaction conflict, and not-found behavior for every v2 route.

### Phase 5 — Shadow event recording

**Objective:** Validate the event model without changing user-visible behavior.

For selected operations, continue writing the current production documents while also recording the new event and projection in the same server transaction whenever Firestore transaction size and contention permit. If atomic dual writing is not possible for a particular operation, use an outbox or durable reconciliation queue; do not silently ignore an event-write failure.

Start with vehicle checkout and recharge approval because they provide clear financial and lifecycle outputs. Do not delete existing vehicle documents in this phase.

**Exit gate:** New events are complete, immutable, tenant-scoped, and reproducible. Any dual-write failure is visible and recoverable.

### Phase 6 — Reconciliation and backfill

**Objective:** Prove equivalence between old and new representations.

Build an admin-only reconciliation job that compares, by garage and bounded date range:

```text
old active vehicles versus new active vehicles
old counters versus computed active count
old daily revenue versus event-derived revenue
old delegate totals versus event-derived totals
old settlement cutoff behavior versus event-derived current cycle
```

Reconciliation must produce a report with mismatch type, scope, identifiers safe for administrators, first observed time, and recommended action. It must not silently overwrite financial data.

Backfill historical events only when the original record contains enough information to reconstruct them confidently. Mark uncertain backfills with a migration source and confidence status rather than inventing missing values.

**Exit gate:** A defined pilot period produces zero unexplained critical mismatches, and all remaining mismatches have documented remediation.

### Phase 7 — Pilot release

**Objective:** Test the replacement with limited operational exposure.

Select two to five pilot garages with different traffic patterns. Keep the existing UI and provide a server-side feature flag that selects the v2 decision path per garage.

Run the pilot long enough to cover ordinary operations, peak periods, refunds, subscriber activity, delegate settlement, mobile retries, and multiple staff devices.

**Exit gate:** Pilot garages meet the error, latency, reconciliation, and financial-equivalence thresholds defined below for at least seven consecutive operating days.

### Phase 8 — Progressive expansion

Expand by controlled cohorts rather than by percentage of all traffic without tenant awareness. Recommended cohorts are five garages, twenty garages, fifty garages, then larger groups.

After each cohort, hold a review period. Do not expand while critical mismatches, duplicate effects, unexplained financial differences, or elevated checkout failures remain.

**Exit gate:** Each cohort passes its review period and rollback remains tested.

### Phase 9 — Retire redundant state

Only after the new model is stable should the system stop using old vehicle documents for operational decisions. Keep an archived, read-only retention copy for the agreed audit period unless legal, operational, or cost requirements say otherwise.

Remove old writes first, then old reads, then old indexes and rules. Each removal must be a separate deployment with a rollback point.

**Exit gate:** No production route, report, correction flow, export, or admin tool depends on the retired representation.

## 5. Rollback design

Rollback must be a feature-flag operation, not an emergency code rewrite.

| Failure | Immediate action | Data action |
|---|---|---|
| New route returns elevated errors | Disable v2 flag for affected garages | Preserve events and projections for diagnosis |
| Projection mismatch | Stop expansion | Rebuild projection from events; do not overwrite source history |
| Duplicate business effect | Disable affected mutation route | Inspect idempotency records and reconcile affected scope |
| Financial discrepancy | Freeze financial expansion | Compare events, old records, and projection; require admin review |
| Realtime stale state | Revert listener/read path | Keep operational listener active until replacement is proven |
| Deployment defect | Roll back application version | Do not roll back data blindly; use forward repair or projection rebuild |

A rollback drill must be performed in staging before the first pilot. The drill must prove that disabling v2 restores the old path without losing new events or creating duplicate effects.

## 6. Release gates and suggested thresholds

Thresholds should be finalized from Phase 1 baseline data. Initial conservative gates are:

| Measure | Pilot requirement |
|---|---:|
| Critical financial mismatches | 0 unexplained |
| Duplicate business effects | 0 |
| Unauthorized successful mutations | 0 |
| Lost event records | 0 |
| Checkout correctness | 100% against approved scenarios |
| Reconciliation completion | 100% of pilot garages and dates |
| New-route error rate | No material regression against baseline |
| p95 mutation latency | No material regression against baseline |
| Rollback drill | Passed before pilot |
| Historical report differences | 0 unexplained |

A release must be blocked when a critical threshold fails, even if the automated test suite is green.

## 7. Testing strategy

The migration requires four complementary test layers.

### Domain tests

These test pure business functions with deterministic fixtures. They cover all approved business rules and boundary conditions.

### API contract tests

These verify authentication, authorization, validation, idempotency, transaction conflicts, response envelopes, and error codes for each route.

### Browser workflow tests

These click the existing UI and verify the resulting server-visible state. Critical journeys include check-in, checkout, refund, subscriber renewal, recharge approval, delegate settlement, garage creation, and role restrictions.

### Reconciliation tests

These generate known event sequences and verify that projections, counters, current state, monthly totals, settlements, and rebuild operations produce the expected values.

A green unit suite is necessary but insufficient. A mutation is production-ready only when the domain, API, browser, and reconciliation layers agree.

## 8. Firestore and cost controls

The migration should optimize the highest-cost patterns rather than assume that the number of garages alone causes a problem.

Use garage-scoped documents and queries. Avoid scans across all garages during normal operations. Bound historical queries by date and page size. Keep realtime listeners limited to operational state. Avoid unbounded aggregate documents that become write hotspots. Introduce sharded counters only when measured contention justifies them.

The Blaze plan should be enabled before sustained usage approaches the Spark limits, but billing-plan changes do not remove the need for bounded queries, idempotency, transaction design, or monitoring. Usage-based billing provides capacity; it does not repair incorrect business logic.

## 9. Operational requirements

Before the first pilot, production must expose:

```text
GET /api/health
```

The response must include status, backend readiness, deployed version, and timestamp. The existing release smoke check must verify this endpoint after deployment.

The system should also provide admin-visible or operator-visible metrics for request counts, latency, transaction retries, conflict rates, idempotency hits, reconciliation mismatches, and projection lag. Alerts should identify the garage scope and operation type without exposing sensitive customer data.

## 10. Recommended implementation order for RQ

The safest practical order is:

1. Freeze and test the existing business rules.
2. Measure current production reads, writes, latency, retries, and listeners.
3. Convert historical screens to bounded on-demand reads.
4. Extract pure domain functions from the current server routes.
5. Add v2 vehicle check-in and checkout APIs behind existing service methods.
6. Add immutable vehicle lifecycle events and rebuildable projections in shadow mode.
7. Add reconciliation and backfill tools.
8. Pilot with two to five garages.
9. Migrate recharge, commission, settlement, subscriber, and reporting paths.
10. Expand by cohorts.
11. Retire redundant state only after the evidence and rollback requirements are satisfied.

## Final recommendation

The migration should proceed, but it should be treated as a **controlled backend replacement**, not a one-time rewrite. Keeping the existing UI reduces user-facing risk. Keeping the existing operational model during shadow mode preserves rollback. Immutable events, deterministic domain functions, idempotency, and reconciliation provide the mathematical foundation required for growth from twenty heavy garages to one thousand or more.

The first implementation milestone should be measurement plus the pure domain engine. The first production migration milestone should be shadow event recording for vehicle lifecycle operations. No old vehicle document should be deleted until the new event-derived state has matched production behavior for a defined pilot period.

## References

[1]: https://firebase.google.com/docs/firestore/manage-data/transactions "Cloud Firestore transactions and batched writes"

[2]: https://firebase.google.com/docs/firestore/quotas "Cloud Firestore quotas and limits"

[3]: https://firebase.google.com/docs/firestore/real-time_queries_at_scale "Cloud Firestore real-time queries at scale"

[4]: https://firebase.google.com/docs/firestore/solutions/aggregation "Cloud Firestore aggregation solutions"

[5]: https://firebase.google.com/docs/app-check "Firebase App Check documentation"

[6]: https://firebase.google.com/docs/firestore/security/rules-conditions "Cloud Firestore security rule conditions"

[7]: https://cloud.google.com/firestore/docs/best-practices "Cloud Firestore best practices"

[8]: https://cloud.google.com/firestore/pricing "Cloud Firestore pricing"

[9]: https://vercel.com/docs/deployments/overview "Vercel deployments overview"

[10]: https://developers.cloudflare.com/pages/configuration/git-integration/ "Cloudflare Pages Git integration"

[11]: https://developers.cloudflare.com/pages/configuration/build-configuration/ "Cloudflare Pages build configuration"

[12]: https://martinfowler.com/bliki/StranglerFigApplication.html "Strangler Fig application pattern"

[13]: https://martinfowler.com/eaaDev/EventSourcing.html "Event sourcing pattern"

[14]: https://martinfowler.com/articles/patterns-of-distributed-systems/idempotent-receiver.html "Idempotent receiver pattern"

[15]: https://sre.google/sre-book/monitoring-distributed-systems/ "Monitoring distributed systems"

[16]: https://sre.google/sre-book/release-engineering/ "Release engineering"

[17]: https://firebase.google.com/docs/firestore/enterprise/understand-use-cases "Firestore usage patterns and use cases"

[18]: https://firebase.google.com/docs/firestore/transaction-data-contention "Cloud Firestore transaction contention"

[19]: https://firebase.google.com/docs/firestore/query-data/indexing "Cloud Firestore indexing"

[20]: https://firebase.google.com/docs/firestore/solutions/counters "Distributed counters in Cloud Firestore"

[21]: https://firebase.google.com/docs/firestore/monitor-usage "Monitor Cloud Firestore usage"

[22]: https://firebase.google.com/docs/firestore/backup-restore "Cloud Firestore backup and restore"

[23]: https://firebase.google.com/docs/firestore/manage-data/add-data "Adding and updating Firestore data"

[24]: https://firebase.google.com/docs/firestore/query-data/listen "Listen to realtime updates"

[25]: https://firebase.google.com/docs/firestore/query-data/query-cursors "Paginate data with query cursors"

[26]: https://firebase.google.com/docs/firestore/transaction-data-contention "Cloud Firestore transaction contention"

[27]: https://firebase.google.com/docs/firestore/monitor-usage "Monitor Cloud Firestore usage"

[28]: https://firebase.google.com/docs/firestore/backup-restore "Cloud Firestore backup and restore"

[29]: https://martinfowler.com/bliki/StranglerFigApplication.html "Strangler Fig application pattern"

[30]: https://martinfowler.com/eaaDev/EventSourcing.html "Event sourcing pattern"

[31]: https://martinfowler.com/articles/patterns-of-distributed-systems/idempotent-receiver.html "Idempotent receiver pattern"

[32]: https://sre.google/sre-book/monitoring-distributed-systems/ "Monitoring distributed systems"

[33]: https://sre.google/sre-book/release-engineering/ "Release engineering"
