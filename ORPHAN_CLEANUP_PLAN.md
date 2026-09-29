# RQ Orphan and Dead-Code Cleanup Plan

**Date:** 2026-09-29  
**Repository:** `tarekhamada875-droid/RQ-`  
**Branch:** `main`

## Purpose

Provide the next agent with a safe, evidence-based plan for removing genuinely orphaned assets or code without damaging Firebase, Cloudflare Pages, Railway, Vitest, or external handoff tooling.

This is a **plan, not a bulk-delete authorization**. The application is in controlled synthetic pre-production, but configuration and deployment files can still be consumed outside the TypeScript import graph.

## Audit evidence

The focused audit performed on 2026-09-29 found:

- The previously identified `public/egypt_crest.svg` was already removed and had no active references.
- Public assets remaining are intentionally active:
  - `public/icon.svg` is referenced by `index.html` and `public/manifest.json`.
  - `public/manifest.json` is referenced by `index.html` and Vite configuration.
  - `public/_headers` is a Cloudflare Pages convention file controlling cache headers for the app shell, service worker, registration script, and hashed assets.
- The frontend graph contains 134 non-test TypeScript modules; 117 are reachable from `src/main.tsx` / `src/App.tsx`.
- The 17 unreachable frontend files are test entrypoints plus `src/vite-env.d.ts`; Vitest discovers test files directly, so they are **not orphan code**.
- The server/tool graph contains 42 non-test TypeScript files; 41 are reachable from the production server, Cloud Run entrypoint, or npm tools.
- The only server file outside that production/tool graph is `server/pinRotation.ts`, but it is imported by `src/__tests__/adminPinRotationRegression.test.ts` and protects a tested authorization contract. It is **intentionally retained**.
- All four npm tools are exposed through package scripts or CI/maintainability workflows and are intentionally retained.

## Candidates requiring a bounded review

### 1. `firebase-blueprint.json`

**Finding:** No in-repository runtime or build reference was found.

**Why it is not safe to delete automatically:** It may be an external Firebase/App-Builder blueprint or historical schema input. Its contents describe the domain model and could be consumed outside GitHub.

**Next action:** Confirm that no external Firebase/App-Builder workflow imports it and that it is not needed for handoff or environment recreation. If confirmed unused, remove it in a dedicated commit and run the full production gate.

### 2. `metadata.json`

**Finding:** No in-repository runtime or build reference was found.

**Why it is not safe to delete automatically:** It contains application metadata and capability declarations that may be consumed by an external development environment even though TypeScript does not import it.

**Next action:** Confirm external tooling ownership/consumption. If it is only stale scaffolding, remove it together with any documentation that still claims it is required.

### 3. Documentation and handoff overlap

The repository contains multiple historical plans and handoffs, including:

- `RQ_PRODUCTION_READINESS_PLAN_2026-09-25.md`
- `PROJECT_CONTINUATION_BRIEF.md`
- `MAINTAINABILITY_HANDOFF.md`
- `RAILWAY_DEPLOYMENT_HANDOFF.md`
- `BRANCHING_AND_RELEASES.md`
- `PRODUCTION_AUDIT_2026-09-25.md`
- `FINANCIAL_AUDIT_REPORT.md`
- `BUSINESS_LOGIC_AUDIT.md`
- `BUSINESS_LOGIC_FIX_CHECKPOINTS.md`

**Finding:** These are documentation candidates, not application dead code. The canonical operational sources remain `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`, `REPOSITORY_CLEANUP_AND_WIRING_AUDIT.md`, `AGENTS.md`, and `docs/SUCCESSION_PROTOCOL.md`.

**Next action:** Compare each historical document against the canonical sources, mark it as archived or superseded, and remove only exact duplicates or documents with no unique evidence. Do not delete a handoff until its unique deployment, security, or rollback information is migrated.

## Explicit retain list

Do not remove these merely because a simple text search shows few references:

- `public/_headers` — deployment configuration consumed by Cloudflare Pages.
- `public/icon.svg` and `public/manifest.json` — active PWA/browser identity.
- `server/pinRotation.ts` — imported by an authorization regression test and part of the tested security boundary.
- `tools/performance-benchmark.ts` — retained benchmark with documented evidence and `npm run benchmark`.
- `tools/ci-check.ts`, `tools/maintainability-check.ts`, and `tools/release-smoke.ts` — CI/release gates.
- `src/**/*.test.ts` and `src/**/*.test.tsx` — Vitest entrypoints, not application imports.
- `src/vite-env.d.ts` — Vite type declarations required by the TypeScript toolchain.

## Safe execution sequence for the next cleanup pass

1. Check the working tree and current remote SHA.
2. Confirm external consumers of `firebase-blueprint.json` and `metadata.json` before changing either file.
3. Perform a document-by-document uniqueness review before archiving or deleting plans.
4. Make one bounded deletion or archive commit at a time; do not mix it with business-logic changes.
5. Run:
   - `git diff --check`
   - `npm test -- --run`
   - `npm run lint`
   - `npm run build`
   - `npm run maintainability:check`
6. Verify the deleted path is absent and no references remain.
7. Push directly to `main` according to the repository workflow.
8. Wait for the GitHub Production Gate and record its result in the canonical checkpoint plan.

## Current conclusion

No additional **confirmed** orphan application asset or production module was found in this pass. The only safe next cleanup targets are the two unreferenced metadata candidates and historical documentation, both of which require external-consumer and uniqueness checks before deletion.
