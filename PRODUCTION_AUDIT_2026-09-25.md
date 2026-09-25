# RQ Production Audit — 2026-09-25

## Executive conclusion

RQ is currently **deployed and operational at the infrastructure level**, but it is **not yet safe to declare production-ready for a wider launch**. The application is not a failed project that needs a rewrite. The highest risks are environment separation, Firestore database/billing policy, and inconsistent authority between server APIs and browser Firestore access.

The correct direction is to keep the current topology:

```text
Cloudflare Pages frontend → Railway Express API → Firebase Authentication + Firestore
```

The backend should remain the authority for authentication, authorization, sessions, vehicle mutations, financial mutations, idempotency, and audit events. Functional programming should be used in pure domain decision modules; Firestore and HTTP should remain imperative adapters at the boundary.

## Verified baseline

| Area | Result | Evidence |
|---|---|---|
| Repository | Clean and synchronized | `main`, `HEAD = origin/main = a8096b5` |
| Install | Passed | `npm ci --ignore-scripts --no-audit --no-fund` |
| TypeScript | Passed | `npm run lint` (`tsc --noEmit`) |
| Tests | Passed | 75 files, 423 tests |
| Production build | Passed | Vite frontend, Node server bundle, Railway API bundle |
| Maintainability check | Passed | Railway/Cloudflare split and npm contract valid |
| GitHub production gate | Passed | Latest run `36144288150` for `a8096b5` |
| Railway health | Passed | HTTP 200, `status: ok`, `adminSdk: true`, version `a8096b5` |
| Railway system config | Passed | HTTP 200 JSON; maintenance mode currently false |
| Cloudflare root | Passed | HTTP 200 HTML from `rq-acg.pages.dev` |
| Cloudflare → Railway CORS | Passed | Preflight allows `https://rq-acg.pages.dev` and `X-Session-ID` |
| Cloudflare Pages deployment | Passed | Project `rq`, production branch `main`, latest deployment matches `a8096b5` |

The Cloudflare response to `/api/health` being SPA HTML is **expected**, not a defect: Cloudflare owns the frontend and Railway owns `/api/*`.

## Critical findings

### P0 — No formal staging environment

The repository documents production, but no separate staging Firebase project and deployment were verified. Authenticated workflow tests, migration rehearsal, and financial reconciliation must not run against production data.

**Required next step:** create a staging Firebase project and separate Railway/Cloudflare environment variables, then validate owner, staff, delegate, supervisor, and admin workflows with test accounts.

### P0 — Firestore named database and billing policy are unresolved

The checked-in Firebase configuration references a named Firestore database. The project must explicitly choose one of:

1. migrate to the project's default Firestore database if no-cost Firebase is required; or
2. keep the named database and enable Blaze billing with budgets, alerts, and usage limits.

Changing only the identifier in code would make existing data appear to disappear. No migration or billing change was performed.

### P0/P1 — Browser/server authority is still mixed

The backend correctly owns sensitive routes and uses Admin SDK transactions, but the frontend still performs direct Firestore operations in session and operational services. Examples include:

- session claim/refresh fallback transactions;
- direct `lastActive` heartbeat writes;
- direct Firestore reads and listeners for operational collections;
- compatibility fallbacks after server calls fail.

Firestore rules restrict many of these writes, but a rejected write is not the same as a coherent production contract. A server outage or an auth mismatch can produce confusing UI state, repeated errors, or divergence between display data and server authorization.

**Required next step:** define the read model explicitly, remove or isolate unauthorized browser writes, and make server session refresh the only authorization path. Preserve Firestore listeners only as display synchronization where they are intentionally allowed.

### P1 — Multi-device session policy is not fully aligned

The server contains active-session arrays and device-session documents, while some client/domain helpers still use single `currentSessionId` assumptions and client-side fallback transactions. The plan already states that multiple concurrent devices should be allowed.

**Required next step:** implement one bounded multi-device session slice with tests for two valid devices, one-device logout, revoke-all, stale sessions, and concurrent vehicle/financial retries. Do not change financial authority or deployment topology in that slice.

### P1 — Vehicle lock/suspension policy needs one server contract

The current repository has substantial route-level tests and business-rule protection. The remaining production decision is whether a locked/suspended garage may check out or correct vehicles already inside. That policy must be written once and enforced on every direct API mutation route, not only in the dashboard.

### P1 — Financial history is not yet reconciled

Current tests cover idempotency and major financial paths. The formal accounting risk is historical consistency: legacy activity logs, garage aggregates, delegate aggregates, manual-credit ledger entries, domain events, and reports may not all cover the same historical period.

Do not run a production correction automatically. First establish the wallet-credit reporting policy, then rehearse a read-only reconciliation against staging or an export.

## Quality observations

- The repository uses **npm**, not pnpm. The correct install command is `npm ci`.
- The full ESLint command remains a separate baseline issue with many pre-existing findings, mostly broad `no-explicit-any` and selected React Hooks findings. TypeScript validation and the production gate are green; do not mass-autofix these findings during the launch-critical track.
- The Railway API bundle is large because it intentionally bundles backend dependencies. Do not change bundling until startup, Firebase Admin initialization, and route smoke tests are measured together.
- The public Cloudflare Pages environment has the expected `VITE_BACKEND_API_URL` value and the deployed JavaScript contains the Railway origin.
- No Railway control connector or Railway CLI credential was available in this sandbox. Public read-only health checks work. The repository's succession document refers to an older protected Railway connector, but it is not present in the currently configured MCP server list.

## Recommended launch sequence

1. **Decide Firestore database/billing policy.** No data migration yet.
2. **Create and verify staging.** Separate Firebase Auth, Firestore, Railway variables, and Cloudflare Pages preview environment.
3. **Run the session authority slice.** Remove ambiguous browser fallback writes only after staging tests exist.
4. **Run direct-API vehicle authorization tests.** Record checkout/correction policy.
5. **Complete financial event/idempotency contract coverage.** Keep one server authority.
6. **Reconcile historical data read-only.** Do not mutate production until counts and aggregates have an approved rollback plan.
7. **Run authenticated staging smoke tests and then safe production smoke tests.** No destructive or financial production actions.
8. **Make the go-live decision from evidence, not from the fact that the landing page loads.**

## Railway access blocker

The current session can inspect public Railway health and system configuration, but cannot safely inspect variables, deployment logs, rollbacks, or trigger a deployment because no protected Railway control connector is available. Do not create a plaintext token workaround.

To add safe Railway control, provide or connect a protected Railway API credential through the connector configuration. The token must remain in protected configuration and must never be printed, committed, or placed in source or logs. Until then, use GitHub Actions and the public health endpoint as the deployment evidence path.

## Scope boundary for this audit

No production data was changed, no production financial operation was called, no deployment was triggered, and no Cloudflare or Railway settings were modified. The only repository change is this audit document.
