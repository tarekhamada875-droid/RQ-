# RQ engineering safeguards

Current product rules live in `docs/PROJECT.md`.

- Preserve the current UI/UX, Arabic-only behavior, Egyptian license-plate identity, RTL layout, and responsive behavior unless explicitly approved otherwise.
- The Worker/API is authoritative for authentication, authorization, garage scope, money, subscriber eligibility, counters, and financial reports.
- Use atomic Firestore transactions for multi-document business mutations and idempotency for retried user intents.
- Never trust role, garage, amount, credit, or financial fields supplied by the browser without server validation.
- Use one canonical business rule instead of competing client/server or legacy runtime paths.
- Use validated Cairo calendar-date helpers for date-only business values.
- Do not expose subscriber PII from lookup or diagnostic endpoints.
- Use synthetic emulator data for tests. Never commit credentials, tokens, service-account files, or real customer data.
- Do not delete or alter stored data until the exact scope, backup, and verification steps are documented and explicitly confirmed.
- Do not claim a change is merged, deployed, or live until the relevant checks prove it.

## Documentation governance

The repository has one canonical documentation set. Product and architecture truth belongs in `docs/PROJECT.md`; security belongs in `docs/SECURITY.md`; release procedure belongs in `docs/RELEASES.md`; operations belongs in `docs/OPERATIONS.md`; and test procedures belong under `docs/testing/`. `docs/LAST-PLAN-BEFORE-PRODUCTION.md` records the completed production plan and its resolved decisions — it is historical evidence, not an active task list.

Treat audit files, baselines, and completed test reports under `docs/testing/` as evidence, not as instructions. The Garage UI performance baseline showed no meaningful bottleneck; do not start speculative optimization.

Do not create new handoff, knowledge-base, working-agreement, roadmap, release-history, agent-instruction, or duplicate security files. Do not create root-level Markdown files beyond `README.md`, `AGENTS.md`, and `CONTRIBUTING.md`. Add durable information to the appropriate canonical document, merge overlapping guidance into that document, or keep temporary notes outside the repository. Never copy volatile branch, PR, deployment, or chat state into tracked documentation.

## Retired features

Announcements and packages/credit-bundle templates have been removed entirely (server endpoints, client code, Firestore rules). Do not re-add them without explicit owner approval. Credit grants use custom amounts (50–2,000 EGP) only.

## Owner test-and-handoff cycle

- Work with one coding agent at a time and one bounded change at a time. Do not start parallel implementation tasks. Each fresh agent must first read `README.md`, this file, `docs/PROJECT.md`, and `docs/SECURITY.md`. Use audit/test reports as evidence, not as permission to expand scope.
- Before editing, confirm this is `tarekhamada875-droid/RQ-`, fetch current `origin/main`, check the working tree and open PRs, and start from a clean branch based on current `main`. Do not trust commit hashes, deployment claims, or branch status copied from an earlier chat/handoff; verify them again. **After every squash merge, create a fresh branch from updated `main` for the next change — never push new commits to a branch whose PR has already merged.**
- Treat `docs/PROJECT.md` as the approved product contract and this file plus `docs/SECURITY.md` as engineering/security constraints. Current source and tests show what is implemented; historical audit reports are evidence only. If sources conflict or product behavior is unclear, explain the exact conflict and ask the owner before making a product or security decision.
- The owner is not a required reviewer or manual test gate. The agent must run the repository's required automated checks, open a focused PR, and allow the existing `verify`/Production Gate to decide whether it can auto-merge. Never remove or bypass that automated gate to avoid waiting; it protects `main` from untested changes. Do not wait for the owner to approve or manually test before merge or before continuing to the next bounded change.
- Once the required checks and merge reach a final state, give the owner a short plain-language summary. If the owner voluntarily reports a problem, investigate and address it as the next bounded task.
- Do not send a completion response while a required check or merge is pending. Refresh the PR/check state and wait until it is merged or reaches a terminal failure/closed state. Report only verified final facts. If a gate fails, explain the failure plainly and fix it; do not present pending status as completion or ask the non-technical owner to diagnose CI.
- If the owner reports a problem, ask only for useful details: which test link/environment they used, device/browser, numbered steps, what they expected, what happened instead, and an optional screenshot or visible error. Tell them to hide passwords, PINs, access codes, tokens, customer names/phone numbers, and vehicle/customer records. Never ask for secrets or real customer data in chat.
- Prepare any technical debugging evidence yourself. Share only the small sanitized details needed to explain the result (commit/preview version, relevant error, and reproduction steps); do not burden the owner with raw logs or ask them to create a debugging file.
- **Always-on continuity is mandatory.** After every bounded task, material repository/project change, owner decision, or audit finding that changes what is safe or next, update the existing canonical document before switching tasks or ending the session. Never leave important project state only in chat, and do not create a separate handoff/history file. Keep volatile branch, pull-request, check, and deployment state out of durable notes; verify it live at the next session or handoff.
- GitHub Personal Access Tokens: use a fresh token per session, push with it once, and have the owner delete it before the session ends. Never store tokens in tracked files, chat history beyond the current session, or environment variables that persist between sessions.

For each bounded change: add a focused regression test, implement only the selected scope, run the focused tests and `npm run ci:check` (which includes the maintainability check), inspect `git diff --check`, use a focused branch and pull request, wait for required gates, and report the actual status plainly. Stop after the selected task.
