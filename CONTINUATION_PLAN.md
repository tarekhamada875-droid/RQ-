# Continuation Plan

## Current production state

The repository is `tarekhamada875-droid/RQ-`. The only permanent branch is `main`.

```text
Cloudflare Pages: https://rq-acg.pages.dev
        |
        v
Railway API: https://rq-production-af02.up.railway.app
        |
        v
Firebase Authentication + Firestore
```

The active deployment contract is in [`RAILWAY_DEPLOYMENT_HANDOFF.md`](./RAILWAY_DEPLOYMENT_HANDOFF.md). The backend replacement plan is in [`BACKEND_COMPLETE_OVERHAUL_STAGES.md`](./BACKEND_COMPLETE_OVERHAUL_STAGES.md); start with its Stage 0 inventory before implementing the replacement.

## Before making changes

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short
npm ci
```

Create a focused short-lived branch from `main`. Do not edit production data, credentials, or Firebase configuration as part of ordinary feature work.

## Required validation

```bash
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

For deployment changes, verify:

```bash
curl -i https://rq-production-af02.up.railway.app/api/health
curl -i https://rq-production-af02.up.railway.app/api/system-config
```

The health endpoint must return JSON with `status: ok` and `adminSdk: true`. The Cloudflare origin is frontend-only; do not use a Cloudflare `/api/*` SPA response as API validation.

## Engineering rules

Firestore and immutable domain events remain authoritative. Dashboard summaries, projection buckets, and telemetry are rebuildable read models. Preserve authentication, authorization, session, CORS, idempotency, operation traces, financial reconciliation, and response contracts.

The Railway service uses `railway.json`, `server/cloudRun.ts`, and `server/app.ts`. The `cloudRun.ts` filename is retained for compatibility with the existing Railway entrypoint and does not indicate a separate production platform.

## Completion

Push the focused branch and open a pull request into `main`. Merge only after CI and review pass, then delete the branch. Update the relevant active handoff document with the validated commit and deployment evidence. Keep the current production deployment contract separate from the backend replacement work until the migration stages pass.
