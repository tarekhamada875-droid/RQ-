# RQ Next-Agent Handoff

**Last updated:** 2026-09-23
**Repository:** `tarekhamada875-droid/RQ-`
**Local path:** `/home/ubuntu/RQ-`
**Current branch:** `main`
**Latest published commit:** `b1aae73 test: cover v2 read pagination contracts`
**Working tree at handoff:** clean and synchronized with `origin/main`; focused Active Devices and v2 adapter coverage plus handoff evidence are published directly to `main`.

## Read this first

This is a controlled backend-overhaul project. The legacy backend remains the production authority. `server-v2` is a guarded replacement foundation and preview capability. Do not migrate production traffic, financial writes, or data ownership without explicit evidence, rollback testing, and an updated plan.

Read these files before changing code:

1. `BACKEND_COMPLETE_OVERHAUL_STAGES.md` — canonical master plan and stage status.
2. `BACKEND_OVERHAUL_HANDOFF.md` — current evidence, blockers, and slice history.
3. `RAILWAY_DEPLOYMENT_HANDOFF.md` — production deployment contract.
4. This file — current operating method, MCP restoration procedure, and next action.
5. The relevant legacy route/repository, matching v2 contract/repository, and existing tests.

## Current verified state

The latest implementation commit is:

```text
5e2bba2 feat: add active session management
```

It adds:

- `GET /api/auth/sessions` for a Firebase-authenticated user’s redacted active-session list.
- `DELETE /api/auth/sessions/:sessionKey` for revoking one device session.
- SHA-256 opaque session identifiers; raw session IDs, UIDs, names, and credentials are not returned.
- Per-device revocation restricted to the caller’s own UID and role.
- Root and entity active-session marker synchronization.
- Backend-operator tokens explicitly blocked from user-session management endpoints.

The previous multi-device implementation is `db0b4a5`; the CI propagation fix is `f0a5b20`.

Successful Production Gates:

```text
5e2bba2 active-session implementation: 35815476395
f0a5b20 Railway propagation wait: 35773357754
259bbc3 prior documentation: 35770479204
```

The Production Gate now cancels obsolete runs, waits up to ten minutes for Railway propagation, and verifies that `/api/health` serves the exact GitHub commit SHA. Its workflow is `.github/workflows/production-gate.yml`.

Local validation for the current implementation passed:

```text
npm run lint
npm run lint:v2
focused session-marker tests
Firebase-emulator-backed npm run check:v2
npm test
npm run build
npm run maintainability:check
git diff --check
```

Do not trust old test counts or commit references in historical sections without checking `git log`, current files, and the latest GitHub run.

## Current architecture and safety boundaries

```text
Cloudflare Pages: https://rq-acg.pages.dev
        |
        v
Railway API: https://rq-production-af02.up.railway.app
        |
        v
Firebase Authentication + Firestore
```

The legacy Express backend and its financial routes remain authoritative. Firestore and immutable business events remain authoritative data sources. Dashboard summaries, projection buckets, caches, and telemetry are rebuildable read models.

Never:

- enable production `VITE_V2_READ_*` flags as part of foundation work;
- migrate financial authority to v2;
- delete legacy routes or production data;
- convert the intentionally non-destructive garage deletion job into a physical delete writer;
- use an old Cloudflare preview as current-build evidence;
- create a branch merely to manufacture a preview for validation;
- print, commit, paste, or expose secrets;
- use the Railway operator token as a Firebase user token;
- treat an operator-MCP health response as proof of Firebase-authenticated frontend behavior.

Known external blocker: the last Cloudflare inspection found no current non-production preview for the current `main` build. The available preview was stale. When a natural current preview appears, use a Firebase-authenticated browser session to validate the Cloudflare-to-Railway path. Do not bypass this by changing production flags.

## Exact working method used successfully

For every new slice:

1. Verify `git status --short --branch`, `git log -3 --oneline`, current plan, handoff, and relevant source.
2. Inspect the legacy behavior and matching v2 contracts/repositories/routes/tests.
3. Select one bounded, reversible, preferably read-only or non-financial capability.
4. Implement it using existing repository conventions for auth, scope, envelopes, idempotency, audit, redaction, and emulator tests.
5. Add focused tests for valid behavior, invalid input, authentication, authorization, cross-scope access, replay/concurrency where relevant, and production non-exposure.
6. Run focused tests first, then the complete validation gate:

   ```bash
   npm run lint:v2
   npm run test:v2 -- <focused-tests>
   npx --yes firebase-tools@15.30.2 emulators:exec --only firestore --project rq-v2-agent-check "npm run check:v2"
   npm test
   npm run lint
   npm run build
   npm run maintainability:check
   git diff --check
   ```

