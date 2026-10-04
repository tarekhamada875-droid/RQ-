# RQ

For a consolidated explanation of the architecture, business decisions, production-readiness status, document hierarchy, and cleanup dispositions, read [`RQ_PROJECT_KNOWLEDGE_BASE.md`](./RQ_PROJECT_KNOWLEDGE_BASE.md) first. The active unified Hono migration instructions are in [`RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`](./RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md), and continuation instructions are in [`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`](./RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md).

RQ is a bilingual Arabic/English garage-management application for vehicle check-in and check-out, subscribers, packages, balances, delegates, staff, supervisors, and administrative operations.

> **Current status — Cloudflare production path verified (2026-10-03):** Cloudflare Pages serves the frontend at `https://rq-acg.pages.dev`, and the Cloudflare Worker API is live at `https://rq.tarekhamada875.workers.dev`. The Worker uses Fetch/Web-Crypto Firebase REST access rather than Node-only Firebase Admin packages. This remains a controlled environment with no real customer or financial data until business validation is completed.

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
- **Production wiring:** Cloudflare Pages production and preview are configured with `VITE_BACKEND_API_URL=https://rq.tarekhamada875.workers.dev`.

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

Copy `.env.example` to a local environment file when needed. Set `VITE_BACKEND_API_URL` explicitly in each Cloudflare Pages environment after the corresponding Worker deployment is verified. Firebase credentials belong only in Cloudflare Worker secrets and must never be placed in frontend variables.

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

## Cloudflare deployment contract

The active target is documented in [`RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`](./RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md). The production Worker exposes JSON health and version endpoints, uses Worker-compatible Firebase access, and receives secrets through Cloudflare Worker secrets. The Hono consolidation is tested on a separate branch before any production cutover.

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

For deployment details, use `wrangler.toml`, `wrangler.deploy.toml`, and the Cloudflare deployment workflow. The current architecture plan is [`RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`](./RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md). The authoritative continuation file is [`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`](./RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md).
