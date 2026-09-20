# RQ Backend Overhaul — Agent Handoff

**Last updated:** 2026-09-20 11:48 UTC+3  
**Repository:** `tarekhamada875-droid/RQ-`  
**Branch:** `main`  
**Last published commit before this handoff update:** `68c1c29 fix: align frontend adapter with v2 route prefix`

## Mission

Continue the staged backend replacement described in [`BACKEND_COMPLETE_OVERHAUL_STAGES.md`](./BACKEND_COMPLETE_OVERHAUL_STAGES.md). The production system is still the existing Railway backend. The `server-v2` tree is a parallel, isolated foundation and must not be treated as production-ready merely because its unit tests pass.

## User operating instructions

The user requested preview validation before publication and prefers direct pushes to `main`; do not create long-lived feature branches. For every implementation slice:

1. Inspect the existing behavior and the plan.
2. Implement one bounded slice without changing production authority.
3. Run the local preview gates.
4. Review `git diff --check`, status, and the exact changed files.
5. Push the validated slice directly to `main`.
6. Report the commit and validation results.

Do not enable v2 flags, mount v2 into production, migrate financial writes, delete legacy routes, or delete production data without the required migration, rollback, and safety gates.

## Current completed work

The following isolated v2 foundations are present and tested:

- Strict `server-v2` TypeScript configuration, environment parsing, API envelopes, test configuration, CI gate, and explicit-`any` gate.
- Typed entities, money, business dates, cursor pagination, pricing, capacity, trials, commissions, refunds, business events, and bounded transaction retry primitives.
- Typed Firestore converter boundaries and in-memory repository test doubles.
- Session expiry/revocation/inactivity policies, role and garage-scope authorization policies, request context, redaction, and rate-limit primitives.
- Wallet ledger math, financial idempotency, reconciliation, audit-event contracts, and atomic in-memory wallet operations.
- Vehicle, subscriber, garage lock/suspension, resumable garage deletion, and lifecycle idempotency domain commands.
- Projection reducers, bounded pending/activity read models, daily financial summary rebuilds, report envelopes, reconciliation differences, projection lag, and repair-needed states.
- Isolated v2 HTTP app routes currently present in `server-v2/app.ts`: `/v2/health`, `/v2/packages`, and `/v2/garages/:garageId/summary`.
- Injectable v2 HTTP authentication, canonical-session lookup, role/garage authorization, CORS allowlisting, and Firebase Admin token/session adapters, all disabled unless explicitly supplied to the isolated app.
- Injectable v2 request-ID propagation, audit-safe request-context capture, authenticated-UID rate limiting, rate-limit response headers, and HTTP lifecycle tests.
- Fail-closed Railway preview bootstrap: `/api/v2` is mounted only when both `V2_PREVIEW_ENABLED` and `V2_PREVIEW_AUTH_ENABLED` are explicitly true; otherwise the legacy entrypoint is unchanged.
- Cloudflare frontend typed read adapter in `src/api/v2ReadAdapter.ts`, authenticated through the existing `apiFetch` path.
- Environment flags documented in `.env.example`; all `VITE_V2_READ_*` flags default to false.
- Preview-only smoke harness in `src/api/v2ReadSmoke.ts` and tests.

## Important known gaps and contract issue

### Production integration is not done

Most v2 repositories are abstractions or in-memory implementations. There are no production Firestore repositories for all entities, no complete v2 HTTP command routes, and no production v2 bootstrap mounted into Railway.

### Read-model routes and external prefix

The isolated v2 app now exposes `/v2/pending` and `/v2/activity` with bounded cursor contracts, Firestore repositories, emulator tests, and stable envelopes. These internal routes are externally mounted under `/api/v2/...` by the guarded preview mount helper.

### Route prefix must be resolved before preview activation

