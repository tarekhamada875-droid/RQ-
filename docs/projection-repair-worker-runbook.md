# Projection Repair Worker Runbook

## Purpose and scope

The projection repair worker rebuilds a bounded set of read-model projections from caller-supplied event windows. It is a **non-financial repair primitive**: the legacy backend remains authoritative for business operations and financial writes. The worker is not a scheduler, does not discover tasks by scanning production data, and is not currently deployed or automatically triggered.

This runbook defines the controls that must be in place before any operational invocation. It does not authorize deployment, production execution, production-flag changes, physical deletion, financial writes, or legacy-route retirement.

## Current implementation contract

Each invocation supplies an explicit batch with an `occurredAt` timestamp and one or more repair tasks. Every task identifies a garage, a business date, a bounded event list, a task identifier, and an idempotency key. The worker processes tasks sequentially and delegates each rebuild to the idempotent and audited projection repository.

The batch contract caps the worker at **25 tasks**. The repository remains responsible for event-window validation, projection scope checks, idempotency, audit behavior, and transaction semantics. Unexpected exceptions are reduced to the redacted `REPAIR_FAILED` result code; credentials, customer payloads, and raw exception text must never appear in the result or logs.

The current worker implementation is `server-v2/workers/projectionRepairWorker.ts`. It is a library primitive only. No production scheduler, queue consumer, automatic retry loop, or Cloudflare/Railway route invokes it today.

## Preconditions for a future non-production exercise

Before an invocation, an accountable operator must record the current commit, environment, worker version, target garage and date scope, task identifiers, idempotency keys, source event count, and the reason for repair. The operator must confirm that the target is a non-production test environment or an explicitly approved isolated exercise, that the legacy backend remains authoritative, and that no financial write or physical deletion is part of the exercise.

The operator must also confirm that the batch is within the 25-task limit, every task has a bounded event window, the repository is configured with emulator or isolated Firestore credentials, and audit output is available for review. A Firebase user token must not be replaced with a Railway operator token for any authenticated browser or user-flow test.

## Execution controls

Run one bounded batch at a time. Do not parallelize tasks unless a separately reviewed repository contract proves that concurrent repairs cannot race on the same projection. Preserve the supplied idempotency keys on retries. A retry after an uncertain result must be treated as an idempotent replay, not as a new repair.

Stop the exercise immediately if any of the following occurs: an unexpected error is not redacted to `REPAIR_FAILED`; a task targets a different garage or date than its event window; an idempotency conflict is unexplained; the repository attempts an unbounded read or write; a financial record is touched; a delete operation is requested; or the output cannot be reconciled with the audit record.

## Expected outcomes

Each task must finish as one of the following states:

| State | Meaning | Required action |
| --- | --- | --- |
| `rebuilt` | The repository rebuilt the projection from the supplied event window. | Compare the resulting projection and source-event count with the expected fixture or reconciliation record. |
| `replayed` | The repository recognized an idempotent prior completion. | Confirm the original audit record and treat the retry as complete without creating a second repair. |
| `failed` | The repository rejected the task or returned an unexpected error. | Preserve the redacted error code, stop if the error is unexpected, and do not broaden the task scope automatically. |

A successful batch is not evidence that v2 traffic may be enabled. It only establishes that the bounded repair operation behaved according to its repository contract in the exercised environment.

## Rollback and stop procedure

Rollback for this primitive means **stop invocation and preserve state**, not delete data. If a repair produces an unexpected result, the operator must stop subsequent tasks, retain the batch and audit identifiers, disable the invoking test harness or route, and return reads to the legacy path if a preview exercise was in progress. No cleanup delete should be attempted.

If a future worker is deployed behind a feature flag, the flag-off path must be tested before deployment and must route reads to the legacy backend. The rollback decision must block rather than fall back if the legacy path is unavailable, a financial write is requested, or a delete operation is requested. Projection repair must never be used as a mechanism to conceal a legacy/v2 mismatch.

## Observability and evidence

A future exercise must retain a redacted record containing the commit, environment, operator, start and end times, batch size, task identifiers, result-state counts, source-event counts, idempotency outcomes, and any safe error codes. It must not retain credentials, Firebase tokens, raw customer payloads, raw exception messages, or unbounded event dumps.

After the exercise, compare the repaired projection with the authoritative legacy-derived expectation, record whether the result was rebuilt or replayed, and obtain an independent review before any follow-up deployment decision. Evidence from this runbook does not replace authenticated Cloudflare preview validation, normalized legacy/v2 comparison, or progressive-cutover gates.

## Current status

The worker and its emulator-backed tests exist, but the worker is **not deployed**, **not scheduled**, and **not connected to automatic production mutation**. The next implementation step after this runbook would require an explicit operational design review, a non-production deployment plan, health and failure alerts, a tested flag-off path, and a rollback rehearsal before any deployment or production invocation is considered.
