# Production Readiness Checklist

## Architecture

- [x] Cloudflare Pages serves the React/Vite frontend at `https://rq-acg.pages.dev`.
- [x] Railway serves the Express API at `https://rq-production-af02.up.railway.app`.
- [x] Firebase Authentication and Firestore remain the identity and data services.
- [ ] Firestore database/billing path is explicitly selected and documented in [`docs/FIRESTORE_DATABASE_DECISION.md`](docs/FIRESTORE_DATABASE_DECISION.md).
- [x] The frontend API client uses `VITE_BACKEND_API_URL` with the Railway URL as a safe fallback.
- [x] Cloudflare is not expected to serve `/api/*`.

## Source and configuration

- [x] `railway.json` defines the build, start command, and `/api/health` check.
- [x] Railway binds the process to `0.0.0.0` and the platform `PORT`.
- [x] Firebase Admin credentials are stored only in Railway secrets.
- [x] CORS allows the exact production Cloudflare origin.
- [x] Retired provider-specific routing files and generated serverless bundles are absent from the active tree.

## Automated validation

- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm run maintainability:check`
- [x] `git diff --check`

## Live validation

- [x] `GET https://rq-production-af02.up.railway.app/api/health` returns HTTP 200 JSON with `status: ok` and `adminSdk: true`.
- [x] `GET https://rq-production-af02.up.railway.app/api/system-config` returns HTTP 200 JSON.
- [x] Unauthenticated PIN verification returns a JSON authentication error.
- [x] `https://rq-acg.pages.dev/` returns frontend HTML.
- [x] API requests are sent to Railway rather than the Cloudflare origin.
- [ ] Authenticated owner, staff, delegate, supervisor, and admin workflows should be rechecked after any behavior change using controlled test accounts.

## Release rule

`main` is the production source of truth. Use a focused branch and pull request for changes, merge only after CI passes, then delete the short-lived branch. Keep historical provider material in Git history and the historical archive, not in active deployment instructions.
