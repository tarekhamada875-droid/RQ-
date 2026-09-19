# Railway Backend Migration Record

**Status:** Completed and superseded by the active Railway deployment contract
**Frontend:** Cloudflare Pages — `https://rq-acg.pages.dev`
**Backend:** Railway Express — `https://rq-production-af02.up.railway.app`
**Data/authentication:** Firebase Authentication and Firestore

## Result

The backend hosting migration is complete. The production topology is:

```text
Cloudflare Pages frontend -> Railway Express backend -> Firebase Authentication/Firestore
```

The Cloudflare frontend remains static and frontend-only. The Railway service owns `/api/*`, binds to the Railway-provided `PORT`, and reports readiness through `/api/health`.

## Active instructions

Use [`RAILWAY_DEPLOYMENT_HANDOFF.md`](./RAILWAY_DEPLOYMENT_HANDOFF.md) for deployment, secrets, smoke tests, rollback, and operational guidance. Use [`README.md`](./README.md) and [`BRANCHING_AND_RELEASES.md`](./BRANCHING_AND_RELEASES.md) for repository development.

The current Railway contract is defined by `railway.json`, `package.json`, `server/cloudRun.ts`, and `server/app.ts`:

```bash
npm ci
npm run build:railway
node dist/cloud-run.cjs
```

## Safety result

The migration changed hosting only. Firebase Authentication, Firestore collections, rules, indexes, user accounts, and application data remain the same. No production data migration is part of the hosting change.

## Historical context

Earlier planning documents described a Vercel/serverless API and a tracked generated function bundle. That plan is closed. The old files and branches remain in Git history for auditability but must not be restored or used as current deployment instructions. See [`HISTORICAL_MIGRATION_ARCHIVE.md`](./HISTORICAL_MIGRATION_ARCHIVE.md).
