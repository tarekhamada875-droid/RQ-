# RQ

RQ is a bilingual Arabic/English garage-management application for vehicle check-in and check-out, subscribers, packages, balances, delegates, staff, supervisors, and administrative operations.

> **Current status — controlled synthetic pre-production (2026-09-25):** This project does not have real users, customer records, or live financial data yet. The current Cloudflare Pages → Railway → Firebase deployment is being used for synthetic testing and wiring recovery only. Do not use unknown data, perform destructive cleanup, accept real revenue, or treat this environment as final production until a separate staging/pre-production validation decision is recorded.

## Production architecture

RQ is deployed as two connected applications:

```text
Cloudflare Pages frontend
  https://rq-acg.pages.dev
        |
        | HTTPS API requests via VITE_BACKEND_API_URL
        v
Railway Express backend
  https://rq-production-af02.up.railway.app
        |
        v
Firebase Authentication + Firestore
```

- **Frontend:** React/Vite static PWA deployed on Cloudflare Pages.
- **Backend:** Express API deployed as a Railway service. Railway runs the API-only entrypoint and supplies `PORT`.
- **Operator access:** A dedicated `BACKEND_OPERATOR_TOKEN` Railway variable may be supplied through the `X-Backend-Operator-Token` header for server-to-server operations. It does not replace browser Firebase authentication and must never be committed to the repository.
- **Data and authentication:** Firebase Authentication and Firestore. The browser uses the Firebase client SDK; the backend uses Firebase Admin SDK credentials stored only in deployment secrets.
- **Important split:** Cloudflare serves the SPA only. Railway owns `/api/*`; API calls must not be sent to the Cloudflare origin.

## Repository and branch policy

`main` is the production source of truth. Short-lived feature or fix branches may be created from `main`, validated by CI, and merged through a pull request. After merge, the branch should be deleted. Do not keep old deployment experiments or completed fixes as permanent branches.

A pull request is a review and CI record for changes from one branch into another; it is not a second deployed application. GitHub may show **Compare & pull request** for any branch that has commits not contained in `main`. That prompt means GitHub is offering to create a PR; it does not mean an open PR already exists.

See [`BRANCHING_AND_RELEASES.md`](./BRANCHING_AND_RELEASES.md) for the current workflow.

## Requirements

Use Node.js 22 and npm. The repository declares its package manager in `package.json` and uses `package-lock.json` for reproducible installs.

```bash
npm ci
```

Never commit `.env` files, Firebase service-account JSON, private keys, or production credentials.

## Environment

Copy `.env.example` to a local environment file when needed. `VITE_BACKEND_API_URL` is optional for the production frontend because the client has the Railway URL as a safe public fallback. Set it in Cloudflare Pages for preview or alternate API environments. Firebase Admin credentials belong only in Railway variables.

## Development and validation commands

```bash
npm run dev
npm test
npm run lint
npm run build
npm run ci:check
npm run maintainability:check
npm run release:smoke
```

The normal validation gate is:

```bash
npm test && npm run lint && npm run build && npm run maintainability:check && git diff --check
```

## Railway deployment contract

Railway uses [`railway.json`](./railway.json). The current contract is:

- Build with `npm run build:railway`.
- Start with `node dist/cloud-run.cjs`.
- Bind to `0.0.0.0` and Railway's `PORT`.
- Expose `/api/health` as the health check.
- Provide Firebase Admin credentials, `APP_URL`, and the approved `ALLOWED_ORIGINS` through Railway variables.

The `cloudRun.ts` filename is retained as the existing API-only entrypoint name; the production host is Railway.

## Production smoke checks

```bash
curl -i https://rq-production-af02.up.railway.app/api/health
curl -i https://rq-production-af02.up.railway.app/api/system-config
curl -i -X POST \
  -H 'content-type: application/json' \
  --data '{}' \
  https://rq-production-af02.up.railway.app/api/auth/verify-pin
```

Expected behavior is HTTP 200 JSON for health and system configuration, and an authentication error in JSON for an unauthenticated PIN request. An API route returning `index.html` is a deployment failure.

## Security and feature-work rules

Authentication and authorization are server-owned. Do not trust role, user ID, or Firebase token fields supplied in request bodies. Preserve Firebase token verification, role scoping, session checks, CORS restrictions, idempotency, operation traces, and financial correctness when changing routes.

Do not delete or mutate Firestore production data without explicit scope and confirmation. Prefer focused route modules, services, domain helpers, and tests over adding more logic to `server/app.ts` or large dashboard components.

## Repository structure

```text
server/                 Express app, middleware, validation, domain utilities
server/routes/          Backend route modules
server/cloudRun.ts      Railway API-only process entrypoint (legacy filename)
src/components/         React UI components
src/api/                Frontend API client
src/services/           Firebase-backed frontend services
src/domain/             Shared business rules and domain logic
.github/workflows/      GitHub Actions production gate
railway.json            Railway build, start, and health-check configuration
Dockerfile              Container build alternative
```

For deployment details, use [`RAILWAY_DEPLOYMENT_HANDOFF.md`](./RAILWAY_DEPLOYMENT_HANDOFF.md). For the current checkpointed recovery and wiring plan, use [`RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`](./RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md). The older overhaul-stage and handoff documents were superseded and are no longer active instructions.
