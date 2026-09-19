# Next Structural Rebuild

This document describes future maintainability work for the current production architecture:

```text
Cloudflare Pages React/Vite frontend -> Railway Express API -> Firebase Auth/Firestore
```

## Current priorities

1. Keep the Cloudflare/Railway boundary explicit and covered by smoke tests.
2. Keep `server/app.ts` focused on middleware, route mounting, health, and shared application assembly.
3. Keep vehicle, financial, subscriber, delegate, and admin business rules in focused route/domain modules.
4. Preserve Firestore as the authoritative source of truth while treating summaries and projections as rebuildable read models.
5. Continue reducing large dashboard components through focused extraction without changing visible behavior.
6. Measure reads, writes, transaction retries, and projection freshness before making performance claims.

## Non-negotiable contracts

Do not change API paths, request methods, response shapes, role scoping, session behavior, idempotency, operation traces, or financial event semantics without corresponding tests and a deliberate migration plan. Do not add a second hosting provider or restore retired serverless routing artifacts as a shortcut.

## Validation

```bash
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
curl -i https://rq-production-af02.up.railway.app/api/health
```

For any production change, validate both the Cloudflare frontend origin and the Railway API origin. Do not use the Cloudflare SPA response as evidence that an API route is healthy.
