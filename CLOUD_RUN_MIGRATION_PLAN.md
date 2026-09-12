# RQ- Production Deployment Handoff: Vercel Frontend and Cloud Run Backend

**Document status:** Implementation plan and handoff

**Repository:** `tarekhamada875-droid/RQ-`

**Current production commit:** `54a97a5`

## Executive summary

The repository is not yet split between Vercel and Cloud Run. The current production deployment serves the React frontend and the Express API from Vercel. The latest production change improved check-in latency without changing that architecture.

The target architecture is:

```text
Browser
  |
  | HTTPS
  v
Vercel: React/Vite frontend only
  |
  | HTTPS requests to VITE_BACKEND_API_URL
  v
Cloud Run: Express backend only
  |
  +--> Firebase Authentication
  +--> Firestore
  +--> Secret Manager or Cloud Run service identity
```

The migration must preserve the existing business rules. Vehicle check-in must continue to use one server-side Firestore transaction. The frontend must never become the source of truth for daily limits, vehicle status, cars-inside counts, or financial records.

## What has already been implemented

### Production hardening already present

The repository contains authentication middleware, role and garage-scope checks, request validation, idempotency utilities, Firestore rules, safe API error handling, and a production CI gate. These controls must remain active after the migration.

### Check-in performance change already deployed

Commit `54a97a5` made the following changes:

| Area | Change | Production effect |
|---|---|---|
| Subscriber lookup | Raw-plate and formatted-plate compatibility queries now run in parallel | Removes avoidable sequential database latency |
| Check-in transaction | The backend still writes the vehicle, garage counters, daily statistics, and activity log atomically | Preserves accounting correctness |
| API response | The backend returns the authoritative vehicle, `carsInside`, and `dailyCount` values | The browser can update immediately |
| Frontend state | The browser applies the response counters without waiting for the Firestore listener | Removes the listener-refresh delay from perceived UX |
| Observability | The endpoint returns `Server-Timing` and logs correlation ID plus duration | Makes real latency measurable |

The local validation completed successfully with **34 test files and 205 tests passing**, TypeScript validation passing, the production build passing, and the CI gate passing.

## Current architecture that must be changed

The current `vercel.json` contains an API rewrite:

```json
{
  "source": "/api/(.*)",
  "destination": "/api/index.js"
}
```

The current Vercel build creates `api/index.js` from `serverless/api-entry.ts`. This means Vercel is still executing the Express backend.

The current `server.ts` serves both the backend and the frontend. It starts Express on `0.0.0.0:${PORT}`, serves Vite middleware in development, and serves the Vite `dist` directory in production. Cloud Run should use a backend-only entrypoint instead of this combined frontend/server entrypoint.

The client API helper already supports a backend base URL through:

```text
VITE_BACKEND_API_URL
```

That variable must be set to the Cloud Run URL for the Vercel production project.

## Phase 1 — Add a backend-only Cloud Run entrypoint

Create this file at:

```text
server/cloudRun.ts
```

Use the following implementation:

```ts
import { app } from './app';

const port = Number(process.env.PORT) || 8080;

app.listen(port, '0.0.0.0', () => {
  console.log(`[RQ Cloud Run API] Listening on 0.0.0.0:${port}`);
});
```

This entrypoint must not mount Vite, serve `dist`, or contain frontend fallback routes. Cloud Run should expose only the Express API.

The existing health endpoint must remain available without authentication. The deployment smoke test must call:

```text
GET /api/health
```

and require HTTP 200 with JSON.

## Phase 2 — Add a production Dockerfile

Create this file at the repository root:

```text
Dockerfile
```

Recommended first implementation:

```dockerfile
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.json vite.config.ts ./
COPY server ./server
COPY serverless ./serverless
COPY src ./src
COPY public ./public
COPY index.html .
COPY firebase-applet-config.json ./

RUN npx esbuild server/cloudRun.ts \
    --bundle \
    --platform=node \
    --format=cjs \
    --packages=bundle \
    --outfile=dist/cloud-run.cjs

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/dist/cloud-run.cjs ./dist/cloud-run.cjs
COPY --from=build /app/firebase-applet-config.json ./firebase-applet-config.json

USER node
EXPOSE 8080

CMD ["node", "dist/cloud-run.cjs"]
```

The Docker build must not copy `.env`, service-account JSON keys, `node_modules`, `dist`, or local logs into the image. Add a `.dockerignore` file at the repository root:

