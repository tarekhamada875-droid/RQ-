# Maintainability Handoff

**Status:** Active
**Production frontend:** Cloudflare Pages — `https://rq-acg.pages.dev`
**Production backend:** Cloudflare Worker — `https://rq.tarekhamada875.workers.dev`
**Data/authentication:** Firebase Authentication and Firestore

## Current source of truth

`main` is the production source of truth. Cloudflare Pages deploys the frontend from `main`; the guarded GitHub Actions workflow deploys the Worker after validation. The branch and release policy is documented in [`BRANCHING_AND_RELEASES.md`](./BRANCHING_AND_RELEASES.md).

The application is a React/Vite static PWA on Cloudflare Pages connected to a Fetch-native Hono Worker. The Worker uses the Worker-compatible Firebase Auth/Firestore REST adapter. Firebase credentials remain protected Worker secrets and never enter frontend assets or Git.

## Current build contract

- Cloudflare frontend build: `npm run build:web`, publish `dist`.
- Cloudflare Worker build: `npm run build:cloudflare`.
- Cloudflare Worker deployment: `.github/workflows/cloudflare-worker-deploy.yml`.
- Live health check: `https://rq.tarekhamada875.workers.dev/api/health`.
- Live frontend check: `https://rq-acg.pages.dev`.

## Validation gate

```bash
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

Live smoke checks target the Cloudflare Worker directly and confirm JSON responses, `status: ok`, `adminSdk: true`, and the deployed Worker version.

## Structural rules

Keep business rules in focused domain modules and route modules. Preserve Firebase token verification, role and garage scoping, session lifecycle, CORS, idempotency, correlation IDs, operation traces, immutable events, and financial reconciliation.

Firestore remains authoritative. Dashboard summaries, projection buckets, cached counters, and telemetry are rebuildable read models. Do not make Node process memory authoritative and do not remove compatibility writes until reconciliation proves the replacement read model equivalent.

Do not mutate or delete production Firestore records without explicit scope and confirmation. Do not commit secrets or restore retired provider-specific deployment artifacts.

## Architecture direction

The active production architecture is **Cloudflare Pages → Cloudflare Worker → Firebase**. Railway deployment configuration and service references have been retired. Do not change production data or traffic outside an approved checkpoint and its validation gate.

## Last verified local baseline

The full Vitest suite, TypeScript validation, production build, maintainability check, and Cloudflare live smoke gate must pass after every source change.
