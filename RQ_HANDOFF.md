# RQ Continuity Handoff

_Last updated: 2026-10-20._

## What RQ is and what matters to its owner

RQ is a bilingual Egyptian garage-management PWA. Production uses Cloudflare Pages for the website, a Cloudflare Worker running Hono for the API, and Firebase Authentication/Firestore for identity and data. Preserve the Egyptian license-plate identity, Arabic/English behavior, RTL/LTR layout, and current visuals. Financial and authorization decisions belong on the Worker, with atomic/idempotent changes and auditable ledger or event records. The owner prefers plain-language progress and is not a technical specialist.

## Verified ALF-12 completion

- ALF-12 merged as PR [#216](https://github.com/tarekhamada875-droid/RQ-/pull/216), commit `3832f0b2902b8748d53e3bd18b95e5d1de5d10f5`.
- Post-merge Production Gate run `39383241961` completed successfully for that commit. It passed typecheck, the full test suite, Firestore security-rules emulator tests, production build/smoke checks, maintainability checks, and deployment of the verified Worker artifact.
- Live `/api/health` and `/api/version` reported Worker commit `3832f0b2902b8748d53e3bd18b95e5d1de5d10f5`, version `1.0.0-production`, environment `production`, and operational status.
- The owner approved the separate Firestore rules deployment. For project `gen-lang-client-0091669619`, database `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759`, the active ruleset is `a835ccf0-df94-4908-b9bc-8f1f95aaf35a`; the rules were read back and matched the merged `firestore.rules` exactly, SHA-256 `b70a5b05c33e7a08e596f90c938baab6026cf5d3e9a7eda4cde6a5cbeca84a74`.
- No stored records were changed, deleted, or migrated.

ALF-12 closes the three scoped authorization gaps: browser reads of raw `system_config` are blocked in favor of the Worker’s four-field allowlist; subscriber reads retain their existing scope while create/update/delete must use the Worker; and vehicle correction/deletion authority follows the same stable garage/staff entity and role that entered the vehicle, so a new Firebase UID after re-login does not remove the same entrant’s authority. Peer entities cannot correct one another’s entries. Existing vehicles without stable entrant metadata remain Admin-only. No vehicle migration was authorized.

## Other completed work not to repeat

- ALF-01 is merged in PR #212; direct browser edits to credit balances are blocked and credit mutations use the Worker’s transaction/ledger path.
- The Admin package catalog accepts credit bundles only, merged in PR #214. Legacy package documents remain stored; they were not deleted or converted. The separate garage-owned monthly-subscriber product is unchanged.
- Do not redo the UI performance audit, checkout/recharge-history fixes, ALF-01, package-format decision, or ALF-12.

## Repository and release snapshot

At ALF-12 verification on 2026-10-20, `main` and `origin/main` were synchronized at `3832f0b2902b8748d53e3bd18b95e5d1de5d10f5`, and the working tree was clean. The latest successful application Production Gate was run `39383241961` for that commit. The open-PR snapshot had only PR #211, an older documentation PR whose `README.md` and `RQ_HANDOFF.md` instructions predate ALF-12. Do not merge it without refreshing its base and reconciling its stale text. Documentation-only merges may advance `main` without deploying a new Worker, so recheck GitHub before any further work.

The protected decision branch `readiness/firestore-decision-gate` was at `d2e0d2c7c904745a672734f5cbde0b7664d1efa2` at the same verification. Re-fetch and verify the current branch, exact `main` SHA, clean state, latest Production Gate, live Worker identity, open PRs, and protected branch before making another release decision.

## Current task: GLF-07 (not yet merged)

ALF-12 already blocks direct Firestore subscriber mutations; the client’s add/renew/update/delete service calls the Worker, whose handlers use transactions, garage scope, maintained summaries, idempotency, and domain events. GLF-07 work is on local branch `test/glf-07-subscriber-write-proof`: it fixes an expired-subscriber summary delta that was not removed on delete and adds an owner-scoped lifecycle regression for state, summary deltas, and audit events. The focused suite passed 11/11; `npm run lint`, `npm run maintainability:check`, `npm run test:rules`, `npm run ci:check`, and `git diff --check` all passed. No production change is deployed yet; no stored records or Firebase rules were changed. The staff subscriber-management policy remains unresolved and is not changed by this patch.

Remaining steps: inspect the final diff, commit the source/tests/status notes, push this branch, open a PR to `main`, wait for the required Production Gate, merge only if it passes, then verify the post-merge Worker deployment and live health/version. After that, update the release snapshot and stop to report GLF-07. GLF-10 is the next roadmap item; do not start it in the same task.

## Safety and workflow

- Preserve existing data. No stored-data deletion, migration, or broad cleanup is authorized. Ask separately before destructive data work or material product/security decisions outside the approved roadmap.
- Keep Admin capabilities in the app’s authorized Worker paths; a direct-Firestore lock is not permission to remove legitimate Admin work.
- Read `AGENTS.md`, `PROJECT_ENGINEERING_KNOWLEDGE.md`, `PROJECT_WORKING_AGREEMENT.md`, `BRANCHING_AND_RELEASES.md`, `BUSINESS_LOGIC_FIX_PLAN.md`, and the selected route/rules/tests before coding.
- For any selected code change: start from synchronized `main` on a short-lived focused branch, add a regression first, run focused tests and the repository’s required checks, inspect the diff, push, open a PR, wait for the Production Gate, and merge only after required checks pass.
- After merge, confirm local `main == origin/main`, clean working tree, post-merge gate and deployment, live health/version identity, open PRs, and protected decision branch. Update project notes and report the completed task before starting another roadmap item.