```text
.dockerignore
.git
.github
node_modules
dist
.env
.env.*
*.log
coverage
screenshots
api/index.js
firebase-service-account*.json
```

The current `firebase-applet-config.json` contains browser-safe Firebase configuration. It is not a replacement for Firebase Admin credentials. The Cloud Run service must authenticate through Application Default Credentials using its attached Google service account whenever possible.

## Phase 3 — Separate build commands

Update `package.json` so the frontend and backend have explicit build commands. The final shape should include equivalent scripts to these:

```json
{
  "scripts": {
    "build:web": "vite build",
    "build:cloudrun": "esbuild server/cloudRun.ts --bundle --platform=node --format=cjs --packages=bundle --sourcemap --outfile=dist/cloud-run.cjs",
    "build": "npm run build:web && npm run build:cloudrun"
  }
}
```

The exact existing scripts must be preserved where they are still required by the repository CI. Do not remove the existing test, lint, or CI scripts. The Cloud Run build must be reproducible with `npm ci`.

The Vercel project must use only:

```text
npm run build:web
```

for its frontend build. Vercel must not generate `api/index.js` after the migration.

## Phase 4 — Make Vercel frontend-only

Update `vercel.json` to remove the `/api` rewrite. The frontend configuration should be equivalent to:

```json
{
  "buildCommand": "npm run build:web",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Do not delete the old Vercel API implementation until Cloud Run has passed the migration verification period. First remove its production use by removing the rewrite. Keep the old files in a rollback branch or a clearly documented rollback commit until the Cloud Run deployment is confirmed.

Configure the Vercel production environment variable:

```text
VITE_BACKEND_API_URL=https://<cloud-run-service>-<region>.a.run.app
```

For a custom domain, prefer:

```text
VITE_BACKEND_API_URL=https://api.parqv2.com
```

After changing this variable, redeploy the Vercel project. Vite variables are compiled into the frontend build, so changing the Vercel variable does not change an already-built deployment.

## Phase 5 — Configure Cloud Run authentication and Firebase

### Preferred credential model

Use a dedicated Google service account attached to the Cloud Run service. Do not commit a service-account JSON file. Do not paste a private key into GitHub, Vercel, Docker, or this repository.

The existing `server/firebaseAdmin.ts` already attempts Application Default Credentials when `FIREBASE_SERVICE_ACCOUNT` is absent. This is the preferred Cloud Run path.

The Cloud Run service account must have only the permissions required by the application. Grant access to the Firebase project and Firestore according to the project’s current IAM model. If Secret Manager is used, grant the service account `roles/secretmanager.secretAccessor` only for the specific secrets required by the service.

### Optional legacy credential path

The existing code supports `FIREBASE_SERVICE_ACCOUNT` as a JSON environment variable. Treat this as a temporary compatibility path only. If it must be used during migration, create the value in Google Secret Manager and mount it as a Cloud Run secret. Never put it in `Dockerfile`, `.env.example`, GitHub source, or Vercel frontend variables.

### Required Cloud Run environment values

Set non-secret configuration as Cloud Run environment variables:

```text
NODE_ENV=production
FIREBASE_PROJECT_ID=gen-lang-client-0091669619
FIRESTORE_DATABASE_ID=ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759
```

The implementation should be updated to read these variables instead of relying only on embedded fallback values. The browser Firebase configuration may remain public, but backend project and database selection must be explicit and validated during startup.

## Phase 6 — Configure CORS for the Vercel frontend

The backend must allow only the production frontend origins. Configure the Express CORS middleware with an explicit allowlist:

```ts
const allowedOrigins = new Set(
  [
    process.env.FRONTEND_ORIGIN,
    'https://parqv2.vercel.app',
    'https://parqv2.com',
    'https://www.parqv2.com',
  ].filter(Boolean),
);
```

The final implementation must reject arbitrary origins. It must not use `origin: '*'` together with authenticated requests.

Set the Cloud Run variable:

```text
FRONTEND_ORIGIN=https://parqv2.vercel.app
```

If a custom domain is activated, include the custom domain in the allowlist and test both the canonical and `www` behavior.

Allow only the methods and headers required by the application:

```text
Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Headers: Content-Type, Authorization, X-Correlation-ID, X-Idempotency-Key
```

## Phase 7 — Add Cloud Run deployment commands

Enable the required Google Cloud APIs in the selected Google Cloud project:

```bash
gcloud config set project gen-lang-client-0091669619
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

