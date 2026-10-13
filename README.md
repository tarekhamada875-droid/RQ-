# RQ

For project status and document authority, read [`RQ_PROJECT_KNOWLEDGE_BASE.md`](./RQ_PROJECT_KNOWLEDGE_BASE.md) first. [`RQ_HONO_SHORTENED_MIGRATION_PLAN.md`](./RQ_HONO_SHORTENED_MIGRATION_PLAN.md) is a **closed-workstream record, not an active plan**. The H9 succession handoff and route inventory are historical evidence only; do not resume their old next steps.

RQ is a bilingual Arabic/English garage-management application for vehicle check-in and check-out, subscribers, packages, balances, delegates, staff, and Admin operations. The retired Supervisor role is not an active product role.

> **Current status (2026-10-13):** `main` at `895e0cb` is the production source of truth. Hono is the production Worker backend at `https://rq.tarekhamada875.workers.dev`; the React app is on Pages at `https://rq-acg.pages.dev`. The project is being exercised with synthetic test data. The H9 / Express-decommissioning workstream is closed; the local Express compatibility runtime remains frozen and is not a cleanup target. Branch previews are not an active release environment.

## Target production architecture

RQ is deployed as two connected applications:

```text
Cloudflare Pages frontend
  https://rq-acg.pages.dev
        |
        | HTTPS API requests via VITE_BACKEND_API_URL
        v
Dedicated Cloudflare Worker API
  https://rq.tarekhamada875.workers.dev
        |
        v
Firebase Authentication + Firestore
```

- **Frontend:** React/Vite static PWA deployed on Cloudflare Pages.
- **Backend:** A dedicated Cloudflare Worker API using a Worker-compatible Firebase Auth/Firestore REST adapter.
- **Data and authentication:** Firebase Authentication and Firestore. The browser uses the Firebase client SDK; the Worker uses server-side secrets that must never enter frontend assets or Git.
- **Production wiring:** Production Pages targets `https://rq.tarekhamada875.workers.dev`. Only the verified `main` release is deployed; do not use old preview configurations as active environments.

## Repository and branch policy

`main` is the production source of truth. Short-lived feature or fix branches may be created from `main`, validated by CI, and merged through a pull request. After merge, the branch should be deleted. Do not keep old deployment experiments or completed fixes as permanent branches.

The former `migration/unified-hono` workstream is closed and its branch was deleted after merge. Do not recreate or resume it as an active workstream.

A pull request is a review and CI record for changes from one branch into another; it is not a second deployed application. GitHub may show **Compare & pull request** for any branch that has commits not contained in `main`. That prompt means GitHub is offering to create a PR; it does not mean an open PR already exists.

See [`BRANCHING_AND_RELEASES.md`](./BRANCHING_AND_RELEASES.md) for the current workflow.

## Requirements

Use Node.js 22 and npm. The repository declares its package manager in `package.json` and uses `package-lock.json` for reproducible installs.

```bash
npm ci
```

Never commit `.env` files, Firebase service-account JSON, private keys, or production credentials.

## Environment

Copy `.env.example` to a local environment file when needed. Set `VITE_BACKEND_API_URL` explicitly in each Cloudflare Pages environment after the corresponding Worker deployment is verified. Firebase credentials belong only in Cloudflare Worker secrets and must never be placed in frontend variables.

## Development and validation commands

```bash
npm run dev
npm test
npm run test:rules
npm run lint
npm run build
npm run ci:check
npm run maintainability:check
npm run release:smoke
```

The normal validation gate is:

```bash
npm test && npm run test:rules && npm run lint && npm run build && npm run maintainability:check && git diff --check
```

`npm run test:rules` starts the Firestore Emulator with the demo project ID; it does not connect to production Firebase. It requires Java 21 or later.

## Cloudflare deployment contract

Hono is the production Worker backend. The H9 plan and succession handoff are closure/history records only. Use the normal branch-and-pull-request flow above; merging to `main` is what starts the guarded Worker release and Pages production publish.

## Production smoke checks

```bash
curl -i "$WORKER_URL/api/health"
curl -i "$WORKER_URL/api/system-config"
curl -i -X POST \
  -H 'content-type: application/json' \
  --data '{}' \
  "$WORKER_URL/api/auth/verify-pin"
```

Expected behavior is HTTP 200 JSON for health and system configuration, and an authentication error in JSON for an unauthenticated PIN request. An API route returning `index.html` is a deployment failure.

## Security and feature-work rules

Authentication and authorization are server-owned. Do not trust role, user ID, or Firebase token fields supplied in request bodies. Preserve Firebase token verification, role scoping, session checks, CORS restrictions, idempotency, operation traces, and financial correctness when changing routes.

Do not delete or mutate Firestore production data without explicit scope and confirmation. Prefer focused route modules, services, domain helpers, and tests over adding more logic to `server/app.ts` or large dashboard components.

## Repository structure

```text
server/                 Backend/domain source and transitional local adapter
server/routes/          Backend route modules and business contracts
server/cloudflareWorker.ts  Current production Hono Worker API
wrangler.toml           Cloudflare Worker deployment configuration
src/components/         React UI components
src/api/                Frontend API client
src/services/           Firebase-backed frontend services
src/domain/              Shared business rules and domain logic
.github/workflows/      GitHub Actions production gate
Dockerfile              Container build alternative
```

For deployment details, use `wrangler.toml`, `wrangler.deploy.toml`, and the Cloudflare deployment workflow. The sole active project plan is [`RQ_HONO_SHORTENED_MIGRATION_PLAN.md`](./RQ_HONO_SHORTENED_MIGRATION_PLAN.md); the current H9 continuation file is [`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`](./RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md).
