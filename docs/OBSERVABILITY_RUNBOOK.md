# RQ Observability and Operational Readiness Runbook

**Status:** Controlled synthetic pre-production
**Owner:** RQ project owner and authorized operators
**Last reviewed:** 2026-09-25

## Scope and safety boundary

The current Cloudflare Pages → Railway → Firebase deployment is authorized for synthetic pre-production only. Do not use this runbook to inspect, repair, delete, export, or reconcile unknown customer or financial data. Before real users, revenue, customer imports, or destructive migrations, establish a separate staging environment and obtain the required owner decisions.

The backend remains authoritative. Diagnostic traces are not accounting records, authorization records, or a replacement for domain events and idempotency records.

## Request tracing contract

Every API request receives or preserves:

- `X-Correlation-ID`: bounded to 128 safe characters and echoed in the response;
- `X-Operation-ID`: an optional frontend operation identifier, also bounded and validated;
- `X-Session-ID`: used for authorization, never logged as a raw identifier.

The frontend generates correlation and operation IDs. The backend adds them to standardized error envelopes and writes a bounded operation trace after the response finishes.

### Trace contents

Operation traces are stored under `operation_traces/{sha256(correlationId)}` with a 90-day expiry field. They contain only:

- schema version, correlation ID, operation ID;
- HTTP method, path without query string, status, outcome, safe error code, and duration;
- hashed actor and garage references;
- occurrence and expiry timestamps.

They do **not** contain request bodies, authorization headers, Firebase tokens, IP addresses, PINs, phone numbers, license plates, payment data, raw session IDs, or raw actor/garage IDs.

Domain events may carry correlation and operation IDs for linkage, but their redaction and accounting rules remain authoritative.

## How to investigate a failed request

1. Ask the operator for the frontend correlation ID shown in the API error or browser diagnostics.
2. Search Railway logs for the exact correlation ID and, if available, operation ID.
3. Classify the response by status and safe error code:
   - `4xx`: caller input, authorization, session, scope, rate-limit, or idempotency issue;
   - `5xx`: service, dependency, or unexpected backend failure;
   - `504 REQUEST_TIMEOUT`: request exceeded the server timeout boundary.
4. Inspect the matching hashed operation trace only for timing, route, outcome, and role context.
5. Inspect the relevant domain event/idempotency record through an authorized read-only workflow. Do not edit diagnostic traces to repair business state.
6. Record the incident, exact commit, correlation ID, affected capability, and whether a retry is safe.

Never paste tokens, request bodies, PINs, phone numbers, plates, or customer data into logs, issues, screenshots, or handoff documents.

## Health and deployment metadata

The public readiness endpoint is:

```text
GET https://rq-production-af02.up.railway.app/api/health
```

Expected healthy response fields:

- `status: "ok"`
- `adminSdk: true`
- ISO `timestamp`
- deployed commit in `version` when Railway provides `RAILWAY_GIT_COMMIT_SHA` or `GIT_COMMIT_SHA`

A non-200 response or `adminSdk: false` is a deployment readiness failure. Do not treat a loaded Cloudflare page as proof that the API or Firebase Admin SDK is healthy.

## Rollback procedure

1. Stop rollout or traffic promotion.
2. Capture the failing commit, health response, frontend deployment URL, and correlation IDs.
3. Use the last known-good Git commit or Railway deployment as the rollback target.
4. Recheck `/api/health`, `/api/system-config`, CORS from `https://rq-acg.pages.dev`, and a synthetic read-only workflow.
5. Confirm no financial or destructive operation was retried automatically.
6. Record the rollback result and preserve the failing commit for diagnosis.

Rollback is a deployment action, not a data-repair action. Do not downgrade Firebase billing, change the named Firestore database, or run repair scripts as part of rollback.

## Incident response minimum record

For each P0/P1 incident, record:

- UTC start/end time;
- exact frontend and backend commit/deployment identifiers;
- correlation and operation IDs;
- affected route and safe error code;
- observed health response;
- whether synthetic or real data could have been involved;
- mitigation or rollback performed;
- follow-up test and owner.

Do not include secrets or personal/financial payloads in the incident record.

## Backup and restore verification

Backup/restore verification is an owner-controlled operational activity and is not performed by ordinary code checkpoints. Before launch:

1. Confirm the intended Firebase project and named database identity.
2. Confirm an authorized backup/export policy exists for the project and required collections.
3. Restore into an isolated non-production project or database, never over the source.
4. Verify representative synthetic authentication, session, vehicle, subscriber, event, idempotency, and projection records.
5. Record restore duration, missing indexes/rules/configuration, and the rollback/cleanup method.
6. Keep the restore evidence and owner contact with the release-candidate packet.

No production restore, export, or destructive cleanup is authorized by this document.

## Billing alerts and spend controls

After the owner enables Blaze on the intended project:

- configure budget alerts at agreed thresholds;
- configure applicable spend caps or service limits;
- confirm the billing owner understands alerts are notifications, not hard caps;
- record the billing project and database identity without recording payment details;
- review alert delivery before launch.

Billing activation and spend-control changes are account-level owner actions. They are not automated by the application and do not belong in source code or frontend variables.

## C9 exit evidence

C9 is complete only when a simulated failed request can be traced from the frontend correlation ID to Railway logs and the operation trace without exposing sensitive payloads, and when health, rollback, incident, backup/restore, and billing-control procedures are recorded for the release candidate.