Create an Artifact Registry repository once:

```bash
gcloud artifacts repositories create rq \
  --repository-format=docker \
  --location=<region> \
  --description="RQ production containers"
```

Build and submit the image:

```bash
gcloud builds submit \
  --tag <region>-docker.pkg.dev/gen-lang-client-0091669619/rq/rq-api:$GIT_SHA \
  .
```

Deploy the backend-only service:

```bash
gcloud run deploy rq-api \
  --image <region>-docker.pkg.dev/gen-lang-client-0091669619/rq/rq-api:$GIT_SHA \
  --region <region> \
  --platform managed \
  --service-account rq-api-runtime@gen-lang-client-0091669619.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,FIREBASE_PROJECT_ID=gen-lang-client-0091669619,FIRESTORE_DATABASE_ID=ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759,FRONTEND_ORIGIN=https://parqv2.vercel.app
```

The public Cloud Run setting is acceptable only if the application’s own `requireAuth` middleware protects all non-health endpoints. The health endpoint may be public. Confirm that no data endpoint bypasses authentication.

Start with conservative scaling settings:

```bash
gcloud run services update rq-api \
  --region <region> \
  --min 1 \
  --max 10 \
  --concurrency 40 \
  --timeout 30s
```

The correct region should be close to the Firestore database region. Measure latency before changing concurrency or minimum instances. A minimum instance can reduce cold-start latency but can create a recurring cost.

## Phase 8 — Add a backend deployment pipeline

The repository should eventually add a GitHub Actions workflow at:

```text
.github/workflows/deploy-cloud-run.yml
```

The workflow should:

1. Run `npm ci`.
2. Run `npm run lint`.
3. Run `npm test`.
4. Run `npm run build:cloudrun`.
5. Build the Docker image.
6. Push the image to Artifact Registry.
7. Deploy a new immutable Cloud Run revision.
8. Call `/api/health`.
9. Run invalid-authentication smoke tests.
10. Report the deployed revision and image digest.

The workflow must use Workload Identity Federation or another short-lived credential method. Do not store a long-lived Google service-account key in GitHub secrets unless there is no supported alternative.

## Phase 9 — Verification sequence

Perform the migration in this order:

| Step | Test | Required result |
|---|---|---|
| 1 | Build Docker image locally | Build completes without secrets in image |
| 2 | Run container locally | Process listens on `$PORT` and `0.0.0.0` |
| 3 | `GET /api/health` | HTTP 200 JSON |
| 4 | Unauthenticated vehicle request | HTTP 401 or 403 |
| 5 | Malformed vehicle request with valid auth | HTTP 400 |
| 6 | Valid trial-garage read-only request | Expected data |
| 7 | Vercel frontend loads | No frontend build errors |
| 8 | Browser network inspection | API calls use Cloud Run URL, not Vercel `/api` |
| 9 | Disposable check-in | Vehicle, daily count, and cars-inside count update once |
| 10 | Disposable check-out | Vehicle leaves and counters update once |
| 11 | Duplicate request | No duplicate vehicle or double count |
| 12 | Cloud Run logs | Correlation ID and check-in duration visible |

Use a disposable plate and the authorized trial garage for mutation testing. Do not test a production customer garage with invented records.

A successful frontend smoke test must confirm that the browser’s request URL is similar to:

```text
https://api.parqv2.com/api/vehicles/check-in
```

or:

```text
https://<cloud-run-service>-<region>.a.run.app/api/vehicles/check-in
```

It must not be:

```text
https://parqv2.vercel.app/api/vehicles/check-in
```

## Phase 10 — Performance acceptance criteria

Measure the following timestamps:

```text
button_pressed
request_started
request_received_by_cloud_run
firebase_auth_verified
transaction_committed
response_received
ui_counters_updated
```

The target for a warm production request is:

| Measurement | Target |
|---|---:|
| Cloud Run request to response | Less than 1.5 seconds |
| Frontend response to counter update | Less than 100 ms |
| Duplicate check-in | Rejected without a second write |
| Cold-start request | Measured and documented separately |

The migration must not claim success based only on the visual loading spinner. Compare actual request timing before and after the migration.

## Phase 11 — Rollback plan

Keep the last known-good Vercel API deployment available while Cloud Run is being verified.

Rollback the frontend by restoring the previous Vercel value:

```text
VITE_BACKEND_API_URL=<previous-backend-url>
```

Rollback Cloud Run by routing traffic to the prior revision:

```bash
gcloud run services update-traffic rq-api \
  --region <region> \
  --to-revisions <previous-revision>=100
```

Do not rollback by deleting Firestore records. Do not manually reverse vehicle counters. Use the application’s authorized correction and check-out workflows.

After a stable observation period, remove the Vercel API rewrite and delete only obsolete serverless deployment files in a separate reviewed commit. Do not combine cleanup with the initial migration commit.

## Files to create or modify

| File | Action | Purpose |
|---|---|---|
| `server/cloudRun.ts` | Create | Backend-only Cloud Run listener |
| `Dockerfile` | Create | Reproducible backend container build |
| `.dockerignore` | Create | Prevent secrets and local artifacts entering the image |
| `package.json` | Modify | Add separate web and Cloud Run build commands |
| `vercel.json` | Modify | Remove API rewrite and build frontend only |
| `server/app.ts` or CORS module | Modify | Use explicit production CORS origins |
| `server/firebaseAdmin.ts` | Modify | Read explicit Cloud Run configuration and prefer ADC |
| `.github/workflows/deploy-cloud-run.yml` | Create | Automated backend build and deployment |
| `CLOUD_RUN_MIGRATION_PLAN.md` | Present document | Handoff and acceptance checklist |

## Definition of done

The migration is complete only when all of the following are true:

1. Vercel serves the frontend only.
2. Cloud Run serves the Express backend only.
3. `VITE_BACKEND_API_URL` points to Cloud Run in Vercel production.
4. No production browser API request uses the Vercel `/api` rewrite.
5. Cloud Run uses a dedicated runtime service account or securely mounted Secret Manager secret.
6. CORS allows only the approved frontend origins.
7. `/api/health` returns HTTP 200.
8. Invalid-authentication requests are rejected.
9. Trial check-in and check-out pass without duplicate writes.
10. The daily count and cars-inside count are correct after refresh.
11. Cloud Run logs expose request correlation and duration without secrets or PINs.
12. A tested rollback path exists.

## Important security reminders

The Personal Access Token previously pasted into the conversation must remain revoked. Create a new least-privilege token only when necessary.

Never commit Firebase Admin private keys. Never place `FIREBASE_SERVICE_ACCOUNT` in a Vercel `VITE_` variable. Any variable beginning with `VITE_` can be exposed to browser users.

Do not expose Firestore Admin credentials, Cloud Run service-account credentials, or Secret Manager values to the frontend.

## References

[1]: https://docs.cloud.google.com/run/docs "Google Cloud Run documentation"

[2]: https://docs.cloud.google.com/run/docs/quickstarts/deploy-container "Cloud Run container deployment quickstart"

[3]: https://docs.cloud.google.com/run/docs/configuring/services/secrets "Configure secrets for Cloud Run services"

[4]: https://docs.cloud.google.com/run/docs/configuring/services/environment-variables "Configure Cloud Run environment variables"

[5]: https://firebase.google.com/docs/admin/setup "Firebase Admin SDK setup"

[6]: https://firebase.google.com/docs/firestore/manage-data/transactions "Cloud Firestore transactions"

[7]: https://cloud.google.com/iam/docs/workload-identity-federation "Google Cloud Workload Identity Federation"

[8]: https://vercel.com/docs/deployments/configure-a-build "Vercel build configuration"

[9]: https://vercel.com/docs/environment-variables "Vercel environment variables"

[10]: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect "GitHub Actions OpenID Connect security hardening"

[11]: https://docs.cloud.google.com/run/docs/configuring/traffic "Cloud Run traffic management and rollback"

[12]: https://docs.cloud.google.com/run/docs/container-contract "Cloud Run container runtime contract"

[13]: https://cloud.google.com/artifact-registry/docs/docker/store-docker-container-images "Artifact Registry Docker image storage"

[14]: https://cloud.google.com/build/docs/building/build-containers "Cloud Build container builds"

[15]: https://firebase.google.com/docs/auth/admin/verify-id-tokens "Verify Firebase ID tokens"

[16]: https://expressjs.com/en/resources/middleware/cors.html "Express CORS middleware"

[17]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing "HTTP Server-Timing header"

[18]: https://docs.docker.com/build/building/best-practices/ "Docker build best practices"
