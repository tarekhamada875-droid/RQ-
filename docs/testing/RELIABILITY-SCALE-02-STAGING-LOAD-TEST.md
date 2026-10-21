# Reliability and Scale 02: staging ten-garage load test

## Status

The repository now contains a guarded read-only HTTP load-test harness. The real staging run is **not yet executed** from this environment because no staging Worker URL, synthetic Firebase identities, or provider observability access is configured here. This document is the execution contract; it must not be treated as production-load evidence until the run produces a saved report and provider metrics.

## Safety boundary

The harness is deliberately limited to synthetic, garage-scoped `GET` traffic. It refuses the production Worker and Pages hostnames, refuses an environment named `production`, requires an explicit `LOAD_TEST_ALLOW_NONPROD=1` opt-in, requires the health response to identify the requested non-production environment, and issues no POST, PUT, PATCH, or DELETE requests.

Never point it at `https://rq.tarekhamada875.workers.dev`, `https://rq-acg.pages.dev`, a production Firebase project, or a shared environment containing customer data. Do not put tokens, service-account files, or real customer data in the repository or the report.

## Required staging environment

Provision an isolated Cloudflare Worker and isolated Firebase project/database outside production. The staging Worker must use `ENVIRONMENT=staging` (or `test`/`qa`), synthetic Firestore fixtures only, and the same Worker build/configuration shape as the candidate release. Seed exactly ten synthetic garages, one synthetic garage-scoped user identity per garage, bounded synthetic vehicles/subscribers/history, and the required Firestore indexes. Keep all ten garage IDs and tokens disposable and outside Git.

Before the run, verify:

- `GET /api/health` returns HTTP 200, `status=ok`, and the requested non-production environment.
- `GET /api/version` reports the candidate Worker version and commit SHA.
- The ten identities are scoped to ten distinct synthetic garages.
- Cloudflare Worker observability and Firebase usage/billing views are available for the staging project.
- The staging database contains no production records.

## Run

From the repository root, provide the ten synthetic identities through an environment variable. The value is JSON and is never written to disk by the harness:

```bash
export LOAD_TEST_BASE_URL='https://<staging-worker-host>'
export LOAD_TEST_ENVIRONMENT='staging'
export LOAD_TEST_ALLOW_NONPROD=1
export LOAD_TEST_TOKENS_JSON='[{"garageId":"synthetic-garage-01","token":"<staging-token-01>"}, ... ten entries total ...]'
export LOAD_TEST_DURATION_SECONDS=300
export LOAD_TEST_CONCURRENCY=20
export LOAD_TEST_OUTPUT="artifacts/ten-garage-load-test-$(date -u +%Y%m%dT%H%M%SZ).json"
npm run ten-garage:load-test
```

The default profile rotates four read-only routes across all ten garages:

- `GET /api/garage-summary?garageId=...`
- `GET /api/garages/:id/dashboard-summary`
- `GET /api/vehicles/inside?garageId=...`
- `GET /api/vehicles/history?garageId=...&limit=50`

The JSON report records request count, error rate, status counts, per-route/per-garage counts, minimum/p50/p95/p99/maximum latency, target release identity, and the exact workload settings. It intentionally does not claim Cloudflare CPU/memory or Firestore billing results.

## Provider evidence to capture during the same run

Record the staging Worker CPU time, invocation count, duration, error rate, request count, network/egress indicators, and memory-related limits from Cloudflare. Record Firestore document reads/writes, active connections if available, database storage, and the incremental cost view from the isolated Firebase project. Record the run start/end timestamps, region or runner location, deployed commit SHA, Worker version, and any provider sampling limitations.

The final report should include at least:

| Area | Evidence |
|---|---|
| HTTP | request count, error count/rate, p50, p95, p99, status distribution |
| Worker | CPU/duration, invocations, errors, limits, sampled observability caveats |
| Firestore | reads, writes, latency/retries if available, isolated-project cost delta |
| Isolation | staging project/Worker identity and confirmation of zero production access |
| Reproducibility | command settings, fixture shape, runner location, commit SHA |

## Acceptance and cleanup

A run is evidence for the ten-garage production-readiness gate only when all ten identities receive the intended traffic, the error budget and latency thresholds are explicitly approved, provider metrics cover the same interval, and no production endpoint or record was touched. Preserve the report outside the repository if it contains sensitive staging identifiers; keep only sanitized aggregate evidence in canonical testing documentation.

After verification, revoke or expire the synthetic identities and dispose of the staging fixtures using the staging provider controls. Do not run cleanup against production and do not add temporary production records for this test.
