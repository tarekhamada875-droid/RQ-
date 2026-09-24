# Legacy Backend Functional Refactoring Assessment

**Repository:** `tarekhamada875-droid/RQ-`  
**Assessment commit inspected:** `b1d65bf`  
**Date:** 2026-09-24

## Executive conclusion

The current production backend **can be remodeled piece by piece using functional programming**, and this is safer than continuing a wholesale replacement with `server-v2`. The legacy backend is not clean, but it has enough existing boundaries—validation, idempotency, event recording, projections, fair-use rules, and financial reporting—to extract a functional core without changing the production data model or replacing the live HTTP surface.

The recommended strategy is a **functional core with an imperative Firestore shell**. Pure functions should decide what is allowed and what state changes should occur. Thin route adapters should authenticate the request, read Firestore documents, call the pure decision function, and apply the returned writes in the existing transaction or batch. The legacy route remains the production entry point during every stage.

This approach should work, provided that the team avoids a big-bang rewrite and does not dual-write financial data. The primary risk is not functional programming itself. The primary risk is changing behavior while extracting it from handlers that currently combine authentication, validation, business rules, time, identifiers, Firestore reads, Firestore writes, logging, and HTTP response formatting.

## What the current backend actually looks like

The live authority is the legacy `server/` tree, not `server-v2`. The application is assembled in `server/app.ts`, and the route handlers directly import the Firebase Admin database, authentication middleware, idempotency helpers, event recording, validation, and business utilities. The main vehicle handler alone combines request authorization, Cairo date calculation, subscriber lookup, capacity rules, fair-use rules, vehicle state transitions, garage counters, activity logs, domain events, projection buckets, and idempotency persistence inside one transaction.

The current structure is therefore **imperative at the edge and partially modular underneath**. It is not a blank slate, but it is also not yet a layered domain architecture.

The following measurements show the main refactoring constraint:

| Area | Current observation | Meaning for the plan |
|---|---:|---|
| Legacy application composition | `server/app.ts` is approximately 900 lines | Routing and cross-cutting behavior should not be rewritten together |
| Legacy route surface | 8 route modules | Refactor one capability at a time behind the existing route |
| Legacy backend tests | 15 server test files | Characterization coverage must be expanded before moving behavior |
| Direct Firestore and transaction references | 283 references in the inspected route/application scope | Firestore access is the main imperative boundary |
| `any` occurrences in `server/` | 227 | Domain input/output types should be introduced gradually |
| Existing pure or mostly pure helpers | validation, projections, fair-use, idempotency fingerprinting, reporting | These are the safest extraction starting points |

## Why a functional core is appropriate here

A functional core does not require changing the language or adopting a new framework. It means that business decisions become deterministic TypeScript functions. They receive explicit data and return either a decision or a typed domain error. They do not read Firestore, inspect environment variables, call the system clock, generate random IDs, or write logs.

