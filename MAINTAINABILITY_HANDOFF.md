# Maintainability Handoff

**Status:** Active
**Production frontend:** Cloudflare Pages — `https://rq-acg.pages.dev`
**Production backend:** Railway Express — `https://rq-production-af02.up.railway.app`
**Data/authentication:** Firebase Authentication and Firestore

## Current source of truth

`main` is the production source of truth. The active deployment contract is documented in [`RAILWAY_DEPLOYMENT_HANDOFF.md`](./RAILWAY_DEPLOYMENT_HANDOFF.md). The branch and pull-request policy is documented in [`BRANCHING_AND_RELEASES.md`](./BRANCHING_AND_RELEASES.md).

The application is a React/Vite static PWA on Cloudflare Pages connected to an Express API on Railway. The browser Firebase SDK supports realtime data access, while the Railway API owns server-authoritative authentication, authorization, sensitive mutations, financial operations, idempotency, operation tracing, and Firebase Admin access.

## Current build contract

- Cloudflare frontend build: `npm run build:web`, publish `dist`.
- Railway build: `npm run build:railway`.
- Railway start: `node dist/cloud-run.cjs`.
- Railway health check: `/api/health`.
- Railway process binding: `0.0.0.0:${PORT}`.
- Firebase Admin credentials: Railway secrets only.

The `cloudRun.ts` filename is retained as a legacy API-only entrypoint name. It does not indicate a separate Cloud Run production deployment.

## Validation gate

```bash
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

Live smoke checks must target Railway directly and must confirm JSON responses, `status: ok`, and `adminSdk: true`. The Cloudflare origin should serve frontend HTML and must not be used as the API origin.

## Structural rules

Keep business rules in focused domain modules and route modules. Keep `server/app.ts` focused on assembly and shared middleware. Preserve Firebase token verification, role and garage scoping, session lifecycle, CORS, idempotency, correlation IDs, operation traces, immutable events, and financial reconciliation.

Firestore remains authoritative. Dashboard summaries, projection buckets, cached counters, and telemetry are rebuildable read models. Do not make Node process memory authoritative and do not remove compatibility writes until reconciliation proves the replacement read model equivalent.

Do not mutate or delete production Firestore records without explicit scope and confirmation. Do not commit secrets or restore retired provider-specific deployment artifacts.

## Architecture direction

The current production architecture remains Cloudflare Pages → Railway → Firebase. The planned replacement of legacy backend boundaries is documented in [`BACKEND_COMPLETE_OVERHAUL_STAGES.md`](./BACKEND_COMPLETE_OVERHAUL_STAGES.md). Its first required implementation step is Stage 0 inventory; do not change production data or traffic before that stage passes.

## Last verified local baseline

The current checkout has passed TypeScript validation, the full Vitest suite, and the production build. The live Railway health endpoint has returned `adminSdk: true` for the deployed `main` commit. Repeat the full gate after every source change.
