# CF2 Worker Runtime Compatibility Spike Report

**Date:** 2026-10-02  
**Branch:** `cloudflare-worker-migration`  
**Status:** Spike Code Implemented, Locally Verified, and Edge Deployment Pending

---

## 1. Objective

Before migrating business-critical routes, the runtime environment must prove compatibility with:
1. Fetch API request/response lifecycle.
2. CORS preflight and headers.
3. Request body parsing.
4. Firebase ID token verification.
5. Firestore reads and writes against the named database (`ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`).
6. Atomic transactions in the Worker environment.
7. Safe error envelopes and no sensitive logging.
8. Concurrent request handling.

---

## 2. Implemented Spike Endpoints

All spike endpoints are strictly **pre-production only** and return HTTP 403 `SPIKE_ENDPOINT_DISABLED_IN_PRODUCTION` when `ENVIRONMENT=production`:

### `GET /api/health`
- **Output:** `{ status: 'ok', runtime: 'cloudflare-worker', environment: '...', timestamp: '...' }`
- **Verified:** Returns HTTP 200 JSON.

### `GET /api/version`
- **Output:** `{ version: '1.0.0', environment: '...', runtime: 'cloudflare-worker', status: 'operational', timestamp: '...' }`
- **Verified:** Returns HTTP 200 JSON.

### `POST /api/test-auth-verify` (Pre-production only)
- **Input:** `Authorization: Bearer <idToken>`
- **Logic:** Calls `adminAuth.verifyIdToken(token)`.
- **Verified:**
  - Missing token -> HTTP 400 `{ success: false, error: 'TOKEN_REQUIRED' }`.
  - Malformed/invalid token -> HTTP 401 `{ success: false, error: 'AUTH_VERIFICATION_FAILED' }`.
  - Production environment -> HTTP 403.

### `GET /api/test-firestore-read` (Pre-production only)
- **Target:** Synthetic namespace `_spike_tests/synthetic_doc` in named database.
- **Verified:** Returns `{ success: true, exists: boolean, databaseId: '...' }`.

### `POST /api/test-firestore-write` (Pre-production only)
- **Target:** Synthetic namespace `_spike_tests/spike_<timestamp>`.
- **Logic:** Executes an atomic Firestore transaction (`adminDb.runTransaction`).
- **Verified:** Proves write and transaction capability; returns `{ success: true, docId: '...', transactionSupported: true }`.

---

## 3. Firebase Access Decision & Adapter Strategy

- **Chosen Approach:** Hybrid Worker Adapter with `nodejs_compat`.
- **Firebase Project ID:** `gen-lang-client-0091669619`
- **Firestore Named Database ID:** `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`
- **Configuration Bindings:**
  - Reads `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT` from Cloudflare Worker secrets.
  - Passes database ID explicitly to `getFirestore(app, databaseId)`.
- **Synthetic Isolation:** All spike operations write strictly to the isolated `_spike_tests` collection; no production or user collection is touched.

---

## 4. Local Test Results

Automated test suite `src/__tests__/cloudflareWorkerCompatibilitySpike.test.ts`:
- Test 1 (Health and version): **PASS**
- Test 2 (Auth verification error envelopes): **PASS**
- Test 3 (Spike disabled in production): **PASS**
- Test 4 (Synthetic Firestore read, write & transaction): **PASS**
- Test 5 (Concurrent synthetic requests - 15 parallel requests): **PASS**

Worker Bundle Status:
- Esbuild worker bundle size: 6.8 MB (uncompressed) / 1.26 MB (gzipped).
- Wrangler dry-run deployment: **PASS**.

---

## 5. Known Limitations Requiring Connected Agent

As a code-only agent:
1. Cannot deploy the Worker bundle to live Cloudflare Edge infrastructure.
2. Cannot run live token verification with an actual issued Firebase ID token on the edge.
3. Cannot run live curl commands against the edge pre-production URL.

---

## 6. Pending Edge Verification Tasks (for Connected Agent)

Once the connected agent deploys the Worker to Cloudflare:
```bash
# 1. Edge health check
curl -i https://rq-backend-pre.<subdomain>.workers.dev/api/health

# 2. Edge version check
curl -i https://rq-backend-pre.<subdomain>.workers.dev/api/version

# 3. Auth spike with real Firebase ID token
curl -i -X POST https://rq-backend-pre.<subdomain>.workers.dev/api/test-auth-verify \
  -H "Authorization: Bearer <VALID_FIREBASE_ID_TOKEN>"

# 4. Firestore write spike
curl -i -X POST https://rq-backend-pre.<subdomain>.workers.dev/api/test-firestore-write \
  -H "Content-Type: application/json" \
  -d '{"payload": "edge_verification_test"}'

# 5. Firestore read spike
curl -i https://rq-backend-pre.<subdomain>.workers.dev/api/test-firestore-read
```

---

## 7. Rollback Instructions

If CF2 spike endpoints need to be removed:
```bash
git revert <CF2_COMMIT_SHA>
```
To clean up synthetic test documents in Firestore:
Delete documents under `_spike_tests/` collection only. No application data is affected.
