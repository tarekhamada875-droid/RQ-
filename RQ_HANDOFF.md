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

The stable application release is GLF-07 Worker code PR [#218](https://github.com/tarekhamada875-droid/RQ-/pull/218), commit `df6dd9182580d25574089ab184441dc5aa0d3980`. Main Production Gate run `39387778329` passed and deployed/smoke-tested it; live `/api/health` and `/api/version` last confirmed that commit. Documentation-only handoff sync PRs [#219](https://github.com/tarekhamada875-droid/RQ-/pull/219), [#220](https://github.com/tarekhamada875-droid/RQ-/pull/220), and [#221](https://github.com/tarekhamada875-droid/RQ-/pull/221) passed their required gates with Worker deployment skipped; they advanced repository history but did not change the Worker release. This is expected, not a broken release. PR #211 is known to contain old documentation predating ALF-12; if it remains open, do not merge without refreshing its base and reconciling the text. This file deliberately does not pin the current `main` SHA, worktree, or open-PR list because merging a handoff PR changes them. Fetch the current state and report it in the final copy-ready handoff message. Never open a follow-up docs PR solely to record the SHA created by this file’s own merge.

The protected decision branch is also moving GitHub state. Fetch and verify its actual SHA, along with synchronized `main`, the latest gate, live Worker identity, and open PRs, at handoff; report the results in the final message instead of relying on a stored SHA.

## GLF-07 complete; next task GLF-10

GLF-07 closes the Worker-only subscriber mutation path and fixes a summary error where deleting an expired subscriber did not remove it from the expired count. The client service uses Worker routes for add/renew/update/delete, and direct browser writes are denied by the ALF-12 rules. The new garage-owner regression checks record state, summary deltas, and create/update/delete audit events; direct-write denial, renewal idempotency/ledger, and cross-garage rejection are also covered. The focused suite passed 11/11; `npm run lint`, `npm run maintainability:check`, `npm run test:rules`, `npm run ci:check`, and `git diff --check` passed. No UI, Firestore rules, role policy, or stored data changed. The staff subscriber-management policy remains unresolved. Next, begin GLF-10 (prevent ledger audit collisions) only after verifying the latest repo/GitHub state; stop and report before expanding scope.

Before GLF-10, read the complete `PROJECT_ENGINEERING_KNOWLEDGE.md` and fetch actual GitHub state. Keep exact `main`/PR/gate values in the handoff message, not as self-updating claims in these files. Follow the normal short-lived branch, regression-first, test, PR gate, merge, and post-merge verification workflow; do not create another docs PR just to record the SHA produced by a docs-only merge.

## Safety and workflow

- Preserve existing data. No stored-data deletion, migration, or broad cleanup is authorized. Ask separately before destructive data work or material product/security decisions outside the approved roadmap.
- Keep Admin capabilities in the app’s authorized Worker paths; a direct-Firestore lock is not permission to remove legitimate Admin work.
- Read `AGENTS.md`, `PROJECT_ENGINEERING_KNOWLEDGE.md`, `PROJECT_WORKING_AGREEMENT.md`, `BRANCHING_AND_RELEASES.md`, `BUSINESS_LOGIC_FIX_PLAN.md`, and the selected route/rules/tests before coding.
- For any selected code change: start from synchronized `main` on a short-lived focused branch, add a regression first, run focused tests and the repository’s required checks, inspect the diff, push, open a PR, wait for the Production Gate, and merge only after required checks pass.
- After merge, confirm local `main == origin/main`, clean working tree, post-merge gate and deployment, live health/version identity, open PRs, and protected decision branch. Update project notes and report the completed task before starting another roadmap item.