For example, the vehicle check-in policy can eventually have a shape like this:

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function decideCheckIn(
  garage: GarageState,
  vehicle: VehicleState | null,
  subscriber: SubscriberState | null,
  command: CheckInCommand,
  clock: Clock
): Result<CheckInDecision, CheckInError> {
  // No Firestore, Express, process.env, Date.now(), or random IDs here.
}
```

The existing route would continue to own the infrastructure work:

1. Authenticate the caller and establish garage scope.
2. Validate and normalize the request.
3. Read the garage, vehicle, and subscriber records.
4. Convert legacy Firestore shapes into domain input values.
5. Call the pure decision function with an injected clock.
6. Convert the decision into the existing Firestore transaction writes.
7. Record the existing event, projection update, and idempotency record.
8. Return the existing response envelope.

This design lets us improve the reasoning and testability of the backend without requiring a simultaneous database migration, route migration, or frontend migration.

## Important legacy risks found during the assessment

These are not reasons to discard the backend. They are the seams that should shape the migration order.

### Business rules and persistence are interleaved

`server/routes/vehicles.ts` places state checks and Firestore mutations in the same transaction callback. The handler computes dates, decides subscriber status, checks capacity and fair-use limits, updates counters, writes activity logs, records a domain event, and stores idempotency state. This makes behavior difficult to test without Firestore and makes it easy for a later change to update one counter but omit another.

`server/routes/recharges.ts` has the same pattern around subscription expiry, package pricing, balance top-ups, referral rewards, activity logs, and financial events. This route must be among the last areas refactored because its behavior changes money, subscription entitlement, and commission state.

### Time and identifiers are hidden dependencies

The routes call `new Date()` and `Date.now()` directly. Event IDs use the current time and random bytes. Cairo date calculation is embedded in handlers. Pure extraction requires an injected clock and an injected identifier generator so tests can prove exact behavior and replay scenarios.

### Idempotency is not uniform across the legacy surface

The shared idempotency implementation already scopes records by endpoint and actor and supports request fingerprints. However, several legacy subscriber mutation paths check and store idempotency records without consistently supplying a request fingerprint. A changed request can therefore be treated as a replay rather than a key-reuse conflict on some paths. The first refactoring slice should standardize this contract without changing successful response shapes.

### Production rate limiting can fall back to process-local memory

`server/middleware.ts` uses a Firestore-backed rate limit when available but falls back to an in-memory map if the database transaction fails. In a multi-instance deployment, that fallback is not a global limit. A functional refactoring should make this policy explicit: either fail closed for protected operations or use a deliberately injected distributed limiter. The pure function can decide whether a request is allowed; the shell must supply the authoritative counter store.

### Multi-step destructive operations are not atomic

Garage creation writes the PIN record, garage document, and activity log in separate operations. A failure can leave partial state. Garage deletion marks state, updates a deletion job, deletes many pages of documents, deletes the garage, writes a completion record, and writes a log. This is intentionally resumable rather than transactional, but the deletion plan and progress state should be modeled explicitly before changing it.

### Authorization is centralized only partially

`requireAuth` performs Firebase verification, session lookup, inactivity checks, role detection, entity lookup, and garage assignment. Route-specific authorization then repeats role and garage checks. The `canManageGarageScopedData` helper is a useful starting point, but a functional policy module should eventually return explicit authorization decisions instead of relying on repeated string comparisons inside handlers.

### Error handling depends on string matching

Both `server/app.ts` and `server/routes/helpers.ts` map errors by searching message strings such as `VEHICLE_ALREADY_INSIDE`, `GARAGE_SCOPE_MISMATCH`, and `SUBSCRIBER_NOT_FOUND`. This works as a compatibility mechanism but is fragile. Typed discriminated errors should be introduced behind the existing response mapper, allowing the HTTP contract to remain stable while the internal error model improves.

## Proposed migration order

The migration should preserve the current route, collections, response shapes, and production authority. Each step should be independently deployable and reversible.

### Stage 0: Freeze the boundary and create characterization tests

Before extracting logic, capture the behavior that clients currently depend on. Tests should cover successful responses, error codes, authorization boundaries, idempotent replays, duplicate-key conflicts, transaction retries, and legacy document shapes.

The tests should use fixed clocks and deterministic IDs where possible. Existing route tests should remain in place; new tests should be added beside them rather than replacing them with only pure-function tests.

### Stage 1: Extract shared pure policies

Start with low-risk, non-financial decisions that already have recognizable boundaries:

- Date-key and Cairo-day calculations.
- Vehicle plate normalization.
- Subscriber date-range validation.
- Garage-scope authorization decisions.
- Package restriction decisions.
- Fair-use decisions.
- Projection reduction and report calculations.
- Idempotency fingerprint and replay classification.

This stage should not change Firestore writes. It should make the existing handlers call pure functions for decisions while continuing to perform the same writes.

### Stage 2: Extract subscriber state transitions

Subscriber add, renew, update, and delete are a good first transactional capability because their state machine is smaller than vehicle check-in/out and does not directly calculate parking revenue.

The pure function should receive the current subscriber and command and return one of the following outcomes:

- `created`
- `renewed`
- `updated`
- `deleted`
- `not_found`
- `invalid_date_range`
- `immutable_plate_change`
- `idempotency_conflict`

The existing route adapter should continue to write the same Firestore document and event records. This slice should also standardize request fingerprints for every mutation.

### Stage 3: Extract vehicle lifecycle decisions

Vehicle check-in and check-out should be treated as two separate slices. Check-in has subscriber, capacity, fair-use, garage-lock, and expiry decisions. Check-out has pricing, elapsed-time, counter, revenue, and possible refund consequences.

Check-in should be implemented before check-out. The pure check-in function can be compared against the current route for many fixed scenarios without changing production behavior. Check-out should remain behind the legacy route until its pricing and accounting characterization suite is extensive.

### Stage 4: Extract non-financial garage policies

Garage profile updates, lock/suspension rules, trial decisions, deletion job planning, and read-model summaries can be moved into pure policies and explicit command objects. Physical deletion should remain a separate operational workflow. The deletion planner should produce a list of collection pages and progress transitions; the Firestore adapter should execute those transitions.

### Stage 5: Refactor authentication and authorization policies

Authentication verification and session reads will remain imperative, but the policy decision can become pure. The policy should accept a verified identity, session facts, entity facts, and requested resource scope, then return an explicit principal or denial reason.

This should be done only after characterization tests establish the current legacy session behavior, including legacy credentials and device-session compatibility.

### Stage 6: Refactor financial operations last

Recharge approval, direct garage recharge, balance top-ups, delegate commission, refunds, and settlement must remain legacy-authoritative until the new functional decisions have passed reconciliation tests against historical and synthetic scenarios.

There must be **no dual write** during this stage. The safe sequence is:

1. Pure calculation and policy tests.
2. Read-only comparison against legacy inputs.
3. Transaction adapter tests in the emulator.
4. Reconciliation against stored events and balances.
5. A feature-gated canary only after explicit rollback evidence.
6. A controlled cutover decision.

## How each slice should be implemented

Every slice should use the same internal structure:

```text
server/
  domain/
    vehicleCheckIn.ts       # pure decisions and typed errors
    subscriberLifecycle.ts  # pure state transitions
    authorization.ts        # pure scope decisions
  adapters/
    firestoreVehicle.ts     # reads and writes only
    firestoreSubscriber.ts  # reads and writes only
  routes/
    vehicles.ts             # HTTP translation and orchestration
    subscribers.ts          # HTTP translation and orchestration
