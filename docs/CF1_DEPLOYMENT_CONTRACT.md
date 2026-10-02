# CF1 Cloudflare Deployment Contract

**Date:** 2026-10-02  
**Branch:** `cloudflare-worker-migration`  
**Status:** Defined and Locally Verified (Dry-Run Passed)

---

## 1. Overview & Service Mapping

| Component | Target Service | Environment | Host / Identifier |
|---|---|---|---|
| Frontend Static Assets & PWA | Cloudflare Pages | Production / Preview | `https://rq-acg.pages.dev` |
| Dedicated Backend API | Cloudflare Worker | Preproduction | `rq-backend-pre` (`https://rq-backend-pre.<subdomain>.workers.dev`) |
| Dedicated Backend API | Cloudflare Worker | Production | `rq-backend` (`https://rq-backend.<subdomain>.workers.dev` or `https://api.rq-acg.com`) |
| Auth & Data Authority | Firebase Auth + Firestore | Production Database | Project: `gen-lang-client-0091669619`, Database: `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759` |

---

## 2. Wrangler Configuration (`wrangler.toml`)

```toml
name = "rq-backend"
main = "server/cloudflareWorker.ts"
compatibility_date = "2024-09-25"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "production"
FIREBASE_PROJECT_ID = "gen-lang-client-0091669619"
FIREBASE_DATABASE_ID = "ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759"

# Pre-production environment for synthetic validation
[env.preproduction]
name = "rq-backend-pre"
vars = { ENVIRONMENT = "preproduction", FIREBASE_PROJECT_ID = "gen-lang-client-0091669619", FIREBASE_DATABASE_ID = "ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759" }
```

---

## 3. Secret Variables Contract (Names Only)

The following secrets must be set in the Cloudflare dashboard or via `wrangler secret put` by the authorized connected agent. **No secret values are committed in source code or Git**:

1. `FIREBASE_SERVICE_ACCOUNT_JSON` — Private service account JSON key for server-side Firebase operations.
2. `BACKEND_OPERATOR_TOKEN` — Pre-shared authorization token for operator connector health diagnostics.
3. `ALLOWED_ORIGINS` — Comma-separated list of approved web origins for CORS policy.

---

## 4. Contract Verification Endpoints

1. **`GET /api/health`**
   - Returns HTTP 200 JSON:
     ```json
     {
       "status": "ok",
       "runtime": "cloudflare-worker",
       "timestamp": "2026-10-02T...",
       "environment": "preproduction"
     }
     ```
2. **`GET /api/version`**
   - Returns HTTP 200 JSON:
     ```json
     {
       "version": "1.0.0",
       "environment": "preproduction",
       "runtime": "cloudflare-worker",
       "status": "operational",
       "timestamp": "2026-10-02T..."
     }
     ```
3. **CORS Options Handling**
   - Restricts origins to approved domains (including `https://rq-acg.pages.dev`).
   - Exposes trace headers: `X-Correlation-ID`, `X-Operation-ID`, `Idempotency-Key`.

---

## 5. Local Validation & Dry-Run Status

- `npx wrangler deploy --dry-run`: **SUCCESS** (Verified production bundle upload size and bindings).
- `npx wrangler deploy --dry-run -e preproduction`: **SUCCESS** (Verified preproduction environment bindings).
- `npx vitest run src/__tests__/cloudflareWorkerContract.test.ts`: **PASS** (4/4 tests passed).
- `tsc --noEmit`: **PASS** (0 errors).

---

## 6. Pending Connected-Agent Actions

1. Log in to Cloudflare account via Wrangler (`wrangler login`).
2. Deploy pre-production worker: `npx wrangler deploy -e preproduction`.
3. Set secret: `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON -e preproduction`.
4. Verify live response from edge: `curl -i https://rq-backend-pre.<subdomain>.workers.dev/api/health`.
