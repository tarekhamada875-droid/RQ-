# RQ Operation Trail Guide

## What this gives us

RQ now records a durable, privacy-safe technical trace for every API request. A manual action such as “check a vehicle in” produces a trace that identifies the endpoint, authenticated role, garage scope, result status, duration, correlation ID, and UI operation ID. The related business records remain in the existing activity log, domain-event, idempotency, and projection collections.

This means a technical reviewer can compare the user-visible result with the server request and the resulting business records. It does not mean that passwords, Firebase tokens, full request bodies, or private credentials are copied into the trace ledger.

## How one action is connected

The intended evidence chain is:

```text
User uses the UI
  -> frontend sends X-Operation-ID and X-Correlation-ID
  -> backend stores operation_traces/{hash(correlationId)}
  -> authenticated actor and garage scope are attached
  -> transaction writes business documents
  -> domain event inherits correlationId and operationId
  -> activity log and projection record the business effect
  -> API response status and duration are stored in the trace
```

The operation trace is diagnostic evidence. The business event, activity log, financial record, vehicle record, and projection are the authoritative records for the operation’s actual effect.

## What the owner needs to do

The owner does not need to open Firebase, read server logs, or run commands. The owner only needs to use the application normally for each role and report whether the screen behaved correctly.

For each manual test, use a dedicated test garage and test vehicles. After a test batch, report the approximate time and the actions performed. The technical reviewer can then locate the corresponding traces by time, endpoint, role, garage, and outcome.

A useful report is:

```text
Role: Garage owner
Approximate time: 2026-09-19 10:15 Cairo time
Garage: Production Test Garage
Actions: login, add vehicle ABC123, check-in, dashboard, check-out, logout
Screen result: all passed
```

Do not send passwords, Firebase tokens, or private credentials in the report.

## What the technical reviewer checks

For each critical manual action, the reviewer checks four layers:

1. **Trace layer.** The request exists, has the expected role and garage scope, has a valid status code, and has a reasonable duration.
2. **Business layer.** The expected vehicle, subscriber, recharge, package, or session record changed correctly.
3. **Consistency layer.** The activity log and domain event exist with the same operation/correlation identifiers where the action creates an event.
4. **Protection layer.** A retry does not duplicate the business effect, unauthorized access is rejected, and no sensitive request data appears in the trace.

A manual action is marked **verified** only when the screen result and the underlying evidence agree. A screen that looks correct without corresponding backend evidence is not sufficient for a production decision.

## Trace fields

Each `operation_traces` document contains bounded metadata:

| Field | Meaning |
|---|---|
| `correlationId` | Unique request trace identifier returned in the `X-Correlation-ID` response header |
| `operationId` | Frontend-generated identifier for the UI request |
| `method` and `path` | API operation, without query strings |
| `statusCode` and `outcome` | Success, client error, or server error |
| `durationMs` | Backend request duration |
| `actorUid` and `actorRole` | Authenticated identity context, when available |
| `garageId` | Authenticated garage scope, when available |
| `occurredAt` | Trace creation time |
| `expiresAt` | Intended retention deadline |

The trace intentionally excludes request bodies, authorization headers, passwords, PINs, tokens, full plate data, payment details, and IP addresses.

## Retention requirement

The application writes `expiresAt` for a 90-day retention period. Before public launch, enable a Firestore TTL policy for `operation_traces.expiresAt` in the production Firebase project. Verify that expired documents are removed during a controlled test. TTL cleanup is managed by Firebase and is not immediate, so the retention period is an approximate minimum rather than an exact deletion timestamp.

Until the TTL policy is enabled, the trail is not fully production-ready because traces could accumulate indefinitely and increase storage cost.

## What this does not prove by itself

The operation trail does not prove that the service can never fail. It provides evidence after an operation occurs. It cannot recover an action that never reached the backend, a device that was offline, or an outage before a trace could be stored. The existing backups, monitoring, rollback, and recovery procedures remain necessary.

The trace write is intentionally asynchronous so a diagnostic write failure does not delay or change the customer’s business response. For that reason, a missing trace is an investigation alert, not proof that the business transaction failed. The authoritative transaction and domain records must be checked.

## Production decision rule after manual testing

After the owner completes the UI tests, the technical reviewer should report one of these outcomes:

- **Verified for pilot:** all tested critical actions have matching traces and correct business records; no blocker was found; remaining checks are limited to pilot monitoring.
- **Not verified:** one or more actions lacked evidence, had a mismatch, or produced an unexplained error.
- **Blocked:** security, financial integrity, data consistency, backup/recovery, or cross-tenant isolation failed.

A public-production recommendation should be based on the full evidence pack, not only on the owner’s screen report. The minimum evidence pack includes the automated test result, deployment/version match, manual UI results, operation-trace results, Firebase business-record checks, backup/recovery result, security result, and rollback readiness.