```

The repository does not need to be reorganized all at once. A new `server/domain/` directory can be introduced one capability at a time. Existing modules such as `server/projections.ts`, `server/unlimitedFairUse.ts`, and `server/validation.ts` can be moved or wrapped only after imports are stable.

The domain functions should use:

- Discriminated unions instead of error-message strings.
- Readonly input and output types.
- Integer minor units for monetary calculations where applicable.
- An injected `Clock` interface.
- An injected ID generator for event and operation identities.
- Explicit command objects.
- Explicit state-transition results.
- No hidden reads, writes, logging, or environment access.

## Production rollout model

Remodeling while the service is deployed is acceptable, especially because there are currently no clients, but deployment safety should still be treated as if clients existed. The absence of clients reduces business impact; it does not eliminate data corruption or rollback risk.

The legacy route should remain the only writer until a slice has passed its acceptance gates. A feature flag may select the new pure decision plus the existing adapter for a narrow operation, but the flag must default to the legacy path. Shadow execution may compute a comparison without applying any new write. Financial operations must not be shadow-written or dual-written.

Each slice should have the following acceptance gates:

- Existing legacy tests pass.
- New pure domain tests cover all state transitions and error outcomes.
- Adapter tests cover legacy Firestore shapes.
- Firestore emulator tests cover transaction retries and concurrent requests.
- Authorization tests cover cross-garage access.
- Idempotency tests cover replay and changed-payload reuse.
- Full repository typecheck, tests, build, and maintainability checks pass.
- A production smoke check verifies the route remains healthy.
- Rollback is a single flag change or deployment rollback.

## Final assessment

**Would it work?** Yes. A piece-by-piece functional refactor of the current production backend is technically feasible and is the strategy I recommend.

**Would it be safer than continuing the current V2 replacement?** Yes, because it preserves the backend that currently owns the data and lets each new functional policy be compared with existing behavior before it changes authority.

**Would a full rewrite from scratch be safe?** No. It would discard useful legacy behavior and recreate the same risks during a larger migration window.

**What should happen next?** Freeze expansion of `server-v2`. Do not delete it, because it contains useful typed contracts and test ideas. Begin with Stage 0 and Stage 1 on the legacy backend, then implement the subscriber lifecycle as the first complete functional-core slice. Keep vehicle check-out and all financial writes on the existing legacy path until later stages prove correctness.

## References

[1]: https://github.com/tarekhamada875-droid/RQ- "RQ production repository"
[2]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server/app.ts "Legacy Express application composition"
[3]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server/middleware.ts "Legacy authentication, sessions, and rate limiting"
[4]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server/routes/vehicles.ts "Legacy vehicle lifecycle routes"
[5]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server/routes/recharges.ts "Legacy financial recharge routes"
[6]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server/idempotency.ts "Legacy idempotency implementation"
[7]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server/events.ts "Legacy domain-event implementation"
[8]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server/projections.ts "Legacy projection reducer"
[9]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server/validation.ts "Legacy validation boundary"
[10]: https://github.com/tarekhamada875-droid/RQ-/blob/main/server-v2 "Guarded parallel V2 backend implementation"

<!-- End of assessment -->
Nothing in this assessment changes production flags, routes, data, or backend authority.