7. Review `git diff --stat`, every changed file, secret exposure, flags, generated artifacts, and `git status`.
8. Direct pushes to `main` are authorized in this project. Commit only the focused files, push, and watch the Production Gate.
9. Do not call a slice complete until the relevant GitHub Gate succeeds.
10. Update both `BACKEND_OVERHAUL_HANDOFF.md` and `BACKEND_COMPLETE_OVERHAUL_STAGES.md` with exact commits, gate IDs, validation evidence, limitations, and next action.

## Railway MCP: restore or recreate it safely

The Railway MCP is deliberately outside the repository at:

```text
/home/ubuntu/rq-backend-mcp
```

Never move it into `RQ-`, `server-v2`, or the frontend. The reference files are:

```text
/home/ubuntu/rq-backend-mcp/server.mjs
/home/ubuntu/rq-backend-mcp/smoke-test.mjs
/home/ubuntu/rq-backend-mcp/live-check.mjs
/home/ubuntu/rq-backend-mcp/README.md
```

It is a read-only stdio MCP with exactly two tools:

```text
backend_health
read_backend_endpoint
```

It uses only `GET`, adds a server-to-server operator header, creates request IDs, enforces a bounded timeout, safely parses/truncates responses, and allows only:

```text
/api/health
/api/system-config
/v2/health
/api/v2/health
/v2/packages
/api/v2/packages
```

It must not gain POST/PUT/PATCH/DELETE, arbitrary URLs, shell execution, Firestore access, token inspection, or business-operation tools.

Required environment variables are configured outside Git:

```text
RQ_BACKEND_URL=https://rq-production-af02.up.railway.app
BACKEND_OPERATOR_TOKEN=<private token; never place in this file>
RQ_BACKEND_TIMEOUT_MS=10000
```

The same private operator token must be configured as `BACKEND_OPERATOR_TOKEN` in Railway and in the MCP connector environment. It is not the Firebase user token. If it is missing or expired, ask the user to provide or rotate it; never invent one. The local token file, if present, must stay outside Git with mode `600`:

```text
/home/ubuntu/rq-backend-mcp/.operator-token
```

To recreate the external directory if it is missing:

```bash
mkdir -p /home/ubuntu/rq-backend-mcp
cd /home/ubuntu/rq-backend-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
```

Then restore `server.mjs` from the existing reference or implement the same `McpServer` + `StdioServerTransport` design. Do not put the token in command arguments or source files.

Inspect connectors before changing them:

```bash
manus-config config load --search railway
manus-config connector list --user-custom-only
```

Register or restore the connector through the connector-management workflow, not by editing `/home/ubuntu/.manus/config/config.json` directly. Put secrets only in connector environment fields. A user approval card may be required; do not bypass it.

Safe local checks, without printing credentials:

```bash
cd /home/ubuntu/rq-backend-mcp
node smoke-test.mjs
node --check server.mjs
node --check live-check.mjs
```

The MCP is an operator diagnostic boundary only. It is not a replacement for Firebase authentication and it is not evidence of a real authenticated Cloudflare preview.

## Current plan and next move

### Completed current slice: frontend session-management UI and gate correction

Commit `9bbcb5a` adds the user-facing Settings/Active Devices screen and typed client service:

- `src/services/sessionService.ts` calls both authenticated endpoints and validates response shapes and 64-character opaque keys.
- `src/components/admin/AdminActiveSessionsView.tsx` displays redacted entries, current status, timestamps, refresh, errors, and confirmation before revocation.
- Current-session revocation delegates to the existing logout callback; no new auth authority was introduced.
- `src/components/admin/AdminNavigationAndViews.tsx` and `AdminDashboard.tsx` wire the screen into admin settings.
- Local `npm test -- --run` passed: 56 files and 300 tests. `npm run build` passed.
- The initial gate for documentation tip `6f8172f` failed in `verify/Typecheck` because the component destructured an unused `t` prop (`TS6133`). Commit `b5b681b` removes only that unused destructuring; Production Gate `35822201327` passed, including typecheck, tests, production build, v2 foundation, artifact, maintainability, and live smoke checks.
- Commit `647e251` adds five focused `sessionService` tests covering valid list responses, malformed list rejection, DELETE construction for valid opaque keys, invalid-key rejection before network access, and mismatched revoke responses. Production Gate `35823053960` passed.
- Commit `eb19593` adds three React/jsdom tests covering session loading, non-current revocation with success feedback, and current-session revocation with logout. Production Gate `35823805861` passed.
- Commit `b1aae73` adds two v2 adapter tests covering URL-encoded pagination cursors/bounded limits and malformed bounded-page rejection. Production Gate `35824735761` passed.

