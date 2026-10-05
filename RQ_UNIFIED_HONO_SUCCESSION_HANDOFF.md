# RQ Unified Hono Migration — Succession Handoff

## Read this first

You are the continuation agent for the RQ garage-management application. Continue the work as a senior production engineer, not as a fresh greenfield developer.

The user is not a technical person. Use plain English, make reasonable decisions autonomously, and do not ask the user to perform terminal or Cloudflare work unless the current environment genuinely blocks the action.

The user requires:

- English only.
- No UI or UX redesign.
- Preserve existing business behavior unless a defect is proven.
- Production safety and tenant isolation are more important than architectural elegance.
- Direct pushes to `main` have historically been requested, but the unified Hono experiment must use a separate migration branch first.
- The phrase `tokens ending` means: stop implementation and prepare a new succession handoff with exact state and instructions.

---

## Mission

Evaluate and, if safe, migrate RQ from the current dual-runtime backend to a unified Hono Web-Standards API while preserving the production application.

Target architecture:

```text
Cloudflare Pages frontend
        |
        v
One Hono API application
        |
        v
Cloudflare Worker in production
        |
        v
Firebase Authentication + Firestore
```

Do not treat this as a quick cleanup. It is a staged migration with rollback protection.

## Latest chained handoff status — 2026-10-05

- **Active branch:** `migration/unified-hono`
- **Current commit:** `5bae486` (`docs: activate unified hono succession handoff`)
- **Remote migration branch:** synchronized at the same commit
- **Production `main`:** unchanged at `bb12fbe90eb97b6638546f292f5de50aab03d81a`
- **Completed checkpoints:** H0, H1, H2, H3, H4, and H5.
- **H5 preview URL:** `https://rq-hono-preview.tarekhamada875.workers.dev`
- **H5 evidence:** GitHub Actions run `37290805011` passed both preview-bundle verification and isolated Worker deployment/smoke tests; Production Gate run `37290805144` also passed.
- **Live production version:** `1.0.0-production`; **live preview version:** `1.0.0-h5-preview`.
- **Current blockers:** H6 human role testing has not been completed; therefore H7 quality-gate signoff, H8 production cutover, and H9 Express decommissioning must not begin.
- **Exact next checkpoint:** H6 preview role testing for Admin, Delegate, Garage Owner, Staff, and Supervisor using synthetic data only. Use the acceptance task and preview URL; record allowed/forbidden outcomes, tenant isolation, session behavior, and mobile/desktop behavior.
- **Exact next files:** `RQ_INTEGRATED_ROLE_AND_TECHNICAL_ACCEPTANCE_TEST_TASK.md`, `docs/H5_DUAL_RUNTIME_FINDINGS_2026-10-05.md`, `server/cloudflareWorker.ts`, `server/api.ts`, and the relevant role/service tests under `src/__tests__/`.

> You are part of a continuing succession chain. If the user says `tokens ending`, stop implementation, record the exact current state, create the next agent’s handoff, and instruct that next agent to repeat the same succession protocol. Do not leave the next agent dependent on conversation history.

---

## Repository and access

Repository:

```text
https://github.com/tarekhamada875-droid/RQ-
```

Working directory in the Manus Sandbox:

```text
/home/ubuntu/RQ
```

Current production branch:

```text
main
```

Current known-good main commit at handoff:

```text
d1c8da5 docs: remove obsolete migration plans and refresh project memory
```

Previous important commits:

```text
7518984 feat(garage): extend garage model and API update schema
3b00d99 feat(referral): implement automated referral reward system
45797e6 fix: wire trial expiry popup to worker API
c6def3a fix: resolve PIN sessions for worker authorization
```

Current production URLs:

```text
Frontend: https://rq-acg.pages.dev
Worker:   https://rq.tarekhamada875.workers.dev
```

Cloudflare account ID:

```text
1ddccc39f679d3a70fddb3ceb77e6235
```

The Cloudflare MCP connector is available. Prefer it for Cloudflare inspection and deployment. Wrangler CLI authentication may not be available in the Sandbox even when the Cloudflare MCP connector is authorized.

GitHub CLI is configured. Use `gh` for repository operations.

---

## Production status at handoff

The application is currently deployed as:

```text
Cloudflare Pages -> Cloudflare Worker -> Firebase
```

The Worker is healthy:

```json
{
  "status": "ok",
  "runtime": "cloudflare-worker",
  "environment": "production",
  "adminSdk": true,
  "version": "1.0.0-production"
}
```

At the last inspection, the Worker was on version 25 and contained the feature-route migration. Do not assume this remains true; verify it through Cloudflare before changing anything.

The latest full quality gate passed:

