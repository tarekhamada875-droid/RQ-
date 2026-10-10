# H6 Read-Only Playwright Preview Smoke — Historical Utility

> H6 is closed for scope, H8 is deployed, and H9 is the active checkpoint. This file documents an opt-in, credential-free smoke utility only; it is not an active acceptance plan. Its health/version-only requests do not authorize any authenticated preview Firestore access. Preview and production currently share Firebase project/database identifiers; see the current H9 handoff and do not run data operations against preview until isolation is verified.

## Scope and safeguards

- The runner accepts only `https://migration-unified-hono.rq-acg.pages.dev`; it rejects missing, malformed, production, alternate-host, query-string, and credential-bearing targets before launching a browser.
- It opens a fresh Chromium context, checks the unauthenticated login shell, and makes only credential-free `GET` requests to `/api/health` and `/api/version` on `rq-hono-preview`.
- It does not enter a PIN, authenticate, create/delete fixtures, call business routes, perform financial actions, or modify application data.
- Automatic retries, parallel workers, screenshots, videos, and traces are disabled. The harness is not wired into default CI.
- The check is deliberately narrow: it confirms the selected Pages origin loads and can make CORS-enabled, read-only calls to the isolated preproduction Worker. It does not prove role authorization, tenant isolation, persistence, listener delivery, cleanup, mobile role workflows, or production readiness.

## Run it

Install project dependencies and the Playwright Chromium browser once:

```sh
npm ci
npx playwright install chromium
```

Then opt in by setting the exact approved preview URL:

```sh
RQ_E2E_BASE_URL=https://migration-unified-hono.rq-acg.pages.dev npm run test:e2e:preview
```

PowerShell:

```powershell
$env:RQ_E2E_BASE_URL = 'https://migration-unified-hono.rq-acg.pages.dev'
npm run test:e2e:preview
```

The command fails closed if the URL is absent or differs from the hard-coded preview origin in `playwright.preview.config.ts`. If the approved Pages preview origin changes, review the new target and update the guard in a separate code review; do not weaken it to accept arbitrary `*.pages.dev` hosts. Confirm the Pages build and Worker version match the current candidate before treating a run as useful H6 evidence.

## Evidence and extension

A passing run is only a repeatable **read-only preview smoke**. Record its commit, Pages deployment identity, Worker version, timestamp, and result in the H6 evidence report. Do not record credentials or raw request/console payloads.

Any future authenticated or mutating tests require a separate explicit scope review, approved runtime secret handling, per-role fresh contexts, serialized writes, verified fixture cleanup, and no blind retries. Keep this smoke read-only and separate from financial flows.
