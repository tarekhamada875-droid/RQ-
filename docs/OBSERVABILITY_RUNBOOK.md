# RQ Observability and Operational Readiness Runbook

> **Supporting operations reference, not a project plan.** The only active project plan is `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md` (current checkpoint H9). C-series references in this document are historical readiness criteria, not instructions to resume a separate C-series workstream.

**Status:** Controlled synthetic pre-production
**Owner:** RQ project owner and authorized operators
**Last reviewed:** 2026-10-08

## Scope and safety boundary

The current production topology is Cloudflare Pages → Hono Worker → Firebase. H6 acceptance is closed for scope; H9 is active on `migration/unified-hono`. Preview and production currently share Firebase project/database identifiers, so do not perform authenticated preview Firestore reads or writes until isolation is established and verified. Do not use this runbook to inspect, repair, delete, export, or reconcile unknown customer or financial data. Before real users, revenue, customer imports, or destructive migrations, establish a separate staging environment and obtain the required owner decisions.

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
2. Use Cloudflare Workers Observability or an authorized read-only `wrangler tail` against the **preview Worker only** to find the exact correlation ID and, if available, operation ID. If safe preview logs/traces are unavailable, mark the test BLOCKED; do not add a temporary endpoint or inspect production to work around it.
3. Classify the response by status and safe error code:
   - `4xx`: caller input, authorization, session, scope, rate-limit, or idempotency issue;
   - `5xx`: service, dependency, or unexpected backend failure;
   - `504 REQUEST_TIMEOUT`: request exceeded the server timeout boundary.
4. Inspect the matching hashed operation trace only for timing, route, outcome, and role context.
5. Inspect the relevant domain event/idempotency record through an authorized read-only workflow. Do not edit diagnostic traces to repair business state.
6. Record the incident, exact commit, correlation ID, affected capability, and whether a retry is safe.

Never paste tokens, request bodies, PINs, phone numbers, plates, or customer data into logs, issues, screenshots, or handoff documents.

## Health and deployment metadata

For H6, the read-only preview readiness endpoints are:

```text
GET https://rq-hono-preview.tarekhamada875.workers.dev/api/health
GET https://rq-hono-preview.tarekhamada875.workers.dev/api/version
```

The current production Worker is `https://rq.tarekhamada875.workers.dev`; production health is an owner/release-operator check and is not part of H6 role testing. Never use a production read as a substitute for a missing preview deployment.

Expected healthy preview responses include `status: "ok"` and `adminSdk: true` at `/api/health`, and `status: "operational"` at `/api/version`. Compare the reported version/environment with the exact preview deployment expected for the candidate commit. Do not treat a Cloudflare Pages SPA fallback, a local proxy response, or a health result alone as proof of role acceptance.

A non-200 response, `adminSdk: false`, wrong runtime/environment, or unexpected version is a preview readiness failure. Do not query `/api/system-config` or inspect financial settings as a health check.

## Rollback procedure

1. Stop any preview promotion or proposed cutover; H6/H7 do not authorize production traffic changes.
2. Capture the failing migration commit, preview Pages/Worker identities, health/version result, and safe correlation IDs.
3. Keep production on its existing known-good Worker/Pages deployment. Do not merge to `main` or deploy a migration commit as an improvised rollback.
4. If production was changed through a separately approved release, only the authorized release operator follows the current Cloudflare rollback procedure to the last known-good release, then verifies health/version and a synthetic read-only smoke.
5. Confirm no financial or destructive operation was retried automatically; record any ambiguous mutation as OPEN/UNVERIFIED.
6. Preserve the failing migration commit for diagnosis and record the rollback result without copying secrets or payloads.

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

## Historical C9 exit criteria — not an active plan

The following criteria are retained from an earlier readiness sequence. C9 is not currently tracked as a separate active project plan, and this section does not claim that the criteria have passed. If the owner explicitly reopens them, reconcile the work into the single active Hono checkpoint plan before execution: trace a simulated failed request from the frontend correlation ID to authorized Worker preview logs and the operation trace without exposing sensitive payloads, and record health, rollback, incident, backup/restore, and billing-control procedures for the release candidate.
