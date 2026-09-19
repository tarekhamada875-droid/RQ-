# Railway Deployment Handoff

**Status:** Active production deployment contract
**Frontend:** Cloudflare Pages — `https://rq-acg.pages.dev`
**Backend:** Railway Express service — `https://rq-production-af02.up.railway.app`
**Data/authentication:** Firebase Authentication and Firestore

## Deployment contract

Railway builds the repository with `npm run build:railway` and starts `node dist/cloud-run.cjs` from `railway.json`. The process binds to `0.0.0.0` and the environment-provided `PORT`. The health endpoint is `/api/health`.

Required Railway variables include Firebase Admin credentials, `APP_URL`, and the approved `ALLOWED_ORIGINS`. Secrets must never be committed to GitHub or placed in frontend variables.

## Frontend contract

Cloudflare Pages builds the static application with `npm run build:web` and publishes `dist`. It does not serve the API. The frontend uses `VITE_BACKEND_API_URL` when configured, otherwise `src/api/apiClient.ts` uses the public Railway fallback URL.

## Validation

```bash
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
curl -i https://rq-production-af02.up.railway.app/api/health
curl -i https://rq-production-af02.up.railway.app/api/system-config
```

The Railway health response must be JSON with `status: ok` and `adminSdk: true`. API endpoints must never return the Cloudflare SPA HTML. Authenticated workflow validation must use a controlled test account and must not mutate production data without explicit scope.

## Historical provider material

The repository previously contained Vercel/serverless deployment artifacts. Those artifacts are retired. Their history is preserved in Git and summarized in `HISTORICAL_MIGRATION_ARCHIVE.md`; do not restore them or use old Vercel URLs as active configuration.