- 96 test files passed.
- 547 tests passed.
- Full production bundling passed.
- Cloudflare Worker build passed.
- `npm run ci:check` passed.
- `npm run maintainability:check` passed.
- TypeScript lint passed.
- Worker parity suite passed.
- Worker authorization suite passed.

Some existing React tests print `act(...)` warnings. They did not fail the gate. Do not “fix” them opportunistically unless they become a real quality-gate failure.

---

## Critical security history

### Anonymous Firebase session resolution bug

PIN login uses Firebase Anonymous Auth. The anonymous Firebase UID is not the garage/admin document ID and does not itself contain the real role.

The Worker previously resolved only the Firebase token role and therefore treated logged-in Admin and Garage Owner users as an unprivileged worker. This caused errors such as:

- “You are not permitted.”
- Admin cannot add or delete.
- Garage owner cannot operate the trial popup.

The fix is in `server/cloudflareWorker.ts` in `resolveWorkerSessionUser` and the session-aware logic inside `requireWorkerAuth`.

The Worker must resolve the active server session from:

```text
admin_sessions
supervisor_sessions
delegate_sessions
garage_sessions
staff_sessions
```

using the authenticated Firebase UID and `X-Session-ID` header.

Do not remove or weaken this logic.

### Trial popup bug

The frontend called:

```text
POST /api/garages/trial-decision
```

The old Express backend had the route, but the Worker did not. The popup rendered correctly but its buttons failed.

The Worker route now exists and is tested for:

- Garage owner submitting a decision for the owned garage.
- Garage owner being denied for another garage.
- Admin authorization.

Do not assume that every old Express route has an equivalent Worker route without checking.

---

## Important current files

### Frontend API client

```text
src/api/apiClient.ts
```

Production default:

```text
https://rq.tarekhamada875.workers.dev
```

Do not reintroduce Railway as the production fallback.

### Worker entry point

```text
server/cloudflareWorker.ts
```

This is currently the production API implementation. It uses Hono and Fetch-style requests.

### Existing Express application

```text
server.ts
server/app.ts
server/routes/
server/auth/
server/middleware.ts
server/cloudRun.ts
```

Express is transitional infrastructure. It is still used by local development, Cloud Run compatibility, and existing integration tests. Do not delete it at the beginning of the migration.

### Current plan

```text
RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md
```

Read this file before starting implementation.

### Current project knowledge base

```text
RQ_PROJECT_KNOWLEDGE_BASE.md
```

Read this file for domain behavior, role definitions, deployment history, and previous decisions.

---

## First actions for the continuation agent

Run these commands before editing code:

```bash
cd /home/ubuntu/RQ
git fetch origin main
git status --short --branch
git log -10 --oneline --decorate
```

Read:

```bash
cat RQ_PROJECT_KNOWLEDGE_BASE.md
cat RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md
```

`RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md` is the authoritative continuation file. The old Railway-era recovery plans and old succession protocol were removed from the working tree on 2026-10-05; do not search for or recreate them unless a concrete missing fact is proven.

Verify the live stack:

```bash
python3 - <<'PY'
import requests
for url in [
    'https://rq-acg.pages.dev',
    'https://rq.tarekhamada875.workers.dev/api/health',
    'https://rq.tarekhamada875.workers.dev/api/version'
]:
    r = requests.get(url, timeout=30)
    print(url, r.status_code, r.headers.get('content-type'), r.text[:500])
PY
```

Inspect Cloudflare Worker code and versions through the Cloudflare MCP before deploying anything.

Run the focused baseline tests:

```bash
npm exec vitest run \
  src/__tests__/workerAuthorizationMatrix.test.ts \
  src/__tests__/workerParityRoutes.test.ts
```

Do not create a migration branch until confirming `main` is clean and the baseline is healthy.

---

# Execution protocol

## H0 — Protect the production baseline

Create a tag from the current `main` only after verifying it is clean:

```bash
git tag rq-production-baseline-before-hono-migration
git push origin rq-production-baseline-before-hono-migration
```

Create the migration branch:

```bash
git switch -c migration/unified-hono
git push -u origin migration/unified-hono
```

Do not deploy this branch to the production Worker. Use a separate preview Worker if available.

If branch naming or deployment restrictions require a different name, document the actual name immediately.

## H1 — Inventory the route surface

Build a method/path inventory from:

```text
src/
server/cloudflareWorker.ts
server/app.ts
server/routes/
server/auth/
```

For every route record:

- Frontend caller.
- Worker implementation.
- Express implementation.
- Authorization rule.
- Firestore reads/writes.
- Idempotency behavior.
- Audit logging.
- Tests.

Feature groups:

- Authentication and sessions.
- Vehicles.
- Subscribers.
- Garages.
- Staff.
- Supervisors.
- Delegates.
- Recharge requests.
- Packages and subscriptions.
- Referral rewards.
- Reports and summaries.
- Admin configuration.
- Announcements and coupons.

Do not use a naive exact-string route comparison as the only audit. Dynamic paths such as `/api/garages/:id` and frontend template strings require normalization.

## H2 — Extract framework-neutral domain logic

Before removing Express routes, move business decisions into framework-neutral modules.

Good locations:

```text
server/domain/
server/services/
server/adapters/
server/validation/
```

Domain modules must not import:

- Express.
- Hono.
- `Request` or `Response`.
- `req` or `res`.

They may accept explicit typed input and return explicit decisions/results.

Preserve the existing policies for:

- Garage scope.
- Role authorization.
- Session validity.
- Tenant isolation.
- Idempotency.
- Financial transactions.
- Activity logs.

Add tests before changing route behavior.

## H3 — Create the canonical Hono app

Target shape:

```text
server/api.ts              # canonical Hono application
server/cloudflareWorker.ts # thin Worker entry point
server/nodeAdapter.ts      # local Node adapter if required
server.ts                  # Vite + local development adapter
```

Important: do not blindly rename `server/cloudflareWorker.ts` to `server/api.ts`. First determine whether all current Worker behavior can be imported cleanly without Cloudflare-only initialization side effects.

The canonical Hono app must preserve:

- Existing route paths.
- HTTP methods.
- JSON envelopes.
- Error codes.
- CORS behavior.
- Correlation IDs.
- Operation IDs.
- Session headers.
- Firebase initialization.
- Durable Object PIN rate limiting.

## H4 — Convert tests incrementally

Keep Express characterization tests temporarily. Add or convert Fetch/Hono tests feature family by feature family.

Required tests include:

- All five roles.
- Own-garage and cross-garage access.
- Anonymous Firebase UID plus server session resolution.
- Session release and expiry.
- Multiple devices.
- Idempotent repeated requests.
- Financial transaction invariants.
- Server-generated activity logs.
- Invalid request envelopes.
- CORS and security headers.

Never delete a test only because it is Express-based. Convert it or explain why it is obsolete.

## H5 — Preview runtime

Deploy the migration branch to a non-production Worker, for example:

```text
rq-hono-preview
```

Use only synthetic test data.

The preview frontend must point to the preview Worker only if the complete preview configuration is isolated and reversible. Do not change the production Pages environment for experimentation.

Compare Express and Hono outputs for:

- Status codes.
- Error codes.
- Response envelopes.
- Database mutations.
- Authorization outcomes.
- Idempotency.
- Audit logs.

## H6 — Human role testing

Test the preview as:

### Admin

- Login/logout.
- Dashboard.
- Garage create/update/delete.
- Staff, supervisor, delegate management.
- Packages, coupons, announcements.
- Recharge and subscription actions.
- Reports.
- Session management.

### Delegate

- Dashboard.
- Commission values.
- Garage application flow.
- Tenant isolation.
- Forbidden admin actions.

### Garage owner

- Login/logout.
- Dashboard.
- Check-in/check-out if allowed.
- Subscribers.
- Packages.
- Trial popup: continue and decline.
- Self-subscription.
- Referral reward.
- Forbidden cross-garage access.

### Staff

- Check-in.
- Check-out.
- History.
- Subscriber operations allowed by policy.
- Forbidden admin/cross-garage actions.

### Supervisor

- Permitted monitoring and recharge workflows.
- Forbidden mutations and financial actions.

Test on mobile because the original production bugs were found there.

## H7 — Quality gate

Before cutover, run:

```bash
npm test
npm run lint
npm run build
npm run ci:check
npm run maintainability:check
npm run release:smoke
```

Also run the preview smoke tests with explicit preview URLs.

Do not call the migration complete if any required command fails. Warnings may be documented only when they do not affect behavior and the command exits successfully.

## H8 — Production cutover

Preferred method:

1. Keep `main` intact during development.
2. Merge the migration branch into `main` only after H0–H7 pass.
3. Push `main`.
4. Deploy the Worker from the merged `main`.
5. Verify Worker health/version.
6. Verify Pages points to the production Worker.
7. Run smoke tests.
8. Perform human role testing.
9. Keep the baseline tag for rollback.

Do not delete `main`. There is almost never a technical benefit to deleting the production branch.

If the user insists on branch replacement, first update the repository default branch and deployment settings, then preserve the old branch/tag until the new branch has been proven. Never delete the only rollback reference.

## H9 — Remove Express last

Only after the unified Hono path is proven:

