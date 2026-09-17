# RQ

RQ is a bilingual Arabic/English garage-management application for vehicle check-in and check-out, subscribers, packages, balances, delegates, staff, supervisors, and administrative operations.

## Architecture

RQ is deployed as two connected applications:

- **Frontend:** Vite/React static build on Cloudflare Pages at `https://rq-acg.pages.dev`.
- **Backend:** Express API bundled as a Vercel serverless function at `https://parqv2.vercel.app`.
- **Data and authentication:** Firebase Authentication and Firestore through the browser SDK and Firebase Admin SDK.

The frontend uses `VITE_BACKEND_API_URL` to call the Vercel backend. Cloudflare Pages does not serve the API. Vercel owns all `/api/*` routes.

## Requirements

Use Node.js 22 and npm. The repository declares its package manager in `package.json` and uses `package-lock.json` for reproducible installs.

```bash
npm ci
```

The file `bun.lock` is legacy. CI and deployment use npm and should not be switched to Bun without an intentional repository-wide decision.

## Environment

Copy `.env.example` to a local environment file when needed. Never commit `.env` files, Firebase service-account JSON, private keys, or production credentials.

Frontend Firebase configuration values are public client configuration. Firebase Admin credentials are server-only and must be supplied through the deployment environment.

## Development commands

```bash
npm run dev       # Start the local application
npm test          # Run the Vitest suite
npm run lint      # Run TypeScript typechecking
npm run build     # Build frontend, server, Cloud Run, and Vercel API artifacts
npm run ci:check  # Run repository-specific CI checks
npm run release:smoke  # Smoke-test a configured production URL
```

The full validation gate is:

```bash
npm test && npm run lint && npm run build && git diff --check
```

## Vercel API entry point

`api/index.js` is a generated Vercel serverless bundle. It is currently tracked because Vercel must discover the function referenced by `vercel.json` before deployment.

Do not edit `api/index.js` manually. After changing backend source code, run:

```bash
npm run build
git add api/index.js
git commit -m "..."
```

The API rewrite must remain before the SPA fallback in `vercel.json`:

```json
{
  "source": "/api/(.*)",
  "destination": "/api/index.js"
}
```

If the generated bundle is ever removed from Git, first prove that a replacement tracked Vercel entry point is discovered and bundled correctly in a production deployment. Removing it without that verification breaks API routes by serving the frontend HTML or returning HTTP 405.

## Deployment

GitHub `main` is connected to both platforms:

- Cloudflare Pages builds with `npm run build:web` and publishes `dist`.
- Vercel builds with `npm run build` and publishes `dist` while exposing `api/index.js` for `/api/*`.

A production deployment is not considered healthy unless these checks pass:

```bash
curl -i https://parqv2.vercel.app/api/health
curl -i https://parqv2.vercel.app/api/system-config
curl -i -X POST \
  -H 'content-type: application/json' \
  --data '{}' \
  https://parqv2.vercel.app/api/auth/verify-pin
```

Expected responses are HTTP 200 JSON for health and system configuration, and HTTP 401 JSON for authentication without a Firebase token. An API route returning `index.html` is a deployment failure.

## Security and feature-work rules

Authentication and authorization are server-owned. Do not trust role, user ID, or Firebase token fields supplied in request bodies. Preserve Firebase token verification, role scoping, session checks, CORS restrictions, and idempotency behavior when changing routes.

Do not delete or mutate Firestore production data without explicit scope and confirmation. Do not add temporary bootstrap or migration endpoints without rate limiting, an explicit removal plan, and a production cleanup verification.

When adding a feature, prefer a focused route module, service, domain helper, and test over adding more logic to `server/app.ts` or a large dashboard component. Update `MAINTAINABILITY_HANDOFF.md` when a planned structural milestone is completed.

## Repository structure

```text
server/                 Express app, middleware, validation, domain utilities
server/routes/          Backend route modules
serverless/api-entry.ts Vercel function source wrapper
api/index.js            Generated and tracked Vercel function bundle
src/components/         React UI components
src/services/           Frontend service clients
src/domain/             Shared business rules and domain logic
src/__tests__/          Frontend and integration tests
.github/workflows/      GitHub Actions production gate
```

## Current maintainability work

See [`MAINTAINABILITY_HANDOFF.md`](./MAINTAINABILITY_HANDOFF.md) for the staged plan, completed milestones, validation history, and instructions for another developer or agent to resume the work safely.
