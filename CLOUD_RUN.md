# Cloud Run deployment

This repository can run as a single Express service on Cloud Run. The service serves the built Vite application and the server-authoritative `/api/*` endpoints from the same origin, so the Vercel deployment can remain available as the frontend and rollback path during migration.

## What is included

- `Dockerfile`: reproducible multi-stage Node 22 image. The runtime listens on Cloud Run's `PORT` (defaulted to `8080`) and binds to `0.0.0.0`.
- `.dockerignore`: prevents local dependencies, build output, and environment files from entering the image.
- `cloudbuild.yaml`: builds the image, pushes it to Artifact Registry, and deploys a new Cloud Run revision. The default region is `europe-west2` to match the existing handoff configuration; override substitutions when needed.

## One-time Google Cloud setup

Create or select a Google Cloud project, enable Cloud Run, Cloud Build, Artifact Registry, and Secret Manager APIs, then create an Artifact Registry Docker repository matching `_REPOSITORY` (default: `rq`). Grant the Cloud Build service account permission to upload Artifact Registry images and deploy Cloud Run services. Grant the Cloud Run runtime service account only the Firebase/Firestore permissions it needs.

Build and deploy from the repository root with:

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION=europe-west2,_REPOSITORY=rq,_SERVICE=rq-api \
  .
```

The deployment command does not include secrets in the image or in source control. Configure runtime secrets on the Cloud Run service using Secret Manager, for example:

```bash
gcloud run services update rq-api \
  --region=europe-west2 \
  --update-secrets=FIREBASE_SERVICE_ACCOUNT=firebase-service-account:latest \
  --set-env-vars=APP_URL=https://YOUR_CLOUD_RUN_HOST,VITE_BACKEND_API_URL=
```

If the runtime uses Application Default Credentials instead of a service-account JSON value, omit `FIREBASE_SERVICE_ACCOUNT` and grant the Cloud Run service account the required Firebase Admin permissions. Do not commit `.env` files, service-account JSON files, or private keys.

## Vercel frontend cutover

For a split deployment, set the Vercel production environment variable `VITE_BACKEND_API_URL` to the Cloud Run service URL, rebuild, and verify that the browser sends its Firebase bearer token to the Cloud Run API. Keep the Vercel API rewrite in place until the Cloud Run revision has passed health and authenticated transaction checks. A blank value keeps same-origin Vercel API behavior.

Required smoke checks after deployment:

```bash
curl -fsS "$CLOUD_RUN_URL/api/health"
curl -fsS "$CLOUD_RUN_URL/"
```

The health response must contain `{"status":"ok"}` and `adminSdk: true`. Then verify an authenticated read and one non-destructive authenticated API request from the Vercel frontend. Do not use a production financial mutation as a smoke test.

## Rollback

Cloud Run revisions are immutable. Route traffic back to the previous revision if a smoke check fails:

```bash
gcloud run services update-traffic rq-api \
  --region=europe-west2 \
  --to-revisions=PREVIOUS_REVISION=100
```

The existing Vercel deployment remains an independent rollback path while `VITE_BACKEND_API_URL` is unset. Cutover and rollback should be performed only after validating Firebase Auth, Firestore transactions, CORS, and session expiry behavior against the intended production origin.