The normal UI test harness has no dedicated component test added yet; add focused service/component coverage only in a later small slice if the existing test environment supports it.

The latest published commit is gate-verified by `35824735761`; the earlier failing gate was corrected without changing behavior.

### Completed bounded read-only migration-evidence task

No current non-production Cloudflare Pages preview exists. Read-only Cloudflare inspection on 2026-09-23 found `main` production deployment `52388dd0` built from `6f8172f`; the newest preview remains stale deployment `7ff4c62e` from branch `feat/backend-operator-mcp-auth`, commit `1c60a0d`, created 2026-09-19. Do not use it for current authenticated Firebase-browser evidence, create a branch to manufacture a preview, or change production flags.

Local normalized migration evidence passed in 4 focused v2 test files with 16 tests: stable normalization/order, timestamp tolerance, redacted financial/authorization mismatch classification, equal-comparison v2 permission, v2-read fallback to legacy, legacy-read blocking, rollback safety, admin route validation, and disabled-flag non-exposure. The full validation gate also passed `npm run lint:v2`, emulator-backed `npm run check:v2`, `npm test`, `npm run lint`, `npm run build`, `npm run maintainability:check`, and `git diff --check`. This remains read-only evidence; no production shadow traffic or cutover is enabled.

### Then resume the overhaul order

1. Keep `b1aae73` and Production Gate `35824735761` as the verified current tip.
2. If a natural current authenticated Cloudflare preview appears, perform Firebase-browser checks for v2 health, package reads, garage summary, and session behavior.
3. Through that preview, repeat normalized legacy/v2 package and garage-summary comparisons and classify every difference.
4. Exercise v2-failure fallback and legacy-failure blocking in the authenticated preview; no unexplained financial or authorization mismatch is acceptable.
5. Complete remaining non-financial repositories, reports, and a deployed projection worker only after explicit operational design and rollback evidence.
6. Progressive read cutover: internal users, one garage, small cohort, larger cohort, all eligible reads.
7. Financial authority migration only after reconciliation, cost/SLO evidence, and rollback testing.
8. Retire legacy paths only after migration and rollback-window expiration.

## Cleanup and source-of-truth rules

The repository contains several historical documents. Keep them unless they are demonstrably obsolete; update canonical status instead of deleting project history. The canonical current documents are:

- `NEXT_AGENT_HANDOFF.md` — this operating handoff.
- `BACKEND_OVERHAUL_HANDOFF.md` — evidence and slice history.
- `BACKEND_COMPLETE_OVERHAUL_STAGES.md` — master stage plan.
- `RAILWAY_DEPLOYMENT_HANDOFF.md` — deployment contract.

Generated local artifacts such as `firestore-debug.log` and `dist/` are ignored and disposable. Do not commit them. The external MCP directory, `.operator-token`, and its lockfile are not repository files; preserve the MCP source and protect the token.

## Final handoff rule

At the end of every slice, leave the repository clean, the exact commit and CI run recorded, the next action explicit, and no secret in source, logs, test fixtures, or documentation.

## Token-ending succession trigger

If the project owner sends the exact phrase **`tokens ending`**, treat it as an immediate handoff request. Do not begin another feature. First inspect the current git status, branch, `HEAD`, recent commits, GitHub Production Gate, changed files, tests, deployment state, blockers, and MCP availability. Then update this file as the canonical operating guide and update the relevant historical and plan documents with exact commit SHAs, test commands and outcomes, CI run IDs, deployment evidence, known limitations, and the next bounded task.

Keep secrets out of chat, files, commits, logs, and frontend code; refer only to secure variable names and the protected MCP restore procedure. Remove duplicate documentation only after verifying that it is not referenced by CI or required checks. Run the repository validation and confirm a clean tree. End with a copy-paste message for the next agent that names the repository, canonical handoff file, completed work, exact next task, safety boundaries, required verification, and the requirement to repeat this succession protocol if the next agent receives **`tokens ending`**.