- Convert remaining Express-only tests.
- Confirm local development works through the Hono adapter.
- Decide whether Cloud Run is retired or intentionally supported.
- Remove Express routes only after shared logic and Hono routes cover them.
- Remove Express middleware/types/dependencies only when unused.
- Update scripts and documentation.
- Run the entire gate again.

If Cloud Run remains a supported fallback, do not remove Express merely to satisfy architectural purity. Either support Cloud Run intentionally or formally retire it with a documented decision.

---

## Deployment guidance

The Cloudflare MCP is preferred over Wrangler when the Sandbox Wrangler login is unavailable.

Cloudflare Worker code inspection uses the Cloudflare API:

```javascript
async () => {
  const r = await cloudflare.request({
    method: 'GET',
    path: `/accounts/${accountId}/workers/scripts/rq`
  });
  return {
    success: r.success,
    status: r.status,
    length: String(r.result || '').length
  };
}
```

Worker versions:

```javascript
async () => {
  return cloudflare.request({
    method: 'GET',
    path: `/accounts/${accountId}/workers/scripts/rq/versions`,
    query: { per_page: 5 }
  });
}
```

Do not expose Firebase service-account data, tokens, or secrets in chat, GitHub, temporary gists, or public URLs.

Do not stage compiled Worker bundles in public gists. A previous deployment attempt used a temporary public bundle and it was deleted; do not repeat that pattern.

---

## Git rules

Before every mutation:

```bash
git status --short --branch
git log -3 --oneline --decorate
```

After every mutation:

```bash
git status --short --branch
git diff --check
```

Commit messages should describe the verified change, for example:

```text
refactor: extract garage authorization service
feat: add fetch adapter for local hono development
 test: convert subscriber route contracts to hono
```

Do not force-push or delete `main` during the experiment.

---

## When to stop and ask the user

Ask the user only when:

- An external action requires their account authorization and cannot be completed through the available connector.
- A production cutover would be consequential and the user has not approved that exact cutover.
- There is a material business-rule ambiguity.
- A destructive action is being considered.

Do not ask the user to run technical commands if the Sandbox or Cloudflare connector can perform the operation.

---

## Succession protocol

If the user says `tokens ending`:

1. Stop implementation immediately.
2. Do not begin a new large task.
3. Record the current branch and commit.
4. Record all changed files.
5. Record tests and exact results.
6. Record deployment and Worker version.
7. Record blockers.
8. Update the plan/status files.
9. Write a new handoff file with the next exact commands.
10. Push documentation if safe.

### Mandatory handoff chaining

This protocol applies to **every future agent**, not only the current agent.

When a future agent receives this handoff and the user says `tokens ending`, that agent must repeat the same process for the agent after him. The succession chain must never terminate at one handoff.

The future agent must:

1. Preserve this file and read it before working.
2. Create or update a new current-status handoff containing the latest branch, commit, files, tests, deployment state, blockers, and next checkpoint.
3. Explicitly tell the next agent to read the newest handoff first.
4. Include the exact next commands and the exact next checkpoint; never write only “continue.”
5. Carry forward the instruction that the next agent must repeat this protocol when the user says `tokens ending`.
6. Keep all older handoff files unless they are clearly obsolete; if an older handoff is replaced, document which file is authoritative.
7. Commit and push the updated handoff when safe, without exposing secrets.

The handoff must contain this instruction verbatim or with the same meaning:

> You are part of a continuing succession chain. If the user says `tokens ending`, stop implementation, record the exact current state, create the next agent’s handoff, and instruct that next agent to repeat the same succession protocol. Do not leave the next agent dependent on conversation history.

### Required succession filename

The authoritative handoff should remain:

```text
RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md
```

If a separate dated handoff is needed, update the authoritative file in the same commit and identify the dated file as historical. The next agent must always know which handoff is authoritative.

The new handoff must never say only “continue.” It must identify the exact next checkpoint and exact next files.

---

## First response template for a new agent

Start the next session with something like:

> I will first read `RQ_UNIFIED_HONO_SUCCESSION_HANDOFF.md`, `RQ_UNIFIED_HONO_MIGRATION_CHECKPOINT_PLAN.md`, and `RQ_PROJECT_KNOWLEDGE_BASE.md`, then verify the current `main` commit, Worker version, Pages deployment, and repository status before changing anything. I will not delete `main` or alter production during the migration experiment.

Then perform the First actions listed in this document.

---

## Final decision rule

The unified Hono migration is successful only when it is demonstrably safer and behaviorally equivalent to the current production system.

Do not replace a working production architecture merely because the replacement is cleaner on paper.

The correct priority order is:

```text
Security and tenant isolation
> Correct business behavior
> Production stability
> Testability
> Maintainability
> Architectural elegance
```