The selected external boundary is `/api/v2/...`. The isolated v2 app keeps its internal `/v2/...` route definitions, while the frontend adapter requests `/api/v2/...` so the existing `src/api/apiClient.ts` reliably sends requests to Railway instead of leaving them relative to the Cloudflare origin.

The mount helper is now guarded by the Railway entrypoint, but the dual preview flags remain disabled until preview deployment and real Cloudflare-to-Railway testing are complete.

Do not claim Cloudflare-to-Railway end-to-end success until this is tested from a real Cloudflare preview against a deployed Railway preview service.

### Production authentication wiring is not enabled

The isolated v2 app now has injectable Firebase ID-token verification, canonical session lookup, revocation/expiry enforcement, role and garage authorization, CORS, request-context capture, authenticated-UID rate limiting, and consistent error mapping with emulator/HTTP tests. The Railway entrypoint has a fail-closed preview bootstrap, but no preview deployment has been activated.

### Financial authority is not migrated

The existing backend remains the only production financial authority. Do not dual-write money operations. Build and test the v2 Firestore transaction path first, then shadow/reconcile reads and migrate writes only through an explicit cutover plan.

## Recommended next implementation order

1. Implement production Firestore repositories and converters, starting with package catalog, garage summaries, pending/activity models, and cost instrumentation.
2. Add a production telemetry sink and explicit per-route rate budgets before preview activation.
3. Deploy the guarded Railway preview with controlled environment flags and verify authenticated Cloudflare-to-Railway reads.
4. Add Firebase emulator tests for converters, security boundaries, transactions, idempotency persistence, concurrent operations, and bounded queries.
5. Connect one read-only frontend feature in a Cloudflare preview, preferably package catalog or garage summary, with a legacy provider and v2 flag disabled by default.
6. Run real authenticated Cloudflare-to-Railway smoke tests and compare normalized v2/legacy results.
7. Implement lifecycle HTTP commands and transactional repositories.
8. Implement the financial write path last, with one authority, reconciliation, repair queue, rollback, and explicit approval.
9. Start Stage 9 shadow comparison, then Stage 10 cohort cutover, then Stage 11 legacy retirement.

## Validation gates

Run from the repository root:

```bash
npm run check:v2
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

A clean working tree and a pushed `main` commit are required after a completed slice. The latest completed slice before this handoff passed **295 repository tests**, **85 v2 tests**, full typecheck, production build, maintainability, and diff checks.

## Key files

| File | Purpose |
|---|---|
| `BACKEND_COMPLETE_OVERHAUL_STAGES.md` | Master plan and live stage-status matrix |
| `BACKEND_OVERHAUL_HANDOFF.md` | This handoff document |
| `server-v2/app.ts` | Isolated v2 HTTP app and current read routes |
| `server-v2/contracts/` | Runtime-validated v2 contracts |
| `server-v2/domain/` | Pure domain rules and command primitives |
| `server-v2/repositories/` | Repository boundaries and test doubles |
| `server-v2/test/` | Isolated v2 unit/contract tests |
| `src/api/apiClient.ts` | Existing authenticated frontend transport and URL resolver |
| `src/api/v2ReadAdapter.ts` | Typed frontend v2 read client and feature adapter |
| `src/api/v2ReadSmoke.ts` | Preview-only read contract smoke harness |
| `.env.example` | Environment and disabled-by-default v2 flags |
| `AGENTS.md` | Repository conventions and safety rules |

## Non-negotiable safety notes

- Cloudflare Pages is frontend only; Railway is backend only.
- Firebase Admin credentials and operator tokens must never enter frontend assets or Git.
- The operator MCP token is for controlled server-to-server operations and does not replace browser Firebase authentication.
- Do not use frontend-provided `uid`, `role`, or token fields as authorization.
- Every new list must be bounded, ordered, cursor-based, and cost-instrumented.
- Every mutation must be idempotent and transaction-safe before production use.
- Every financial write must have one authoritative writer.
- Do not delete or mutate production Firestore data during foundation work.
